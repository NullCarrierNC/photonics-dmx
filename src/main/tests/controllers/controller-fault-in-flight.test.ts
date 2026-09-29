import { describe, expect, it, jest } from '@jest/globals'

jest.mock('electron', () => ({
  app: { getPath: jest.fn(() => '/tmp/photonics-test') },
  ipcMain: { handle: jest.fn() },
}))

jest.mock('../../utils/copyDefaultData', () => ({ copyDefaultData: jest.fn(async () => {}) }))

jest.mock('../../utils/windowUtils', () => ({
  sendToAllWindows: jest.fn(),
  hasBrowserWindows: () => false,
  mainRuntimeBroadcaster: { emit: jest.fn() },
}))

import { ipcMain } from 'electron'
import type { ControllerLifecycle } from '../../controllers/ControllerLifecycle'
import { setupLifecycleHandlers } from '../../ipc/lifecycle-handlers'
import { LIFECYCLE } from '../../../shared/ipcChannels'
import { ControllerManager } from '../../controllers/ControllerManager'
import { FAULT_HELD_MESSAGE } from '../../controllers/ControllerLifecycle'
import {
  listenerStub,
  restartGraph,
  senderLifecycleStub,
  stubConfig,
  stubbedManager,
} from './lifecycleStub'

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve))

/** Longer than the fault response waits on the running op before it disables the inputs. */
const PAST_THE_WAIT_MS = 1200

function barrier(): { wait: Promise<void>; release: () => void } {
  let release!: () => void
  const wait = new Promise<void>((resolve) => {
    release = resolve
  })
  return { wait, release }
}

/**
 * Listeners that hold real on/off state. YARG models the coordinator, whose disable returns at once
 * while an enable has not bound yet. Audio models its controller, whose disable queues behind an
 * enable in flight.
 */
function statefulListeners(enableMs = 0) {
  const listeners = listenerStub()
  const on = { yarg: false, audio: false }
  let audioChain: Promise<void> = Promise.resolve()
  listeners.yargRb3.getIsYargEnabled.mockImplementation(() => on.yarg)
  listeners.yargRb3.enableYarg.mockImplementation(async () => {
    await sleep(enableMs)
    on.yarg = true
  })
  listeners.yargRb3.disableYarg.mockImplementation(async () => {
    on.yarg = false
  })
  listeners.audio.getIsAudioEnabled.mockImplementation(() => on.audio)
  listeners.audio.enableAudio.mockImplementation(() => {
    audioChain = audioChain.then(async () => {
      await sleep(enableMs)
      on.audio = true
    })
    return audioChain
  })
  listeners.audio.disableAudio.mockImplementation(() => {
    audioChain = audioChain.then(() => {
      on.audio = false
    })
    return audioChain
  })
  return { listeners, on }
}

/** Registry loaders whose first cue registry load waits on `hold`. */
function registryHeldOn(hold: Promise<void>) {
  let first = true
  return {
    initializeCueRegistry: jest.fn(async () => {
      if (first) {
        first = false
        await hold
      }
    }),
    initializeEffectLoader: jest.fn(async () => {}),
    initializeNodeCueLoader: jest.fn(async () => {}),
  }
}

/** Registry loaders whose cue registry load takes `ms`, as a load from disk does. */
function registryTaking(ms: number) {
  return {
    initializeCueRegistry: jest.fn(() => sleep(ms)),
    initializeEffectLoader: jest.fn(async () => {}),
    initializeNodeCueLoader: jest.fn(async () => {}),
  }
}

/** A sender change holding the lifecycle queue for `ms`. */
function senderChangeTaking(manager: ControllerManager, ms: number): Promise<void> {
  return manager.runSenderOp(() => sleep(ms))
}

function initConfig() {
  return Object.assign(stubConfig({ cueDomains: {} }), {
    updateCueDomain: jest.fn(async () => {}),
  })
}

