import { describe, expect, it } from '@jest/globals'
import { reorderWithinGroup, swapAcrossGroups } from './lightLayoutDnd'
import { FixtureTypes, type DmxLight } from '../../../../photonics-dmx/types'

function light(id: string, group: DmxLight['group'], position: number): DmxLight {
  return {
    id,
    fixtureId: 't1',
    position,
    fixture: FixtureTypes.RGB,
    label: id,
    name: id,
    isStrobeEnabled: false,
    group,
    universe: 1,
    mount: 'floor',
    channels: { masterDimmer: 1, red: 2, green: 3, blue: 4 } as unknown as DmxLight['channels'],
  }
}

/** Each light as group:id@position, in array order. */
function layout(lights: DmxLight[]): string[] {
  return lights.map((l) => `${l.group}:${l.id}@${l.position}`)
}

const RIG = [
  light('f1', 'front', 1),
  light('f2', 'front', 2),
  light('f3', 'front', 3),
  light('b1', 'back', 4),
  light('b2', 'back', 5),
  light('s1', 'strobe', 1),
]

describe('reorderWithinGroup', () => {
  it('moves a front light and renumbers every primary light, strobes last', () => {
    expect(layout(reorderWithinGroup(RIG, 'front', 'f1', 'f3'))).toEqual([
      'front:f2@1',
      'front:f3@2',
      'front:f1@3',
      'back:b1@4',
      'back:b2@5',
      'strobe:s1@1',
    ])
  })

  it('numbers the back row after the front', () => {
    expect(layout(reorderWithinGroup(RIG, 'back', 'b2', 'b1'))).toEqual([
      'front:f1@1',
      'front:f2@2',
      'front:f3@3',
      'back:b2@4',
      'back:b1@5',
      'strobe:s1@1',
    ])
  })

  it('works from position order rather than array order', () => {
    const shuffled = [RIG[2]!, RIG[3]!, RIG[0]!, RIG[5]!, RIG[1]!, RIG[4]!]
    expect(layout(reorderWithinGroup(shuffled, 'front', 'f2', 'f1'))).toEqual([
      'front:f2@1',
      'front:f1@2',
      'front:f3@3',
      'back:b1@4',
      'back:b2@5',
      'strobe:s1@1',
    ])
  })

  it('returns the rig untouched when either light is not in that row', () => {
    expect(reorderWithinGroup(RIG, 'front', 'f1', 'b1')).toBe(RIG)
  })
})

describe('swapAcrossGroups', () => {
  it('trades group and position between a front and a back light', () => {
    expect(layout(swapAcrossGroups(RIG, 'f2', 'b1'))).toEqual([
      'front:f1@1',
      'back:f2@4',
      'front:f3@3',
      'front:b1@2',
      'back:b2@5',
      'strobe:s1@1',
    ])
  })

  it.each([
    ['two lights in the same row', 'f1', 'f2'],
    ['a strobe light', 'f1', 's1'],
    ['an unknown id', 'f1', 'missing'],
  ])('returns the rig untouched for %s', (_case, a, b) => {
    expect(swapAcrossGroups(RIG, a, b)).toBe(RIG)
  })
})
