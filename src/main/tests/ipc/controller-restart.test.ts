import { describe, expect, it, jest } from '@jest/globals'

// ConfigFile and the loaders resolve their base directory from app.getPath('appData').
jest.mock('electron', () => ({
  app: { getPath: jest.fn(() => '/tmp/photonics-test') },
}))

// Broadcasts to the windows go nowhere under test.
jest.mock('../../utils/windowUtils', () => ({
  sendToAllWindows: jest.fn(),
  hasBrowserWindows: () => false,
  mainRuntimeBroadcaster: { emit: jest.fn() },
}))

import { LifecycleAbortedError } from '../../controllers/ControllerManager'
import {
  consoleModeStub,
  lifecycleAt,
  lifecycleBlockedOn,
  lifecycleShuttingDownOn,
  listenerStub,
  senderLifecycleStub,
  stubbedManager,
} from '../controllers/lifecycleStub'
import { SenderLifecycleController } from '../../controllers/SenderLifecycleController'
import { sendToAllWindows } from '../../utils/windowUtils'
import { RENDERER_RECEIVE } from '../../../shared/ipcChannels'
import { DMX_OUTPUT_REFRESH_RATE_HZ_DEFAULT } from '../../../shared/dmxOutputRefresh'

/** A promise and the call that settles it. */
function barrier(): { wait: Promise<void>; release: () => void } {
  let release!: () => void
  const wait = new Promise<void>((resolve) => {
    release = resolve
  })
  return { wait, release }
}

const SNAPSHOT_NONE = { sacn: false, artnet: false, enttecpro: false, opendmx: false, ipc: false }

