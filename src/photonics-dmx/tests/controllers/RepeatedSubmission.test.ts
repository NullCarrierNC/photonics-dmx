/**
 * A cue held across frames is called again on each one, so its effects are re-submitted while the
 * previous run is still going.
 */
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals'
import { createSequencerHarness, type SequencerHarness } from '../helpers/sequencerHarness'
import { getEffectSingleColor } from '../../effects/effectSingleColor'
import type { RGBIO } from '../../types'

const RED: RGBIO = {
  red: 255,
  green: 0,
  blue: 0,
  intensity: 255,
  opacity: 1,
  blendMode: 'replace',
}

/** The YARG keepalive cadence, which is how often a held cue is called again. */
const FRAME_MS = 33

describe('an effect re-submitted under its own name while it runs', () => {
  let harness: SequencerHarness

  beforeEach(() => {
    harness = createSequencerHarness({ frontCount: 2, backCount: 0 })
  })

  afterEach(() => harness.cleanup())

  const fade = (): ReturnType<typeof getEffectSingleColor> =>
    getEffectSingleColor({
      color: RED,
      duration: 1000,
      lights: harness.lightManager.getLights(['front'], 'all'),
      layer: 1,
    })

  const red = (): number => harness.getLightState(harness.allLightIds[0])?.red ?? 0

  it('keeps fading rather than restarting from the top', () => {
    const reds: number[] = []
    for (let frame = 0; frame < 24; frame++) {
      harness.sequencer.addEffectUnblockedName('held-cue', fade())
      harness.advanceBy(FRAME_MS)
      reds.push(red())
    }

    for (let i = 1; i < reds.length; i++) {
      expect(reds[i]).toBeGreaterThan(reds[i - 1])
    }
  })

  it('refuses the re-submission rather than queueing a run per frame', () => {
    const accepted: boolean[] = []
    for (let frame = 0; frame < 8; frame++) {
      accepted.push(harness.sequencer.addEffectUnblockedName('held-cue', fade()))
      harness.advanceBy(FRAME_MS)
    }

    expect(accepted[0]).toBe(true)
    expect(accepted.slice(1)).toEqual([false, false, false, false, false, false, false])
  })
})
