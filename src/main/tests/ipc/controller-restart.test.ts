import { describe, expect, it, jest } from '@jest/globals'

// Stub electron so BrowserWindow lookups inside sendToAllWindows don't crash on prototype-stub tests.
jest.mock('../../utils/windowUtils', () => ({
  sendToAllWindows: jest.fn(),
  hasBrowserWindows: () => false,
  mainRuntimeBroadcaster: { emit: jest.fn() },
}))

import { ControllerManager, LifecycleAbortedError } from '../../controllers/ControllerManager'
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

type RestartFake = Record<string, unknown> & {
  restartControllersInFlight?: Promise<void> | null
}

function listenerStub() {
  return {
    yargRb3: {
      getIsYargEnabled: jest.fn().mockReturnValue(false),
      getIsRb3Enabled: jest.fn().mockReturnValue(false),
    },
    audio: {
      getIsAudioEnabled: jest.fn().mockReturnValue(false),
      disableAudio: jest.fn().mockImplementation(() => Promise.resolve()),
      enableAudio: jest.fn().mockImplementation(() => Promise.resolve()),
    },
  }
}

describe('ControllerManager lifecycle and sender restore', () => {
  it('restartControllers throws when phase is not running, consoleMode, or failed', async () => {
    const fake = Object.assign(Object.create(ControllerManager.prototype), {
      lifecyclePhase: 'initializing',
    })
    await expect(
      ControllerManager.prototype.restartControllers.call(fake as unknown as ControllerManager),
    ).rejects.toThrow(/invalid lifecycle for restartControllers/)
  })

  it('restartControllers sets failed phase when init throws after teardown', async () => {
    const fake: RestartFake = Object.assign(Object.create(ControllerManager.prototype), {
      listenerLifecycle: listenerStub(),
      effectsController: { shutdown: jest.fn().mockImplementation(() => Promise.resolve()) },
      dmxPublisher: { shutdown: jest.fn().mockImplementation(() => Promise.resolve()) },
      cueHandler: { shutdown: jest.fn() },
      rigChains: [],
      clock: { destroy: jest.fn() },
      dmxLightManager: {},
      lightStateManager: {},
      lightTransitionController: {},
      sequencer: {},
      isInitialized: true,
      lifecyclePhase: 'running',
      disableYarg: jest.fn().mockImplementation(() => Promise.resolve()),
      disableRb3: jest.fn().mockImplementation(() => Promise.resolve()),
      enableYarg: jest.fn().mockImplementation(() => Promise.resolve()),
      enableRb3: jest.fn().mockImplementation(() => Promise.resolve()),
      init: jest.fn().mockImplementation(() => Promise.reject(new Error('init failed'))),
      senderLifecycle: {
        resetSenderForControllerRestart: jest.fn().mockImplementation(() => Promise.resolve()),
        getActiveOutputSenderSnapshotIfAny: jest.fn().mockReturnValue(null),
        restoreSenderOutputsFromPrefs: jest.fn().mockImplementation(() => Promise.resolve()),
      },
      consoleMode: {
        onControllersReinitializedWhileConsoleOpen: jest.fn(),
        getConsoleRestore: jest.fn().mockReturnValue(null),
      },
    })

    await expect(
      ControllerManager.prototype.restartControllers.call(fake as unknown as ControllerManager),
    ).rejects.toThrow('init failed')

    expect(fake.lifecyclePhase).toBe('failed')
    expect(fake.isInitialized).toBe(false)
  })

  it('concurrent restartControllers shares one in-flight restart', async () => {
    let release!: () => void
    const barrier = new Promise<void>((r) => {
      release = r
    })
    let initCount = 0
    const fake: RestartFake = Object.assign(Object.create(ControllerManager.prototype), {
      listenerLifecycle: listenerStub(),
      effectsController: { shutdown: jest.fn().mockImplementation(() => Promise.resolve()) },
      dmxPublisher: { shutdown: jest.fn().mockImplementation(() => Promise.resolve()) },
      cueHandler: { shutdown: jest.fn() },
      rigChains: [],
      clock: { destroy: jest.fn() },
      dmxLightManager: {},
      lightStateManager: {},
      lightTransitionController: {},
      sequencer: {},
      isInitialized: true,
      lifecyclePhase: 'running',
      disableYarg: jest.fn().mockImplementation(() => Promise.resolve()),
      disableRb3: jest.fn().mockImplementation(() => Promise.resolve()),
      enableYarg: jest.fn().mockImplementation(() => Promise.resolve()),
      enableRb3: jest.fn().mockImplementation(() => Promise.resolve()),
      init: jest.fn().mockImplementation(async function (this: RestartFake) {
        initCount += 1
        await barrier
        this.isInitialized = true
        this.lifecyclePhase = 'running'
      }),
      senderLifecycle: {
        resetSenderForControllerRestart: jest.fn().mockImplementation(() => Promise.resolve()),
        getActiveOutputSenderSnapshotIfAny: jest.fn().mockReturnValue(null),
        restoreSenderOutputsFromPrefs: jest.fn().mockImplementation(() => Promise.resolve()),
      },
      consoleMode: {
        onControllersReinitializedWhileConsoleOpen: jest.fn(),
        getConsoleRestore: jest.fn().mockReturnValue(null),
      },
    })

    const p1 = ControllerManager.prototype.restartControllers.call(
      fake as unknown as ControllerManager,
    )
    const p2 = ControllerManager.prototype.restartControllers.call(
      fake as unknown as ControllerManager,
    )
    release()
    await Promise.all([p1, p2])

    expect(initCount).toBe(1)
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
      maxOutputRate: 40,
      minRefreshRate: 40,
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
      ipc: false,
    })

    expect(senderManager.enableSender).toHaveBeenCalledTimes(1)
    expect(senderManager.enableSender).toHaveBeenCalledWith('sacn', 'sacn', {
      sender: 'sacn',
      universe: 11,
      networkInterface: '10.0.0.10',
      useUnicast: false,
      unicastDestination: undefined,
      maxOutputRate: 40,
      minRefreshRate: 40,
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
      rigChains: [],
      clock: { destroy: jest.fn() },
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
          ipc: false,
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
      ipc: false,
    })
    expect(setManualBuffer).not.toHaveBeenCalled()
    expect(fake.lifecyclePhase).toBe('running')
  })

  it('restartControllers passes ipc flag through snapshot so preview sender can be restored', async () => {
    const restoreFromPrefs = jest.fn().mockImplementation(() => Promise.resolve())
    const fake: RestartFake = Object.assign(Object.create(ControllerManager.prototype), {
      listenerLifecycle: listenerStub(),
      effectsController: { shutdown: jest.fn().mockImplementation(() => Promise.resolve()) },
      dmxPublisher: {
        shutdown: jest.fn().mockImplementation(() => Promise.resolve()),
        setManualBuffer: jest.fn(),
      },
      cueHandler: { shutdown: jest.fn() },
      rigChains: [],
      clock: { destroy: jest.fn() },
      dmxLightManager: {},
      lightStateManager: {},
      lightTransitionController: {},
      sequencer: {},
      isInitialized: true,
      lifecyclePhase: 'running',
      disableYarg: jest.fn().mockImplementation(() => Promise.resolve()),
      disableRb3: jest.fn().mockImplementation(() => Promise.resolve()),
      enableYarg: jest.fn().mockImplementation(() => Promise.resolve()),
      enableRb3: jest.fn().mockImplementation(() => Promise.resolve()),
      init: jest.fn().mockImplementation(function (this: RestartFake) {
        this.isInitialized = true
        this.lifecyclePhase = 'running'
        return Promise.resolve()
      }),
      senderLifecycle: {
        resetSenderForControllerRestart: jest.fn().mockImplementation(() => Promise.resolve()),
        getActiveOutputSenderSnapshotIfAny: jest.fn().mockReturnValue({
          sacn: false,
          artnet: false,
          enttecpro: false,
          opendmx: false,
          ipc: true,
        }),
        restoreSenderOutputsFromPrefs: restoreFromPrefs,
      },
      consoleMode: {
        onControllersReinitializedWhileConsoleOpen: jest.fn(),
        getConsoleRestore: jest.fn().mockReturnValue(null),
      },
    })

    await ControllerManager.prototype.restartControllers.call(fake as unknown as ControllerManager)

    expect(restoreFromPrefs).toHaveBeenCalledWith({
      sacn: false,
      artnet: false,
      enttecpro: false,
      opendmx: false,
      ipc: true,
    })
  })

  it('restartControllers disables and re-enables Audio when it was active', async () => {
    const listeners = listenerStub()
    const disableAudio = listeners.audio.disableAudio as jest.Mock
    const enableAudio = listeners.audio.enableAudio as jest.Mock
    ;(listeners.audio.getIsAudioEnabled as jest.Mock).mockReturnValue(true)

    const fake: RestartFake = Object.assign(Object.create(ControllerManager.prototype), {
      listenerLifecycle: listeners,
      effectsController: { shutdown: jest.fn().mockImplementation(() => Promise.resolve()) },
      dmxPublisher: {
        shutdown: jest.fn().mockImplementation(() => Promise.resolve()),
        setManualBuffer: jest.fn(),
      },
      cueHandler: { shutdown: jest.fn() },
      rigChains: [],
      clock: { destroy: jest.fn() },
      dmxLightManager: {},
      lightStateManager: {},
      lightTransitionController: {},
      sequencer: {},
      isInitialized: true,
      lifecyclePhase: 'running',
      disableYarg: jest.fn().mockImplementation(() => Promise.resolve()),
      disableRb3: jest.fn().mockImplementation(() => Promise.resolve()),
      enableYarg: jest.fn().mockImplementation(() => Promise.resolve()),
      enableRb3: jest.fn().mockImplementation(() => Promise.resolve()),
      init: jest.fn().mockImplementation(function (this: RestartFake) {
        this.isInitialized = true
        this.lifecyclePhase = 'running'
        return Promise.resolve()
      }),
      senderLifecycle: {
        resetSenderForControllerRestart: jest.fn().mockImplementation(() => Promise.resolve()),
        getActiveOutputSenderSnapshotIfAny: jest.fn().mockReturnValue(null),
        restoreSenderOutputsFromPrefs: jest.fn().mockImplementation(() => Promise.resolve()),
      },
      consoleMode: {
        onControllersReinitializedWhileConsoleOpen: jest.fn(),
        getConsoleRestore: jest.fn().mockReturnValue(null),
      },
    })

    await ControllerManager.prototype.restartControllers.call(fake as unknown as ControllerManager)

    expect(disableAudio).toHaveBeenCalledTimes(1)
    expect(enableAudio).toHaveBeenCalledTimes(1)
    expect(enableAudio).toHaveBeenCalledWith(true, expect.any(Function))
  })

  it('restartControllers does not touch Audio when Audio was not enabled', async () => {
    const listeners = listenerStub()
    const disableAudio = listeners.audio.disableAudio as jest.Mock
    const enableAudio = listeners.audio.enableAudio as jest.Mock

    const fake: RestartFake = Object.assign(Object.create(ControllerManager.prototype), {
      listenerLifecycle: listeners,
      effectsController: { shutdown: jest.fn().mockImplementation(() => Promise.resolve()) },
      dmxPublisher: {
        shutdown: jest.fn().mockImplementation(() => Promise.resolve()),
        setManualBuffer: jest.fn(),
      },
      cueHandler: { shutdown: jest.fn() },
      rigChains: [],
      clock: { destroy: jest.fn() },
      dmxLightManager: {},
      lightStateManager: {},
      lightTransitionController: {},
      sequencer: {},
      isInitialized: true,
      lifecyclePhase: 'running',
      disableYarg: jest.fn().mockImplementation(() => Promise.resolve()),
      disableRb3: jest.fn().mockImplementation(() => Promise.resolve()),
      enableYarg: jest.fn().mockImplementation(() => Promise.resolve()),
      enableRb3: jest.fn().mockImplementation(() => Promise.resolve()),
      init: jest.fn().mockImplementation(function (this: RestartFake) {
        this.isInitialized = true
        this.lifecyclePhase = 'running'
        return Promise.resolve()
      }),
      senderLifecycle: {
        resetSenderForControllerRestart: jest.fn().mockImplementation(() => Promise.resolve()),
        getActiveOutputSenderSnapshotIfAny: jest.fn().mockReturnValue(null),
        restoreSenderOutputsFromPrefs: jest.fn().mockImplementation(() => Promise.resolve()),
      },
      consoleMode: {
        onControllersReinitializedWhileConsoleOpen: jest.fn(),
        getConsoleRestore: jest.fn().mockReturnValue(null),
      },
    })

    await ControllerManager.prototype.restartControllers.call(fake as unknown as ControllerManager)

    expect(disableAudio).not.toHaveBeenCalled()
    expect(enableAudio).not.toHaveBeenCalled()
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
      rigChains: [],
      clock: { destroy: jest.fn() },
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
          ipc: false,
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
      maxOutputRate: 40,
      minRefreshRate: 40,
    })
    expect(senderManager.enableSender).toHaveBeenNthCalledWith(2, 'sacn', 'sacn', {
      sender: 'sacn',
      universe: 7,
      networkInterface: '10.0.0.12',
      useUnicast: false,
      unicastDestination: undefined,
      maxOutputRate: 40,
      minRefreshRate: 40,
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

  it('init() throws LifecycleAbortedError when phase is shuttingDown', async () => {
    const fake = Object.assign(Object.create(ControllerManager.prototype), {
      lifecyclePhase: 'shuttingDown',
      isInitialized: false,
    })
    await expect(ControllerManager.prototype.init.call(fake)).rejects.toBeInstanceOf(
      LifecycleAbortedError,
    )
  })

  it('runRestartControllers aborts cleanly if shutdown begins between teardown and reinit', async () => {
    const init = jest.fn().mockImplementation(() => Promise.resolve())
    const fake: RestartFake = Object.assign(Object.create(ControllerManager.prototype), {
      listenerLifecycle: listenerStub(),
      effectsController: { shutdown: jest.fn().mockImplementation(() => Promise.resolve()) },
      dmxPublisher: { shutdown: jest.fn().mockImplementation(() => Promise.resolve()) },
      cueHandler: { shutdown: jest.fn() },
      rigChains: [],
      clock: { destroy: jest.fn() },
      dmxLightManager: {},
      lightStateManager: {},
      lightTransitionController: {},
      sequencer: {},
      isInitialized: true,
      lifecyclePhase: 'running',
      controllerShutdownPromise: null,
      disableYarg: jest.fn().mockImplementation(() => Promise.resolve()),
      disableRb3: jest.fn().mockImplementation(() => Promise.resolve()),
      enableYarg: jest.fn().mockImplementation(() => Promise.resolve()),
      enableRb3: jest.fn().mockImplementation(() => Promise.resolve()),
      init,
      senderLifecycle: {
        // Simulate shutdown starting concurrently: after sender reset, an outside actor
        // flips lifecyclePhase to 'shuttingDown' (as ControllerManager.shutdown would).
        resetSenderForControllerRestart: jest.fn().mockImplementation(function (this: RestartFake) {
          fake.lifecyclePhase = 'shuttingDown'
          return Promise.resolve()
        }),
        getActiveOutputSenderSnapshotIfAny: jest.fn().mockReturnValue(null),
        restoreSenderOutputsFromPrefs: jest.fn().mockImplementation(() => Promise.resolve()),
      },
      consoleMode: {
        onControllersReinitializedWhileConsoleOpen: jest.fn(),
        getConsoleRestore: jest.fn().mockReturnValue(null),
      },
    })

    await expect(
      ControllerManager.prototype.restartControllers.call(fake as unknown as ControllerManager),
    ).rejects.toBeInstanceOf(LifecycleAbortedError)

    // init() must NOT run after shutdown begins; phase stays at 'shuttingDown' so the shutdown
    // promise can complete the transition to 'stopped'.
    expect(init).not.toHaveBeenCalled()
    expect(fake.lifecyclePhase).toBe('shuttingDown')
  })

  it('disableYarg awaits an in-flight restart before disabling', async () => {
    let restartReleased = false
    let resolveRestart!: () => void
    const restartBarrier = new Promise<void>((r) => {
      resolveRestart = r
    })
    const yargDisable = jest.fn().mockImplementation(() => Promise.resolve())
    const fake = Object.assign(Object.create(ControllerManager.prototype), {
      restartControllersInFlight: restartBarrier.then(() => {
        restartReleased = true
      }),
      controllerShutdownPromise: null,
      listenerLifecycle: { yargRb3: { disableYarg: yargDisable } },
    })

    const disablePromise = ControllerManager.prototype.disableYarg.call(
      fake as unknown as ControllerManager,
    )

    // Give the microtask queue a turn; disableYarg should still be waiting on the in-flight restart.
    await Promise.resolve()
    expect(yargDisable).not.toHaveBeenCalled()

    resolveRestart()
    await disablePromise

    expect(restartReleased).toBe(true)
    expect(yargDisable).toHaveBeenCalledTimes(1)
  })

  it('shutdown.call against fresh stub uses the in-flight promise (no double shutdown)', async () => {
    let releaseInner!: () => void
    const inner = new Promise<void>((r) => {
      releaseInner = r
    })
    const senderShutdown = jest.fn().mockImplementation(() => inner)
    const stub = Object.create(ControllerManager.prototype) as Record<string, unknown> & {
      lifecyclePhase: string
      isInitialized: boolean
      listenerLifecycle: unknown
      nodeCueLoader: null
      effectLoader: null
      cueHandler: null
      rigChains: Array<{ rigId: string; dispose: jest.Mock }>
      clock: { destroy: jest.Mock } | null
      dmxLightManager: null
      effectsController: null
      dmxPublisher: { shutdown: jest.Mock }
      senderLifecycle: { shutdownSenderOnAppExit: jest.Mock }
    }
    stub.lifecyclePhase = 'running'
    stub.isInitialized = true
    stub.listenerLifecycle = {
      yargRb3: {
        disableYarg: jest.fn().mockImplementation(() => Promise.resolve()),
        disableRb3: jest.fn().mockImplementation(() => Promise.resolve()),
      },
      audio: { disableAudio: jest.fn().mockImplementation(() => Promise.resolve()) },
    }
    stub.nodeCueLoader = null
    stub.effectLoader = null
    stub.cueHandler = null
    stub.rigChains = [
      { rigId: 'merged', dispose: jest.fn().mockImplementation(() => Promise.resolve()) },
    ]
    stub.clock = { destroy: jest.fn() }
    stub.dmxLightManager = null
    stub.effectsController = null
    stub.dmxPublisher = { shutdown: jest.fn().mockImplementation(() => Promise.resolve()) }
    stub.senderLifecycle = { shutdownSenderOnAppExit: senderShutdown }

    const p1 = ControllerManager.prototype.shutdown.call(stub as unknown as ControllerManager)
    const p2 = ControllerManager.prototype.shutdown.call(stub as unknown as ControllerManager)
    releaseInner()
    await Promise.all([p1, p2])

    expect(senderShutdown).toHaveBeenCalledTimes(1)
    expect(stub.lifecyclePhase).toBe('stopped')
  })
})