describe('ControllerManager restart', () => {
  it('refuses a restart outside running, console mode or failed', async () => {
    const { manager } = stubbedManager({ lifecycle: lifecycleAt('initializing') })

    await expect(manager.restartControllers()).rejects.toThrow(
      /invalid lifecycle for restartControllers/,
    )
  })

  it('enters the failed phase when the rebuild after teardown throws', async () => {
    const { manager, lifecycle } = stubbedManager({
      init: () => Promise.reject(new Error('init failed')),
    })

    await expect(manager.restartControllers()).rejects.toThrow('init failed')

    expect(lifecycle.phase).toBe('failed')
    expect(manager.getIsInitialized()).toBe(false)
  })

  it('shares one in-flight restart between overlapping callers', async () => {
    const rebuild = barrier()
    const { manager, init } = stubbedManager({
      init: async (lifecycle) => {
        await rebuild.wait
        lifecycle.setPhase('running')
      },
    })

    const first = manager.restartControllers()
    const second = manager.restartControllers()
    rebuild.release()
    await Promise.all([first, second])

    expect(init).toHaveBeenCalledTimes(1)
  })

  it('runs again with what was saved when a restart is requested once the rebuild began', async () => {
    const rebuild = barrier()
    const { manager, init } = stubbedManager({
      init: async (lifecycle) => {
        if (init.mock.calls.length === 1) await rebuild.wait
        lifecycle.setPhase('running')
      },
    })

    const first = manager.restartControllers()
    for (let i = 0; i < 20 && init.mock.calls.length === 0; i++) await Promise.resolve()
    expect(init).toHaveBeenCalledTimes(1)
    const second = manager.restartControllers()
    rebuild.release()
    await Promise.all([first, second])

    expect(init).toHaveBeenCalledTimes(2)
  })

  it('reads which listeners run only once a listener op ahead of it settles', async () => {
    const op = barrier()
    const { manager, listeners } = stubbedManager({ lifecycle: lifecycleBlockedOn(op.wait) })

    const restarting = manager.restartControllers()
    await Promise.resolve()
    await Promise.resolve()
    expect(listeners.yargRb3.getIsYargEnabled).not.toHaveBeenCalled()

    op.release()
    await restarting
    expect(listeners.yargRb3.getIsYargEnabled).toHaveBeenCalled()
  })

  it('shuts down the domain cue handler refs and resets the strobe state during teardown', async () => {
    const { manager, graph } = stubbedManager()

    await manager.restartControllers()

    expect(graph.shutdownDomainCueHandlerRefs).toHaveBeenCalledTimes(1)
    expect(graph.resetStrobeState).toHaveBeenCalledTimes(1)
  })

  it('waits out an RB3 teardown already reporting disabled before disposing rig chains', async () => {
    const teardown = barrier()
    const listeners = listenerStub()
    // A runtime error has started tearing RB3 down: the flag already reads false, but the teardown
    // is still blacking out and closing the socket, and only disableRb3 waits for it.
    listeners.yargRb3.disableRb3.mockImplementation(() => teardown.wait)
    const { manager, graph } = stubbedManager({ listeners })

    const restarting = manager.restartControllers()
    await new Promise((resolve) => setImmediate(resolve))
    expect(listeners.yargRb3.disableRb3).toHaveBeenCalledTimes(1)
    expect(graph.disposeChainsForRestart).not.toHaveBeenCalled()

    teardown.release()
    await restarting

    expect(graph.disposeChainsForRestart).toHaveBeenCalledTimes(1)
    expect(listeners.yargRb3.enableRb3).not.toHaveBeenCalled()
  })

  it('reports the phase its lifecycle holds', () => {
    const { manager } = stubbedManager({ lifecycle: lifecycleAt('restarting') })

    expect(manager.getLifecyclePhase()).toBe('restarting')
  })

  it('restores the senders the snapshot held once the rebuild is up, and says it restarted', async () => {
    const senders = senderLifecycleStub()
    const snapshot = { ...SNAPSHOT_NONE, sacn: true }
    senders.getActiveOutputSenderSnapshotIfAny.mockReturnValue(snapshot)
    const { manager, lifecycle, init } = stubbedManager({ senders })

    await manager.restartControllers()

    expect(senders.resetSenderForControllerRestart).toHaveBeenCalledTimes(1)
    expect(init).toHaveBeenCalledTimes(1)
    expect(senders.restoreRunningSenders).toHaveBeenCalledTimes(1)
    expect(senders.restoreRunningSenders).toHaveBeenCalledWith(snapshot)
    expect(lifecycle.phase).toBe('running')
    // The restart announces itself once, for every window.
    expect(jest.mocked(sendToAllWindows)).toHaveBeenCalledWith(
      RENDERER_RECEIVE.CONTROLLERS_RESTARTED,
      undefined,
    )
  })

  it('carries the preview sender through the snapshot so it can be restored', async () => {
    const senders = senderLifecycleStub()
    senders.getActiveOutputSenderSnapshotIfAny.mockReturnValue({ ...SNAPSHOT_NONE, ipc: true })
    const { manager } = stubbedManager({ senders })

    await manager.restartControllers()

    expect(senders.restoreRunningSenders).toHaveBeenCalledWith({
      ...SNAPSHOT_NONE,
      ipc: true,
    })
  })

  it('stops and restarts audio when it was running', async () => {
    const listeners = listenerStub()
    listeners.audio.getIsAudioEnabled.mockReturnValue(true)
    const { manager } = stubbedManager({ listeners })

    await manager.restartControllers()

    expect(listeners.audio.disableAudio).toHaveBeenCalledTimes(1)
    expect(listeners.audio.enableAudio).toHaveBeenCalledTimes(1)
    expect(listeners.audio.enableAudio).toHaveBeenCalledWith(true, expect.any(Function))
  })

  it('brings back the listener alone when a snapshot holds both it and audio', async () => {
    const listeners = listenerStub()
    listeners.audio.getIsAudioEnabled.mockReturnValue(true)
    listeners.yargRb3.getIsYargEnabled.mockReturnValue(true)
    const { manager } = stubbedManager({ listeners })

    await manager.restartControllers()

    expect(listeners.yargRb3.enableYarg).toHaveBeenCalledTimes(1)
    expect(listeners.audio.enableAudio).not.toHaveBeenCalled()
  })

  it('leaves audio alone when it was not running', async () => {
    const { manager, listeners } = stubbedManager()

    await manager.restartControllers()

    expect(listeners.audio.disableAudio).not.toHaveBeenCalled()
    expect(listeners.audio.enableAudio).not.toHaveBeenCalled()
  })

  it('hands back to an open DMX console and returns to its phase', async () => {
    const consoleMode = consoleModeStub()
    consoleMode.getConsoleRestore.mockReturnValue({ yarg: false, rb3: false, audio: false })
    const { manager, lifecycle } = stubbedManager({
      lifecycle: lifecycleAt('consoleMode'),
      consoleMode,
    })

    await manager.restartControllers()

    expect(consoleMode.onControllersReinitializedWhileConsoleOpen).toHaveBeenCalled()
    expect(lifecycle.phase).toBe('consoleMode')
  })

  it('aborts without rebuilding when a shutdown begins between teardown and rebuild', async () => {
    const senders = senderLifecycleStub()
    const { manager, lifecycle, init } = stubbedManager({ senders })
    senders.resetSenderForControllerRestart.mockImplementation(async () => {
      lifecycle.setPhase('shuttingDown')
    })

    await expect(manager.restartControllers()).rejects.toBeInstanceOf(LifecycleAbortedError)

    // The phase stays shutting down so the shutdown can take it on to stopped.
    expect(init).not.toHaveBeenCalled()
    expect(lifecycle.phase).toBe('shuttingDown')
  })

  it('reopens no listener or sender when a shutdown begins during the rebuild', async () => {
    const listeners = listenerStub()
    listeners.yargRb3.getIsYargEnabled.mockReturnValue(true)
    const { manager, lifecycle, senders } = stubbedManager({
      listeners,
      init: async (current) => {
        current.setPhase('shuttingDown')
      },
    })

    await expect(manager.restartControllers()).rejects.toBeInstanceOf(LifecycleAbortedError)

    expect(listeners.yargRb3.enableYarg).not.toHaveBeenCalled()
    expect(senders.restoreRunningSenders).not.toHaveBeenCalled()
    expect(lifecycle.phase).toBe('shuttingDown')
  })

  it('runs every registered teardown on restart and on shutdown, less one taken back', async () => {
    const { manager } = stubbedManager()
    const kept = jest.fn()
    const takenBack = jest.fn()
    const unregister = manager.addOnControllerRestart(takenBack)
    manager.addOnControllerRestart(kept)

    await manager.restartControllers()
    unregister()
    await manager.shutdown()

    expect(takenBack).toHaveBeenCalledTimes(1)
    expect(kept).toHaveBeenCalledTimes(2)
  })
})

