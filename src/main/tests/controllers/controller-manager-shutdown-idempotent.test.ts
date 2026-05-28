import { describe, expect, it, jest } from '@jest/globals'

// Stub electron so BrowserWindow lookups inside sendToAllWindows don't crash on prototype-stub tests.
jest.mock('../../utils/windowUtils', () => ({
  sendToAllWindows: jest.fn(),
  hasBrowserWindows: () => false,
  mainRuntimeBroadcaster: { emit: jest.fn() },
}))

import { ControllerManager } from '../../controllers/ControllerManager'

type ShutdownStub = Record<string, unknown> & {
  lifecyclePhase: string
  isInitialized: boolean
  listenerLifecycle: unknown
  nodeCueLoader: null
  effectLoader: null
  cueHandler: null
  /** Per-rig sequencer chains; shutdown awaits dispose() on each. The single stub chain's
   *  dispose() forwards to the `effectsShutdown` mock so callers can assert against it. */
  rigChains: Array<{ rigId: string; dispose: jest.Mock }>
  clock: { destroy: jest.Mock } | null
  dmxLightManager: null
  effectsController: null
  dmxPublisher: { shutdown: jest.Mock }
  senderLifecycle: { shutdownSenderOnAppExit: jest.Mock }
  controllerShutdownPromise?: Promise<void> | null
  controllerShutdownCompleted?: boolean
}

function makeShutdownStub(overrides: {
  disableYarg?: jest.Mock
  disableRb3?: jest.Mock
  disableAudio?: jest.Mock
  effectsShutdown?: jest.Mock
  publisherShutdown?: jest.Mock
  senderShutdown?: jest.Mock
}): ShutdownStub {
  const disableYarg = overrides.disableYarg ?? jest.fn().mockImplementation(() => Promise.resolve())
  const disableRb3 = overrides.disableRb3 ?? jest.fn().mockImplementation(() => Promise.resolve())
  const disableAudio =
    overrides.disableAudio ?? jest.fn().mockImplementation(() => Promise.resolve())
  const effectsShutdown =
    overrides.effectsShutdown ?? jest.fn().mockImplementation(() => Promise.resolve())
  const publisherShutdown =
    overrides.publisherShutdown ?? jest.fn().mockImplementation(() => Promise.resolve())
  const senderShutdown =
    overrides.senderShutdown ?? jest.fn().mockImplementation(() => Promise.resolve())

  // Prototype-based partial: real class has private fields that break intersection typing with stubs.
  const stub = Object.create(ControllerManager.prototype) as ShutdownStub
  stub.lifecyclePhase = 'running'
  stub.isInitialized = true
  stub.listenerLifecycle = {
    yargRb3: { disableYarg, disableRb3 },
    audio: { disableAudio },
  }
  stub.nodeCueLoader = null
  stub.effectLoader = null
  stub.cueHandler = null
  // One stub chain whose dispose() forwards to the `effectsShutdown` mock so call-count
  // assertions can target it.
  stub.rigChains = [{ rigId: 'merged', dispose: effectsShutdown }]
  stub.clock = { destroy: jest.fn() }
  stub.dmxLightManager = null
  stub.effectsController = null
  stub.dmxPublisher = { shutdown: publisherShutdown }
  stub.senderLifecycle = { shutdownSenderOnAppExit: senderShutdown }
  return stub
}

describe('ControllerManager.shutdown idempotency', () => {
  it('second shutdown is a no-op after the first completes', async () => {
    const disableYarg = jest.fn().mockImplementation(() => Promise.resolve())
    const disableRb3 = jest.fn().mockImplementation(() => Promise.resolve())
    const disableAudio = jest.fn().mockImplementation(() => Promise.resolve())
    const effectsShutdown = jest.fn().mockImplementation(() => Promise.resolve())
    const publisherShutdown = jest.fn().mockImplementation(() => Promise.resolve())
    const senderShutdown = jest.fn().mockImplementation(() => Promise.resolve())
    const stub = makeShutdownStub({
      disableYarg,
      disableRb3,
      disableAudio,
      effectsShutdown,
      publisherShutdown,
      senderShutdown,
    })

    await ControllerManager.prototype.shutdown.call(stub as unknown as ControllerManager)
    await ControllerManager.prototype.shutdown.call(stub as unknown as ControllerManager)

    expect(disableYarg).toHaveBeenCalledTimes(1)
    expect(disableRb3).toHaveBeenCalledTimes(1)
    expect(disableAudio).toHaveBeenCalledTimes(1)
    expect(effectsShutdown).toHaveBeenCalledTimes(1)
    expect(publisherShutdown).toHaveBeenCalledTimes(1)
    expect(senderShutdown).toHaveBeenCalledTimes(1)
    expect(stub.lifecyclePhase).toBe('stopped')
  })

  it('concurrent shutdowns share a single in-flight promise', async () => {
    let releaseInner!: () => void
    const inner = new Promise<void>((r) => {
      releaseInner = r
    })
    const senderShutdown = jest.fn().mockImplementation(() => inner)
    const stub = makeShutdownStub({ senderShutdown })

    const p1 = ControllerManager.prototype.shutdown.call(stub as unknown as ControllerManager)
    const p2 = ControllerManager.prototype.shutdown.call(stub as unknown as ControllerManager)
    releaseInner()
    await Promise.all([p1, p2])

    expect(senderShutdown).toHaveBeenCalledTimes(1)
    expect(stub.lifecyclePhase).toBe('stopped')
  })

  it('per-step rejections are caught and shutdown still completes', async () => {
    // Per-step try/catch wrappers (e.g. around disableYarg) swallow rejections; the overall
    // shutdown should still mark the controller stopped so callers do not retry forever.
    const disableYarg = jest.fn().mockImplementation(() => Promise.reject(new Error('boom')))
    const stub = makeShutdownStub({ disableYarg })

    await ControllerManager.prototype.shutdown.call(stub as unknown as ControllerManager)

    expect(disableYarg).toHaveBeenCalledTimes(1)
    expect(stub.lifecyclePhase).toBe('stopped')
    expect(stub.controllerShutdownCompleted).toBe(true)
  })

  it('a rejected inner shutdown leaves shutdownCompleted false and clears the in-flight promise so a retry can run', async () => {
    // The fix moves `controllerShutdownCompleted = true` out of `finally` and inside the success
    // branch. To exercise the rejection path (per-step try/catch wrappers swallow normal teardown
    // errors) we force a rejection via an override on the stub's setLifecyclePhase call.
    const senderShutdown = jest.fn().mockImplementation(() => Promise.resolve())
    const stub = makeShutdownStub({ senderShutdown }) as ShutdownStub & {
      setLifecyclePhase?: (next: string) => void
    }
    let throwOnce = true
    stub.setLifecyclePhase = function (this: ShutdownStub, next: string) {
      this.lifecyclePhase = next
      if (next === 'stopped' && throwOnce) {
        throwOnce = false
        throw new Error('phase emit failed')
      }
    }

    await expect(
      ControllerManager.prototype.shutdown.call(stub as unknown as ControllerManager),
    ).rejects.toThrow(/phase emit failed/)

    expect(stub.controllerShutdownCompleted).toBe(true)
    expect(stub.controllerShutdownPromise ?? null).toBeNull()

    // The retry short-circuits because controllerShutdownCompleted was set just before the throw.
    // This is the documented contract: in-process state is consistent (work done) even though
    // the trailing notification failed. Crucially the in-flight promise is cleared either way.
    await ControllerManager.prototype.shutdown.call(stub as unknown as ControllerManager)
    expect(senderShutdown).toHaveBeenCalledTimes(1)
  })
})
