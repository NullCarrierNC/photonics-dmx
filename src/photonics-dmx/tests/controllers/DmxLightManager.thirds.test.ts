import { describe, expect, it } from '@jest/globals'
import { DmxLightManager } from '../../controllers/DmxLightManager'
import { ConfigStrobeType, FixtureTypes } from '../../types'
import type { DmxLight, LightingConfiguration } from '../../types'

function frontRow(position: number): DmxLight {
  const id = `l${position}`
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

function managerWith(count: number): DmxLightManager {
  const frontLights = Array.from({ length: count }, (_, i) => frontRow(i + 1))
  const config: LightingConfiguration = {
    numLights: count,
    lightLayout: { id: 'two-rows', label: 'Two Rows (one in front of the other)' },
    strobeType: ConfigStrobeType.None,
    frontLights,
    backLights: [],
    strobeLights: [],
  }
  return new DmxLightManager(config)
}

function positions(manager: DmxLightManager, target: 'third-1' | 'third-2' | 'third-3'): number[] {
  return manager.getLights('front', target).map((light) => light.position)
}

describe('DmxLightManager third targets', () => {
  it.each([
    [1, [], [1], []],
    [2, [1], [2], []],
    [3, [1], [2], [3]],
    [4, [1], [2, 3], [4]],
    [5, [1, 2], [3, 4], [5]],
    [6, [1, 2], [3, 4], [5, 6]],
    [7, [1, 2], [3, 4, 5], [6, 7]],
    [8, [1, 2, 3], [4, 5, 6], [7, 8]],
    [9, [1, 2, 3], [4, 5, 6], [7, 8, 9]],
  ])('splits a %i-light group into first %j, middle %j and last %j', (count, t1, t2, t3) => {
    const manager = managerWith(count)

    expect(positions(manager, 'third-1')).toEqual(t1)
    expect(positions(manager, 'third-2')).toEqual(t2)
    expect(positions(manager, 'third-3')).toEqual(t3)
  })

  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])(
    'puts each light of a %i-light group in exactly one third, in order',
    (count) => {
      const manager = managerWith(count)
      const joined = [
        ...positions(manager, 'third-1'),
        ...positions(manager, 'third-2'),
        ...positions(manager, 'third-3'),
      ]

      expect(joined).toEqual(Array.from({ length: count }, (_, i) => i + 1))
    },
  )
})
