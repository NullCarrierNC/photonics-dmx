import { POST_PROCESSING_VALUES, type PostProcessing } from '../../cues/types/cueTypes'
import {
  applyVenueBleed,
  compileVenueColorTransform,
  isPostProcessingState,
  isVenueEffectActive,
  VENUE_EFFECT_SPECS,
  venueBloomSpec,
  VenuePostProcessor,
  type VenueBleedChain,
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

  it.each(['Default', 'Unknown', 'Mirror', 'Scanlines'] as const)(
    'leaves colour untouched for %s',
    (state) => {
      expect(isVenueEffectActive(state)).toBe(false)
      expect(apply(state, 200, 100, 50)).toEqual({ r: 200, g: 100, b: 50 })
    },
  )

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
    expect(out.b).toBe(255)
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

interface LightSample {
  r: number
  g: number
  b: number
  i?: number
}

function makeChain(lights: LightSample[]): VenueBleedChain {
  const count = lights.length
  const chain: VenueBleedChain = {
    red: new Float64Array(count),
    green: new Float64Array(count),
    blue: new Float64Array(count),
    intensity: new Float64Array(count),
    emitRed: new Float64Array(count),
    emitGreen: new Float64Array(count),
    emitBlue: new Float64Array(count),
    spillRed: new Float64Array(count),
    spillGreen: new Float64Array(count),
    spillBlue: new Float64Array(count),
    count,
  }
  lights.forEach((light, index) => {
    chain.red[index] = light.r
    chain.green[index] = light.g
    chain.blue[index] = light.b
    chain.intensity[index] = light.i ?? 255
  })
  return chain
}

function readChain(chain: VenueBleedChain): LightSample[] {
  const out: LightSample[] = []
  for (let i = 0; i < chain.count; i++) {
    out.push({ r: chain.red[i]!, g: chain.green[i]!, b: chain.blue[i]!, i: chain.intensity[i]! })
  }
  return out
}

/**
 * What a fixture actually puts out, which is its colour scaled by the master dimmer. Assertions use
 * this rather than the raw channels, since the same emitted light can be split between colour and
 * dimmer in more than one way.
 */
function readEmitted(chain: VenueBleedChain): Array<{ r: number; g: number; b: number }> {
  return readChain(chain).map((light) => {
    const scale = (light.i ?? 255) / 255
    return {
      r: Math.round(light.r * scale),
      g: Math.round(light.g * scale),
      b: Math.round(light.b * scale),
    }
  })
}

const BLOOM = venueBloomSpec('Bloom')!
const OFF: LightSample = { r: 0, g: 0, b: 0, i: 0 }
const LIT_RED: LightSample = { r: 255, g: 0, b: 0 }
const LIT_GREEN: LightSample = { r: 0, g: 255, b: 0 }

describe('venue bloom bleed', () => {
  it('is configured for Bloom alone', () => {
    expect(BLOOM).not.toBeNull()
    for (const state of POST_PROCESSING_VALUES) {
      if (state === 'Bloom') continue
      expect(venueBloomSpec(state)).toBeNull()
    }
  })

  it('spills colour onto both neighbours of a lit fixture', () => {
    const chain = makeChain([OFF, LIT_RED, OFF])
    applyVenueBleed(chain, BLOOM)
    const [left, , right] = readChain(chain)

    expect(left!.r).toBeGreaterThan(0)
    expect(right!.r).toBeGreaterThan(0)
    expect(left!.r).toBe(right!.r)
    expect(left!.g).toBe(0)
    expect(left!.b).toBe(0)
  })

  it('raises a dark neighbour master dimmer so the spill can reach the wire', () => {
    const chain = makeChain([OFF, LIT_RED, OFF])
    applyVenueBleed(chain, BLOOM)
    const [left] = readChain(chain)

    expect(left!.i).toBeGreaterThan(0)
    // Colour carries the hue at full and the dimmer carries the level, so the emitted light is
    // attenuated once rather than twice.
    expect(left!.r).toBe(255)
    expect(readEmitted(chain)[0]!.r).toBe(left!.i)
  })

  it('emits spill at the intended fraction of the source', () => {
    const chain = makeChain([OFF, LIT_RED, OFF])
    applyVenueBleed(chain, BLOOM)
    const emitted = readEmitted(chain)

    expect(emitted[0]!.r).toBe(Math.round(255 * BLOOM.spill))
    expect(emitted[2]!.r).toBe(emitted[0]!.r)
  })

  it('never lowers a master dimmer that is already higher', () => {
    const chain = makeChain([{ r: 0, g: 0, b: 0, i: 255 }, LIT_RED])
    applyVenueBleed(chain, BLOOM)
    expect(readChain(chain)[0]!.i).toBe(255)
  })

  it('blooms a fully saturated red source, whose luma sits well below the threshold', () => {
    const chain = makeChain([OFF, LIT_RED])
    applyVenueBleed(chain, BLOOM)
    expect(readChain(chain)[0]!.r).toBeGreaterThan(0)
  })

  it('leaves a fixture below the threshold inert', () => {
    const dim = Math.floor(BLOOM.threshold * 255) - 10
    const chain = makeChain([OFF, { r: dim, g: dim, b: dim }, OFF])
    applyVenueBleed(chain, BLOOM)
    const lights = readChain(chain)

    expect(lights[0]).toEqual({ ...OFF, i: 0 })
    expect(lights[2]).toEqual({ ...OFF, i: 0 })
    expect(lights[1]!.r).toBe(dim)
  })

  it('spills from a fixture only part way up the dimmer', () => {
    // Cues spend most of their time below full, so a threshold that only catches near-full
    // fixtures leaves whole looks with no spill at all.
    for (const level of [128, 150, 180]) {
      const chain = makeChain([OFF, { r: 0, g: 0, b: 255, i: level }, OFF])
      applyVenueBleed(chain, BLOOM)
      expect(readEmitted(chain)[0]!.b).toBeGreaterThan(10)
    }
  })

  it('ramps the spill smoothly rather than switching on at a cliff', () => {
    const spillAt = (level: number): number => {
      const chain = makeChain([OFF, { r: 0, g: 0, b: 255, i: level }, OFF])
      applyVenueBleed(chain, BLOOM)
      return readEmitted(chain)[0]!.b
    }
    const samples = [100, 128, 150, 180, 220, 255].map(spillAt)
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]!).toBeGreaterThan(samples[i - 1]!)
    }
  })

  it('scales the spill by how far above the threshold a fixture sits', () => {
    const justOver = Math.ceil(BLOOM.threshold * 255) + 20
    const dimmer = makeChain([OFF, { r: justOver, g: justOver, b: justOver }])
    const brighter = makeChain([OFF, { r: 255, g: 255, b: 255 }])
    applyVenueBleed(dimmer, BLOOM)
    applyVenueBleed(brighter, BLOOM)

    expect(readEmitted(brighter)[0]!.r).toBeGreaterThan(readEmitted(dimmer)[0]!.r)
  })

  it('accounts for the master dimmer when deciding what blooms', () => {
    const chain = makeChain([OFF, { r: 255, g: 255, b: 255, i: 40 }])
    applyVenueBleed(chain, BLOOM)
    expect(readChain(chain)[0]!.r).toBe(0)
  })

  it('brightens the source itself', () => {
    const chain = makeChain([{ r: 200, g: 0, b: 0 }])
    applyVenueBleed(chain, BLOOM)
    expect(readChain(chain)[0]!.r).toBeGreaterThan(200)
  })

  it('does not reach a fixture two positions away', () => {
    const chain = makeChain([OFF, OFF, LIT_RED, OFF, OFF])
    applyVenueBleed(chain, BLOOM)
    const lights = readChain(chain)

    expect(lights[1]!.r).toBeGreaterThan(0)
    expect(lights[0]!.r).toBe(0)
    expect(lights[4]!.r).toBe(0)
  })

  it('does not wrap around the ends of the chain', () => {
    const chain = makeChain([LIT_RED, OFF, OFF, OFF])
    applyVenueBleed(chain, BLOOM)
    expect(readChain(chain)[3]!.r).toBe(0)
  })

  it('mixes two lit neighbours into each other while each keeps its own colour', () => {
    const chain = makeChain([LIT_RED, LIT_GREEN])
    applyVenueBleed(chain, BLOOM)
    const [red, green] = readChain(chain)

    expect(red!.g).toBeGreaterThan(0)
    expect(red!.r).toBeGreaterThan(red!.g)
    expect(green!.r).toBeGreaterThan(0)
    expect(green!.g).toBeGreaterThan(green!.r)
    // The exchange reads pre-bleed colour on both sides, so it is symmetric.
    expect(red!.g).toBe(green!.r)
  })

  it('accumulates two sources on a shared neighbour without exceeding full output', () => {
    const chain = makeChain([LIT_RED, OFF, LIT_RED])
    applyVenueBleed(chain, BLOOM)
    const middle = readEmitted(chain)[1]!

    const single = makeChain([LIT_RED, OFF])
    applyVenueBleed(single, BLOOM)
    // Contributions are summed before rounding, so the pair lands within a step of double.
    expect(middle.r).toBeGreaterThanOrEqual(readEmitted(single)[1]!.r * 2 - 1)
    expect(middle.r).toBeLessThanOrEqual(readEmitted(single)[1]!.r * 2 + 1)

    const saturated = makeChain([
      { r: 255, g: 255, b: 255 },
      { r: 250, g: 250, b: 250 },
      { r: 255, g: 255, b: 255 },
    ])
    applyVenueBleed(saturated, BLOOM)
    for (const light of readChain(saturated)) {
      for (const value of [light.r, light.g, light.b, light.i!]) {
        expect(value).toBeLessThanOrEqual(255)
        expect(Number.isInteger(value)).toBe(true)
      }
    }
  })

  it('handles chains too short to have neighbours', () => {
    const empty = makeChain([])
    expect(() => applyVenueBleed(empty, BLOOM)).not.toThrow()

    const single = makeChain([LIT_RED])
    expect(() => applyVenueBleed(single, BLOOM)).not.toThrow()
    expect(readChain(single)[0]!.r).toBe(255)
  })

  it('ignores array entries beyond the live count', () => {
    const chain = makeChain([LIT_RED, OFF, LIT_RED])
    chain.count = 2
    applyVenueBleed(chain, BLOOM)

    // The third entry is stale capacity, so it neither receives spill nor blooms.
    expect(chain.red[2]).toBe(255)
    expect(chain.intensity[2]).toBe(255)
  })
})
