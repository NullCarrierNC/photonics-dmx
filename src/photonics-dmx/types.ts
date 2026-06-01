import type { CueType } from './cues/types/cueTypes'
import {
  cubicIn,
  cubicInOut,
  cubicOut,
  EasingFunction,
  linear,
  quadraticIn,
  quadraticInOut,
  quadraticOut,
  sinIn,
  sinInOut,
  sinOut,
} from './easing'

/**
 * Represents available colors in the lighting system
 */
export type Color =
  | 'red'
  | 'blue'
  | 'yellow'
  | 'green'
  | 'cyan'
  | 'orange'
  | 'purple'
  | 'chartreuse'
  | 'teal'
  | 'violet'
  | 'magenta'
  | 'vermilion'
  | 'amber'
  | 'white'
  | 'black'
  | 'transparent'

/**
 * Represents how a color should blend with colors on lower layers
 */
export type BlendMode = 'replace' | 'add' | 'multiply' | 'overlay' | 'mix'

/**
 * Represents brightness levels for lights
 */
export type Brightness = 'low' | 'medium' | 'high' | 'max' | 'linear'

/**
 * Interface representing RGB, Intensity, Pan/Tilt values for a light
 */
export interface RGBIO {
  red: number // 0-255
  green: number // 0-255
  blue: number // 0-255
  intensity: number // 0-255

  /** Normalised pan position: 0 = configured min, 100 = configured max (see FixtureConfig). */
  pan?: number
  /** Normalised tilt position: 0 = configured min, 100 = configured max (see FixtureConfig). */
  tilt?: number

  opacity: number // 0.0 to 1.0, controls overall contribution strength
  blendMode: BlendMode // How this color should blend with lower layers
}

/**
 * Interface representing a layer of a light with its RGBIP values
 */
export interface LightLayer {
  layer: number
  value: RGBIO
}

/**
 * Interface representing a virtual light with multiple layers
 */
export interface VirtualLight {
  id: string
  layers: LightLayer[]
}

/**
 * Interface representing the current state of a light
 */
export interface LightState {
  id: string
  value: RGBIO
}

/**
 * Interface defining a transition for light effects
 */
export interface Transition {
  transform: {
    color: RGBIO
    easing: string // e.g., "sin.in"
    duration: number // in milliseconds
  }
  layer: number
}

/**
 * Interface representing a lighting effect with transitions
 */
export interface Effect {
  id: string
  description: string
  transitions: EffectTransition[]
}

/**
 * Node system events - cue lifecycle events handled by the node cue system.
 * These are NOT song events and should NOT be used in action timing.
 */
export const NODE_SYSTEM_EVENTS = [
  'cue-started', // Fires once per cue lifecycle (first YARG call after creation)
  'cue-called', // Fires every YARG call (for repeated work)
] as const

/**
 * Represents node system lifecycle events
 */
export type NodeSystemEvent = (typeof NODE_SYSTEM_EVENTS)[number]

/**
 * Song wait conditions - events from YARG song data, handled by the sequencer.
 * Used for action timing (waitForCondition, waitUntilCondition).
 */
export const WAIT_CONDITIONS = [
  'none',
  'delay',
  'beat',
  'measure',
  'half-beat',
  'keyframe',
  'keyframe-first',
  'keyframe-next',
  'keyframe-previous',
  // Guitar events
  'guitar-open',
  'guitar-green',
  'guitar-red',
  'guitar-yellow',
  'guitar-blue',
  'guitar-orange',
  // Bass events
  'bass-open',
  'bass-green',
  'bass-red',
  'bass-yellow',
  'bass-blue',
  'bass-orange',
  // Keys events
  'keys-open',
  'keys-green',
  'keys-red',
  'keys-yellow',
  'keys-blue',
  'keys-orange',
  // Drum events
  'drum-kick',
  'drum-red',
  'drum-yellow',
  'drum-blue',
  'drum-green',
  'drum-yellow-cymbal',
  'drum-blue-cymbal',
  'drum-green-cymbal',
] as const

