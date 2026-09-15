import { EventEmitter } from 'events'
import { describe, expect, it, jest } from '@jest/globals'
import {
  ListenerCoordinator,
  type ListenerCoordinatorDeps,
} from '../../controllers/ListenerCoordinator'
import { DmxLightManager } from '../../../photonics-dmx/controllers/DmxLightManager'
import { ChainFanout } from '../../../photonics-dmx/controllers/ChainFanout'
import { noopRuntimeBroadcaster } from '../../../photonics-dmx/runtime/broadcaster'
import type { CueRuntime } from '../../../photonics-dmx/cueHandlers/CueRuntime'
import type { RigChain } from '../../../photonics-dmx/controllers/RigChain'
import { RENDERER_RECEIVE } from '../../../shared/ipcChannels'
import { fakeLightingController } from '../../../photonics-dmx/tests/helpers/fakeLightingController'

class FakeUdpSocket extends EventEmitter {
  bind = jest.fn((_port: number, cb?: () => void) => {
    cb?.()
    this.emit('listening')
  })
  close = jest.fn((cb?: () => void) => cb?.())
  address = jest.fn(() => ({ address: '0.0.0.0', port: 21070 }))
}

jest.mock('dgram', () => ({
  createSocket: jest.fn(() => new FakeUdpSocket()),
}))

function makeChain(sequencer: ReturnType<typeof fakeLightingController>, rigId = 'stub'): RigChain {
  return {
    rigId,
    isPrimary: true,
    dmxLightManager: {} as DmxLightManager,
    sequencer,
    cueHandlers: {
      yarg: null,
      rb3: null,
    },
    audioCueHandler: null,
    rb3MenuCueHandler: null,
  } as unknown as RigChain
}

function makeDeps(
  options: {
    chains?: RigChain[]
    mode?: 'direct' | 'cue'
    decorateCueRuntime?: ListenerCoordinatorDeps['decorateCueRuntime']
  } = {},
): ListenerCoordinatorDeps & { sendToAllWindows: jest.Mock } {
  const effects = fakeLightingController()
  const dmx = {} as DmxLightManager
  const chains = options.chains ?? [makeChain(effects)]
  const chainFanout = new ChainFanout()
  chainFanout.setChains(chains)
  const sendToAllWindows = jest.fn()
  return {
    getDmxLightManager: () => dmx,
    getEffectsController: () => effects,
    getRigChains: () => chains,
    getChainFanout: () => chainFanout,
    getMotionEnabled: () => true,
    getActiveYargMotionCueRef: () => null,
    getMotionCueMinimumHoldMs: () => 5000,
    getMotionCueProbabilityPercent: () => 100,
    getActiveRb3MotionCueRef: () => null,
    getRb3MotionCueMinimumHoldMs: () => 5000,
    getRb3MotionCueProbabilityPercent: () => 100,
    getRb3MotionCueDurationRangeSec: () => ({ min: 5, max: 20 }),
    getRb3RotationEnabled: () => true,
    getFallbackCueTimeMs: () => 20000,
    setVenuePostProcessing: jest.fn(),
    sendSenderError: jest.fn(),
    sendToAllWindows,
    runtimeBroadcaster: noopRuntimeBroadcaster(),
    setCueHandlerRef: jest.fn(),
    setRb3CueHandlerRef: jest.fn(),
    getRb3ProcessingMode: () => options.mode ?? 'direct',
    decorateCueRuntime: options.decorateCueRuntime,
  }
}

/** A blackout promise the test controls the resolution of, so a teardown can be paused mid-flight. */
function deferredBlackout(): { blackout: () => Promise<void>; resolve: () => void } {
  let resolve!: () => void
  const promise = new Promise<void>((r) => {
    resolve = r
  })
  return { blackout: () => promise, resolve }
}

