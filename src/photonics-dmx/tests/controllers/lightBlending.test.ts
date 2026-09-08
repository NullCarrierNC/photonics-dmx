import { describe, expect, it } from '@jest/globals'
import {
  blendWithOpacity,
  getEasingValue,
  interpolate,
  interpolateFloat,
  transparentColor,
} from '../../controllers/sequencer/lightBlending'
import type { RGBIO } from '../../types'

/** Folds layers onto a transparent base, lowest first, the way a frame composites them. */
function compose(...layers: RGBIO[]): RGBIO {
  return layers.reduce(blendWithOpacity, transparentColor())
}

function color(overrides: Partial<RGBIO> = {}): RGBIO {
  return {
    red: 0,
    green: 0,
    blue: 0,
    intensity: 255,
    opacity: 1.0,
    blendMode: 'replace',
    ...overrides,
  }
}

const blue = color({ blue: 255 })
const green = color({ green: 255 })
const red = color({ red: 255 })

describe('blendWithOpacity', () => {
  describe('replace', () => {
    it('hides the layer below rather than adding to it', () => {
      const out = compose(blue, green)
      expect([out.red, out.green, out.blue]).toEqual([0, 255, 0])
      expect(out.intensity).toBe(255)
    })

    it('reveals the layer below when the upper layer is transparent', () => {
      const out = compose(blue, { ...green, opacity: 0.0 })
      expect([out.red, out.green, out.blue]).toEqual([0, 0, 255])
    })

    it('scales the replacement colour from black at partial opacity', () => {
      const out = compose(
        color({ red: 100, green: 40, blue: 20, intensity: 200 }),
        color({ red: 200, green: 100, blue: 50, intensity: 100, opacity: 0.5 }),
      )
      expect([out.red, out.green, out.blue, out.intensity]).toEqual([100, 50, 25, 50])
    })

    it('fades an upper layer down without ever revealing the layer below', () => {
      for (const opacity of [1.0, 0.75, 0.5, 0.25]) {
        const out = compose(blue, { ...green, opacity })
        expect(out.green).toBe(Math.round(255 * opacity))
        expect(out.blue).toBe(0)
        expect(out.red).toBe(0)
      }
    })

    it('overrides every channel of the layer below at full opacity', () => {
      const upper = color({ red: 42, green: 180, blue: 220, intensity: 150 })
      const out = compose(color({ red: 123, green: 45, blue: 67, intensity: 210 }), upper)
      expect(out).toEqual(upper)
    })

    it('gives the highest layer regardless of which layers are present', () => {
      expect(compose(blue).blue).toBe(255)
      expect([compose(blue, green).green, compose(blue, green).blue]).toEqual([255, 0])
      expect([compose(blue, red).red, compose(blue, red).blue]).toEqual([255, 0])
      expect([compose(blue, green, red).red, compose(blue, green, red).green]).toEqual([255, 0])
      expect([compose(green, red).red, compose(green, red).green]).toEqual([255, 0])
    })

    it('resolves to the top layer when the layers in between are skipped', () => {
      const top = color({ blue: 100 })
      expect(compose(color({ red: 100 }), top)).toEqual(top)
    })
  })

  describe('add', () => {
    it('sums the layer below with the layer above', () => {
      const out = compose(blue, { ...green, blendMode: 'add' })
      expect([out.red, out.green, out.blue]).toEqual([0, 255, 255])
    })

    it('scales the added colour by opacity', () => {
      const out = compose(
        color({ red: 100, green: 40, blue: 20, intensity: 200 }),
        color({ red: 200, green: 100, blue: 50, intensity: 100, opacity: 0.5, blendMode: 'add' }),
      )
      expect([out.red, out.green, out.blue, out.intensity]).toEqual([200, 90, 45, 250])
    })

    it('clamps every channel at 255', () => {
      const out = compose(
        color({ red: 200, green: 200, blue: 200, intensity: 200 }),
        color({
          red: 255,
          green: 255,
          blue: 255,
          intensity: 255,
          opacity: 0.75,
          blendMode: 'add',
        }),
      )
      expect([out.red, out.green, out.blue, out.intensity]).toEqual([255, 255, 255, 255])
    })

    it('treats intensity as a channel of its own rather than a master dimmer', () => {
      const out = compose(
        color({ red: 255, intensity: 200 }),
        color({ red: 255, intensity: 100, opacity: 0.5, blendMode: 'add' }),
      )
      expect([out.red, out.green, out.blue]).toEqual([255, 0, 0])
      expect(out.intensity).toBe(250)
    })

    it('scales each channel by the same opacity independently of the others', () => {
      const out = compose(
        color({ red: 200, green: 200, blue: 200, intensity: 200 }),
        color({
          red: 100,
          green: 250,
          blue: 50,
          intensity: 150,
          opacity: 0.5,
          blendMode: 'add',
        }),
      )
      expect([out.red, out.green, out.blue, out.intensity]).toEqual([250, 255, 225, 255])
    })

    it('adds a colour-only layer onto a differently coloured base', () => {
      const out = compose(
        color({ red: 255 }),
        color({ green: 200, intensity: 100, opacity: 0.5, blendMode: 'add' }),
      )
      expect([out.red, out.green, out.blue, out.intensity]).toEqual([255, 100, 0, 255])
    })
  })

  describe('mix', () => {
    const yellow = color({ red: 255, green: 255 })

    it('shows the layer below at opacity 0', () => {
      const out = compose(blue, { ...yellow, opacity: 0, blendMode: 'mix' })
      expect([out.red, out.green, out.blue]).toEqual([0, 0, 255])
    })

    it('shows the upper layer alone at opacity 1', () => {
      const out = compose(blue, { ...yellow, opacity: 1, blendMode: 'mix' })
      expect([out.red, out.green, out.blue]).toEqual([255, 255, 0])
    })

    it('crossfades through both colours rather than through black or white', () => {
      const out = compose(blue, { ...yellow, opacity: 0.5, blendMode: 'mix' })
      expect(out.red).toBeGreaterThan(0)
      expect(out.green).toBeGreaterThan(0)
      expect(out.blue).toBeGreaterThan(0)
      expect(out.blue).toBeLessThan(255)
      expect(out.red).toBeLessThan(255)
    })

    it('lands half way between the two colours at opacity 0.5', () => {
      const out = compose(
        color({ red: 100, green: 40, blue: 20, intensity: 200 }),
        color({ red: 200, green: 100, blue: 50, intensity: 100, opacity: 0.5, blendMode: 'mix' }),
      )
      expect([out.red, out.green, out.blue, out.intensity]).toEqual([150, 70, 35, 150])
    })
  })

  describe('across every blend mode', () => {
    const base = color({ red: 100, green: 40, blue: 20, intensity: 200 })
    const upper = { red: 200, green: 100, blue: 50, intensity: 100 }

    for (const blendMode of ['replace', 'add', 'mix'] as const) {
      it(`${blendMode}: opacity 0 leaves the layer below unchanged`, () => {
        const out = compose(base, color({ ...upper, opacity: 0, blendMode }))
        expect([out.red, out.green, out.blue, out.intensity]).toEqual([100, 40, 20, 200])
      })
    }

    it('replace and mix take the upper colour at opacity 1, and add saturates', () => {
      expect(compose(base, color({ ...upper, opacity: 1, blendMode: 'replace' })).red).toBe(200)
      expect(compose(base, color({ ...upper, opacity: 1, blendMode: 'mix' })).red).toBe(200)
      expect(compose(base, color({ ...upper, opacity: 1, blendMode: 'add' })).red).toBe(255)
      expect(compose(base, color({ ...upper, opacity: 1, blendMode: 'add' })).intensity).toBe(255)
    })

    it('publishes a fully opaque result carrying the top layer blend mode', () => {
      const out = compose(
        color({ red: 255, intensity: 255 }),
        color({ green: 255, intensity: 200, opacity: 0.5, blendMode: 'add' }),
        color({ blue: 255, intensity: 150, opacity: 0.75, blendMode: 'add' }),
        color({ red: 255, green: 255, intensity: 100, opacity: 0.25, blendMode: 'add' }),
      )
      expect(out.opacity).toBe(1.0)
      expect(out.blendMode).toBe('add')
    })

    it('falls back to replace for an unrecognised blend mode', () => {
      const out = compose(blue, {
        ...green,
        blendMode: 'screen' as RGBIO['blendMode'],
      })
      expect([out.red, out.green, out.blue]).toEqual([0, 255, 0])
    })
  })

  describe('pan and tilt', () => {
    const aimed = color({ intensity: 0, opacity: 0, pan: 42, tilt: 77 })

    it('carry forward through a colour-only layer above', () => {
      const out = compose(aimed, color({ red: 200, green: 100, blue: 50 }))
      expect([out.pan, out.tilt]).toEqual([42, 77])
    })

    it('are overridden by a higher layer that sets them', () => {
      const out = compose(aimed, color({ red: 200, pan: 90, tilt: 10 }))
      expect([out.pan, out.tilt]).toEqual([90, 10])
    })

    it('survive a single layer that carries them', () => {
      const out = compose(color({ red: 128, green: 64, blue: 32, pan: 55, tilt: 30 }))
      expect([out.pan, out.tilt]).toEqual([55, 30])
    })

    it('stay undefined when no layer carries them, so the publisher uses fixture home', () => {
      const out = compose(color({ red: 128, green: 64, blue: 32 }))
      expect(out.pan).toBeUndefined()
      expect(out.tilt).toBeUndefined()
    })

    it('carry forward through an additive colour-only layer', () => {
      const out = compose(
        color({ intensity: 0, opacity: 0, pan: 55, tilt: 33 }),
        color({ red: 100, green: 100, blue: 100, blendMode: 'add' }),
      )
      expect([out.pan, out.tilt]).toEqual([55, 33])
    })

    it('carry forward through a mix colour-only layer', () => {
      const out = compose(
        color({ red: 200, green: 100, blue: 50, intensity: 200, pan: 20, tilt: 80 }),
        color({ red: 128, green: 128, blue: 128, intensity: 200, blendMode: 'mix' }),
      )
      expect([out.pan, out.tilt]).toEqual([20, 80])
    })
  })
})

