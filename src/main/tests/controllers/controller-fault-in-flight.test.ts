import { describe, expect, it, jest } from '@jest/globals'

jest.mock('electron', () => ({
  app: { getPath: jest.fn(() => '/tmp/photonics-test') },
}))

jest.mock('../../utils/copyDefaultData', () => ({ copyDefaultData: jest.fn(async () => {}) }))

jest.mock('../../utils/windowUtils', () => ({
  sendToAllWindows: jest.fn(),
  hasBrowserWindows: () => false,
  mainRuntimeBroadcaster: { emit: jest.fn() },
}))

import { ControllerManager } from '../../controllers/ControllerManager'
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
})
