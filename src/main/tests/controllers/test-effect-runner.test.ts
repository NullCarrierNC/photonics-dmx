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
    cueHandlers: { yarg: null, rb3: null },
    sequencer: {
      blackout: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    },
  } as unknown as RigChain
}

function makeFanout(chains: RigChain[]): ChainFanout {
  return {
    getChains: jest.fn(() => chains),
    handleCue: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    stopActiveCue: jest.fn(),
    blackout: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  } as unknown as ChainFanout
}

/** A dispatcher wired like the YARG domain: dispatch/stop delegate to the fanout mocks. */
function makeDispatcher(fanout: ChainFanout, ensureHandlers: () => void): TestCueDispatcher {
  return {
    ensureHandlers,
    dispatch: (cue, data) => void fanout.handleCue(cue, data),
    stopActiveCue: () => fanout.stopActiveCue(),
  }
}

describe('TestEffectRunner under multi-rig', () => {
  it('startTestEffect ensures every chain has a handler before ticking', async () => {
    const chains = [makeChainStub('a'), makeChainStub('b')]
    const fanout = makeFanout(chains)
    const ensureHandlers = jest.fn(() => {
      for (const c of chains) {
        c.cueHandlers.yarg = {} as unknown as RigChain['cueHandlers']['yarg']
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

    expect(fanout.stopActiveCue).toHaveBeenCalledTimes(1)
    expect(fanout.blackout).toHaveBeenCalledWith(0)
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
        for (const c of chains)
          c.cueHandlers.yarg = {} as unknown as RigChain['cueHandlers']['yarg']
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

describe('TestEffectRunner RB3 LED state', () => {
  function makeRb3Runner() {
    const chains = [makeChainStub('a')]
    const fanout = makeFanout(chains)
    const ensureHandlers = jest.fn(() => {
      for (const c of chains) c.cueHandlers.yarg = {} as unknown as RigChain['cueHandlers']['yarg']
    })
    const songEvent = jest.fn()
    const dispatcher: TestCueDispatcher = {
      ensureHandlers,
      dispatch: (cue, data) => void fanout.handleCue(cue, data),
      stopActiveCue: () => fanout.stopActiveCue(),
      songEvent,
    }
    const ctx: TestEffectRunnerContext = {
      getChainFanout: () => fanout,
      ensureInitialized: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    }
    return { runner: new TestEffectRunner(ctx, dispatcher), fanout, songEvent }
  }

  it('merges the LED bank masks + fog into dispatched frames', async () => {
    jest.useFakeTimers()
    try {
      const { runner, fanout } = makeRb3Runner()
      runner.startTestEffect('RB3')
      await Promise.resolve()
      await Promise.resolve()
      runner.setRb3LedState({ red: 0b0101, green: 0, blue: 0, yellow: 0b0100, fog: true })
      jest.advanceTimersByTime(16)
      const lastFrame = (fanout.handleCue as jest.Mock).mock.calls.at(-1)![1] as {
        ledBanks: { red: number; yellow: number }
        fogState: boolean
        ledColor: string
        ledPositions: number[]
      }
      expect(lastFrame.ledBanks.red).toBe(0b0101)
      expect(lastFrame.ledBanks.yellow).toBe(0b0100)
      expect(lastFrame.fogState).toBe(true)
      expect(lastFrame.ledColor).toBe('red')
      expect(lastFrame.ledPositions).toEqual([0, 2])
      await runner.stopTestEffect()
    } finally {
      jest.useRealTimers()
    }
  })

  it('emits led/fog edges once per state change, not per keepalive frame', async () => {
    jest.useFakeTimers()
    try {
      const { runner, songEvent } = makeRb3Runner()
      runner.startTestEffect('RB3')
      await Promise.resolve()
      await Promise.resolve()

      runner.setRb3LedState({ red: 0b0001, green: 0, blue: 0, yellow: 0, fog: false })
      jest.advanceTimersByTime(16 * 4) // several keepalives, no further state change
      expect(songEvent.mock.calls).toEqual([['led-1']])

      // Turning it off emits the off-edge exactly once.
      songEvent.mockClear()
      runner.setRb3LedState({ red: 0, green: 0, blue: 0, yellow: 0, fog: true })
      expect(songEvent.mock.calls).toEqual([['led-1-off'], ['fog-on']])
      await runner.stopTestEffect()
    } finally {
      jest.useRealTimers()
    }
  })

  it('resets LED state on stop so a restart begins dark', async () => {
    jest.useFakeTimers()
    try {
      const { runner, fanout } = makeRb3Runner()
      runner.startTestEffect('RB3')
      await Promise.resolve()
      await Promise.resolve()
      runner.setRb3LedState({ red: 0xff, green: 0, blue: 0, yellow: 0, fog: false })
      await runner.stopTestEffect()

      runner.startTestEffect('RB3')
      await Promise.resolve()
      await Promise.resolve()
      ;(fanout.handleCue as jest.Mock).mockClear()
      jest.advanceTimersByTime(16)
      const frame = (fanout.handleCue as jest.Mock).mock.calls.at(-1)![1] as {
        ledBanks: { red: number }
      }
      expect(frame.ledBanks.red).toBe(0)
      await runner.stopTestEffect()
    } finally {
      jest.useRealTimers()
    }
  })
})
