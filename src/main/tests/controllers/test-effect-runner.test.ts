/**
 * TestEffectRunner under multi-rig: start ensures every chain has this domain's handler so the
 * test cue reaches every rig (not just the primary), the interval re-dispatches the cue
 * continuously (so a held strobe keeps flashing), and stop stops the active cue and blackouts.
 */
import { describe, expect, it, jest } from '@jest/globals'

jest.mock('../../utils/windowUtils', () => ({
  sendToAllWindows: jest.fn(),
}))

import {
  TestEffectRunner,
  type TestEffectRunnerContext,
  type TestCueDispatcher,
} from '../../controllers/TestEffectRunner'
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

/** A dispatcher wired like the YARG domain: dispatch/stop delegate to the fanout mocks. */
function makeDispatcher(fanout: ChainFanout, ensureHandlers: () => void): TestCueDispatcher {
  return {
    ensureHandlers,
    dispatch: (cue, data) => void fanout.handleCue(cue, data),
    stopActiveCue: () => fanout.yargStopActiveCue(),
  }
}

describe('TestEffectRunner under multi-rig', () => {
  it('startTestEffect ensures every chain has a handler before ticking', async () => {
    const chains = [makeChainStub('a'), makeChainStub('b')]
    const fanout = makeFanout(chains)
    const ensureHandlers = jest.fn(() => {
      for (const c of chains) {
        c.yargCueHandler = {} as unknown as RigChain['yargCueHandler']
      }
    })
    const ctx: TestEffectRunnerContext = {
      getChainFanout: () => fanout,
      ensureInitialized: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    }
    const runner = new TestEffectRunner(ctx, makeDispatcher(fanout, ensureHandlers))

    runner.startTestEffect('Chorus')
    await Promise.resolve() // let ensureInitialized resolve
    await Promise.resolve()

    expect(ensureHandlers).toHaveBeenCalledTimes(1)
    await runner.stopTestEffect()
  })

  it('stopTestEffect stops the active cue and awaits per-chain blackout', async () => {
    const chains = [makeChainStub('a'), makeChainStub('b')]
    const fanout = makeFanout(chains)
    const ctx: TestEffectRunnerContext = {
      getChainFanout: () => fanout,
      ensureInitialized: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    }
    const runner = new TestEffectRunner(ctx, makeDispatcher(fanout, jest.fn()))

    // startTestEffect first so stopTestEffect doesn't early-return.
    runner.startTestEffect('Chorus')
    await Promise.resolve()
    await Promise.resolve()

    await runner.stopTestEffect()

    expect(fanout.yargStopActiveCue).toHaveBeenCalledTimes(1)
    expect(fanout.yargBlackout).toHaveBeenCalledWith(0)
  })

  it('re-dispatches the cue continuously on the interval (held strobe keeps flashing)', async () => {
    jest.useFakeTimers()
    try {
      const chains = [makeChainStub('a'), makeChainStub('b')]
      const fanout = makeFanout(chains)
      const ctx: TestEffectRunnerContext = {
        getChainFanout: () => fanout,
        ensureInitialized: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      }
      const ensureHandlers = jest.fn(() => {
        for (const c of chains) c.yargCueHandler = {} as unknown as RigChain['yargCueHandler']
      })
      const runner = new TestEffectRunner(ctx, makeDispatcher(fanout, ensureHandlers))
      runner.startTestEffect('Strobe_Fast')
      // Drain the ensureInitialized microtask so the interval is armed.
      await Promise.resolve()
      await Promise.resolve()

      // A single tick would flash once; several ticks must dispatch several times.
      jest.advanceTimersByTime(16 * 5)
      expect((fanout.handleCue as jest.Mock).mock.calls.length).toBeGreaterThanOrEqual(3)
      await runner.stopTestEffect()
    } finally {
      jest.useRealTimers()
    }
  })

  it('does nothing if no rig chains are active', async () => {
    const fanout = makeFanout([])
    const ctx: TestEffectRunnerContext = {
      getChainFanout: () => fanout,
      ensureInitialized: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    }
    const runner = new TestEffectRunner(ctx, makeDispatcher(fanout, jest.fn()))

    runner.startTestEffect('Chorus')
    await Promise.resolve()
    await Promise.resolve()

    expect(fanout.handleCue).not.toHaveBeenCalled()
    await runner.stopTestEffect()
  })
})