/**
 * Represents song-based wait conditions for action timing - derived from WAIT_CONDITIONS
 */
export type WaitCondition = (typeof WAIT_CONDITIONS)[number]

/**
 * Combined event types for YARG event nodes.
 * Includes both system events and song events.
 */
export const YARG_EVENT_TYPES = [...NODE_SYSTEM_EVENTS, ...WAIT_CONDITIONS] as const

/**
 * Represents all valid event types for YARG event nodes
 */
export type YargEventType = (typeof YARG_EVENT_TYPES)[number]

/**
 * Interface defining a transition within an effect
 */
export interface EffectTransition {
  lights: TrackedLight[]
  layer: number

  waitForCondition: WaitCondition
  waitForTime: number // in milliseconds
  waitForConditionCount?: number
  /**
   * When true, this transition is used purely for timing (no light changes).
   * TransitionEngine skips applying any light transforms for timing-only steps.
   */
  timingOnly?: boolean
  transform: {
    color: RGBIO
    easing: string
    duration: number // in milliseconds
  }
  waitUntilCondition: WaitCondition
  waitUntilTime: number // in milliseconds
  waitUntilConditionCount?: number
}

/**
 * Fixture Types Enumeration
 */
export enum FixtureTypes {
  RGB = 'rgb',
  RGBW = 'rgbw',
  STROBE = 'strobe',
  RGBMH = 'rgb/mh',
  RGBWMH = 'rgbw/mh',
}

/** Legacy fixture identifiers replaced by the hasStrobeChannel model; retained for migration only. */
export const LEGACY_FIXTURE_RGB_STROBE = 'rgb/s'
export const LEGACY_FIXTURE_RGBW_STROBE = 'rgbw/s'

/**
 * DMX-related types
 */
export type DmxChannel = {
  universe: number
  channel: number
  value: number // 0-255
}

export interface BaseDmxFixture {
  masterDimmer: number
}

export interface RgbDmxChannels extends BaseDmxFixture {
  red: number
  green: number
  blue: number
  /**
   * Optional hardware strobe-speed DMX channel on an RGB-family fixture (RGB / RGBW / RGBMH /
   * RGBWMH). Present when the fixture template has "Strobe Channel?" enabled — i.e. the user has
   * declared that this colour fixture also exposes a strobe-speed channel. Stored alongside the
   * other channel offsets so master-dimmer shifts propagate the same way they do for r/g/b.
   *
   * This is **not** the same concept as {@link StrobeDmxChannels.strobeChannel}: that one belongs
   * to a dedicated (colour-less) hardware strobe fixture. The runtime treats the two channels
   * differently — only the RGB-family flavour participates in the latch-and-write behaviour added
   * for the "Strobe Channel?" feature.
   */
  strobeChannel?: number
}

export interface RgbwDmxChannels extends RgbDmxChannels {
  white: number
}

export interface MovingHeadDmxChannels {
  pan: number
  tilt: number
}

/** Default physical pan range (degrees) when not specified on a fixture. */
export const DEFAULT_PAN_RANGE_DEG = 540
/** Default physical tilt range (degrees) when not specified on a fixture. */
export const DEFAULT_TILT_RANGE_DEG = 180

export interface FixtureConfig {
  /** Normalised home pan: 0 = panMin, 100 = panMax (see panMin/panMax). */
  panHome: number
  panMin: number
  panMax: number
  /** Physical pan travel in degrees (DMX 0–255 maps across this span). */
  panRangeDeg: number
  /**
   * When true, increasing pan DMX rotates the beam clockwise from above (stage convention).
   * When false, increasing pan DMX rotates counter-clockwise from above.
   */
  panDirectionCW: boolean
  /** Normalised home tilt: 0 = tiltMin, 100 = tiltMax. */
  tiltHome: number
  tiltMin: number
  tiltMax: number
  /** Physical tilt travel in degrees (DMX 0–255 maps across this span). */
  tiltRangeDeg: number
  /** Motor angle (deg, 0..panRangeDeg) where beam points upstage (bearing 0). Stage-direction calibration anchor. */
  panStageDeg: number
  /** Motor angle (deg, 0..tiltRangeDeg) where beam points straight up. Tilt calibration anchor. */
  tiltStageDeg: number
  /** When true, pan DMX mirrors around {@link panHome} (e.g. truss vs floor mount). */
  invertPan: boolean
  /** When true, tilt DMX mirrors around {@link tiltHome}. */
  invertTilt: boolean
}