describe('ListenerCoordinator RB3 runtime socket failure', () => {
  it('blackouts rigs when auto-disabling after a post-bind runtime error', async () => {
    const deps = makeDeps()
    const lc = new ListenerCoordinator(deps)
    await lc.enableRb3Internal()

    const chain = deps.getRigChains()[0]
    const removeAllEffects = chain.sequencer.removeAllEffects as jest.Mock
    const blackout = chain.sequencer.blackout as jest.Mock
    removeAllEffects.mockClear()
    blackout.mockClear()

    const co = lc as unknown as {
      rb3eListener: { emit: (event: string, payload: unknown) => void } | null
    }
    co.rb3eListener!.emit('rb3-error', {
      type: 'runtime-error',
      message: 'runtime failure',
    })

    await new Promise((r) => setImmediate(r))

    expect(removeAllEffects).toHaveBeenCalled()
    expect(blackout).toHaveBeenCalledWith(0)
  })

  it('auto-disables RB3 and notifies the renderer after a post-bind runtime error', async () => {
    const deps = makeDeps()
    const lc = new ListenerCoordinator(deps)
    await lc.enableRb3Internal()

    const co = lc as unknown as {
      isRb3Enabled: boolean
      rb3eListener: { emit: (event: string, payload: unknown) => void } | null
      processorManager: { destroy: jest.Mock } | null
    }
    expect(co.isRb3Enabled).toBe(true)
    expect(co.rb3eListener).not.toBeNull()

    co.rb3eListener!.emit('rb3-error', {
      type: 'runtime-error',
      message: 'runtime failure',
    })

    await new Promise((r) => setImmediate(r))

    expect(co.isRb3Enabled).toBe(false)
    expect(co.rb3eListener).toBeNull()
    expect(co.processorManager).toBeNull()
    expect(deps.sendToAllWindows).toHaveBeenCalledWith(RENDERER_RECEIVE.RB3_ERROR, {
      type: 'runtime-error',
      message: 'runtime failure',
      autoDisabled: true,
    })
  })

  it('serializes concurrent runtime teardown so processor destroy runs once', async () => {
    const deps = makeDeps()
    const lc = new ListenerCoordinator(deps)
    await lc.enableRb3Internal()

    const co = lc as unknown as {
      rb3eListener: { emit: (event: string, payload: unknown) => void } | null
      processorManager: { destroy: () => void } | null
    }
    const destroy = jest.spyOn(co.processorManager!, 'destroy')

    co.rb3eListener!.emit('rb3-error', {
      type: 'runtime-error',
      message: 'first',
    })
    co.rb3eListener!.emit('rb3-error', {
      type: 'runtime-error',
      message: 'second',
    })

    await new Promise((r) => setImmediate(r))

    expect(destroy).toHaveBeenCalledTimes(1)
    expect(
      deps.sendToAllWindows.mock.calls.filter(([channel]) => channel === RENDERER_RECEIVE.RB3_ERROR)
        .length,
    ).toBe(1)
    destroy.mockRestore()
  })

  it('sends no notice for a runtime error that arrives during a manual disable', async () => {
    const deps = makeDeps()
    const lc = new ListenerCoordinator(deps)
    await lc.enableRb3Internal()

    const co = lc as unknown as {
      rb3eListener: { emit: (event: string, payload: unknown) => void } | null
    }
    const listener = co.rb3eListener!

    const disableP = lc.disableRb3()
    listener.emit('rb3-error', { type: 'runtime-error', message: 'raced with manual disable' })
    await disableP
    await new Promise((r) => setImmediate(r))

    expect(deps.sendToAllWindows).not.toHaveBeenCalledWith(
      RENDERER_RECEIVE.RB3_ERROR,
      expect.anything(),
    )
  })

  it('blacks out every rig and nulls every menu handler across a multi-rig teardown', async () => {
    const chainA = makeChain(fakeLightingController(), 'a')
    const chainB = makeChain(fakeLightingController(), 'b')
    const deps = makeDeps({ chains: [chainA, chainB] })
    const lc = new ListenerCoordinator(deps)
    await lc.enableRb3Internal()

    chainA.rb3MenuCueHandler = { shutdown: jest.fn() } as unknown as RigChain['rb3MenuCueHandler']
    chainB.rb3MenuCueHandler = { shutdown: jest.fn() } as unknown as RigChain['rb3MenuCueHandler']

    const co = lc as unknown as {
      rb3eListener: { emit: (event: string, payload: unknown) => void } | null
    }
    co.rb3eListener!.emit('rb3-error', { type: 'runtime-error', message: 'multi-rig failure' })
    await new Promise((r) => setImmediate(r))

    for (const chain of [chainA, chainB]) {
      expect(chain.sequencer.removeAllEffects).toHaveBeenCalled()
      expect(chain.sequencer.blackout).toHaveBeenCalledWith(0)
      expect(chain.rb3MenuCueHandler).toBeNull()
    }
  })

  it('lets the resumed teardown finish tearing down the new session started during it', async () => {
    const paused = deferredBlackout()
    const chain = makeChain(fakeLightingController({ blackout: paused.blackout }))
    const deps = makeDeps({ chains: [chain] })
    const lc = new ListenerCoordinator(deps)
    await lc.enableRb3Internal()

    const co = lc as unknown as {
      rb3eListener: { emit: (event: string, payload: unknown) => void } | null
      processorManager: unknown
      isRb3Enabled: boolean
    }
    const firstListener = co.rb3eListener!
    firstListener.emit('rb3-error', { type: 'runtime-error', message: 'first session failure' })
    // The teardown is now paused inside the blackout await, before the old listener is shut down.

    const enableP = lc.enableRb3Internal()
    paused.resolve()
    await enableP
    await new Promise((r) => setImmediate(r))

    expect(co.isRb3Enabled).toBe(true)
    expect(co.rb3eListener).not.toBeNull()
    expect(co.rb3eListener).not.toBe(firstListener)
    expect(co.processorManager).not.toBeNull()
  })

  it('has enableYargInternal wait for an in-flight RB3 teardown before building YARG handlers', async () => {
    const paused = deferredBlackout()
    const chain = makeChain(fakeLightingController({ blackout: paused.blackout }))
    const deps = makeDeps({ chains: [chain] })
    const lc = new ListenerCoordinator(deps)
    await lc.enableRb3Internal()

    const co = lc as unknown as {
      rb3eListener: { emit: (event: string, payload: unknown) => void } | null
    }
    co.rb3eListener!.emit('rb3-error', { type: 'runtime-error', message: 'teardown in flight' })

    const enableYargP = lc.enableYargInternal()
    let yargSettled = false
    void enableYargP.then(() => {
      yargSettled = true
    })
    await new Promise((r) => setImmediate(r))
    expect(yargSettled).toBe(false)

    paused.resolve()
    await enableYargP

    expect(yargSettled).toBe(true)
    expect(lc.getIsYargEnabled()).toBe(true)
  })

  it('cue mode clears the RB3 chain handler and calls onDisable on the decorated runtime', async () => {
    const onDisable = jest.fn()
    const decorateCueRuntime = jest.fn(
      (_domain: string, base: CueRuntime): CueRuntime => ({ ...base, onDisable }),
    )
    const chain = makeChain(fakeLightingController())
    const deps = makeDeps({ chains: [chain], mode: 'cue', decorateCueRuntime })
    const lc = new ListenerCoordinator(deps)
    await lc.enableRb3Internal()

    expect(chain.cueHandlers.rb3).not.toBeNull()

    const co = lc as unknown as {
      rb3eListener: { emit: (event: string, payload: unknown) => void } | null
    }
    co.rb3eListener!.emit('rb3-error', { type: 'runtime-error', message: 'cue mode failure' })
    await new Promise((r) => setImmediate(r))

    expect(onDisable).toHaveBeenCalled()
    expect(chain.cueHandlers.rb3).toBeNull()
    expect(lc.getRb3CueHandler()).toBeNull()
  })
})