describe('ControllerManager lifecycle queue', () => {
  it('runs a listener toggle queued behind a restart once the restart finishes', async () => {
    const rebuild = barrier()
    const order: string[] = []
    const listeners = listenerStub()
    listeners.yargRb3.disableYarg.mockImplementation(async () => {
      order.push('disable')
    })
    const { manager } = stubbedManager({
      listeners,
      init: async (lifecycle) => {
        await rebuild.wait
        order.push('restart')
        lifecycle.setPhase('running')
      },
    })

    const restarting = manager.restartControllers()
    const disabling = manager.disableYarg()
    await Promise.resolve()
    await Promise.resolve()
    expect(listeners.yargRb3.disableYarg).not.toHaveBeenCalled()

    rebuild.release()
    await Promise.all([restarting, disabling])

    expect(order).toEqual(['restart', 'disable'])
  })

  it('disables YARG once an in-flight shutdown settles', async () => {
    const shutdown = barrier()
    const { manager, listeners } = stubbedManager({
      lifecycle: lifecycleShuttingDownOn(shutdown.wait, 'running'),
    })

    const disabling = manager.disableYarg()
    await Promise.resolve()
    expect(listeners.yargRb3.disableYarg).not.toHaveBeenCalled()

    shutdown.release()
    await disabling

    expect(listeners.yargRb3.disableYarg).toHaveBeenCalledTimes(1)
  })

  it('settles a listener toggle and a restart asked for in the same tick', async () => {
    const order: string[] = []
    const listeners = listenerStub()
    listeners.yargRb3.enableYarg.mockImplementation(async () => {
      order.push('toggle')
    })
    const { manager, lifecycle } = stubbedManager({
      listeners,
      init: async (current) => {
        order.push('restart')
        current.setPhase('running')
      },
    })

    await Promise.all([manager.enableYarg(), manager.restartControllers()])

    expect(order).toEqual(['toggle', 'restart'])
    expect(lifecycle.isRestartInFlight()).toBe(false)
  })

  it('shares one shutdown between overlapping callers', async () => {
    const senderShutdown = barrier()
    const senders = senderLifecycleStub()
    senders.shutdownSenderOnAppExit.mockImplementation(() => senderShutdown.wait)
    const { manager, lifecycle } = stubbedManager({ senders })

    const first = manager.shutdown()
    const second = manager.shutdown()
    senderShutdown.release()
    await Promise.all([first, second])

    expect(senders.shutdownSenderOnAppExit).toHaveBeenCalledTimes(1)
    expect(lifecycle.phase).toBe('stopped')
  })

  it('runs a sender operation after the lifecycle op ahead of it, on the sender manager that op leaves', async () => {
    const op = barrier()
    const before = { id: 'before' }
    const after = { id: 'after' }
    let current = before
    const senders = senderLifecycleStub()
    senders.getSenderManager.mockImplementation(() => current)
    const { manager } = stubbedManager({ lifecycle: lifecycleBlockedOn(op.wait), senders })
    const run = jest.fn(async (sendersNow: unknown) => sendersNow)

    const running = manager.runSenderOp(run as never)
    await Promise.resolve()
    expect(run).not.toHaveBeenCalled()
    current = after
    op.release()

    await expect(running).resolves.toBe(after)
  })
})