describe('the uncaught-fault hold against work already under way', () => {
  it('stops a YARG enable that binds after the fault and refuses it', async () => {
    const { listeners, on } = statefulListeners(PAST_THE_WAIT_MS)
    const { manager } = stubbedManager({ listeners })

    const enabling = manager.enableYarg()
    await sleep(20)
    manager.handleUncaughtException(new Error('frame path threw'))

    await expect(enabling).rejects.toThrow(/restart/i)
    await settle()
    expect(on.yarg).toBe(false)
    expect(manager.getLifecyclePhase()).toBe('failed')
  })

  it('stops an audio enable that lands after the fault and refuses it', async () => {
    const { listeners, on } = statefulListeners(PAST_THE_WAIT_MS)
    const { manager } = stubbedManager({ listeners })

    const enabling = manager.enableAudio()
    await sleep(20)
    manager.handleUncaughtException(new Error('frame path threw'))

    await expect(enabling).rejects.toThrow(/restart/i)
    await settle()
    expect(on.audio).toBe(false)
    expect(manager.getLifecyclePhase()).toBe('failed')
  })

  it('refuses a console entry that a fault crosses and leaves manual output off', async () => {
    const { listeners, on } = statefulListeners()
    on.yarg = true
    listeners.yargRb3.disableYarg.mockImplementation(async () => {
      await sleep(50)
      on.yarg = false
    })
    let manual = false
    const graph = restartGraph()
    jest.mocked(graph.getDmxPublisher).mockReturnValue({
      setManualBuffer: () => {
        manual = true
      },
      clearManualBuffer: () => {
        manual = false
      },
    } as never)
    const { manager } = stubbedManager({
      listeners,
      graph,
      ownConsoleMode: true,
      init: async () => {},
    })

    const entering = manager.enableConsoleMode('rig-1')
    await sleep(10)
    manager.handleUncaughtException(new Error('frame path threw'))
    const entered = await entering

    expect(entered.success).toBe(false)
    expect(manual).toBe(false)
    expect(manager.getConsoleModeController().getConsoleRestore()).toBeNull()
    expect(manager.getLifecyclePhase()).toBe('failed')
  })

  it('keeps the hold when a cold init lands after the fault', async () => {
    const hold = barrier()
    const { listeners, on } = statefulListeners()
    const manager = new ControllerManager({
      config: initConfig(),
      graph: restartGraph(),
      collaborators: {
        registryInit: registryHeldOn(hold.wait),
        senderLifecycle: senderLifecycleStub(),
        listenerLifecycle: listeners,
      } as never,
    })

    const cold = manager.init()
    await settle()
    manager.handleUncaughtException(new Error('watcher callback threw'))
    await settle()
    hold.release()
    await cold

    expect(manager.getLifecyclePhase()).toBe('failed')
    await expect(manager.enableYarg()).rejects.toThrow(/restart/i)
    expect(on.yarg).toBe(false)
  })

  it('keeps the hold and leaves the inputs off when a restart lands after the fault', async () => {
    const hold = barrier()
    const { listeners, on } = statefulListeners()
    on.yarg = true
    const { manager } = stubbedManager({
      listeners,
      ownInit: { registryInit: registryHeldOn(hold.wait), config: initConfig() },
    })

    const restarting = manager.restartControllers()
    await sleep(20)
    manager.handleUncaughtException(new Error('cue file load threw'))
    await settle()
    hold.release()
    await restarting

    expect(manager.getLifecyclePhase()).toBe('failed')
    expect(on.yarg).toBe(false)
    await expect(manager.enableYarg()).rejects.toThrow(/restart/i)

    await manager.restartControllers()
    await manager.enableYarg()

    expect(manager.getLifecyclePhase()).toBe('running')
    expect(on.yarg).toBe(true)
  })

  it.each([0, 50])(
    'refuses a restart asked for before the fault that starts after it, with a %i ms rebuild',
    async (rebuildMs) => {
      const { listeners, on } = statefulListeners()
      on.yarg = true
      const { manager } = stubbedManager({
        listeners,
        ownInit: { registryInit: registryTaking(rebuildMs), config: initConfig() },
      })

      const holding = senderChangeTaking(manager, 200)
      const restarting = manager.restartControllers()
      await sleep(20)
      manager.handleUncaughtException(new Error('frame path threw'))
      await holding
      const refusal = await restarting.then(
        () => null,
        (error: Error) => error.message,
      )
      await sleep(rebuildMs + 50)

      expect(manager.getLifecyclePhase()).toBe('failed')
      expect(on.yarg).toBe(false)
      expect(refusal).toBe(FAULT_HELD_MESSAGE)
      await expect(manager.enableYarg()).rejects.toThrow(/restart/i)
    },
  )

  it('refuses a follow-up restart asked for before the fault that starts after it', async () => {
    const hold = barrier()
    const { listeners, on } = statefulListeners()
    on.yarg = true
    const { manager } = stubbedManager({
      listeners,
      ownInit: { registryInit: registryHeldOn(hold.wait), config: initConfig() },
    })

    const rebuilding = manager.restartControllers()
    await sleep(20)
    const followUp = manager.restartControllers()
    manager.handleUncaughtException(new Error('cue file load threw'))
    await settle()
    hold.release()
    await rebuilding
    const refusal = await followUp.then(
      () => null,
      (error: Error) => error.message,
    )

    expect(manager.getLifecyclePhase()).toBe('failed')
    expect(on.yarg).toBe(false)
    expect(refusal).toBe(FAULT_HELD_MESSAGE)
  })

  it('lifts the hold for a restart asked for after the fault that joins one still queued', async () => {
    const { listeners } = statefulListeners()
    const { manager } = stubbedManager({
      listeners,
      ownInit: { registryInit: registryTaking(0), config: initConfig() },
    })

    const holding = senderChangeTaking(manager, 200)
    const beforeFault = manager.restartControllers()
    await sleep(20)
    manager.handleUncaughtException(new Error('frame path threw'))
    const retry = manager.restartControllers()
    await holding
    await Promise.all([beforeFault, retry])

    expect(manager.getLifecyclePhase()).toBe('running')
    await manager.enableYarg()
    expect(manager.getIsYargEnabled()).toBe(true)
  })

  it('lifts the hold for a restart asked for after the fault while one crossed by it rebuilds', async () => {
    const hold = barrier()
    const { listeners } = statefulListeners()
    const { manager } = stubbedManager({
      listeners,
      ownInit: { registryInit: registryHeldOn(hold.wait), config: initConfig() },
    })

    const rebuilding = manager.restartControllers()
    await sleep(20)
    manager.handleUncaughtException(new Error('cue file load threw'))
    await settle()
    const retry = manager.restartControllers()
    hold.release()
    await Promise.all([rebuilding, retry])

    expect(manager.getLifecyclePhase()).toBe('running')
  })
})