/** Legacy persisted field; merged in {@link normalizeFixtureConfig} into invertPan/invertTilt. */
export type LegacyFixtureConfigFields = {
  invert?: boolean
}

/** Full defaults for moving-head fixture config; use {@link normalizeFixtureConfig} for persisted data. */
export const DEFAULT_MOVING_HEAD_FIXTURE_CONFIG: Readonly<FixtureConfig> = {
  panHome: 50,
  panMin: 0,
  panMax: 255,
  panRangeDeg: DEFAULT_PAN_RANGE_DEG,
  panDirectionCW: true,
  panStageDeg: DEFAULT_PAN_RANGE_DEG / 2,
  tiltHome: 50,
  tiltMin: 0,
  tiltMax: 255,
  tiltRangeDeg: DEFAULT_TILT_RANGE_DEG,
  tiltStageDeg: DEFAULT_TILT_RANGE_DEG / 2,
  invertPan: false,
  invertTilt: false,
}

function migrateLegacyHomeDmxToPercent(
  home: number | undefined,
  min: number,
  max: number,
  defaultPercent: number,
): number {
  if (home === undefined || home === null) {
    return defaultPercent
  }
  if (!Number.isFinite(home)) {
    return defaultPercent
  }
  // Legacy stored raw DMX 0–255; values above 100 are unambiguous.
  if (home > 100) {
    if (max === min) {
      return 50
    }
    const clamped = Math.max(0, Math.min(255, home))
    const pct = Math.max(0, Math.min(100, ((clamped - min) / (max - min)) * 100))
    return Math.round(pct)
  }
  return Math.round(Math.max(0, Math.min(100, home)))
}

/**
 * Merges partial or legacy saved config with defaults (e.g. missing degree-range fields).
 */
export function normalizeFixtureConfig(
  config: (Partial<FixtureConfig> & LegacyFixtureConfigFields) | null | undefined,
): FixtureConfig {
  const c = config ?? {}
  const panMin = c.panMin ?? DEFAULT_MOVING_HEAD_FIXTURE_CONFIG.panMin
  const panMax = c.panMax ?? DEFAULT_MOVING_HEAD_FIXTURE_CONFIG.panMax
  const tiltMin = c.tiltMin ?? DEFAULT_MOVING_HEAD_FIXTURE_CONFIG.tiltMin
  const tiltMax = c.tiltMax ?? DEFAULT_MOVING_HEAD_FIXTURE_CONFIG.tiltMax

  const legacyInvert = c.invert === true
  const invertPan = c.invertPan ?? legacyInvert
  const invertTilt = c.invertTilt ?? legacyInvert

  return {
    panHome: migrateLegacyHomeDmxToPercent(
      c.panHome,
      panMin,
      panMax,
      DEFAULT_MOVING_HEAD_FIXTURE_CONFIG.panHome,
    ),
    panMin,
    panMax,
    panRangeDeg:
      Number.isFinite(c.panRangeDeg) && (c.panRangeDeg as number) > 0
        ? (c.panRangeDeg as number)
        : DEFAULT_MOVING_HEAD_FIXTURE_CONFIG.panRangeDeg,
    panDirectionCW: c.panDirectionCW ?? DEFAULT_MOVING_HEAD_FIXTURE_CONFIG.panDirectionCW,
    panStageDeg:
      Number.isFinite(c.panStageDeg) && (c.panStageDeg as number) >= 0
        ? (c.panStageDeg as number)
        : (Number.isFinite(c.panRangeDeg) && (c.panRangeDeg as number) > 0
            ? (c.panRangeDeg as number)
            : DEFAULT_MOVING_HEAD_FIXTURE_CONFIG.panRangeDeg) / 2,
    tiltHome: migrateLegacyHomeDmxToPercent(
      c.tiltHome,
      tiltMin,
      tiltMax,
      DEFAULT_MOVING_HEAD_FIXTURE_CONFIG.tiltHome,
    ),
    tiltMin,
    tiltMax,
    tiltRangeDeg:
      Number.isFinite(c.tiltRangeDeg) && (c.tiltRangeDeg as number) > 0
        ? (c.tiltRangeDeg as number)
        : DEFAULT_MOVING_HEAD_FIXTURE_CONFIG.tiltRangeDeg,
    tiltStageDeg:
      Number.isFinite(c.tiltStageDeg) && (c.tiltStageDeg as number) >= 0
        ? (c.tiltStageDeg as number)
        : (Number.isFinite(c.tiltRangeDeg) && (c.tiltRangeDeg as number) > 0
            ? (c.tiltRangeDeg as number)
            : DEFAULT_MOVING_HEAD_FIXTURE_CONFIG.tiltRangeDeg) / 2,
    invertPan,
    invertTilt,
  }
}

