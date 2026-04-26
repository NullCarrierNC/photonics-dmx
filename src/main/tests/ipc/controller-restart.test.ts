import { describe, expect, it, jest } from '@jest/globals'
import { ControllerManager } from '../../controllers/ControllerManager'
import { SenderLifecycleController } from '../../controllers/SenderLifecycleController'

type SenderManagerLike = {
  enableSender: jest.Mock
  shutdown?: jest.Mock
  isSenderEnabled?: jest.Mock
}

function makeManagerForRestore(prefs: Record<string, unknown>): {
  manager: ControllerManager
  senderManager: SenderManagerLike
} {
  const senderManager: SenderManagerLike = {
    enableSender: jest.fn().mockImplementation(() => Promise.resolve()),
  }
  const config = { getAllPreferences: () => prefs }
  const sl = Object.create(SenderLifecycleController.prototype) as {
    getConfig: () => typeof config
    senderManager: SenderManagerLike
    senderErrorHandler: (e: unknown) => void
    senderErrorTrackingCallback: null
  }
  sl.getConfig = () => config
  sl.senderManager = senderManager
  sl.senderErrorHandler = () => {}
  sl.senderErrorTrackingCallback = null

  const manager = Object.create(ControllerManager.prototype) as any
  manager.config = config
  manager.senderLifecycle = sl
  return { manager: manager as ControllerManager, senderManager }
}

type RestartFake = Record<string, unknown>

function listenerStub() {
  return {
    yargRb3: {
      getIsYargEnabled: jest.fn().mockReturnValue(false),
      getIsRb3Enabled: jest.fn().mockReturnValue(false),
    },
  }
}