describe('a Retry restart asked for during the fault response', () => {
  /** A rebuild longer than the fault response waits on the running op. */
  function slowInit(lifecycle: ControllerLifecycle): Promise<void> {
    return sleep(PAST_THE_WAIT_MS).then(() => lifecycle.setPhase('running'))
  }

  it.each(['yarg', 'audio'] as const)(
    'lifts the hold and leaves %s off when its rebuild outlasts the fault response wait',
    async (input) => {
      const { listeners, on } = statefulListeners()
      on[input] = true
      const { manager } = stubbedManager({ listeners, init: slowInit })

      manager.handleUncaughtException(new Error('frame path threw'))
      await manager.restartControllers()
      await settle()

      expect(manager.getLifecyclePhase()).toBe('running')
      expect(on[input]).toBe(false)
    },
  )

  it('lifts the hold and leaves YARG off when it arrives while the inputs stop', async () => {
    const { listeners, on } = statefulListeners()
    on.yarg = true
    listeners.yargRb3.disableYarg.mockImplementation(async () => {
      await sleep(50)
      on.yarg = false
    })
    const { manager } = stubbedManager({ listeners })

    manager.handleUncaughtException(new Error('frame path threw'))
    await sleep(20)
    await manager.restartControllers()
    await sleep(100)

    expect(manager.getLifecyclePhase()).toBe('running')
    expect(on.yarg).toBe(false)
  })
})

describe('a Retry of a graph that never came up, asked for during the fault response', () => {
  /** Registry loaders whose first cue registry load fails, so the first init leaves no graph. */
  function registryFailingOnce() {
    let first = true
    return {
      initializeCueRegistry: jest.fn(async () => {
        if (first) {
          first = false
          throw new Error('cue folder unreadable')
        }
      }),
      initializeEffectLoader: jest.fn(async () => {}),
      initializeNodeCueLoader: jest.fn(async () => {}),
    }
  }

  it('builds the graph only once the fault response has stopped the inputs', async () => {
    const stopping = barrier()
    const { listeners, on } = statefulListeners()
    on.yarg = true
    listeners.yargRb3.disableYarg.mockImplementation(async () => {
      await stopping.wait
      on.yarg = false
    })
    const graph = restartGraph()
    const manager = new ControllerManager({
      config: initConfig(),
      graph,
      collaborators: {
        registryInit: registryFailingOnce(),
        senderLifecycle: senderLifecycleStub(),
        listenerLifecycle: listeners,
      } as never,
    })
    await expect(manager.init()).rejects.toThrow('cue folder unreadable')
    setupLifecycleHandlers(ipcMain, manager)
    const retry = jest
      .mocked(ipcMain.handle)
      .mock.calls.find(([channel]) => channel === LIFECYCLE.RETRY_INIT)?.[1]
    if (!retry) throw new Error('no Retry handler')
    const builtBefore = jest.mocked(graph.buildChains).mock.calls.length

    manager.handleUncaughtException(new Error('watcher callback threw'))
    await settle()
    const retrying = retry({} as never)
    await sleep(50)
    const builtWhileStopping = jest.mocked(graph.buildChains).mock.calls.length
    stopping.release()
    await retrying

    expect(builtWhileStopping).toBe(builtBefore)
    expect(jest.mocked(graph.buildChains).mock.calls.length).toBeGreaterThan(builtBefore)
  })
})
