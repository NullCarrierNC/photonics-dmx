import {
  ConfigStrobeType,
  DmxLight,
  DmxRig,
  FixtureTypes,
  LightingConfiguration,
} from '../../types'
import { createMockDmxLight } from './testFixtures'

/**
 * Helpers for building multi-rig test fixtures so tests covering symmetric and asymmetric
 * two-tower setups (the cases the per-rig cue pipeline has to scale across) don't have to
 * duplicate the per-rig boilerplate.
 */

/**
 * Build a rig config from a flat per-group light count. Lights are auto-named with stable
 * ids so multiple rigs in the same test don't collide: `{rigId}-{group}-{position}`.
 */
export interface RigSpec {
  id: string
  name?: string
  active?: boolean
  frontCount?: number
  backCount?: number
  strobeCount?: number
  fixtureType?: FixtureTypes
  /** Per-rig `outputs` whitelist (see DmxRig.outputs). Defaults to undefined (all wire senders). */
  outputs?: DmxRig['outputs']
}

const buildLights = (
  rigId: string,
  group: 'front' | 'back' | 'strobe',
  count: number,
  startPosition: number,
  fixtureType: FixtureTypes,
): DmxLight[] => {
  return Array.from({ length: count }, (_, idx) =>
    createMockDmxLight({
      id: `${rigId}-${group}-${startPosition + idx}`,
      group,
      position: startPosition + idx,
      fixture: fixtureType,
      isStrobeEnabled: group === 'strobe',
    }),
  )
}

export function makeRig(spec: RigSpec): DmxRig {
  const frontCount = spec.frontCount ?? 0
  const backCount = spec.backCount ?? 0
  const strobeCount = spec.strobeCount ?? 0
  const fixtureType = spec.fixtureType ?? FixtureTypes.RGB
  const frontLights = buildLights(spec.id, 'front', frontCount, 1, fixtureType)
  const backLights = buildLights(spec.id, 'back', backCount, 1, fixtureType)
  const strobeLights = buildLights(spec.id, 'strobe', strobeCount, 1, fixtureType)
  const config: LightingConfiguration = {
    numLights: frontCount + backCount + strobeCount,
    lightLayout: { id: 'two-rows', label: 'Two Rows (one in front of the other)' },
    strobeType: ConfigStrobeType.None,
    frontLights,
    backLights,
    strobeLights,
  }
  return {
    id: spec.id,
    name: spec.name ?? spec.id,
    active: spec.active ?? true,
    config,
    outputs: spec.outputs,
  }
}

/** Two symmetric rigs with the same front-light count (the symmetric two-tower test scenario). */
export function makeTwoRigs(
  options: {
    frontPerRig?: number
    backPerRig?: number
    strobePerRig?: number
    fixtureType?: FixtureTypes
  } = {},
): [DmxRig, DmxRig] {
  const frontPerRig = options.frontPerRig ?? 4
  const backPerRig = options.backPerRig ?? 0
  const strobePerRig = options.strobePerRig ?? 0
  const fixtureType = options.fixtureType ?? FixtureTypes.RGB
  return [
    makeRig({
      id: 'rig-a',
      frontCount: frontPerRig,
      backCount: backPerRig,
      strobeCount: strobePerRig,
      fixtureType,
    }),
    makeRig({
      id: 'rig-b',
      frontCount: frontPerRig,
      backCount: backPerRig,
      strobeCount: strobePerRig,
      fixtureType,
    }),
  ]
}

/**
 * Asymmetric two-tower scenario from the limitation doc: a 4-light tower and an 8-light tower.
 * Useful for cases where group-relative target resolution must scale per-rig rather than across
 * the union.
 */
export function makeAsymmetricTwoRigs(
  options: {
    smallFrontCount?: number
    largeFrontCount?: number
    fixtureType?: FixtureTypes
  } = {},
): [DmxRig, DmxRig] {
  const smallFrontCount = options.smallFrontCount ?? 4
  const largeFrontCount = options.largeFrontCount ?? 8
  const fixtureType = options.fixtureType ?? FixtureTypes.RGB
  return [
    makeRig({ id: 'rig-small', frontCount: smallFrontCount, fixtureType }),
    makeRig({ id: 'rig-large', frontCount: largeFrontCount, fixtureType }),
  ]
}
