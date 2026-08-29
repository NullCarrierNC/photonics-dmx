/**
 * A blocking effect parked on a song event is released by that event and raised again by a cue
 * reacting to the same event, in the same synchronous pass, before any clock tick. That is what
 * YARG motion cues such as Vogue Slow do on every measure, so these tests cover the release and
 * the re-raise landing on one event.
 */
import { getColor } from '../../helpers/dmxHelpers'
import { createSequencerHarness, type SequencerHarness } from '../helpers/sequencerHarness'
import type { Effect, EffectTransition, TrackedLight } from '../../types'

/** One-transition effect that parks on `waitUntil` once its move has run. */
const buildParkedEffect = (
  lights: TrackedLight[],
  waitUntilCondition: 'measure' | 'beat',
): Effect => ({
  id: 'parked-effect',
  description: 'blocking effect parked on a song event',
  transitions: [
    {
      lights,
      layer: 1,
      waitForCondition: 'none',
      waitForTime: 0,
      waitUntilCondition,
      waitUntilTime: 0,
      transform: {
        color: { ...getColor('blue', 'high', 'replace'), opacity: 1 },
        duration: 100,
        easing: 'linear',
      },
    },
  ],
})

/**
 * The parked transition above, followed by a zero-duration transition whose event count is 0.
 * Releasing the first one runs the second through to the end of the effect in the same pass.
 */
const buildParkedThenInstantEffect = (lights: TrackedLight[]): Effect => {
  const instant: EffectTransition = {
    lights,
    layer: 1,
    waitForCondition: 'none',
    waitForTime: 0,
    waitUntilCondition: 'beat',
    waitUntilConditionCount: 0,
    waitUntilTime: 0,
    transform: {
      color: { ...getColor('green', 'high', 'replace'), opacity: 1 },
      duration: 0,
      easing: 'linear',
    },
  }
  const base = buildParkedEffect(lights, 'measure')
  return { ...base, transitions: [...base.transitions, instant] }
}

/** Fires a measure frame the way CueHandler.handleMeasure does: the beat, then the measure. */
const fireMeasureFrame = (harness: SequencerHarness): void => {
  harness.sequencer.onBeat()
  harness.sequencer.onMeasure()
}

describe('blocking effect released by a song event', () => {
  it('accepts a re-submission raised by the same measure that released it', () => {
    const harness = createSequencerHarness({ frontCount: 2, backCount: 0 })
    const lights = harness.lightManager.getLights(['front'], ['all'])
    const completions: boolean[] = []

    harness.sequencer.addEffectUnblockedNameWithCallback(
      'motion:pos',
      buildParkedEffect(lights, 'measure'),
      (cancelled) => completions.push(cancelled),
    )

    // Run the move out so the effect parks waiting for the next measure.
    harness.advanceBy(150)

    // The measure releases the parked effect, then the cue raises it again in the same pass.
    fireMeasureFrame(harness)
    const accepted = harness.sequencer.addEffectUnblockedName(
      'motion:pos',
      buildParkedEffect(lights, 'measure'),
    )

    expect(accepted).toBe(true)
    expect(completions).toEqual([false])

    harness.cleanup()
  })

  it('accepts a re-submission on every consecutive measure', () => {
    const harness = createSequencerHarness({ frontCount: 2, backCount: 0 })
    const lights = harness.lightManager.getLights(['front'], ['all'])

    harness.sequencer.addEffectUnblockedName('motion:pos', buildParkedEffect(lights, 'measure'))

    for (let measure = 0; measure < 4; measure++) {
      harness.advanceBy(150)
      fireMeasureFrame(harness)
      const accepted = harness.sequencer.addEffectUnblockedName(
        'motion:pos',
        buildParkedEffect(lights, 'measure'),
      )
      expect(accepted).toBe(true)
    }

    harness.cleanup()
  })

  it('accepts a re-submission when the release runs a chain of instant transitions', () => {
    const harness = createSequencerHarness({ frontCount: 2, backCount: 0 })
    const lights = harness.lightManager.getLights(['front'], ['all'])

    harness.sequencer.addEffectUnblockedName('motion:pos', buildParkedThenInstantEffect(lights))
    harness.advanceBy(150)

    // The measure releases the park, and the zero-duration transition behind it runs to the
    // end of the effect in the same pass.
    fireMeasureFrame(harness)
    const accepted = harness.sequencer.addEffectUnblockedName(
      'motion:pos',
      buildParkedThenInstantEffect(lights),
    )

    expect(accepted).toBe(true)

    harness.cleanup()
  })

  it('accepts a re-submission for an effect the measure frame releases on its beat', () => {
    const harness = createSequencerHarness({ frontCount: 2, backCount: 0 })
    const lights = harness.lightManager.getLights(['front'], ['all'])

    harness.sequencer.addEffectUnblockedName('motion:pos', buildParkedEffect(lights, 'beat'))
    harness.advanceBy(150)

    // A measure frame leads with its beat, which is what releases this effect.
    fireMeasureFrame(harness)
    const accepted = harness.sequencer.addEffectUnblockedName(
      'motion:pos',
      buildParkedEffect(lights, 'beat'),
    )

    expect(accepted).toBe(true)

    harness.cleanup()
  })

  it('blocks a re-submission while the effect is mid-move', () => {
    const harness = createSequencerHarness({ frontCount: 2, backCount: 0 })
    const lights = harness.lightManager.getLights(['front'], ['all'])

    harness.sequencer.addEffectUnblockedName('motion:pos', buildParkedEffect(lights, 'measure'))

    // Part way through the 100ms move, so the effect has not reached its wait yet.
    harness.advanceBy(40)
    const accepted = harness.sequencer.addEffectUnblockedName(
      'motion:pos',
      buildParkedEffect(lights, 'measure'),
    )

    expect(accepted).toBe(false)

    harness.cleanup()
  })

  it('leaves an effect parked when a different song event fires', () => {
    const harness = createSequencerHarness({ frontCount: 2, backCount: 0 })
    const lights = harness.lightManager.getLights(['front'], ['all'])

    harness.sequencer.addEffectUnblockedName('motion:pos', buildParkedEffect(lights, 'measure'))
    harness.advanceBy(150)

    // A beat does not release an effect waiting on a measure, so the name stays taken.
    harness.sequencer.onBeat()
    const accepted = harness.sequencer.addEffectUnblockedName(
      'motion:pos',
      buildParkedEffect(lights, 'measure'),
    )

    expect(accepted).toBe(false)

    harness.cleanup()
  })
})
