import { afterEach, describe, expect, it } from '@jest/globals'
import { createSequencerHarness, type SequencerHarness } from '../helpers/sequencerHarness'
import type { EffectTransition, RGBIO, TrackedLight } from '../../types'

const colour = (red: number, green: number): RGBIO => ({
  red,
  green,
  blue: 0,
  intensity: 255,
  opacity: 1,
  blendMode: 'replace',
})

const step = (light: TrackedLight, color: RGBIO): EffectTransition => ({
  lights: [light],
  layer: 1,
  waitForCondition: 'none',
  waitForTime: 0,
  transform: { color, easing: 'linear', duration: 0 },
  waitUntilCondition: 'none',
  waitUntilTime: 0,
})

describe('a first transition of duration 0 that waits for a beat counted zero times', () => {
  let harness: SequencerHarness

  afterEach(() => harness.cleanup())

  it('lands the second transition in the first frame with no beat sent', () => {
    harness = createSequencerHarness({ frontCount: 1, backCount: 0 })
    const light = harness.lightManager.getLights(['front'], ['all'])[0]

    harness.sequencer.addEffect('zero-count', {
      id: 'zero-count',
      description: 'zero-count wait',
      transitions: [
        { ...step(light, colour(255, 0)), waitUntilCondition: 'beat', waitUntilConditionCount: 0 },
        { ...step(light, colour(0, 255)), waitUntilCondition: 'delay', waitUntilTime: 100000 },
      ],
    })

    const frames: string[] = []
    for (let frame = 0; frame < 4; frame++) {
      harness.advanceBy(10)
      const state = harness.getLightState(light.id)
      frames.push(state ? `${state.red}/${state.green}` : 'none')
    }

    expect(frames).toEqual(['0/255', '0/255', '0/255', '0/255'])
  })
})
