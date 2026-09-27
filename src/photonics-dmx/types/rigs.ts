/**
 * A rig: one lighting layout plus the wire senders it publishes to.
 */
import type { DmxLight } from './fixtures'

export enum ConfigStrobeType {
  None = 'None',
  Dedicated = 'Dedicated',
  AllCapable = 'AllCapable',
}

export interface ConfigLightLayoutType {
  id: string
  label: string
}

/**
 * Lighting Configuration Interface
 */
export interface LightingConfiguration {
  numLights: number
  lightLayout: ConfigLightLayoutType
  strobeType: ConfigStrobeType

  frontLights: DmxLight[]
  backLights: DmxLight[]
  strobeLights: DmxLight[]
}

/**
 * Sender ids whose DMX output goes on a wire (vs the in-app IPC preview).
 * Per-rig `outputs` lists target only wire senders, IPC always receives every active rig
 * and is filtered for display by the renderer's existing preview rig-selector.
 */
export type WireSenderId = 'sacn' | 'artnet' | 'enttecpro' | 'opendmx'

export const WIRE_SENDER_IDS: readonly WireSenderId[] = [
  'sacn',
  'artnet',
  'enttecpro',
  'opendmx',
] as const

/** A sender slot id used by the publisher: wire senders plus the IPC preview channel. */
export type SenderSlotId = WireSenderId | 'ipc'

/**
 * DMX Rig Interface
 * Represents a complete DMX configuration with its own active state.
 * Universe is configured at the sender/adapter level.
 */
export interface DmxRig {
  id: string // UUID
  name: string
  active: boolean // Default true
  config: LightingConfiguration
  /**
   * Wire senders this rig publishes to.
   *  - `undefined` → publish to every currently enabled wire sender (legacy/default).
   *  - explicit array → publish only to listed wire senders that are currently enabled.
   *    Empty array means "publish nowhere on the wire" (the rig still feeds the IPC preview).
   * IPC is always populated for every active rig regardless of this field.
   */
  outputs?: WireSenderId[]
  /**
   * Mirror this rig horizontally (left/right) at runtime: positions within `frontLights`,
   * `backLights`, and `strobeLights` are independently reversed, so cues using `'linear'`
   * walk in the opposite direction and `'even'`/`'odd'` swap. Absence = false. See
   * `helpers/mirrorRig.ts` for the transform.
   */
  mirrorHoriz?: boolean
  /**
   * Mirror this rig vertically (front/back) at runtime: `frontLights` and `backLights` arrays
   * are swapped. `strobeLights` is not affected. Combine with `mirrorHoriz` for 180° rotation.
   * Absence = false.
   */
  mirrorVert?: boolean
}

/**
 * DMX Rigs Configuration Interface
 */
export interface DmxRigsConfig {
  rigs: DmxRig[]
  /** Schema version driving the on-read rig migrations, see `CURRENT_RIGS_SCHEMA_VERSION` and `migrateDmxRigsConfig`. */
  schemaVersion?: number
}

export const LOCATION_OPTIONS = ['front', 'back', 'strobe'] as const

/**
 * Defines the location a light can be placed.
 */
export type LocationGroup = (typeof LOCATION_OPTIONS)[number]

export function isLocationGroup(value: unknown): value is LocationGroup {
  return typeof value === 'string' && (LOCATION_OPTIONS as readonly string[]).includes(value)
}

export const LIGHT_TARGET_OPTIONS = [
  'all',
  'even',
  'odd',
  'half-1',
  'half-2',
  'outter-half-major',
  'outter-half-minor',
  'inner-half-major',
  'inner-half-minor',
  'third-1',
  'third-2',
  'third-3',
  'quarter-1',
  'quarter-2',
  'quarter-3',
  'quarter-4',
  'linear',
  'inverse-linear',
  'random-1',
  'random-2',
  'random-3',
  'random-4',
] as const

/**
 * Within a location group, which sets of lights we should target for an effect.
 * All: All lights in the selected group(s)
 * Even: Even numbered lights
 * Odd: Odd numbered lights
 * Half-*: Divides the number of lights in half.
 *        If there is an odd number of lights, the middle light is
 *        last in Half-1 AND first in Half-2
 * Half-1: The first half of the lights in each group
 * Half-2: The second half of the lights in each group
 * Third-*: Splits the lights of each group, in order, into three runs that hold every light
 *        once. A spare light joins the middle third and a second spare joins the first, so
 *        one light is the middle third and two lights are the first and middle thirds.
 * Linear: Sequentially applies the effect to the first, then second, then third, etc., lights
 * Inverse-Linear: The reverse of linear, starting at the last to first.
 */
export type LightTarget = (typeof LIGHT_TARGET_OPTIONS)[number]

export function isLightTarget(value: unknown): value is LightTarget {
  return typeof value === 'string' && (LIGHT_TARGET_OPTIONS as readonly string[]).includes(value)
}
