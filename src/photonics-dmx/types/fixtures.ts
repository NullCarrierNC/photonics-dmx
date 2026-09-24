/**
 * Fixture archetypes, their channel layouts, and the library of built-in light types.
 */
import type { BaseDmxFixture } from './dmxChannels'
import {
  DEFAULT_MOVING_HEAD_FIXTURE_CONFIG,
  type FixtureConfig,
  type MovingHeadDmxChannels,
} from './movingHead'

/**
 * Fixture Types Enumeration
 */
export enum FixtureTypes {
  RGB = 'rgb',
  STROBE = 'strobe',
  RGBMH = 'rgb/mh',
}

/** Legacy fixture identifiers replaced by the hasStrobeChannel model, retained for migration only. */
export const LEGACY_FIXTURE_RGB_STROBE = 'rgb/s'
export const LEGACY_FIXTURE_RGBW_STROBE = 'rgbw/s'

/**
 * Legacy fixture identifiers for the discrete RGBW archetypes, replaced by RGB(+MH) carrying a
 * `white` {@link ExtraChannel}. Retained for migration only - a white emitter is just one more
 * channel the substitution mixer drives, so a dedicated type earned nothing.
 */
export const LEGACY_FIXTURE_RGBW = 'rgbw'
export const LEGACY_FIXTURE_RGBW_MH = 'rgbw/mh'

export type RgbDmxChannels = BaseDmxFixture & {
  red: number
  green: number
  blue: number
  /**
   * Optional hardware strobe-speed DMX channel on an RGB-family fixture (RGB / RGBMH). Present
   * when the fixture template has "Strobe Channel?" enabled - i.e. the user has
   * declared that this colour fixture also exposes a strobe-speed channel. Stored alongside the
   * other channel offsets so master-dimmer shifts propagate the same way they do for r/g/b.
   *
   * This is **not** the same concept as {@link StrobeDmxChannels.strobeChannel}: that one belongs
   * to a dedicated (colour-less) hardware strobe fixture. The runtime treats the two channels
   * differently - only the RGB-family flavour participates in the latch-and-write behaviour added
   * for the "Strobe Channel?" feature.
   */
  strobeChannel?: number
}

/**
 * Colour channel types the substitution mixer can derive from the internal RGB value. Order here
 * is not the mix order (that lives in the mixer). This is just the vocabulary shared by the picker,
 * validators and the mixer. Persisted string values - never rename.
 *
 * Each entry has to be a chromaticity a cue can actually select. Cues carry nothing but an RGB
 * triple, so amber, orange, lime and UV earn their place - a yellow target drives amber and leaves
 * white dark. Colour-temperature variants of white do not: every near-neutral emitter answers the
 * same RGB the same way, so a fixture's warm or cool white is declared as plain `white` and the RGB
 * residual carries whatever it cannot.
 */
export const MIXABLE_CHANNEL_TYPES = ['white', 'amber', 'orange', 'lime', 'uv'] as const
export type MixableChannelType = (typeof MIXABLE_CHANNEL_TYPES)[number]

/**
 * How a fixture's `white` emitter is driven, chosen by the White Channel Mix Mode preference.
 * Applies only to RGB fixtures carrying a `white` extra channel. Persisted values - never rename.
 *
 *  - `w-only`      substitution everywhere: white takes min(r,g,b) and RGB is charged for it.
 *  - `strobe-rgbw` substitution for regular lighting, additive for lights a strobe drives.
 *  - `always-rgbw` additive everywhere: white drives at min(r,g,b) and RGB keeps its full values.
 */
export const WHITE_CHANNEL_MIX_MODES = ['w-only', 'strobe-rgbw', 'always-rgbw'] as const
export type WhiteChannelMixMode = (typeof WHITE_CHANNEL_MIX_MODES)[number]

/** Brightest option, and what a rig gets until the preference is set. */
export const DEFAULT_WHITE_CHANNEL_MIX_MODE: WhiteChannelMixMode = 'always-rgbw'

/**
 * Everything the "+ Add Channel" picker offers: the mixable colours, plain red/green/blue (so a
 * fixture with a second red bank is expressible), and `fixed` (a utility channel pinned to a
 * constant, e.g. a mode/macro channel).
 */
