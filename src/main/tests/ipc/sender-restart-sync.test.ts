import { describe, expect, it, jest } from '@jest/globals'
import { ControllerManager } from '../../controllers/ControllerManager'

type SenderManagerLike = {
  enableSender: jest.Mock<any>
  shutdown?: jest.Mock<any>
  isSenderEnabled?: jest.Mock<any>
}

function makeManagerForRestore(prefs: Record<string, unknown>): {
  manager: ControllerManager
  senderManager: SenderManagerLike
} {
  const senderManager: SenderManagerLike = {
    enableSender: jest.fn().mockImplementation(() => Promise.resolve()),
  }
  const manager = Object.create(ControllerManager.prototype) as any
  manager.config = { getAllPreferences: () => prefs }
  manager.senderManager = senderManager
  manager.ensureSenderManager = jest.fn()
  return { manager: manager as ControllerManager, senderManager }
}

describe('ControllerManager sender restore lifecycle', () => {
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
    const senderManager = {
      isSenderEnabled: jest.fn((id: string) => id === 'sacn'),
      shutdown: jest.fn().mockImplementation(() => Promise.resolve()),
    }
    const fake = {
      listenerCoordinator: {
        getIsYargEnabled: jest.fn().mockReturnValue(false),
        getIsRb3Enabled: jest.fn().mockReturnValue(false),
      },
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
      consoleRestore: null,
      disableYarg: jest.fn().mockImplementation(() => Promise.resolve()),
      disableRb3: jest.fn().mockImplementation(() => Promise.resolve()),
      enableYarg: jest.fn().mockImplementation(() => Promise.resolve()),
      enableRb3: jest.fn().mockImplementation(() => Promise.resolve()),
      init: jest.fn().mockImplementation(function (this: any) {
        this.dmxPublisher = { setManualBuffer }
        return Promise.resolve()
      }),
      restoreSenderOutputsFromPrefs: jest.fn().mockImplementation(() => Promise.resolve()),
      senderManager,
    }

    await ControllerManager.prototype.restartControllers.call(fake)

    expect(senderManager.shutdown).toHaveBeenCalledTimes(1)
    expect(fake.init).toHaveBeenCalledTimes(1)
    expect(fake.restoreSenderOutputsFromPrefs).toHaveBeenCalledTimes(1)
    expect(fake.restoreSenderOutputsFromPrefs).toHaveBeenCalledWith({
      sacn: true,
      artnet: false,
      enttecpro: false,
      opendmx: false,
    })
    expect(setManualBuffer).not.toHaveBeenCalled()
  })

  it('restartControllers reapplies manual mode when console mode is active', async () => {
    const setManualBuffer = jest.fn()
    const senderManager = {
      isSenderEnabled: jest.fn((id: string) => id === 'sacn'),
      shutdown: jest.fn().mockImplementation(() => Promise.resolve()),
    }
    const fake = {
      listenerCoordinator: {
        getIsYargEnabled: jest.fn().mockReturnValue(false),
        getIsRb3Enabled: jest.fn().mockReturnValue(false),
      },
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
      consoleRestore: { yarg: false, rb3: false, audio: false },
      disableYarg: jest.fn().mockImplementation(() => Promise.resolve()),
      disableRb3: jest.fn().mockImplementation(() => Promise.resolve()),
      enableYarg: jest.fn().mockImplementation(() => Promise.resolve()),
      enableRb3: jest.fn().mockImplementation(() => Promise.resolve()),
      init: jest.fn().mockImplementation(function (this: any) {
        this.dmxPublisher = { setManualBuffer }
        return Promise.resolve()
      }),
      restoreSenderOutputsFromPrefs: jest.fn().mockImplementation(() => Promise.resolve()),
      senderManager,
    }

    await ControllerManager.prototype.restartControllers.call(fake)

    expect(setManualBuffer).toHaveBeenCalledWith({})
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

    // App start -> restore sender from prefs.
    await manager.restoreSenderOutputsFromPrefs()
    // Calibration/config update -> restart -> restore sender again.
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

  it('enableConsoleMode stops active simulation via onConsoleEnter callback', async () => {
    const onConsoleEnter = jest.fn()
    const setManualBuffer = jest.fn()
    const fake = {
      init: jest.fn().mockImplementation(() => Promise.resolve()),
      config: {
        getDmxRig: jest.fn().mockReturnValue({ id: 'rig-1' }),
      },
      onConsoleEnter,
      consoleRestore: null,
      listenerCoordinator: {
        getIsYargEnabled: jest.fn().mockReturnValue(false),
        getIsRb3Enabled: jest.fn().mockReturnValue(false),
      },
      getIsAudioEnabled: jest.fn().mockReturnValue(false),
      disableYarg: jest.fn().mockImplementation(() => Promise.resolve()),
      disableRb3: jest.fn().mockImplementation(() => Promise.resolve()),
      disableAudio: jest.fn().mockImplementation(() => Promise.resolve()),
      dmxPublisher: { setManualBuffer },
    }

    const result = await ControllerManager.prototype.enableConsoleMode.call(fake, 'rig-1')

    expect(result).toEqual({ success: true })
    expect(onConsoleEnter).toHaveBeenCalledTimes(1)
    expect(setManualBuffer).toHaveBeenCalledWith({})
  })

  it('disableConsoleMode always restores saved listeners and audio after clearing manual mode', async () => {
    const clearManualBuffer = jest.fn()
    const fake = {
      consoleRestore: { yarg: false, rb3: true, audio: true },
      dmxPublisher: { clearManualBuffer },
      enableYarg: jest.fn().mockImplementation(() => Promise.resolve()),
      enableRb3: jest.fn().mockImplementation(() => Promise.resolve()),
      enableAudio: jest.fn().mockImplementation(() => Promise.resolve()),
    }

    const result = await ControllerManager.prototype.disableConsoleMode.call(fake)

    expect(result).toEqual({ success: true })
    expect(clearManualBuffer).toHaveBeenCalledTimes(1)
    expect(fake.enableYarg).not.toHaveBeenCalled()
    expect(fake.enableRb3).toHaveBeenCalledTimes(1)
    expect(fake.enableAudio).toHaveBeenCalledTimes(1)
    expect(fake.consoleRestore).toBeNull()
  })
})
