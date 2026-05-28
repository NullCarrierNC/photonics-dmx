/**
 * TestEffectRunner under multi-rig: start ensures every chain has a YARG handler so the
 * test cue reaches every rig (not just the primary), and stop blackouts every chain.
 */
import { describe, expect, it, jest } from '@jest/globals'

jest.mock('../../utils/windowUtils', () => ({
  sendToAllWindows: jest.fn(),
}))

import { TestEffectRunner, type TestEffectRunnerContext } from '../../controllers/TestEffectRunner'
import type { ChainFanout } from '../../../photonics-dmx/controllers/ChainFanout'
import type { RigChain } from '../../../photonics-dmx/controllers/RigChain'

function makeChainStub(rigId: string): RigChain {
  return {
    rigId,
    isPrimary: rigId === 'a',
    yargCueHandler: null,
    sequencer: {
      blackout: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    },
  } as unknown as RigChain
}

function makeFanout(chains: RigChain[]): ChainFanout {
  return {
    getChains: jest.fn(() => chains),
    handleCue: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    yargStopActiveCue: jest.fn(),
    yargBlackout: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  } as unknown as ChainFanout
}

describe('TestEffectRunner under multi-rig', () => {
  it('startTestEffect ensures every chain has a YARG handler before ticking', async () => {
    const chains = [makeChainStub('a'), makeChainStub('b')]
    const fanout = makeFanout(chains)
    const ensureChainsHaveYargHandlers = jest.fn(() => {
      // Simulate the helper attaching handlers.
      for (const c of chains) {
        c.yargCueHandler = {} as unknown as RigChain['yargCueHandler']
      }
    })
    const ctx: TestEffectRunnerContext = {
      getChainFanout: () => fanout,
      ensureChainsHaveYargHandlers,
      ensureInitialized: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    }
    const runner = new TestEffectRunner(ctx)

    runner.startTestEffect('Chorus')
    await Promise.resolve() // let ensureInitialized resolve
    await Promise.resolve()

    expect(ensureChainsHaveYargHandlers).toHaveBeenCalledTimes(1)
    await runner.stopTestEffect()
  })

  it('stopTestEffect stops every chain and awaits per-chain blackout', async () => {
    const chains = [makeChainStub('a'), makeChainStub('b')]
    const fanout = makeFanout(chains)
    const ctx: TestEffectRunnerContext = {
      getChainFanout: () => fanout,
      ensureChainsHaveYargHandlers: jest.fn(),
      ensureInitialized: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    }
    const runner = new TestEffectRunner(ctx)

    // startTestEffect first so stopTestEffect doesn't early-return.
    runner.startTestEffect('Chorus')
    await Promise.resolve()
    await Promise.resolve()

    await runner.stopTestEffect()

    expect(fanout.yargStopActiveCue).toHaveBeenCalledTimes(1)
    expect(fanout.yargBlackout).toHaveBeenCalledWith(0)
  })

  it('test cue is dispatched through the fanout, not a single primary handler', async () => {
    jest.useFakeTimers()
    try {
      const chains = [makeChainStub('a'), makeChainStub('b')]
      const fanout = makeFanout(chains)
      const ctx: TestEffectRunnerContext = {
        getChainFanout: () => fanout,
        ensureChainsHaveYargHandlers: jest.fn(() => {
          for (const c of chains) c.yargCueHandler = {} as unknown as RigChain['yargCueHandler']
        }),
        ensureInitialized: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      }
      const runner = new TestEffectRunner(ctx)
      runner.startTestEffect('Chorus')
      // Drain the ensureInitialized microtask so the interval is armed.
      await Promise.resolve()
      await Promise.resolve()
      jest.advanceTimersByTime(20)
      expect(fanout.handleCue).toHaveBeenCalled()
      await runner.stopTestEffect()
    } finally {
      jest.useRealTimers()
    }
  })

  it('does nothing if no rig chains are active', async () => {
    const fanout = makeFanout([])
    const ctx: TestEffectRunnerContext = {
      getChainFanout: () => fanout,
      ensureChainsHaveYargHandlers: jest.fn(),
      ensureInitialized: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    }
    const runner = new TestEffectRunner(ctx)

    runner.startTestEffect('Chorus')
    await Promise.resolve()
    await Promise.resolve()

    expect(fanout.handleCue).not.toHaveBeenCalled()
    await runner.stopTestEffect()
  })
})