/**
 * Merges a moving-head {@link FixtureConfig} patch into a base config with UI-consistent clamps
 * (ranges, home %, stage reference degrees).
 */
export function clampMergeMovingHeadFixtureConfig(
  base: FixtureConfig,
  patch: Partial<FixtureConfig>,
): FixtureConfig {
  const merged: FixtureConfig = { ...base, ...patch }
  const panRangeDeg = Math.max(1, Math.min(720, Math.round(merged.panRangeDeg)))
  const tiltRangeDeg = Math.max(1, Math.min(360, Math.round(merged.tiltRangeDeg)))
  const panHome = Math.max(0, Math.min(100, Math.round(merged.panHome)))
  const tiltHome = Math.max(0, Math.min(100, Math.round(merged.tiltHome)))
  const panStageDeg = Math.max(0, Math.min(panRangeDeg, Math.round(merged.panStageDeg)))
  const tiltStageDeg = Math.max(0, Math.min(tiltRangeDeg, Math.round(merged.tiltStageDeg)))
  return normalizeFixtureConfig({
    ...merged,
    panRangeDeg,
    tiltRangeDeg,
    panHome,
    tiltHome,
    panStageDeg,
    tiltStageDeg,
  })
}

export interface RgbMovingHeadDmxChannels extends MovingHeadDmxChannels, RgbDmxChannels {}

export interface RgbwMovingHeadDmxChannels extends MovingHeadDmxChannels, RgbwDmxChannels {}

/**
 * Channel record for a **dedicated** hardware strobe fixture — a colour-less light whose only
 * outputs are master dimmer + strobe speed. Distinct from {@link RgbDmxChannels.strobeChannel},
 * which is the optional strobe-speed channel exposed by some RGB-family fixtures.
 */
export interface StrobeDmxChannels extends BaseDmxFixture {
  strobeChannel: number
}

/**
 * Per-fixture DMX values written to {@link RgbDmxChannels.strobeChannel} when each strobe cue is
 * active. Values are DMX 0–255 (not channel numbers).
 *
 * Only used by RGB-family fixtures with the "Strobe Channel?" template option enabled. Dedicated
 * {@link FixtureTypes.STROBE} fixtures do not consume this — they are a separate device class.
 */
export interface StrobeChannelValues {
  slow: number
  medium: number
  fast: number
  fastest: number
}

/** Defaults used when a strobe-channel fixture has no explicit per-cue speed values yet. */
export const DEFAULT_STROBE_CHANNEL_VALUES: Readonly<StrobeChannelValues> = {
  slow: 64,
  medium: 128,
  fast: 192,
  fastest: 255,
}

export type TrackedLight = {
  id: string
  position: number
  config?: FixtureConfig
  /** When true, direction-mode and circle-center bearings reflect across SR-SL (see backLightBearingIsFlipped). */
  bearingIsFlipped?: boolean
}

