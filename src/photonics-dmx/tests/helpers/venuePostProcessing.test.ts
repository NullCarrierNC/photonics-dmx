import { POST_PROCESSING_VALUES, type PostProcessing } from '../../cues/types/cueTypes'
import {
  compileVenueColorTransform,
  isPostProcessingState,
  isVenueEffectActive,
  VENUE_EFFECT_SPECS,
  VenuePostProcessor,
  type VenueColor,
} from '../../helpers/venuePostProcessing'

function newColor(): VenueColor {
  return { r: 0, g: 0, b: 0, intensity: 0 }
}

/** Colour only, so the colour vectors below stay readable. */
function apply(
  state: PostProcessing,
  r: number,
  g: number,
  b: number,
  nowMs = 0,
): { r: number; g: number; b: number } {
  const out = applyFull(state, r, g, b, 255, nowMs)
  return { r: out.r, g: out.g, b: out.b }
}

function applyFull(
  state: PostProcessing,
  r: number,
  g: number,
  b: number,
  intensity: number,
  nowMs = 0,
): VenueColor {
  const proc = new VenuePostProcessor()
  proc.setState(state)
  const out = newColor()
  proc.transform('light-1', r, g, b, intensity, nowMs, out)
  return out
}

describe('venue post-processing colour transforms', () => {
  it('covers every state YARG can report', () => {
    for (const state of POST_PROCESSING_VALUES) {
      expect(VENUE_EFFECT_SPECS[state]).toBeDefined()
    }
  })

  it.each(['Default', 'Unknown', 'Mirror'] as const)('leaves colour untouched for %s', (state) => {
    expect(isVenueEffectActive(state)).toBe(false)
    expect(apply(state, 200, 100, 50)).toEqual({ r: 200, g: 100, b: 50 })
  })

  it('leaves a single light untouched for Bloom, which acts between fixtures', () => {
    expect(isVenueEffectActive('Bloom')).toBe(true)
    expect(apply('Bloom', 200, 100, 50)).toEqual({ r: 200, g: 100, b: 50 })
  })

  it('collapses colour to luma for BlackAndWhite', () => {
    expect(apply('BlackAndWhite', 255, 0, 0)).toEqual({ r: 76, g: 76, b: 76 })
    expect(apply('BlackAndWhite', 0, 255, 0)).toEqual({ r: 150, g: 150, b: 150 })
    expect(apply('BlackAndWhite', 0, 0, 255)).toEqual({ r: 29, g: 29, b: 29 })
  })

  it('inverts channels for PhotoNegative', () => {
    expect(apply('PhotoNegative', 0, 128, 255)).toEqual({ r: 255, g: 127, b: 0 })
  })

  it('warms colour for SepiaTone', () => {
    const out = apply('SepiaTone', 150, 150, 150)
    expect(out.r).toBeGreaterThan(out.g)
    expect(out.g).toBeGreaterThan(out.b)
  })

  it('drops red and pushes blue for Scanlines_Blue', () => {
    const out = apply('Scanlines_Blue', 200, 200, 200)
    expect(out.r).toBe(0)
    // Blue is driven past the ceiling, so it only leaves it by as much as the flicker swings.
    expect(out.b).toBeGreaterThan(239)
  })

  it('flickers the level for Scanlines without shifting hue', () => {
    const levels = new Set<number>()
    for (let bucket = 0; bucket < 12; bucket++) {
      const out = applyFull('Scanlines', 200, 100, 50, 255, bucket * 40)
      levels.add(out.r)
      expect(out.g / out.r).toBeCloseTo(0.5, 1)
      expect(out.b / out.r).toBeCloseTo(0.25, 1)
    }
    expect(levels.size).toBeGreaterThan(1)
  })

  it('reports the whole scan line family as active', () => {
    for (const state of [
      'Scanlines',
      'Scanlines_BlackAndWhite',
      'Scanlines_Blue',
      'Scanlines_Security',
    ] as const) {
      expect(isVenueEffectActive(state)).toBe(true)
    }
  })

  it('ramps luma between the duotone endpoints for Polarized_RedAndBlue', () => {
    expect(apply('Polarized_RedAndBlue', 0, 0, 0)).toEqual({ r: 255, g: 0, b: 0 })
    expect(apply('Polarized_RedAndBlue', 255, 255, 255)).toEqual({ r: 0, g: 0, b: 255 })
  })

  it('maps an inverted image onto black-to-red for PhotoNegative_RedAndBlack', () => {
    expect(apply('PhotoNegative_RedAndBlack', 255, 255, 255)).toEqual({ r: 0, g: 0, b: 0 })
    const dark = apply('PhotoNegative_RedAndBlack', 0, 0, 0)
    expect(dark.r).toBe(255)
    expect(dark.g).toBe(0)
    expect(dark.b).toBe(0)
  })

  it('pushes values away from mid-grey for Contrast', () => {
    const high = apply('Contrast', 200, 200, 200)
    const low = apply('Contrast', 60, 60, 60)
    expect(high.r).toBeGreaterThan(200)
    expect(low.r).toBeLessThan(60)
  })

  it('quantises to the requested level count for Posterize', () => {
    const levels = new Set<number>()
    for (let i = 0; i <= 255; i++) {
      levels.add(apply('Posterize', i, i, i).r)
    }
    expect(levels.size).toBe(VENUE_EFFECT_SPECS.Posterize.posterize)
  })

  it('darkens for the negative exposure of Grainy_Film', () => {
    const proc = new VenuePostProcessor()
    proc.setState('Grainy_Film')
    const out = newColor()
    proc.transform('light-1', 200, 200, 200, 255, 0, out)
    expect(out.r).toBeLessThan(200)
  })

  it('emphasises one channel for the per-channel contrast states', () => {
    const red = apply('Contrast_Red', 150, 150, 150)
    expect(red.r).toBeGreaterThan(red.g)
    expect(red.g).toBe(red.b)
    const green = apply('Contrast_Green', 150, 150, 150)
    expect(green.g).toBeGreaterThan(green.r)
    const blue = apply('Contrast_Blue', 150, 150, 150)
    expect(blue.b).toBeGreaterThan(blue.g)
  })

  it('tints the desaturated states toward their colour', () => {
    const red = apply('Desaturated_Red', 120, 120, 120)
    expect(red.r).toBeGreaterThan(red.b)
    const blue = apply('Desaturated_Blue', 120, 120, 120)
    expect(blue.b).toBeGreaterThan(blue.r)
  })

  it('keeps every output an integer inside the DMX byte range', () => {
    for (const state of POST_PROCESSING_VALUES) {
      for (const sample of [0, 1, 128, 254, 255]) {
        const out = apply(state, sample, sample, sample)
        for (const value of [out.r, out.g, out.b]) {
          expect(Number.isInteger(value)).toBe(true)
          expect(value).toBeGreaterThanOrEqual(0)
          expect(value).toBeLessThanOrEqual(255)
        }
      }
    }
  })

  it('reaches the master dimmer for the curve effects, which colour alone cannot show', () => {
    // 0 and 255 are fixed points of these curves, and cue colours are mostly saturated primaries,
    // so a curve confined to colour would leave a red wash untouched.
    const lit = { r: 255, g: 0, b: 0, i: 180 }

    const bright = applyFull('Bright', lit.r, lit.g, lit.b, lit.i)
    expect(bright.r).toBe(255)
    expect(bright.intensity).toBeGreaterThan(lit.i)

    const contrast = applyFull('Contrast', lit.r, lit.g, lit.b, lit.i)
    expect(contrast.intensity).toBeGreaterThan(lit.i)
    expect(applyFull('Contrast', lit.r, lit.g, lit.b, 80).intensity).toBeLessThan(80)

    const posterize = applyFull('Posterize', lit.r, lit.g, lit.b, lit.i)
    expect(posterize.intensity).not.toBe(lit.i)

    const film = applyFull('Grainy_Film', lit.r, lit.g, lit.b, lit.i)
    expect(film.intensity).toBeLessThan(lit.i)
  })

  it('leaves the master dimmer alone for a state with no curve', () => {
    expect(applyFull('BlackAndWhite', 255, 0, 0, 180).intensity).toBe(180)
    expect(applyFull('Default', 255, 0, 0, 180).intensity).toBe(180)
  })

  it('compiles a state once and reuses it', () => {
    expect(compileVenueColorTransform('BlackAndWhite')).toBe(
      compileVenueColorTransform('BlackAndWhite'),
    )
  })

  it('recognises only known states', () => {
    expect(isPostProcessingState('BlackAndWhite')).toBe(true)
    expect(isPostProcessingState('NotAnEffect')).toBe(false)
    expect(isPostProcessingState(7)).toBe(false)
  })
})

