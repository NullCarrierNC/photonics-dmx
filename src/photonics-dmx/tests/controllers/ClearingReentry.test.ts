/**
 * What a cancelled effect callback is allowed to submit while removeAllEffects is still running.
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

const GREEN: RGBIO = {
  red: 0,
  green: 255,
  blue: 0,
  intensity: 255,
  opacity: 1,
  blendMode: 'replace',
}

describe('a cue submitted from a cancelled callback', () => {
  let harness: SequencerHarness

  beforeEach(() => {
    harness = createSequencerHarness({ frontCount: 2, backCount: 2 })
  })

  afterEach(() => harness.cleanup())

  const look = (
    color: RGBIO,
    layer: number,
    duration = 0,
  ): ReturnType<typeof getEffectSingleColor> =>
    getEffectSingleColor({
      color,
      duration,
      lights: harness.lightManager.getLights(['front', 'back'], 'all'),
      layer,
    })

  it('reaches the rig', () => {
    harness.sequencer.addEffectWithCallback(
      'blocking',
      look(RED, 1, 5000),
      (cancelled) => {
        if (cancelled) {
          harness.sequencer.addEffect('next-cue', look(GREEN, 1))
        }
      },
      false,
    )
    harness.advanceBy(50)

    harness.sequencer.removeAllEffects()
    harness.advanceBy(50)

    const green = harness.allLightIds.map((id) => harness.getLightState(id)?.green ?? 0)
    expect(green).toEqual([255, 255, 255, 255])
  })
})
