import { describe, expect, it } from '@jest/globals'
import { DmxLightManager } from '../../controllers/DmxLightManager'
import { makeAsymmetricTwoRigs, makeTwoRigs } from '../helpers/multiRigFixtures'

/**
 * Cue resolution scope: each active rig owns its own light manager, so a cue's group /
 * target / `totalLights` queries return per-rig results — not a merged view across rigs.
 * These tests query rig-local managers directly (the production wiring lifts this into
 * each `RigChain`).
 */

describe('Multi-rig per-chain resolution', () => {
  describe('Symmetric two-rig (4 + 4 front lights)', () => {
    const [rigA, rigB] = makeTwoRigs({ frontPerRig: 4 })
    const managerA = new DmxLightManager(rigA.config)
    const managerB = new DmxLightManager(rigB.config)

    it('each rig sees its own totalLights', () => {
      expect(managerA.getTotalDmxLightCount()).toBe(4)
      expect(managerB.getTotalDmxLightCount()).toBe(4)
    })

    it("'all' on 'front' returns each rig's own four lights, not a merged eight", () => {
      const a = managerA.getLights(['front'], ['all'])
      const b = managerB.getLights(['front'], ['all'])
      expect(a).toHaveLength(4)
      expect(b).toHaveLength(4)
      expect(a.map((l) => l.id)).toEqual([
        'rig-a-front-1',
        'rig-a-front-2',
        'rig-a-front-3',
        'rig-a-front-4',
      ])
      expect(b.map((l) => l.id)).toEqual([
        'rig-b-front-1',
        'rig-b-front-2',
        'rig-b-front-3',
        'rig-b-front-4',
      ])
    })

    it("'half-1' of front returns the first half per rig, not across the union", () => {
      const half1A = managerA.getLights(['front'], ['half-1'])
      const half1B = managerB.getLights(['front'], ['half-1'])
      // First half of 4 → first 2 lights of each rig (positions 1 and 2).
      expect(half1A.map((l) => l.id)).toEqual(['rig-a-front-1', 'rig-a-front-2'])
      expect(half1B.map((l) => l.id)).toEqual(['rig-b-front-1', 'rig-b-front-2'])
    })
  })

  describe('Asymmetric two-rig (4 + 8 front lights)', () => {
    const [small, large] = makeAsymmetricTwoRigs({ smallFrontCount: 4, largeFrontCount: 8 })
    const managerSmall = new DmxLightManager(small.config)
    const managerLarge = new DmxLightManager(large.config)

    it('totalLights is per-rig, not the union', () => {
      expect(managerSmall.getTotalDmxLightCount()).toBe(4)
      expect(managerLarge.getTotalDmxLightCount()).toBe(8)
    })

    it("'half-1' resolves against each rig's own light count", () => {
      // Small rig: half-1 of 4 = first 2. Large rig: half-1 of 8 = first 4. With the merged
      // model these would both walk the same 12-light list and return the first 6.
      expect(managerSmall.getLights(['front'], ['half-1']).map((l) => l.id)).toEqual([
        'rig-small-front-1',
        'rig-small-front-2',
      ])
      expect(managerLarge.getLights(['front'], ['half-1']).map((l) => l.id)).toEqual([
        'rig-large-front-1',
        'rig-large-front-2',
        'rig-large-front-3',
        'rig-large-front-4',
      ])
    })

    it("'linear' walks each rig's own positions, scaled to that rig", () => {
      // 'linear' returns lights sorted by position. A cue iterating "for light X in
      // totalLights" therefore walks 1→4 on the small rig and 1→8 on the large rig in
      // parallel under the per-rig model — instead of 1→12 across the union.
      expect(managerSmall.getLights(['front'], ['linear']).map((l) => l.position)).toEqual([
        1, 2, 3, 4,
      ])
      expect(managerLarge.getLights(['front'], ['linear']).map((l) => l.position)).toEqual([
        1, 2, 3, 4, 5, 6, 7, 8,
      ])
    })
  })
})