describe('venue post-processing temporal effects', () => {
  it('decays a trail toward dark instead of cutting to it', () => {
    const proc = new VenuePostProcessor()
    proc.setState('Trails')
    const out = newColor()

    proc.transform('light-1', 255, 255, 255, 255, 0, out)
    expect(out.r).toBe(255)

    proc.transform('light-1', 0, 0, 0, 255, 33.3, out)
    expect(out.r).toBeGreaterThan(0)
    expect(out.r).toBeLessThan(255)

    const afterOneFrame = out.r
    proc.transform('light-1', 0, 0, 0, 255, 66.6, out)
    expect(out.r).toBeLessThan(afterOneFrame)
  })

  it('holds a longer trail than the standard one', () => {
    const short = newColor()
    const long = newColor()
    const shortProc = new VenuePostProcessor()
    shortProc.setState('Trails')
    const longProc = new VenuePostProcessor()
    longProc.setState('Trails_Long')

    shortProc.transform('light-1', 255, 255, 255, 255, 0, short)
    longProc.transform('light-1', 255, 255, 255, 255, 0, long)
    shortProc.transform('light-1', 0, 0, 0, 255, 100, short)
    longProc.transform('light-1', 0, 0, 0, 255, 100, long)

    expect(long.r).toBeGreaterThan(short.r)
  })

  it('does not advance the trail when a light is reached twice at one timestamp', () => {
    const proc = new VenuePostProcessor()
    proc.setState('Trails')
    const out = newColor()

    proc.transform('light-1', 255, 255, 255, 255, 0, out)
    proc.transform('light-1', 0, 0, 0, 255, 50, out)
    const first = { ...out }
    proc.transform('light-1', 0, 0, 0, 255, 50, out)

    expect(out).toEqual(first)
  })

  it('holds colour within a choppy bucket and re-samples on the next one', () => {
    const proc = new VenuePostProcessor()
    proc.setState('Choppy_BlackAndWhite')
    const out = newColor()

    proc.transform('light-1', 255, 255, 255, 255, 0, out)
    const held = out.r
    proc.transform('light-1', 0, 0, 0, 255, 60, out)
    expect(out.r).toBe(held)

    proc.transform('light-1', 0, 0, 0, 255, 260, out)
    expect(out.r).not.toBe(held)
  })

  it('leaves no afterglow when the trail is skipped', () => {
    const proc = new VenuePostProcessor()
    proc.setState('Trails')
    const out = newColor()

    proc.transform('light-1', 255, 255, 255, 255, 0, out, true)
    expect(out.r).toBe(255)

    proc.transform('light-1', 0, 0, 0, 255, 33.3, out, true)
    expect(out.r).toBe(0)
  })

  it('re-samples every frame when the choppy hold is skipped', () => {
    const proc = new VenuePostProcessor()
    proc.setState('Choppy_BlackAndWhite')
    const out = newColor()

    proc.transform('light-1', 255, 255, 255, 255, 0, out, true)
    proc.transform('light-1', 0, 0, 0, 255, 60, out, true)

    expect(out.r).toBe(0)
  })

  it('still applies the colour transform to a flashing light', () => {
    const proc = new VenuePostProcessor()
    proc.setState('Choppy_BlackAndWhite')
    const graded = newColor()
    proc.transform('light-1', 255, 0, 0, 255, 0, graded, true)

    // The greyscale matrix and contrast curve still reach a red cue colour.
    expect(graded.r).toBe(graded.g)
    expect(graded.r).toBe(graded.b)
    expect(graded.r).toBeGreaterThan(0)
    expect(graded.r).toBeLessThan(255)
  })
})

