/**
 * VenueFrameProcessor unit tests: per-light transforms, bloom topology, temporal clearing, and rig
 * isolation. End-to-end publisher wiring is covered by DmxPublisher.venuePostProc.test.ts.
 */
import { describe, expect, it } from '@jest/globals'
import { DmxLightManager } from '../../controllers/DmxLightManager'
import { VenueFrameProcessor } from '../../controllers/VenueFrameProcessor'
import { ConfigStrobeType, FixtureTypes, type DmxRig, type RGBIO } from '../../types'
import type {
  ProcessedLightColor,
  PublisherFrameRigView,
} from '../../controllers/PublisherFrameProcessor'

function rgbio(overrides: Partial<RGBIO> = {}): RGBIO {
  return { red: 0, green: 0, blue: 0, intensity: 0, opacity: 1, blendMode: 'replace', ...overrides }
}

/**
 * `colorFor` writes into a buffer the caller owns and reuses, so each case takes its own copy and
 * results captured across several fixtures stay independent.
 */
function colorOf(
  view: PublisherFrameRigView,
  lightId: string,
  input: RGBIO,
  strobeFlash?: boolean,
): ProcessedLightColor {
  const out: ProcessedLightColor = { r: 0, g: 0, b: 0, intensity: 0 }
  view.colorFor(lightId, input, out, strobeFlash)
  return out
}

function makeRig(
  id: string,
  lights: Array<{ id: string; group: 'front' | 'back' | 'strobe'; base: number }>,
): DmxRig {
  let position = 1
  const inGroup = (group: 'front' | 'back' | 'strobe') =>
    lights
      .filter((l) => l.group === group)
      .map((l) => ({
        id: l.id,
        fixtureId: `tpl-${l.id}`,
        position: position++,
        name: l.id,
        label: l.id,
        fixture: FixtureTypes.RGB,
        isStrobeEnabled: false,
        group,
        universe: 1,
        mount: 'floor' as const,
        channels: {
          masterDimmer: l.base,
          red: l.base + 1,
          green: l.base + 2,
          blue: l.base + 3,
        },
      }))

  return {
    id,
    name: id,
    active: true,
    config: {
      numLights: lights.filter((l) => l.group !== 'strobe').length,
      lightLayout: { id: 'two-rows', label: 'Two Rows (one in front of the other)' },
      strobeType: ConfigStrobeType.AllCapable,
      frontLights: inGroup('front') as DmxRig['config']['frontLights'],
      backLights: inGroup('back') as DmxRig['config']['backLights'],
      strobeLights: inGroup('strobe') as DmxRig['config']['strobeLights'],
    },
  }
}

const RED = rgbio({ red: 255, intensity: 255 })