export interface DmxFixture {
  // The physical light
  id: string | null
  position: number
  fixture: FixtureTypes
  label: string
  name: string
  isStrobeEnabled: boolean
  group?: string
  channels:
    | RgbDmxChannels
    | RgbwDmxChannels
    | StrobeDmxChannels
    | RgbMovingHeadDmxChannels
    | RgbwMovingHeadDmxChannels
  config?: FixtureConfig
  universe?: number
  /** Floor vs ceiling/truss placement for preview and static wash; default floor when omitted before migration. */
  mount?: 'floor' | 'ceiling'
  /**
   * DMX values (0–255) written to {@link RgbDmxChannels.strobeChannel} based on the active strobe
   * cue. Only meaningful when this is an RGB-family fixture whose `channels.strobeChannel` is set;
   * dedicated {@link FixtureTypes.STROBE} fixtures don't use this field.
   */
  strobeValues?: StrobeChannelValues
}

export interface DmxLight extends DmxFixture {
  fixtureId: string
}

/**
 * Light Types Definition
 */
export const LightTypes: DmxFixture[] = [
  {
    id: null,
    position: 0,
    fixture: FixtureTypes.RGB,
    label: 'RGB',
    name: 'RGB',
    isStrobeEnabled: false,
    group: '',
    channels: {
      masterDimmer: 0,
      red: 0,
      green: 0,
      blue: 0,
    },
    universe: 1,
  },
  {
    id: null,
    position: 0,
    fixture: FixtureTypes.RGBW,
    label: 'RGBW',
    name: 'RGBW',
    isStrobeEnabled: false,
    group: '',
    channels: {
      masterDimmer: 0,
      red: 0,
      green: 0,
      blue: 0,
      white: 0,
    },
    universe: 1,
  },
  {
    id: null,
    position: 0,
    fixture: FixtureTypes.RGBMH,
    label: 'RGB/MH',
    name: 'RGB/MH',
    isStrobeEnabled: false,
    group: '',
    channels: {
      masterDimmer: 0,
      red: 0,
      green: 0,
      blue: 0,
      pan: 0,
      tilt: 0,
    },
    config: {
      ...DEFAULT_MOVING_HEAD_FIXTURE_CONFIG,
    },
    universe: 1,
  },
  {
    id: null,
    position: 0,
    fixture: FixtureTypes.RGBWMH,
    label: 'RGBW/MH',
    name: 'RGBW/MH',
    isStrobeEnabled: false,
    group: '',
    channels: {
      masterDimmer: 0,
      red: 0,
      green: 0,
      blue: 0,
      white: 0,
      pan: 0,
      tilt: 0,
    },
    config: {
      ...DEFAULT_MOVING_HEAD_FIXTURE_CONFIG,
    },
    universe: 1,
  },
  {
    id: null,
    position: 0,
    fixture: FixtureTypes.STROBE,
    label: 'Strobe',
    name: 'Strobe',
    isStrobeEnabled: false,
    group: '',
    channels: {
      masterDimmer: 0,
      strobeChannel: 0,
    },
    universe: 1,
  },
]

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
 * Per-rig `outputs` lists target only wire senders; IPC always receives every active rig
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
  /** Bumped once the legacy `front-back` → `two-rows` rename and initial mount backfill have run. */
  schemaVersion?: number
}

/**
 * Defines the location a light can be placed.
 */
export type LocationGroup = 'front' | 'back' | 'strobe'

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
 * Third-*: Divides the lights into thirds.
 *        If the number of lights are even, will use half or quarter depending on count
 * Linear: Sequentially applies the effect to the first, then second, then third, etc., lights
 * Inverse-Linear: The reverse of linear, starting at the last to first.
 */
export type LightTarget =
  | 'all'
  | 'even'
  | 'odd'
  | 'half-1'
  | 'half-2'
  | 'outter-half-major'
  | 'outter-half-minor'
  | 'inner-half-major'
  | 'inner-half-minor'
  | 'third-1'
  | 'third-2'
  | 'third-3'
  | 'quarter-1'
  | 'quarter-2'
  | 'quarter-3'
  | 'quarter-4'
  | 'linear'
  | 'inverse-linear'
  | 'random-1'
  | 'random-2'
  | 'random-3'
  | 'random-4'

