/**
 * Completion callbacks run inside the frame, so a caller that throws in one is a fault the frame
 * has to absorb. These cases check what the rest of the frame still does when that happens.
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

const GREEN: RGBIO = { ...RED, red: 0, green: 255 }

describe('a completion callback that throws', () => {
  let harness: SequencerHarness

  beforeEach(() => {
    harness = createSequencerHarness({ frontCount: 2, backCount: 0 })
  })

  afterEach(() => harness.cleanup())

  /** A finished look on one light, so its callback fires on the next frame. */
  const lookOn = (lightIndex: number, color: RGBIO) =>
    getEffectSingleColor({
      color,
      duration: 0,
      lights: [harness.lightManager.getLights(['front'], 'all')[lightIndex]],
      layer: 0,
    })

  it('leaves the other callbacks on that frame to fire', () => {
    const fired: string[] = []

    harness.sequencer.addEffectWithCallback('throws', lookOn(0, RED), () => {
      fired.push('throws')
      throw new Error('a waiter that faults')
    })
    harness.sequencer.addEffectWithCallback('settles', lookOn(1, GREEN), () => {
      fired.push('settles')
    })
    harness.advanceBy(10)
    harness.advanceBy(10)

    expect(fired).toContain('throws')
    expect(fired).toContain('settles')
  })

  it('keeps publishing on the frames that follow', () => {
    harness.sequencer.addEffectWithCallback('throws', lookOn(0, RED), () => {
      throw new Error('a waiter that faults')
    })
    harness.advanceBy(10)
    harness.advanceBy(10)

    harness.sequencer.setState(harness.lightManager.getLights(['front'], 'all'), GREEN, 0)
    harness.advanceBy(10)

    const state = harness.getLightState(harness.frontLightIds[0])
    expect(state?.green).toBe(255)
  })
})