describe('transparentColor', () => {
  it('is an all-zero colour that shows whatever is below it', () => {
    expect(transparentColor()).toEqual({
      red: 0,
      green: 0,
      blue: 0,
      intensity: 0,
      opacity: 0.0,
      blendMode: 'replace',
    })
  })
})

describe('interpolate', () => {
  it('rounds to a whole channel value', () => {
    expect(interpolate(0, 255, 0.5)).toBe(128)
  })

  it('floors at zero so a channel never goes negative', () => {
    expect(interpolate(0, -100, 1)).toBe(0)
  })

  it('returns the endpoints exactly', () => {
    expect(interpolate(10, 200, 0)).toBe(10)
    expect(interpolate(10, 200, 1)).toBe(200)
  })
})

describe('interpolateFloat', () => {
  it('keeps the fractional value rather than rounding it', () => {
    expect(interpolateFloat(0, 1, 0.25)).toBe(0.25)
  })

  it('clamps to the 0 to 1 opacity range', () => {
    expect(interpolateFloat(0, 2, 1)).toBe(1)
    expect(interpolateFloat(0, -1, 1)).toBe(0)
  })
})

describe('getEasingValue', () => {
  it('passes progress straight through for a linear curve', () => {
    expect(getEasingValue(0.5, 'linear')).toBe(0.5)
  })

  it('bends progress for a named curve', () => {
    expect(getEasingValue(0.5, 'quadraticIn')).toBe(0.25)
  })
})