describe('VenueFrameProcessor', () => {
  it('passes colour through when inactive', () => {
    const proc = new VenueFrameProcessor()
    const rig = makeRig('rig-1', [{ id: 'f1', group: 'front', base: 1 }])
    const manager = new DmxLightManager(rig.config)
    const lights = new Map([['f1', RED]])

    const view = proc.prepareRigFrame(rig.config, manager, lights, { nowMs: 0, rigId: rig.id })
    expect(view.isActive()).toBe(false)
    expect(colorOf(view, 'f1', RED)).toEqual({ r: 255, g: 0, b: 0, intensity: 255 })
  })

  it('applies a greyscale transform when active', () => {
    const proc = new VenueFrameProcessor()
    proc.setVenuePostProcessing('BlackAndWhite')
    const rig = makeRig('rig-1', [{ id: 'f1', group: 'front', base: 1 }])
    const manager = new DmxLightManager(rig.config)
    const lights = new Map([['f1', RED]])

    const view = proc.prepareRigFrame(rig.config, manager, lights, { nowMs: 0, rigId: rig.id })
    expect(view.isActive()).toBe(true)
    expect(colorOf(view, 'f1', RED)).toEqual({ r: 76, g: 76, b: 76, intensity: 255 })
  })

  it('grades a fixture but skips its trail on request', () => {
    const proc = new VenueFrameProcessor()
    proc.setVenuePostProcessing('Trails_Desaturated')
    const rig = makeRig('rig-1', [{ id: 'f1', group: 'front', base: 1 }])
    const manager = new DmxLightManager(rig.config)
    const lights = new Map([['f1', RED]])

    const lit = proc.prepareRigFrame(rig.config, manager, lights, { nowMs: 0, rigId: rig.id })
    const graded = colorOf(lit, 'f1', RED, true)
    expect(graded.r).toBeGreaterThan(graded.g)
    expect(graded.g).toBeGreaterThan(0)

    const dark = proc.prepareRigFrame(rig.config, manager, lights, { nowMs: 60, rigId: rig.id })
    expect(colorOf(dark, 'f1', rgbio(), true)).toEqual({ r: 0, g: 0, b: 0, intensity: 0 })
  })

  it('preserves observed state while clearing temporal history on disable', () => {
    const proc = new VenueFrameProcessor()
    proc.setVenuePostProcessing('Trails')
    proc.setVenuePostProcessingEnabled(false)
    expect(proc.getVenuePostProcessing()).toBe('Trails')
    expect(proc.isFrameProcessingActive()).toBe(false)
  })

  it('transforms every fixture in the bloom pre-pass before bleeding', () => {
    const proc = new VenueFrameProcessor()
    proc.setVenuePostProcessing('Bloom')
    const rig = makeRig('rig-1', [
      { id: 'f1', group: 'front', base: 1 },
      { id: 'f2', group: 'front', base: 5 },
      { id: 'f3', group: 'front', base: 9 },
    ])
    const manager = new DmxLightManager(rig.config)
    const lights = new Map<string, RGBIO>([
      ['f1', rgbio()],
      ['f2', RED],
      ['f3', rgbio()],
    ])

    const view = proc.prepareRigFrame(rig.config, manager, lights, { nowMs: 0, rigId: rig.id })
    const centre = colorOf(view, 'f2', RED)
    const left = colorOf(view, 'f1', rgbio())
    const right = colorOf(view, 'f3', rgbio())

    expect([centre.r, centre.g, centre.b]).toEqual([255, 0, 0])
    expect(left.r).toBeGreaterThan(0)
    expect(right.r).toBeGreaterThan(0)
    expect(left.r).toBe(right.r)
  })

  it('does not bleed between front and back rows', () => {
    const proc = new VenueFrameProcessor()
    proc.setVenuePostProcessing('Bloom')
    const rig = makeRig('rig-1', [
      { id: 'f1', group: 'front', base: 1 },
      { id: 'b1', group: 'back', base: 5 },
    ])
    const manager = new DmxLightManager(rig.config)
    const lights = new Map<string, RGBIO>([
      ['f1', RED],
      ['b1', rgbio()],
    ])

    const view = proc.prepareRigFrame(rig.config, manager, lights, { nowMs: 0, rigId: rig.id })
    expect(colorOf(view, 'b1', rgbio())).toEqual({ r: 0, g: 0, b: 0, intensity: 0 })
  })

  it('transforms fixtures outside bleed rows individually', () => {
    const proc = new VenueFrameProcessor()
    proc.setVenuePostProcessing('Bloom')
    const rig = makeRig('rig-1', [
      { id: 'f1', group: 'front', base: 1 },
      { id: 's1', group: 'strobe', base: 5 },
    ])
    const manager = new DmxLightManager(rig.config)
    const lights = new Map<string, RGBIO>([
      ['f1', RED],
      ['s1', RED],
    ])

    const view = proc.prepareRigFrame(rig.config, manager, lights, { nowMs: 0, rigId: rig.id })
    expect(colorOf(view, 's1', RED)).toEqual({ r: 255, g: 0, b: 0, intensity: 255 })
  })

  it('uses independent bleed caches per rig config', () => {
    const proc = new VenueFrameProcessor()
    proc.setVenuePostProcessing('Bloom')
    const rigA = makeRig('A', [
      { id: 'a1', group: 'front', base: 1 },
      { id: 'a2', group: 'front', base: 5 },
    ])
    const rigB = makeRig('B', [
      { id: 'b1', group: 'front', base: 1 },
      { id: 'b2', group: 'front', base: 5 },
    ])
    const managerA = new DmxLightManager(rigA.config)
    const managerB = new DmxLightManager(rigB.config)

    const viewA = proc.prepareRigFrame(rigA.config, managerA, new Map([['a2', RED]]), {
      nowMs: 0,
      rigId: 'A',
    })
    const viewB = proc.prepareRigFrame(rigB.config, managerB, new Map([['b2', rgbio()]]), {
      nowMs: 0,
      rigId: 'B',
    })

    expect(colorOf(viewA, 'a1', rgbio()).r).toBeGreaterThan(0)
    expect(colorOf(viewB, 'b1', rgbio())).toEqual({ r: 0, g: 0, b: 0, intensity: 0 })
  })
})
