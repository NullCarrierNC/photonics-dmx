import { describe, expect, it } from '@jest/globals'
import { ConfigStrobeType, FixtureTypes } from '../types'
import type { DmxLight, LightingConfiguration } from '../types'
import { applyMirrorToConfig } from './mirrorRig'

function makeLight(id: string, position: number): DmxLight {
  return {
    id,
    fixtureId: 'tpl-rgb',
    position,
    fixture: FixtureTypes.RGB,
    label: id,
    name: id,
    isStrobeEnabled: false,
    group: 'front',
    universe: 1,
    channels: { masterDimmer: position * 10, red: 0, green: 0, blue: 0 },
  }
}

function makeConfig(opts: {
  front?: DmxLight[]
  back?: DmxLight[]
  strobe?: DmxLight[]
}): LightingConfiguration {
  return {
    numLights: (opts.front?.length ?? 0) + (opts.back?.length ?? 0) + (opts.strobe?.length ?? 0),
    lightLayout: { id: 'two-rows', label: 'Two Rows (one in front of the other)' },
    strobeType: ConfigStrobeType.None,
    frontLights: opts.front ?? [],
    backLights: opts.back ?? [],
    strobeLights: opts.strobe ?? [],
  }
}

describe('applyMirrorToConfig', () => {
  it('returns the same reference when no mirror flags are set', () => {
    const config = makeConfig({ front: [makeLight('a', 1), makeLight('b', 2)] })
    expect(applyMirrorToConfig(config, {})).toBe(config)
    expect(applyMirrorToConfig(config, { horiz: false, vert: false })).toBe(config)
  })

  it('Horiz mirror reverses contiguous positions within each row', () => {
    const config = makeConfig({
      front: [makeLight('f1', 1), makeLight('f2', 2), makeLight('f3', 3), makeLight('f4', 4)],
      back: [makeLight('b1', 5), makeLight('b2', 6), makeLight('b3', 7), makeLight('b4', 8)],
    })
    const result = applyMirrorToConfig(config, { horiz: true })
    expect(result.frontLights.map((l) => [l.id, l.position])).toEqual([
      ['f1', 4],
      ['f2', 3],
      ['f3', 2],
      ['f4', 1],
    ])
    expect(result.backLights.map((l) => [l.id, l.position])).toEqual([
      ['b1', 8],
      ['b2', 7],
      ['b3', 6],
      ['b4', 5],
    ])
  })

  it('Horiz mirror reverses non-contiguous positions using rank-based mapping', () => {
    const config = makeConfig({
      front: [makeLight('a', 1), makeLight('b', 2), makeLight('c', 5), makeLight('d', 8)],
    })
    const result = applyMirrorToConfig(config, { horiz: true })
    expect(result.frontLights.map((l) => [l.id, l.position])).toEqual([
      ['a', 8],
      ['b', 5],
      ['c', 2],
      ['d', 1],
    ])
  })

  it('Horiz mirror reverses strobeLights too', () => {
    const config = makeConfig({
      strobe: [makeLight('s1', 1), makeLight('s2', 2), makeLight('s3', 3)],
    })
    const result = applyMirrorToConfig(config, { horiz: true })
    expect(result.strobeLights.map((l) => [l.id, l.position])).toEqual([
      ['s1', 3],
      ['s2', 2],
      ['s3', 1],
    ])
  })

  it('Vert mirror swaps frontLights and backLights; strobeLights untouched', () => {
    const front = [makeLight('f1', 1), makeLight('f2', 2)]
    const back = [makeLight('b1', 3), makeLight('b2', 4)]
    const strobe = [makeLight('s1', 5)]
    const config = makeConfig({ front, back, strobe })
    const result = applyMirrorToConfig(config, { vert: true })
    expect(result.frontLights).toBe(back)
    expect(result.backLights).toBe(front)
    expect(result.strobeLights).toBe(strobe)
  })

  it('both flags set = 180° rotation: row swap with each row internally reversed', () => {
    const config = makeConfig({
      front: [makeLight('f1', 1), makeLight('f2', 2), makeLight('f3', 3), makeLight('f4', 4)],
      back: [makeLight('b1', 5), makeLight('b2', 6), makeLight('b3', 7), makeLight('b4', 8)],
    })
    const result = applyMirrorToConfig(config, { horiz: true, vert: true })
    // New front = old back, horiz-reversed.
    expect(result.frontLights.map((l) => [l.id, l.position])).toEqual([
      ['b1', 8],
      ['b2', 7],
      ['b3', 6],
      ['b4', 5],
    ])
    // New back = old front, horiz-reversed.
    expect(result.backLights.map((l) => [l.id, l.position])).toEqual([
      ['f1', 4],
      ['f2', 3],
      ['f3', 2],
      ['f4', 1],
    ])
  })

  it('does not mutate the input config or its light objects', () => {
    const front = [makeLight('f1', 1), makeLight('f2', 2), makeLight('f3', 3)]
    const config = makeConfig({ front })
    const snapshot = JSON.parse(JSON.stringify(config))
    applyMirrorToConfig(config, { horiz: true, vert: true })
    expect(config).toEqual(snapshot)
    expect(config.frontLights).toBe(front)
    expect(config.frontLights[0]!.position).toBe(1)
  })

  it('handles empty rows gracefully', () => {
    const config = makeConfig({ front: [], back: [], strobe: [] })
    const result = applyMirrorToConfig(config, { horiz: true, vert: true })
    expect(result.frontLights).toEqual([])
    expect(result.backLights).toEqual([])
    expect(result.strobeLights).toEqual([])
  })
})