describe('venue post-processing colours that put a flash out', () => {
  it.each(['PhotoNegative', 'PhotoNegative_RedAndBlack'] as const)(
    'leaves a flash alone under %s',
    (state) => {
      const proc = new VenuePostProcessor()
      proc.setState(state)
      const out = newColor()

      proc.transform('light-1', 255, 255, 255, 255, 0, out, true)

      expect(out).toEqual({ r: 255, g: 255, b: 255, intensity: 255 })
    },
  )

  it('still inverts a light no strobe is driving', () => {
    const proc = new VenuePostProcessor()
    proc.setState('PhotoNegative')
    const out = newColor()

    proc.transform('light-1', 255, 255, 255, 255, 0, out)

    expect([out.r, out.g, out.b]).toEqual([0, 0, 0])
  })

  it('greys a flash under a colour that leaves it visible', () => {
    const proc = new VenuePostProcessor()
    proc.setState('BlackAndWhite')
    const out = newColor()

    proc.transform('light-1', 255, 0, 0, 255, 0, out, true)

    expect([out.r, out.g, out.b]).toEqual([76, 76, 76])
  })

  it('dims a flash under the darkest colour that still reads as one', () => {
    const proc = new VenuePostProcessor()
    proc.setState('Grainy_Film')
    const out = newColor()

    proc.transform('light-1', 255, 255, 255, 255, 0, out, true)

    expect(out.r).toBeLessThan(255)
    expect(out.r).toBeGreaterThan(0)
  })

  it('varies grain over time but repeats for the same light and moment', () => {
    const proc = new VenuePostProcessor()
    proc.setState('Trails_Flickery')
    const first = newColor()
    const repeat = newColor()

    proc.transform('light-1', 200, 200, 200, 255, 0, first)
    proc.transform('light-1', 200, 200, 200, 255, 0, repeat)
    expect(repeat).toEqual(first)

    const samples = new Set<number>()
    for (let bucket = 0; bucket < 12; bucket++) {
      const out = newColor()
      const fresh = new VenuePostProcessor()
      fresh.setState('Scanlines_Security')
      fresh.transform('light-1', 200, 200, 200, 255, bucket * 40, out)
      samples.add(out.g)
    }
    expect(samples.size).toBeGreaterThan(1)
  })

  it('leaves a dark light dark under grain', () => {
    for (let bucket = 0; bucket < 8; bucket++) {
      const proc = new VenuePostProcessor()
      proc.setState('Grainy_Film')
      const out = newColor()
      proc.transform('light-1', 0, 0, 0, 255, bucket * 40, out)
      expect([out.r, out.g, out.b]).toEqual([0, 0, 0])
    }
  })

  it('gives different lights independent grain', () => {
    const proc = new VenuePostProcessor()
    proc.setState('Scanlines_Security')
    const a = newColor()
    const b = newColor()
    proc.transform('light-a', 200, 200, 200, 255, 0, a)
    proc.transform('light-b', 200, 200, 200, 255, 0, b)
    expect(a.g).not.toBe(b.g)
  })

  it('clears trail state when the effect changes', () => {
    const proc = new VenuePostProcessor()
    proc.setState('Trails')
    const out = newColor()
    proc.transform('light-1', 255, 255, 255, 255, 0, out)

    proc.setState('Trails_Long')
    proc.transform('light-1', 0, 0, 0, 255, 33.3, out)
    expect([out.r, out.g, out.b]).toEqual([0, 0, 0])
  })

  it('keeps every trail visible for long enough to read as a trail', () => {
    // A trail that is gone within a few frames reads as a fast fade, not an afterglow.
    for (const state of [
      'Trails',
      'Trails_Long',
      'Trails_Desaturated',
      'Trails_Flickery',
      'Trails_Spacey',
    ] as const) {
      const proc = new VenuePostProcessor()
      proc.setState(state)
      const out = newColor()
      proc.transform('light-1', 255, 255, 255, 255, 0, out)

      // Still clearly lit a third of a second after the source goes dark.
      proc.transform('light-1', 0, 0, 0, 0, 300, out)
      expect(out.intensity).toBeGreaterThan(40)
    }
  })

  it('orders the trail lengths as their names suggest', () => {
    const remaining = (state: PostProcessing): number => {
      const proc = new VenuePostProcessor()
      proc.setState(state)
      const out = newColor()
      proc.transform('light-1', 255, 255, 255, 255, 0, out)
      proc.transform('light-1', 0, 0, 0, 0, 500, out)
      return out.intensity
    }
    expect(remaining('Trails_Long')).toBeGreaterThan(remaining('Trails'))
    expect(remaining('Trails_Spacey')).toBeGreaterThan(remaining('Trails_Long'))
  })

  it('fades a trail to near nothing once its duration has elapsed', () => {
    const proc = new VenuePostProcessor()
    proc.setState('Trails')
    const out = newColor()
    proc.transform('light-1', 255, 255, 255, 255, 0, out)

    const trailMs = VENUE_EFFECT_SPECS.Trails.trailMs!
    proc.transform('light-1', 0, 0, 0, 0, trailMs, out)
    expect(out.intensity).toBeLessThan(40)
  })

  it('decays the master dimmer alongside the colour', () => {
    // A cue switches a fixture off through the dimmer, so a trail that held colour alone would
    // decay behind a closed shutter and never be seen.
    const proc = new VenuePostProcessor()
    proc.setState('Trails')
    const out = newColor()

    proc.transform('light-1', 255, 0, 0, 255, 0, out)
    expect(out.intensity).toBe(255)

    proc.transform('light-1', 0, 0, 0, 0, 33.3, out)
    expect(out.intensity).toBeGreaterThan(0)
    expect(out.intensity).toBeLessThan(255)

    const afterOneFrame = out.intensity
    proc.transform('light-1', 0, 0, 0, 0, 66.6, out)
    expect(out.intensity).toBeLessThan(afterOneFrame)
  })

  it('holds the master dimmer through a choppy bucket', () => {
    const proc = new VenuePostProcessor()
    proc.setState('Choppy_BlackAndWhite')
    const out = newColor()

    proc.transform('light-1', 255, 255, 255, 255, 0, out)
    const held = out.intensity
    proc.transform('light-1', 0, 0, 0, 0, 60, out)
    expect(out.intensity).toBe(held)
  })

  it('preserves the observed effect when temporal history is cleared', () => {
    const proc = new VenuePostProcessor()
    proc.setState('Trails')
    const out = newColor()
    proc.transform('light-1', 255, 0, 0, 255, 0, out)
    expect(out.r).toBeGreaterThan(0)

    proc.clearTemporalState()
    expect(proc.getState()).toBe('Trails')
    expect(proc.isActive()).toBe(true)

    proc.transform('light-1', 0, 0, 0, 0, 1000, out)
    expect(out.r).toBe(0)
  })
})
