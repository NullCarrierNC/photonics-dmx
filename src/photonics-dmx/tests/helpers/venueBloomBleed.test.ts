/**
 * Bloom bleed: how colour spreads between neighbouring fixtures, and what it leaves on the master
 * dimmer. The per-light colour stages are covered by venuePostProcessing.test.ts.
 */

import { POST_PROCESSING_VALUES } from '../../cues/types/cueTypes'
import { applyVenueBleed, type VenueBleedChain } from '../../helpers/venueBloomBleed'
import { venueBloomSpec } from '../../helpers/venuePostProcessing'

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
