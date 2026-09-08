/**
 * What the 3D preview reads off a fixture, and which prop changes make a memoised part re-render.
 */
import { describe, expect, it } from '@jest/globals'
import type { Texture } from 'three'
import { FixtureTypes, type DmxFixture } from '../../../photonics-dmx/types'
import {
  beamPropsEqual,
  bodyPropsEqual,
  fixtureMount,
  isMovingHead,
  masterDimmer01,
  type FixtureBeamProps,
  type FixtureBodyProps,
} from './lightsDmxPreview3DProps'

function fixture(overrides: Partial<DmxFixture> = {}): DmxFixture {
  return {
    id: 'f1',
    position: 1,
    fixture: FixtureTypes.RGB,
    label: 'PAR',
    name: 'PAR',
    isStrobeEnabled: false,
    group: '',
    universe: 1,
    channels: { masterDimmer: 10, red: 11, green: 12, blue: 13 } as DmxFixture['channels'],
    ...overrides,
  }
}

const texture = {} as Texture

function beamProps(overrides: Partial<FixtureBeamProps> = {}): FixtureBeamProps {
  return {
    position: [1, 2, 3],
    direction: { x: 0, y: -1, z: 0 },
    rgb: { r: 10, g: 20, b: 30 },
    dimmer01: 0.5,
    isMovingHead: false,
    flareTexture: texture,
    ...overrides,
  }
}

function bodyProps(overrides: Partial<FixtureBodyProps> = {}): FixtureBodyProps {
  return {
    position: [1, 2, 3],
    rgb: { r: 10, g: 20, b: 30 },
    movingHead: false,
    fixtureOrientation: 'up',
    ...overrides,
  }
}

describe('isMovingHead', () => {
  it('recognises a moving head', () => {
    expect(isMovingHead(fixture({ fixture: FixtureTypes.RGBMH }))).toBe(true)
  })

  it('treats every other archetype as static', () => {
    for (const type of [FixtureTypes.RGB, FixtureTypes.STROBE]) {
      expect(isMovingHead(fixture({ fixture: type }))).toBe(false)
    }
  })
})

describe('masterDimmer01', () => {
  it('scales the master dimmer channel into 0 to 1', () => {
    expect(masterDimmer01(fixture(), { 10: 255 })).toBe(1)
    expect(masterDimmer01(fixture(), { 10: 51 })).toBeCloseTo(0.2)
  })

  it('reads an unwritten channel as dark', () => {
    expect(masterDimmer01(fixture(), {})).toBe(0)
  })

  it('holds a value past the top of the range', () => {
    expect(masterDimmer01(fixture(), { 10: 400 })).toBe(1)
  })

  it('holds a negative value at dark', () => {
    expect(masterDimmer01(fixture(), { 10: -20 })).toBe(0)
  })

  it('reads its own master dimmer channel, not another light on the same value', () => {
    expect(
      masterDimmer01(fixture({ channels: { masterDimmer: 20 } as DmxFixture['channels'] }), {
        10: 255,
        20: 0,
      }),
    ).toBe(0)
  })
})

describe('fixtureMount', () => {
  it('reports a ceiling mount', () => {
    expect(fixtureMount(fixture({ mount: 'ceiling' }))).toBe('ceiling')
  })

  it('falls back to the floor when the mount is unset', () => {
    expect(fixtureMount(fixture())).toBe('floor')
  })
})

/** Every field each comparator reads. */
const BEAM_FIELDS = ['position', 'direction', 'rgb', 'dimmer01', 'isMovingHead', 'flareTexture']
const BODY_FIELDS = ['position', 'rgb', 'movingHead', 'fixtureOrientation']

describe('beamPropsEqual', () => {
  it('carries every field the comparator reads', () => {
    expect(Object.keys(beamProps()).sort()).toEqual([...BEAM_FIELDS].sort())
  })

  it('matches two props objects built the same way', () => {
    expect(beamPropsEqual(beamProps(), beamProps())).toBe(true)
  })

  const differences: Array<[string, Partial<FixtureBeamProps>]> = [
    ['isMovingHead', { isMovingHead: true }],
    ['flareTexture', { flareTexture: {} as Texture }],
    ['dimmer01', { dimmer01: 0.51 }],
    ['position x', { position: [9, 2, 3] }],
    ['position y', { position: [1, 9, 3] }],
    ['position z', { position: [1, 2, 9] }],
    ['direction x', { direction: { x: 9, y: -1, z: 0 } }],
    ['direction y', { direction: { x: 0, y: 9, z: 0 } }],
    ['direction z', { direction: { x: 0, y: -1, z: 9 } }],
    ['red', { rgb: { r: 99, g: 20, b: 30 } }],
    ['green', { rgb: { r: 10, g: 99, b: 30 } }],
    ['blue', { rgb: { r: 10, g: 20, b: 99 } }],
  ]

  for (const [what, change] of differences) {
    it(`separates props whose ${what} moved`, () => {
      expect(beamPropsEqual(beamProps(), beamProps(change))).toBe(false)
    })
  }
})

describe('bodyPropsEqual', () => {
  it('carries every field the comparator reads', () => {
    expect(Object.keys(bodyProps()).sort()).toEqual([...BODY_FIELDS].sort())
  })

  it('matches two props objects built the same way', () => {
    expect(bodyPropsEqual(bodyProps(), bodyProps())).toBe(true)
  })

  const differences: Array<[string, Partial<FixtureBodyProps>]> = [
    ['movingHead', { movingHead: true }],
    ['orientation', { fixtureOrientation: 'down' }],
    ['position x', { position: [9, 2, 3] }],
    ['position y', { position: [1, 9, 3] }],
    ['position z', { position: [1, 2, 9] }],
    ['red', { rgb: { r: 99, g: 20, b: 30 } }],
    ['green', { rgb: { r: 10, g: 99, b: 30 } }],
    ['blue', { rgb: { r: 10, g: 20, b: 99 } }],
  ]

  for (const [what, change] of differences) {
    it(`separates props whose ${what} moved`, () => {
      expect(bodyPropsEqual(bodyProps(), bodyProps(change))).toBe(false)
    })
  }

  it('reads an unset orientation as upright', () => {
    const unset = bodyProps()
    delete unset.fixtureOrientation

    expect(bodyPropsEqual(unset, bodyProps({ fixtureOrientation: 'up' }))).toBe(true)
    expect(bodyPropsEqual(unset, bodyProps({ fixtureOrientation: 'down' }))).toBe(false)
  })
})
