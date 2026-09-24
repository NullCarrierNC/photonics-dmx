import { afterEach, describe, expect, it, jest } from '@jest/globals'
import { createSequencerHarness } from '../helpers/sequencerHarness'
import { Rb3StageKitRigProcessor } from '../../processors/Rb3StageKitRigProcessor'

type BankUpdate = { positions: number[]; bank: string }

/**
 * Runs the real rig processor over a real sequencer, its 5 ms accumulation timer on the fake clock
 * and the sequencer's 10 ms frame in step with it, and answers what each light ends up showing.
 */
function playBanks(settle: BankUpdate, updates: BankUpdate[], gapMs: number, phaseMs: number) {
  jest.useFakeTimers({ doNotFake: ['queueMicrotask', 'nextTick'] })
  const h = createSequencerHarness({ frontCount: 4, backCount: 4 })
  let msSinceFrame = 0
  const advance = (ms: number): void => {
    for (let i = 0; i < ms; i++) {
      jest.advanceTimersByTime(1)
      if (++msSinceFrame >= 10) {
        h.advanceBy(10)
        msSinceFrame = 0
      }
    }
  }
  try {
    const processor = new Rb3StageKitRigProcessor('rig', h.lightManager, h.sequencer, {
      enabled: true,
    } as never)
    processor.applyLightData(settle.positions, settle.bank)
    advance(200 + phaseMs)
    for (const update of updates) {
      processor.applyLightData(update.positions, update.bank)
      advance(gapMs)
    }
    advance(300)
    const shown = h.lightManager.getLights(['front', 'back'], 'all').map((light) => {
      const state = h.getLightState(light.id)
      return { red: state?.red ?? 0, green: state?.green ?? 0 }
    })
    void processor.turnOffAllLights()
    return shown
  } finally {
    h.cleanup()
    jest.useRealTimers()
  }
}

describe('StageKit bank updates a few milliseconds apart', () => {
  afterEach(() => {
    jest.useRealTimers()
  })

  it.each([5, 10, 15, 20])('leaves every light on its last colour with a %i ms gap', (gapMs) => {
    for (const phaseMs of [0, 3, 6, 9]) {
      const shown = playBanks(
        { positions: [0, 1, 2, 3, 4, 5, 6, 7], bank: 'green' },
        [
          { positions: [0, 1], bank: 'red' },
          { positions: [], bank: 'green' },
        ],
        gapMs,
        phaseMs,
      )
      const lit = shown.filter((s) => s.red > 0)
      expect(lit).toHaveLength(2)
      expect(shown.every((s) => s.green === 0)).toBe(true)
    }
  })
})
