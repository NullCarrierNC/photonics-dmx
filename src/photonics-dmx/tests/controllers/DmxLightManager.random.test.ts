/**
 * random-* targets must re-roll each call (never cached), pick distinct lights (no duplicates), and
 * degrade safely on an empty group.
 */
import { describe, expect, it } from '@jest/globals'
import { DmxLightManager } from '../../controllers/DmxLightManager'
import { ConfigStrobeType, FixtureTypes } from '../../types'
import type { DmxLight, LightingConfiguration } from '../../types'

function frontRow(id: string, position: number): DmxLight {
  return {
    id,
    fixtureId: 'tpl-1',
    position,
    fixture: FixtureTypes.RGB,
    label: id,
    name: id,
    isStrobeEnabled: false,
    group: 'front',
    universe: 1,
    mount: 'floor',
    channels: { masterDimmer: 1, red: 2, green: 3, blue: 4 },
  }
}

function makeConfig(frontLights: DmxLight[]): LightingConfiguration {
  return {
    numLights: frontLights.length,
    lightLayout: { id: 'two-rows', label: 'Two Rows (one in front of the other)' },
    strobeType: ConfigStrobeType.None,
    frontLights,
    backLights: [],
    strobeLights: [],
  }
}

describe('DmxLightManager random targets', () => {
  const config = makeConfig([
    frontRow('l1', 1),
    frontRow('l2', 2),
    frontRow('l3', 3),
    frontRow('l4', 4),
    frontRow('l5', 5),
    frontRow('l6', 6),
  ])

  it('re-rolls each call rather than returning a cached first draw', () => {
    const mgr = new DmxLightManager(config)
    const draws = new Set<string>()
    for (let i = 0; i < 40; i++) {
      draws.add(
        mgr
          .getLights('front', 'random-3')
          .map((l) => l.id)
          .join(','),
      )
    }
    // With 6 lights choose 3 there are many possible draws; a frozen cache would yield exactly one.
    expect(draws.size).toBeGreaterThan(1)
  })

  it('does not cache-poison a subsequent non-random query', () => {
    const mgr = new DmxLightManager(config)
    mgr.getLights('front', 'random-2')
    const all = mgr.getLights('front', 'all').map((l) => l.id)
    expect(all).toEqual(['l1', 'l2', 'l3', 'l4', 'l5', 'l6'])
  })

  it('samples without replacement (distinct lights, no undefined entries)', () => {
    const mgr = new DmxLightManager(config)
    for (let i = 0; i < 40; i++) {
      const picked = mgr.getLights('front', 'random-4')
      expect(picked).toHaveLength(4)
      expect(picked.every((l) => l !== undefined)).toBe(true)
      expect(new Set(picked.map((l) => l.id)).size).toBe(4) // all distinct
    }
  })

  it('caps the pick at the group size instead of padding with duplicates', () => {
    const small = new DmxLightManager(makeConfig([frontRow('only', 1)]))
    const picked = small.getLights('front', 'random-3')
    expect(picked.map((l) => l.id)).toEqual(['only'])
  })

  it('returns [] for a random pick from an empty group', () => {
    const empty = new DmxLightManager(makeConfig([]))
    expect(empty.getLights('front', 'random-2')).toEqual([])
  })
})
