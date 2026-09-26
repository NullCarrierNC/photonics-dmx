/**
 * What the 3D preview reads off a fixture, and the value equality its memoised parts compare on.
 *
 * The stage recomputes each beam and body prop object every DMX frame, so a reference compare never
 * matches. These compare field by field instead, so a fixture whose values are unchanged keeps its
 * rendered output. Each comparator reads every field of its shape.
 */
import type { Texture } from 'three'
import type { DmxFixture } from '../../../photonics-dmx/types'
import type { StageVector3 } from './lightsDmxPreview3DMath'

export function masterDimmer01(light: DmxFixture, dmxValues: Record<number, number>): number {
  const d = dmxValues[light.channels.masterDimmer] ?? 0
  return Math.max(0, Math.min(1, d / 255))
}

export function fixtureMount(light: DmxFixture): 'floor' | 'ceiling' {
  return light.mount === 'ceiling' ? 'ceiling' : 'floor'
}

export type FixtureBeamProps = {
  position: [number, number, number]
  direction: StageVector3
  rgb: { r: number; g: number; b: number }
  dimmer01: number
  isMovingHead: boolean
  flareTexture: Texture
}

/**
 * Value-equality for the beam props. The parent recomputes rgb/direction/position arrays every
 * DMX frame, so reference comparison never matches. Comparing by value lets a fixture whose
 * channels did not change skip re-rendering, and re-allocating its THREE objects, that frame.
 */
export const beamPropsEqual = (a: FixtureBeamProps, b: FixtureBeamProps): boolean =>
  a.isMovingHead === b.isMovingHead &&
  a.flareTexture === b.flareTexture &&
  a.dimmer01 === b.dimmer01 &&
  a.position[0] === b.position[0] &&
  a.position[1] === b.position[1] &&
  a.position[2] === b.position[2] &&
  a.direction.x === b.direction.x &&
  a.direction.y === b.direction.y &&
  a.direction.z === b.direction.z &&
  a.rgb.r === b.rgb.r &&
  a.rgb.g === b.rgb.g &&
  a.rgb.b === b.rgb.b

export type FixtureBodyProps = {
  position: [number, number, number]
  rgb: { r: number; g: number; b: number }
  movingHead: boolean
  /** Upside-down for truss / bottom-of-bar so the body reads as hanging. */
  fixtureOrientation?: 'up' | 'down'
}

/** Value-equality for the fixture body, on the same reasoning as {@link beamPropsEqual}. */
export const bodyPropsEqual = (a: FixtureBodyProps, b: FixtureBodyProps): boolean =>
  a.movingHead === b.movingHead &&
  (a.fixtureOrientation ?? 'up') === (b.fixtureOrientation ?? 'up') &&
  a.position[0] === b.position[0] &&
  a.position[1] === b.position[1] &&
  a.position[2] === b.position[2] &&
  a.rgb.r === b.rgb.r &&
  a.rgb.g === b.rgb.g &&
  a.rgb.b === b.rgb.b