/**
 * A cue is a group of effects with their own triggers
 */
export type Cue = {
  id: string
  description: string
  effects: [Effect]
  trigger: WaitCondition
}

/**
 * Variables scoped to groups or targets
 * For example:
 * {
 *   "even": { "r": { "start": 100, "end": 150 }, "g":0, "b":255, "i":255 },
 *   "odd":  { "r": { "start": 200, "end":255 }, "g":255, "b":0, "i":255 }
 * }
 */
export interface GroupedColorVariables {
  [targetGroup: string]: ResolvableColor
}

/**
 * effectVariables can define multiple sets of group-based color variables
 * e.g. { "colorsByGroup": { "even": {...}, "odd": {...} } }
 */
export interface EffectVariables {
  [varName: string]: ResolvableValue
}

/**
 * Represents a range for random selection.
 */
export type RandomRange = { start: number; end: number }

/**
 * Defines a random target selection.
 */
export interface RandomTarget {
  type: 'random'
  count: number
}

/**
 * Possible values that can be resolved.
 */
export type ResolvableValue =
  | number
  | boolean
  | string // Can be a direct string or a variable reference like "$varName"
  | ResolvableColor
  | GroupedColorVariables
  | RandomTarget
  | { [key: string]: ResolvableValue }

/**
 * Colors can reference random values or be fixed.
 */
export interface ResolvableColor {
  r?: ResolvableValue
  g?: ResolvableValue
  b?: ResolvableValue
  i?: ResolvableValue
  w?: ResolvableValue
}

export type EffectSelector = {
  id: string
  yargDescription: string
  rb3Description: string
  groupName?: string
}

export interface CueGroup {
  id: string
  name: string
  description: string
  /** Populated when the row comes from main-process cue registry IPC. */
  cueTypes?: CueType[]
}

export type Easing = {
  name: string
  f: EasingFunction
}

// Mapping of easing names to easing functions
export const easingFunctions: { [key: string]: EasingFunction } = {
  'sin.in': sinIn,
  'sin.out': sinOut,
  'sin.inout': sinInOut,
  'linear': linear,
  'quadratic.in': quadraticIn,
  'quadratic.out': quadraticOut,
  'quadratic.inout': quadraticInOut,
  'cubic.in': cubicIn,
  'cubic.out': cubicOut,
  'cubic.inout': cubicInOut,
}

export type Senders = 'sacn' | 'ipc' | 'enttecpro' | 'artnet' | 'opendmx'

interface BaseSenderConfig {
  sender: Senders
}

export interface ArtNetSenderConfig extends BaseSenderConfig {
  sender: 'artnet'
  host?: string
  universe?: number
  net?: number
  subnet?: number
  subuni?: number
  port?: number
  base_refresh_interval?: number
  /** Max output rate in Hz (0 = no limit). */
  maxOutputRate?: number
  /**
   * Unified preference field (Hz); normalized on IPC enable into `maxOutputRate` and
   * `base_refresh_interval`.
   */
  refreshRateHz?: number
}

export interface SacnSenderConfig extends BaseSenderConfig {
  sender: 'sacn'
  universe?: number
  networkInterface?: string
  useUnicast?: boolean
  unicastDestination?: string
  /** Max output rate in Hz (0 = no limit) */
  maxOutputRate?: number
  /** sACN library min refresh when payload unchanged (Hz); aligns with `maxOutputRate` when set from prefs. */
  minRefreshRate?: number
  /** Unified preference field (Hz); normalized on IPC enable into `maxOutputRate` and `minRefreshRate`. */
  refreshRateHz?: number
}

export interface SerialSenderConfig extends BaseSenderConfig {
  sender: 'enttecpro' | 'opendmx'
  devicePath?: string
  universe?: number
  dmxSpeed?: number
}

export interface IpcSenderConfig extends BaseSenderConfig {
  sender: 'ipc'
}

export type SenderConfig =
  | ArtNetSenderConfig
  | SacnSenderConfig
  | SerialSenderConfig
  | IpcSenderConfig
