/**
 * A direct state set puts the lights where the caller asked, now. These cases drive states that
 * change as fast as the frame, which is what a strobe does, and follow what the lights show.
 */
import { beforeEach, afterEach, describe, expect, it } from '@jest/globals'
import { createSequencerHarness, type SequencerHarness } from '../helpers/sequencerHarness'
import type { RGBIO, TrackedLight } from '../../types'

const WHITE: RGBIO = {
  red: 255,
  green: 255,
  blue: 255,
  intensity: 255,
  opacity: 1,
  blendMode: 'replace',
}

const BLACK: RGBIO = { ...WHITE, red: 0, green: 0, blue: 0, intensity: 0 }

const RED: RGBIO = { ...WHITE, green: 0, blue: 0 }
const GREEN: RGBIO = { ...WHITE, red: 0, blue: 0 }

const FRAME_MS = 10

describe('direct state submission', () => {
  let harness: SequencerHarness
  let lights: TrackedLight[]

  beforeEach(() => {
    harness = createSequencerHarness({ frontCount: 1, backCount: 0 })
    lights = harness.lightManager.getLights(['front'], ['all'])
  })

  afterEach(() => harness.cleanup())

  /** What the light is showing, as a comparable string. */
  const shown = (): string => {
    const state = harness.getLightState(harness.frontLightIds[0])
    return state ? `${state.red},${state.green},${state.blue},${state.intensity}` : 'none'
  }

  it('follows a state that changes every frame', () => {
    const seen = new Set<string>()

    for (let frame = 0; frame < 20; frame++) {
      harness.sequencer.setState(lights, frame % 2 === 0 ? WHITE : BLACK, 0)
      harness.advanceBy(FRAME_MS)
      seen.add(shown())
    }

    expect(seen.size).toBeGreaterThan(1)
  })

  it('shows the latest state when two land inside one frame', () => {
    harness.sequencer.setState(lights, RED, 0)
    harness.advanceBy(FRAME_MS)

    harness.sequencer.setState(lights, GREEN, 0)
    harness.sequencer.setState(lights, WHITE, 0)
    harness.advanceBy(FRAME_MS)

    expect(shown()).toBe('255,255,255,255')
  })

  it('does not hold an older state while newer ones keep arriving', () => {
    harness.sequencer.setState(lights, RED, 0)
    harness.advanceBy(FRAME_MS)

    // Two states per frame is what the fastest strobe asks of a clock that ticks half as often.
    for (let frame = 0; frame < 6; frame++) {
      harness.sequencer.setState(lights, WHITE, 0)
      harness.sequencer.setState(lights, BLACK, 0)
      harness.advanceBy(FRAME_MS)
    }

    expect(shown()).toBe('0,0,0,0')
  })
})

describe('direct state submission across lights', () => {
  let harness: SequencerHarness

  beforeEach(() => {
    harness = createSequencerHarness({ frontCount: 2, backCount: 0 })
  })

  afterEach(() => harness.cleanup())

  const BLUE: RGBIO = { ...WHITE, red: 0, green: 0 }

  it('keeps a light on its last state when another light updates in the same frame', () => {
    const [a, b] = harness.lightManager.getLights(['front'], ['all'])

    harness.sequencer.setState([a], RED, 1)
    harness.sequencer.setState([a], BLUE, 1)
    harness.sequencer.setState([b], GREEN, 1)
    for (let frame = 0; frame < 5; frame++) harness.advanceBy(FRAME_MS)

    expect(harness.getLightState(a.id)).toMatchObject({ red: 0, green: 0, blue: 255 })
    expect(harness.getLightState(b.id)).toMatchObject({ red: 0, green: 255, blue: 0 })
  })
})