describe('ControllerManager console mode', () => {
  it('enters console mode through its console controller and takes its phase', async () => {
    const consoleMode = {
      ...consoleModeStub(),
      enableConsoleMode: jest.fn(async (_rigId: string) => ({ success: true as const })),
    }
    const { manager, lifecycle } = stubbedManager({ consoleMode })

    const result = await manager.enableConsoleMode('rig-1')

    expect(consoleMode.enableConsoleMode).toHaveBeenCalledWith('rig-1')
    expect(result).toEqual({ success: true })
    expect(lifecycle.phase).toBe('consoleMode')
  })

  it('waits for a restart in flight and then enters console mode', async () => {
    const teardown = barrier()
    const listeners = listenerStub()
    // Every restart awaits disableRb3, so holding it holds the teardown.
    listeners.yargRb3.disableRb3.mockImplementation(() => teardown.wait)
    const consoleMode = {
      ...consoleModeStub(),
      enableConsoleMode: jest.fn(async (_rigId: string) => ({ success: true as const })),
    }
    const { manager, lifecycle } = stubbedManager({
      listeners,
      consoleMode,
      // The manager's own init returns at once while the graph still counts as initialized.
      init: async (current) => {
        if (!manager.getIsInitialized()) current.setPhase('running')
      },
    })

    const restart = manager.restartControllers()
    await Promise.resolve()
    expect(lifecycle.phase).toBe('restarting')
    const entering = manager.enableConsoleMode('rig-1')
    await Promise.resolve()
    expect(consoleMode.enableConsoleMode).not.toHaveBeenCalled()
    teardown.release()
    await restart

    await expect(entering).resolves.toEqual({ success: true })
    expect(lifecycle.phase).toBe('consoleMode')
  })

  it('answers in plain words when the controllers cannot take the console', async () => {
    const consoleMode = {
      ...consoleModeStub(),
      enableConsoleMode: jest.fn(async (_rigId: string) => ({ success: true as const })),
    }
    const { manager } = stubbedManager({
      lifecycle: lifecycleAt('shuttingDown'),
      consoleMode,
      init: async () => {},
    })

    const result = await manager.enableConsoleMode('rig-1')

    expect(result).toEqual({ success: false, error: expect.stringMatching(/controllers/i) })
    expect(result).not.toEqual({ success: false, error: expect.stringMatching(/phase=/) })
    expect(consoleMode.enableConsoleMode).not.toHaveBeenCalled()
  })

  it('pauses a listener that a toggle queued ahead of it turns on', async () => {
    const queue = barrier()
    const listeners = listenerStub()
    let yargOn = false
    listeners.yargRb3.getIsYargEnabled.mockImplementation(() => yargOn)
    listeners.yargRb3.enableYarg.mockImplementation(async () => {
      yargOn = true
    })
    listeners.yargRb3.disableYarg.mockImplementation(async () => {
      yargOn = false
    })
    const { manager, lifecycle } = stubbedManager({
      lifecycle: lifecycleBlockedOn(queue.wait),
      listeners,
      ownConsoleMode: true,
    })

    const enablingYarg = manager.enableYarg()
    const entering = manager.enableConsoleMode('rig-1')
    queue.release()
    await enablingYarg

    await expect(entering).resolves.toEqual({ success: true })
    expect(yargOn).toBe(false)
    expect(lifecycle.phase).toBe('consoleMode')
  })

  it('leaves the phase shutting down when a shutdown starts while console mode comes up', async () => {
    const entered = barrier()
    const enable = barrier()
    const consoleMode = {
      ...consoleModeStub(),
      enableConsoleMode: jest.fn(async () => {
        entered.release()
        await enable.wait
        return { success: true as const }
      }),
    }
    const { manager, lifecycle } = stubbedManager({ consoleMode })

    const enabling = manager.enableConsoleMode('rig-1')
    await entered.wait
    lifecycle.setPhase('shuttingDown')
    enable.release()
    await enabling

    expect(lifecycle.phase).toBe('shuttingDown')
  })

  it('returns to running when console mode ends', async () => {
    const consoleMode = {
      ...consoleModeStub(),
      disableConsoleMode: jest.fn(async () => ({ success: true as const })),
    }
    const { manager, lifecycle } = stubbedManager({
      lifecycle: lifecycleAt('consoleMode'),
      consoleMode,
    })

    const result = await manager.disableConsoleMode()

    expect(consoleMode.disableConsoleMode).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ success: true })
    expect(lifecycle.phase).toBe('running')
  })

  it('refuses to build the graph once a shutdown has begun', async () => {
    const { manager } = stubbedManager({ lifecycle: lifecycleAt('shuttingDown') })
    // The stand-in build is set aside so the manager's own init answers.
    const own = Object.getPrototypeOf(manager).init as () => Promise<void>
    ;(manager as unknown as { isInitialized: boolean }).isInitialized = false

    await expect(own.call(manager)).rejects.toBeInstanceOf(LifecycleAbortedError)
  })
})

