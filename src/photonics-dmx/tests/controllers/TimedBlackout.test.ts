/**
 * The timed blackout against a real sequencer.
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

describe('timed blackout', () => {
  let harness: SequencerHarness

  beforeEach(() => {
    harness = createSequencerHarness({ frontCount: 2, backCount: 2 })
  })

  afterEach(() => harness.cleanup())

  /**
   * Submits a lit look and settles it, so the transitions behind it have completed and been reaped.
   */
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

  it('darkens a look whose transitions have all finished', () => {
    lightEverything('settled-look')
    expect(anyLit()).toBe(true)

    void harness.sequencer.blackout(100)
    harness.advanceBy(100)

    expect(anyLit()).toBe(false)
  })

  it('darkens every light in the rig, not only the ones still fading', () => {
    lightEverything('settled-look')

    void harness.sequencer.blackout(100)
    harness.advanceBy(100)

    for (const id of harness.allLightIds) {
      expect(harness.getLightState(id)?.intensity ?? 0).toBe(0)
    }
  })

  it('darkens a look that is still fading', () => {
    harness.sequencer.setEffect(
      'fading-look',
      getEffectSingleColor({
        color: WHITE,
        duration: 400,
        lights: harness.lightManager.getLights(['front', 'back'], 'all'),
        layer: 0,
      }),
      true,
    )
    harness.advanceBy(200)
    expect(anyLit()).toBe(true)

    void harness.sequencer.blackout(100)
    harness.advanceBy(100)

    expect(anyLit()).toBe(false)
  })

  it('resolves once the fade has run', async () => {
    lightEverything('settled-look')

    const done = harness.sequencer.blackout(20)
    harness.advanceBy(50)

    await expect(done).resolves.toBeUndefined()
  })
})