describe('ControllerManager lifecycle and sender restore', () => {
  it('restartControllers throws when phase is not running or consoleMode', async () => {
    const fake = Object.assign(Object.create(ControllerManager.prototype), {
      lifecyclePhase: 'initializing',
    })
    await expect(
      ControllerManager.prototype.restartControllers.call(fake as unknown as ControllerManager),
    ).rejects.toThrow(/invalid lifecycle for restartControllers/)
  })

  it('getLifecyclePhase returns the current phase on a prototype-based stub', () => {
    const stub = Object.assign(Object.create(ControllerManager.prototype), {
      lifecyclePhase: 'restarting' as const,
    })
    expect(ControllerManager.prototype.getLifecyclePhase.call(stub)).toBe('restarting')
  })

  it('restoreSenderOutputsFromPrefs restores enabled sACN sender with persisted mapping', async () => {
    const { manager, senderManager } = makeManagerForRestore({
      dmxOutputConfig: {
        sacnEnabled: true,
        artNetEnabled: false,
        enttecProEnabled: false,
        openDmxEnabled: false,
      },
      sacnConfig: {
        universe: 42,
        networkInterface: '192.168.1.10',
        useUnicast: true,
        unicastDestination: '192.168.1.50',
      },
    })

    await manager.restoreSenderOutputsFromPrefs()

    expect(senderManager.enableSender).toHaveBeenCalledTimes(1)
    expect(senderManager.enableSender).toHaveBeenCalledWith('sacn', 'sacn', {
      sender: 'sacn',
      universe: 42,
      networkInterface: '192.168.1.10',
      useUnicast: true,
      unicastDestination: '192.168.1.50',
    })
  })

  it('restoreSenderOutputsFromPrefs skips serial/network senders missing required persisted fields', async () => {
    const { manager, senderManager } = makeManagerForRestore({
      dmxOutputConfig: {
        sacnEnabled: false,
        artNetEnabled: true,
        enttecProEnabled: true,
        openDmxEnabled: true,
      },
      artNetConfig: {
        host: '',
        universe: 1,
        net: 0,
        subnet: 0,
        subuni: 0,
        port: 6454,
      },
      enttecProConfig: {
        port: '',
      },
      openDmxConfig: {
        port: '',
        dmxSpeed: 40,
      },
    })

    await manager.restoreSenderOutputsFromPrefs()

    expect(senderManager.enableSender).not.toHaveBeenCalled()
  })

  it('restoreSenderOutputsFromPrefs honors explicit active-sender snapshot over prefs', async () => {
    const { manager, senderManager } = makeManagerForRestore({
      dmxOutputConfig: {
        sacnEnabled: true,
        artNetEnabled: true,
        enttecProEnabled: true,
        openDmxEnabled: true,
      },
      sacnConfig: {
        universe: 11,
        networkInterface: '10.0.0.10',
        useUnicast: false,
        unicastDestination: '',
      },
      artNetConfig: {
        host: '127.0.0.1',
        universe: 1,
        net: 0,
        subnet: 0,
        subuni: 0,
        port: 6454,
      },
      enttecProConfig: {
        port: '/dev/tty.usbserial-ENTTEC',
      },
      openDmxConfig: {
        port: '/dev/tty.usbserial-OPEN',
        dmxSpeed: 40,
      },
    })

    await manager.restoreSenderOutputsFromPrefs({
      sacn: true,
      artnet: false,
      enttecpro: false,
      opendmx: false,
    })

    expect(senderManager.enableSender).toHaveBeenCalledTimes(1)
    expect(senderManager.enableSender).toHaveBeenCalledWith('sacn', 'sacn', {
      sender: 'sacn',
      universe: 11,
      networkInterface: '10.0.0.10',
      useUnicast: false,
      unicastDestination: undefined,
    })
  })

  it('restartControllers always performs post-init sender restore', async () => {
    const setManualBuffer = jest.fn()
    const resetSender = jest.fn().mockImplementation(() => Promise.resolve())
    const restoreFromPrefs = jest.fn().mockImplementation(() => Promise.resolve())
    const fake: RestartFake = Object.assign(Object.create(ControllerManager.prototype), {
      listenerLifecycle: listenerStub(),
      effectsController: { shutdown: jest.fn().mockImplementation(() => Promise.resolve()) },
      dmxPublisher: {
        shutdown: jest.fn().mockImplementation(() => Promise.resolve()),
        setManualBuffer,
      },
      cueHandler: { shutdown: jest.fn() },
      dmxLightManager: {},
      lightStateManager: {},
      lightTransitionController: {},
      sequencer: {},
      isInitialized: true,
      lifecyclePhase: 'running',
      consoleRestore: null,
      disableYarg: jest.fn().mockImplementation(() => Promise.resolve()),
      disableRb3: jest.fn().mockImplementation(() => Promise.resolve()),
      enableYarg: jest.fn().mockImplementation(() => Promise.resolve()),
      enableRb3: jest.fn().mockImplementation(() => Promise.resolve()),
      init: jest.fn().mockImplementation(function (this: RestartFake) {
        this.dmxPublisher = { setManualBuffer }
        this.isInitialized = true
        this.lifecyclePhase = 'running'
        return Promise.resolve()
      }),
      senderLifecycle: {
        resetSenderForControllerRestart: resetSender,
        getActiveOutputSenderSnapshotIfAny: jest.fn().mockReturnValue({
          sacn: true,
          artnet: false,
          enttecpro: false,
          opendmx: false,
        }),
        restoreSenderOutputsFromPrefs: restoreFromPrefs,
      },
      consoleMode: {
        onControllersReinitializedWhileConsoleOpen: jest.fn(),
        getConsoleRestore: jest.fn().mockReturnValue(null),
      },
    })

    await ControllerManager.prototype.restartControllers.call(fake as unknown as ControllerManager)

    expect(resetSender).toHaveBeenCalledTimes(1)
    const init = fake.init as jest.Mock
    expect(init).toHaveBeenCalledTimes(1)
    expect(restoreFromPrefs).toHaveBeenCalledTimes(1)
    expect(restoreFromPrefs).toHaveBeenCalledWith({
      sacn: true,
      artnet: false,
      enttecpro: false,
      opendmx: false,
    })
    expect(setManualBuffer).not.toHaveBeenCalled()
    expect(fake.lifecyclePhase).toBe('running')
  })

  it('restartControllers restores console phase when DMX console is open', async () => {
    const setManualBuffer = jest.fn()
    const fake: RestartFake = Object.assign(Object.create(ControllerManager.prototype), {
      listenerLifecycle: listenerStub(),
      effectsController: { shutdown: jest.fn().mockImplementation(() => Promise.resolve()) },
      dmxPublisher: {
        shutdown: jest.fn().mockImplementation(() => Promise.resolve()),
        setManualBuffer,
      },
      cueHandler: { shutdown: jest.fn() },
      dmxLightManager: {},
      lightStateManager: {},
      lightTransitionController: {},
      sequencer: {},
      isInitialized: true,
      lifecyclePhase: 'consoleMode',
      consoleRestore: { yarg: false, rb3: false, audio: false },
      disableYarg: jest.fn().mockImplementation(() => Promise.resolve()),
      disableRb3: jest.fn().mockImplementation(() => Promise.resolve()),
      enableYarg: jest.fn().mockImplementation(() => Promise.resolve()),
      enableRb3: jest.fn().mockImplementation(() => Promise.resolve()),
      init: jest.fn().mockImplementation(function (this: RestartFake) {
        this.dmxPublisher = { setManualBuffer }
        this.isInitialized = true
        this.lifecyclePhase = 'running'
        return Promise.resolve()
      }),
      senderLifecycle: {
        resetSenderForControllerRestart: jest.fn().mockImplementation(() => Promise.resolve()),
        getActiveOutputSenderSnapshotIfAny: jest.fn().mockReturnValue({
          sacn: true,
          artnet: false,
          enttecpro: false,
          opendmx: false,
        }),
        restoreSenderOutputsFromPrefs: jest.fn().mockImplementation(() => Promise.resolve()),
      },
    })
    Object.assign(fake, {
      consoleMode: {
        onControllersReinitializedWhileConsoleOpen: () => {
          if (fake.consoleRestore != null) {
            const pub = fake.dmxPublisher as { setManualBuffer: jest.Mock } | undefined
            pub?.setManualBuffer({})
          }
        },
        getConsoleRestore: () => ({ yarg: false, rb3: false, audio: false }),
      },
    })

    await ControllerManager.prototype.restartControllers.call(fake as unknown as ControllerManager)

    expect(setManualBuffer).toHaveBeenCalledWith({})
    expect(fake.lifecyclePhase).toBe('consoleMode')
  })

  it('repro flow: sender restore keeps same sACN universe across consecutive restarts', async () => {
    const { manager, senderManager } = makeManagerForRestore({
      dmxOutputConfig: {
        sacnEnabled: true,
        artNetEnabled: false,
        enttecProEnabled: false,
        openDmxEnabled: false,
      },
      sacnConfig: {
        universe: 7,
        networkInterface: '10.0.0.12',
        useUnicast: false,
        unicastDestination: '',
      },
    })

    await manager.restoreSenderOutputsFromPrefs()
    await manager.restoreSenderOutputsFromPrefs()

    expect(senderManager.enableSender).toHaveBeenCalledTimes(2)
    expect(senderManager.enableSender).toHaveBeenNthCalledWith(1, 'sacn', 'sacn', {
      sender: 'sacn',
      universe: 7,
      networkInterface: '10.0.0.12',
      useUnicast: false,
      unicastDestination: undefined,
    })
    expect(senderManager.enableSender).toHaveBeenNthCalledWith(2, 'sacn', 'sacn', {
      sender: 'sacn',
      universe: 7,
      networkInterface: '10.0.0.12',
      useUnicast: false,
      unicastDestination: undefined,
    })
  })

  it('ControllerManager enableConsoleMode delegates to ConsoleModeController and updates phase', async () => {
    const enableConsoleMode = jest
      .fn<(rigId: string) => Promise<{ success: true }>>()
      .mockResolvedValue({ success: true })
    const init = jest.fn().mockImplementation(() => Promise.resolve())
    const fake = Object.assign(Object.create(ControllerManager.prototype), {
      init,
      lifecyclePhase: 'running',
      consoleMode: { enableConsoleMode },
    })
    const result = await ControllerManager.prototype.enableConsoleMode.call(fake, 'rig-1')
    expect(init).toHaveBeenCalled()
    expect(enableConsoleMode).toHaveBeenCalledWith('rig-1')
    expect(result).toEqual({ success: true })
    expect((fake as { lifecyclePhase: string }).lifecyclePhase).toBe('consoleMode')
  })

  it('ControllerManager disableConsoleMode returns to running phase when active', async () => {
    const disableConsoleMode = jest
      .fn<() => Promise<{ success: true }>>()
      .mockResolvedValue({ success: true })
    const fake = Object.assign(Object.create(ControllerManager.prototype), {
      lifecyclePhase: 'consoleMode',
      consoleMode: { disableConsoleMode },
    })
    const result = await ControllerManager.prototype.disableConsoleMode.call(fake)
    expect(disableConsoleMode).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ success: true })
    expect((fake as { lifecyclePhase: string }).lifecyclePhase).toBe('running')
  })
})