/** A sender lifecycle over saved preferences, with its sender manager's enable watched. */
function senderLifecycleWith(prefs: Record<string, unknown>) {
  const lifecycle = new SenderLifecycleController(
    () => ({ getAllPreferences: () => prefs }) as never,
    { broadcaster: { emit: () => {} }, hasReceivers: () => false } as never,
  )
  const enableSender = jest
    .spyOn(lifecycle.getSenderManager(), 'enableSender')
    .mockImplementation(async () => {})
  return { lifecycle, enableSender }
}

describe('SenderLifecycleController.restoreRunningSenders', () => {
  it('restores an enabled sACN sender with its saved mapping', async () => {
    const { lifecycle, enableSender } = senderLifecycleWith({
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

    await lifecycle.restoreRunningSenders({ ...SNAPSHOT_NONE, sacn: true })

    expect(enableSender).toHaveBeenCalledTimes(1)
    expect(enableSender).toHaveBeenCalledWith('sacn', 'sacn', {
      sender: 'sacn',
      universe: 42,
      networkInterface: '192.168.1.10',
      useUnicast: true,
      unicastDestination: '192.168.1.50',
      maxOutputRate: DMX_OUTPUT_REFRESH_RATE_HZ_DEFAULT,
      minRefreshRate: DMX_OUTPUT_REFRESH_RATE_HZ_DEFAULT,
    })
  })

  it('skips serial and network senders missing a required saved field', async () => {
    const { lifecycle, enableSender } = senderLifecycleWith({
      dmxOutputConfig: {
        sacnEnabled: false,
        artNetEnabled: true,
        enttecProEnabled: true,
        openDmxEnabled: true,
      },
      artNetConfig: { host: '', universe: 1, net: 0, subnet: 0, subuni: 0, port: 6454 },
      enttecProConfig: { port: '' },
      openDmxConfig: { port: '', dmxSpeed: 40 },
    })

    await lifecycle.restoreRunningSenders({
      ...SNAPSHOT_NONE,
      artnet: true,
      enttecpro: true,
      opendmx: true,
    })

    expect(enableSender).not.toHaveBeenCalled()
  })

  it.each([
    [5, 5],
    [0, 1],
    [900, 44],
  ])('brings a saved OpenDMX rate of %p into range as %p', async (stored, restored) => {
    const { lifecycle, enableSender } = senderLifecycleWith({
      dmxOutputConfig: {
        sacnEnabled: false,
        artNetEnabled: false,
        enttecProEnabled: false,
        openDmxEnabled: true,
      },
      openDmxConfig: { port: 'COM4', dmxSpeed: stored },
    })

    await lifecycle.restoreRunningSenders({ ...SNAPSHOT_NONE, opendmx: true })

    expect(enableSender).toHaveBeenCalledWith('opendmx', 'opendmx', {
      sender: 'opendmx',
      devicePath: 'COM4',
      dmxSpeed: restored,
    })
  })

  it('leaves Art-Net off when the saved host is not an address', async () => {
    // The file is hand-editable, so the host is checked on the way out as well as on the way in.
    const { lifecycle, enableSender } = senderLifecycleWith({
      dmxOutputConfig: {
        sacnEnabled: false,
        artNetEnabled: true,
        enttecProEnabled: false,
        openDmxEnabled: false,
      },
      artNetConfig: {
        host: 'http://attacker.example',
        universe: 1,
        net: 0,
        subnet: 0,
        subuni: 0,
        port: 6454,
      },
    })

    await lifecycle.restoreRunningSenders({ ...SNAPSHOT_NONE, artnet: true })

    expect(enableSender).not.toHaveBeenCalled()
  })

  it('leaves sACN off when the saved universe is out of range', async () => {
    const { lifecycle, enableSender } = senderLifecycleWith({
      dmxOutputConfig: {
        sacnEnabled: true,
        artNetEnabled: false,
        enttecProEnabled: false,
        openDmxEnabled: false,
      },
      sacnConfig: { universe: 70000, useUnicast: false, unicastDestination: '' },
    })

    await lifecycle.restoreRunningSenders({ ...SNAPSHOT_NONE, sacn: true })

    expect(enableSender).not.toHaveBeenCalled()
  })

  it('restores only the senders that ran, whatever outputs the saved flags offer', async () => {
    const { lifecycle, enableSender } = senderLifecycleWith({
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
      artNetConfig: { host: '127.0.0.1', universe: 1, net: 0, subnet: 0, subuni: 0, port: 6454 },
      enttecProConfig: { port: '/dev/tty.usbserial-ENTTEC' },
      openDmxConfig: { port: '/dev/tty.usbserial-OPEN', dmxSpeed: 40 },
    })

    await lifecycle.restoreRunningSenders({ ...SNAPSHOT_NONE, sacn: true })

    expect(enableSender).toHaveBeenCalledTimes(1)
    expect(enableSender).toHaveBeenCalledWith('sacn', 'sacn', {
      sender: 'sacn',
      universe: 11,
      networkInterface: '10.0.0.10',
      useUnicast: false,
      unicastDestination: undefined,
      maxOutputRate: DMX_OUTPUT_REFRESH_RATE_HZ_DEFAULT,
      minRefreshRate: DMX_OUTPUT_REFRESH_RATE_HZ_DEFAULT,
    })
  })

  it('restores the same sACN universe on each restart', async () => {
    const { lifecycle, enableSender } = senderLifecycleWith({
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

    await lifecycle.restoreRunningSenders({ ...SNAPSHOT_NONE, sacn: true })
    await lifecycle.restoreRunningSenders({ ...SNAPSHOT_NONE, sacn: true })

    const restored = {
      sender: 'sacn' as const,
      universe: 7,
      networkInterface: '10.0.0.12',
      useUnicast: false,
      unicastDestination: undefined,
      maxOutputRate: DMX_OUTPUT_REFRESH_RATE_HZ_DEFAULT,
      minRefreshRate: DMX_OUTPUT_REFRESH_RATE_HZ_DEFAULT,
    }
    expect(enableSender).toHaveBeenCalledTimes(2)
    expect(enableSender).toHaveBeenNthCalledWith(1, 'sacn', 'sacn', restored)
    expect(enableSender).toHaveBeenNthCalledWith(2, 'sacn', 'sacn', restored)
  })
})
