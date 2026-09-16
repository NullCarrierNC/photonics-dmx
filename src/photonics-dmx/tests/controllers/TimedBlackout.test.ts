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

  /** The run id the lit look is looping under, and whether the registry still holds it. */
  const runState = (): { runId: string; isLive: () => boolean } => {
    const runId = harness.sequencer
      .getActiveEffectsForLight(harness.allLightIds[0])
      .get(0)?.effectRunId
    expect(runId).toBeDefined()
    const persistentRuns = (
      harness.sequencer as unknown as {
        effectManager: { persistentRuns: { has(id: string): boolean } }
      }
    ).effectManager.persistentRuns
    return { runId: runId!, isLive: () => persistentRuns.has(runId!) }
  }

  it('retires the run of a persistent look it wipes instantly', () => {
    lightEverything('settled-look')
    const { isLive } = runState()
    expect(isLive()).toBe(true)

    void harness.sequencer.blackout(0)
    harness.advanceBy(10)

    expect(isLive()).toBe(false)
  })

  it('retires the run of a persistent look when the fade completes', async () => {
    lightEverything('settled-look')
    const { isLive } = runState()

    const done = harness.sequencer.blackout(50)
    // Long enough for the fade's own completion timer to have fired.
    harness.advanceBy(80)
    await done

    expect(isLive()).toBe(false)
  })

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

  it('goes dark at once when an instant blackout lands during a fade', () => {
    lightEverything('settled-look')

    void harness.sequencer.blackout(500)
    harness.advanceBy(100)
    expect(anyLit()).toBe(true)

    void harness.sequencer.blackout(0)
    harness.advanceBy(10)

    expect(anyLit()).toBe(false)
  })

  it('leaves a look that starts after an instant blackout alone', () => {
    lightEverything('settled-look')

    void harness.sequencer.blackout(500)
    harness.advanceBy(100)
    void harness.sequencer.blackout(0)
    harness.advanceBy(10)

    lightEverything('look-after')
    harness.advanceBy(500)

    expect(anyLit()).toBe(true)
  })

  it('does not leave the completed fade behind to hide a later add-only submission', async () => {
    lightEverything('settled-look')

    const done = harness.sequencer.blackout(50)
    // Long enough for the fade's own +16ms completion timer to have fired.
    harness.advanceBy(80)
    await done
    expect(anyLit()).toBe(false)

    // A non-clearing submission (unlike setEffect, this never touches layer 255 itself), the way
    // a secondary or effect-raiser cue resubmits its look every frame.
    harness.sequencer.addEffect(
      'after-blackout',
      getEffectSingleColor({
        color: WHITE,
        duration: 0,
        lights: harness.lightManager.getLights(['front', 'back'], 'all'),
        layer: 101,
      }),
      true,
    )
    harness.advanceBy(50)

    expect(anyLit()).toBe(true)
  })

  it("fades from the light's actual blended colour, not layer 0, when nothing is on layer 0", () => {
    // The look lives on a layer above 0, so layer 0 itself holds no state at all.
    void harness.sequencer.setEffect(
      'raised-look',
      getEffectSingleColor({
        color: WHITE,
        duration: 0,
        lights: harness.lightManager.getLights(['front', 'back'], 'all'),
        layer: 5,
      }),
      true,
    )
    harness.advanceBy(50)
    expect(anyLit()).toBe(true)

    void harness.sequencer.blackout(100)
    harness.advanceBy(1)

    // Barely into a 100ms fade: still close to the original colour rather than already black,
    // which is what reading layer 0's (empty) state as the fade's start colour would produce.
    const sampleId = harness.allLightIds[0]
    expect(harness.getLightState(sampleId)?.intensity ?? 0).toBeGreaterThan(200)
  })

  /** A persistent look above layer 0, the way a primary cue leaves its effects up when it stops. */
  const lightRaisedLook = (): void => {
    void harness.sequencer.setEffect(
      'raised-look',
      getEffectSingleColor({
        color: WHITE,
        duration: 0,
        lights: harness.lightManager.getLights(['front', 'back'], 'all'),
        layer: 5,
      }),
      true,
    )
    harness.advanceBy(50)
  }

  it('keeps a look above layer 0 dark once the fade has completed', async () => {
    lightRaisedLook()
    expect(anyLit()).toBe(true)

    const done = harness.sequencer.blackout(50)
    harness.advanceBy(80)
    await done
    harness.advanceBy(100)

    expect(anyLit()).toBe(false)
  })

  it('stays dark through a held slow blackout that restarts its fade', async () => {
    lightRaisedLook()

    // A chart-held Blackout_Slow asks again on every frame; each request after a completed fade
    // starts a new one.
    for (let i = 0; i < 6; i++) {
      const done = harness.sequencer.blackout(50)
      harness.advanceBy(80)
      await done
      harness.advanceBy(20)
      expect(anyLit()).toBe(false)
    }
  })
})