export const EXTRA_CHANNEL_TYPES = [
  'red',
  'green',
  'blue',
  ...MIXABLE_CHANNEL_TYPES,
  'fixed',
] as const
export type ExtraChannelType = (typeof EXTRA_CHANNEL_TYPES)[number]

/**
 * One user-added channel on a fixture template beyond its archetype's closed channel map. Stored as
 * an ordered array on {@link DmxFixture.extraChannels}, and duplicates of a type are valid (all
 * duplicates receive the same derived value at publish time). No per-row id: template dedup on
 * import (see rigImportExport `sameTemplateContent`) deep-equals everything except id/position, so a
 * random per-row id would break it - the UI keys rows by array index instead.
 */
export interface ExtraChannel {
  type: ExtraChannelType
  /** DMX channel number 1-512. 0 means unassigned (same "invalid until set" rule as `channels`). */
  channel: number
  /** Constant DMX output 0-255. Only meaningful when `type === 'fixed'`. */
  value?: number
  /**
   * Brightness trim for this emitter, integer percent 0-100 (see
   * {@link DmxFixture.brightnessScaling}). Absent means 100 and 100 is never stored, so dedup sees
   * an unscaled row and a scale-less one as the same. Not used on `fixed`, whose value is pinned.
   */
  scale?: number
}

export type RgbMovingHeadDmxChannels = MovingHeadDmxChannels & RgbDmxChannels

/**
 * Channel record for a **dedicated** hardware strobe fixture - a colour-less light whose only
 * outputs are master dimmer + strobe speed. Distinct from {@link RgbDmxChannels.strobeChannel},
 * which is the optional strobe-speed channel exposed by some RGB-family fixtures.
 */
export type StrobeDmxChannels = BaseDmxFixture & {
  strobeChannel: number
}

/**
 * Per-fixture DMX values written to {@link RgbDmxChannels.strobeChannel} when each strobe cue is
 * active. Values are DMX 0-255 (not channel numbers).
 *
 * Only used by RGB-family fixtures with the "Strobe Channel?" template option enabled. Dedicated
 * {@link FixtureTypes.STROBE} fixtures do not consume this - they are a separate device class.
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

/** Full emitter output, and what every colour channel gets until it is trimmed. */
export const DEFAULT_BRIGHTNESS_SCALE_PERCENT = 100

/**
 * Brightness trim for a fixture's base red/green/blue emitters, integer percents 0-100. Colour
 * extras carry their own {@link ExtraChannel.scale}. A weak red pulls every mixed colour towards
 * green/blue, so trimming the stronger emitters rebalances the fixture.
 *
 * A key is present only when scaled, the object only when some key is. The default is absence at
 * every layer, which template dedup on rig import depends on.
 */
export interface BrightnessScaling {
  red?: number
  green?: number
  blue?: number
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
  channels: RgbDmxChannels | StrobeDmxChannels | RgbMovingHeadDmxChannels
  config?: FixtureConfig
  universe?: number
  /** Floor vs ceiling/truss placement for preview and static wash, default floor when omitted before migration. */
  mount?: 'floor' | 'ceiling'
  /**
   * DMX values (0-255) written to {@link RgbDmxChannels.strobeChannel} based on the active strobe
   * cue. Only meaningful when this is an RGB-family fixture whose `channels.strobeChannel` is set.
   * Dedicated {@link FixtureTypes.STROBE} fixtures don't use this field.
   */
  strobeValues?: StrobeChannelValues
  /**
   * User-added channels beyond the archetype's closed {@link channels} map. Ordered, and duplicates of a
   * type are valid. Absent (never `[]`) when the fixture has no additions, so deep-equality and
   * template dedup treat "no extras" uniformly. On a rig snapshot ({@link DmxLight}) this field is
   * template-owned exactly like the channel layout: `type`/`value` are copied from the template and
   * `channel` is re-derived by the master-dimmer offset model on every sync.
   */
  extraChannels?: ExtraChannel[]
  /**
   * Trim for the base red/green/blue channels (see {@link BrightnessScaling}). Wire output only, and
   * template-owned on a rig snapshot ({@link DmxLight}): every sync copies it wholesale.
   */
  brightnessScaling?: BrightnessScaling
}

export interface DmxLight extends DmxFixture {
  fixtureId: string
}

/**
 * A fixture's channels by name. Each archetype declares its own closed channel map, so code that
 * handles every archetype reads it through this view.
 */
export type ChannelView = Readonly<Record<string, number | undefined>>

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
