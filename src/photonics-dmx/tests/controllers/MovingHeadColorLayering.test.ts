/**
 * A colour-only transition must not stamp a moving head's pan/tilt to its configured home: the
 * publisher already parks any undriven axis there, so doing it again in the sequencer would let a
 * colour effect on a higher layer win the blend over a real position or motion pattern underneath.
 */
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals'
import { createSequencerHarness, type SequencerHarness } from '../helpers/sequencerHarness'
import { getEffectSingleColor } from '../../effects/effectSingleColor'
import type { RGBIO } from '../../types'

const positionOnly = (pan: number, tilt: number): RGBIO => ({
  red: 0,
  green: 0,
  blue: 0,
  intensity: 0,
  opacity: 1,
  blendMode: 'replace',
  pan,
  tilt,
})

const RED: RGBIO = {
  red: 255,
  green: 0,
  blue: 0,
  intensity: 255,
  opacity: 1,
  blendMode: 'replace',
}

describe('colour transitions and moving-head pan/tilt', () => {
  let harness: SequencerHarness

  beforeEach(() => {
    harness = createSequencerHarness({ frontCount: 1, movingHead: true })
  })

  afterEach(() => harness.cleanup())

  it('keeps a real position on a lower layer instead of a colour layer stamping it to home', () => {
    const lights = harness.lightManager.getLights(['front'], 'all')

    harness.sequencer.addEffect(
      'position',
      getEffectSingleColor({ color: positionOnly(75, 30), duration: 0, lights, layer: 0 }),
      true,
    )
    harness.advanceBy(50)

    harness.sequencer.addEffect(
      'color-flash',
      getEffectSingleColor({ color: RED, duration: 0, lights, layer: 1 }),
      true,
    )
    harness.advanceBy(50)

    const state = harness.getLightState(lights[0].id)
    expect(state?.pan).toBe(75)
    expect(state?.tilt).toBe(30)
  })

  it('leaves pan and tilt undefined for a colour-only effect on an otherwise undriven head', () => {
    const lights = harness.lightManager.getLights(['front'], 'all')

    harness.sequencer.addEffect(
      'color-only',
      getEffectSingleColor({ color: RED, duration: 0, lights, layer: 0 }),
      true,
    )
    harness.advanceBy(50)

    const state = harness.getLightState(lights[0].id)
    expect(state?.pan).toBeUndefined()
    expect(state?.tilt).toBeUndefined()
  })
})
