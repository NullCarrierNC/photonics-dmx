import { describe, it, expect } from '@jest/globals'
import { FixtureTypes } from '../../../../photonics-dmx/types'
import type { DmxLight } from '../../../../photonics-dmx/types'
import { reassignNonStrobeGroups, mapDedicatedStrobeGroupRows } from './lightsLayoutState'

function makeLight(overrides: Partial<DmxLight> & Pick<DmxLight, 'id' | 'position'>): DmxLight {
  return {
    fixtureId: 'f1',
    fixture: FixtureTypes.RGB,
    name: 't',
    label: 'l',
    isStrobeEnabled: false,
    channels: { red: 1, green: 2, blue: 3, masterDimmer: 4 },
    universe: 0,
    ...overrides,
  }
}

describe('reassignNonStrobeGroups', () => {
  it('assigns front and back by row targets without mutating input objects', () => {
    const a = { ...makeLight({ id: 'a', position: 1, group: 'front' as const }) }
    const b = { ...makeLight({ id: 'b', position: 2, group: 'back' as const }) }
    const aCopy = { ...a }
    const bCopy = { ...b }
    const out = reassignNonStrobeGroups([a, b], 1, 1)
    expect(a).toEqual(aCopy)
    expect(b).toEqual(bCopy)
    expect(out[0]!.group).toBe('front')
    expect(out[0]!.position).toBe(1)
    expect(out[1]!.group).toBe('back')
    expect(out[1]!.position).toBe(2)
  })
})

describe('mapDedicatedStrobeGroupRows', () => {
  it('sets strobe properties only for group strobe', () => {
    const input: DmxLight[] = [
      { ...makeLight({ id: '1', position: 1 }) },
      { ...(makeLight({ id: '2', position: 2 }) as DmxLight & { group: string }), group: 'strobe' },
    ]
    const out = mapDedicatedStrobeGroupRows(input)
    expect(out[0]!.fixture).toBe(FixtureTypes.RGB)
    expect(out[1]!.fixture).toBe(FixtureTypes.STROBE)
    expect(out[1]!.isStrobeEnabled).toBe(true)
  })
})
