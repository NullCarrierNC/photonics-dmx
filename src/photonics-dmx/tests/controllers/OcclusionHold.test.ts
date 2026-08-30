/**
 * The occlusion hold against a real sequencer.
 *
 * It is deliberately not an effect on a top layer. `setEffect` clears every transition through
 * `removeAllEffects`, and the blackout paths empty the same map, so an overlay expressed that way is
 * dropped by the next cue that submits — which is exactly the moment it has to survive. These cases
 * drive the paths that would drop it.
 */
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals'
import { createSequencerHarness, type SequencerHarness } from '../helpers/sequencerHarness'
import { getEffectSingleColor } from '../../effects/effectSingleColor'
import type { RGBIO } from '../../types'

const WHITE: RGBIO = {
  red: 255,
  green: 255,
  blue: 255,
  intensity: 255,
  opacity: 1,
  blendMode: 'replace',
}

describe('occlusion hold', () => {
  let harness: SequencerHarness

  beforeEach(() => {
    harness = createSequencerHarness({ frontCount: 2, backCount: 2 })
  })

  afterEach(() => harness.cleanup())

  /** Submit a lit look and settle it, so there is something for the occlusion to hide. */
  const lightEverything = (name: string): void => {
    harness.sequencer.setEffect(
      name,
      getEffectSingleColor({
        color: WHITE,
        duration: 0,
        lights: harness.lightManager.getLights(['front', 'back'], 'all'),
        layer: 0,
      }),
      true,
    )
    harness.advanceBy(50)
  }

  const anyLit = (): boolean =>
    harness.allLightIds.some((id) => (harness.getLightState(id)?.intensity ?? 0) > 0)

  it('darkens the rig and restores it on release', () => {
    lightEverything('look')
    expect(anyLit()).toBe(true)

    harness.sequencer.holdOcclusion(true)
    expect(anyLit()).toBe(false)

    harness.sequencer.holdOcclusion(false)
    harness.advanceBy(50)
    expect(anyLit()).toBe(true)
  })

  it('survives the setEffect that a new primary cue makes', () => {
    // The regression this guards: setEffect wipes every transition, so a top-layer overlay would be
    // gone the instant the next cue started and the rig would light up mid-mute.
    lightEverything('look')
    harness.sequencer.holdOcclusion(true)
    expect(anyLit()).toBe(false)

    lightEverything('next-cue')
    expect(anyLit()).toBe(false)

    harness.sequencer.holdOcclusion(false)
    harness.advanceBy(50)
    expect(anyLit()).toBe(true)
  })

  it('survives removeAllEffects', () => {
    lightEverything('look')
    harness.sequencer.holdOcclusion(true)

    harness.sequencer.removeAllEffects()
    harness.advanceBy(50)
    expect(anyLit()).toBe(false)
  })

  it('survives an immediate blackout and the cue that follows it', () => {
    lightEverything('look')
    harness.sequencer.holdOcclusion(true)

    void harness.sequencer.blackout(0)
    harness.advanceBy(50)
    expect(anyLit()).toBe(false)

    lightEverything('after-blackout')
    expect(anyLit()).toBe(false)
  })

  it('holds for a rig that has not lit anything yet', () => {
    // Nothing has been submitted, so there are no transitions to hang an overlay on at all.
    harness.sequencer.holdOcclusion(true)
    lightEverything('first-look')
    expect(anyLit()).toBe(false)
  })
})
