/**
 * The core domain model, re-exported from `types/` so every consumer keeps one import path.
 *
 * The modules behind this barrel are layered: `lighting`, `songEvents`, `dmxChannels` and
 * `senders` stand alone, `movingHead` builds on the channel primitives, `fixtures` builds on
 * both, and `effects`, `rigs` and `cues` sit on top.
 */

export {
  BLEND_MODE_OPTIONS,
  BRIGHTNESS_OPTIONS,
  COLOR_OPTIONS,
  isBlendMode,
  isBrightness,
  isColor,
} from './types/lighting'
export type {
  BlendMode,
  Brightness,
  Color,
  LightLayer,
  LightState,
  RGBIO,
  Transition,
  VirtualLight,
} from './types/lighting'

export {
  isWaitCondition,
  NET_EVENT_TYPES,
  NODE_SYSTEM_EVENTS,
  RB3_SONG_EVENTS,
  WAIT_CONDITIONS,
  YARG_SONG_EVENTS,
} from './types/songEvents'
export type { NetEventType, NodeSystemEvent, WaitCondition } from './types/songEvents'

export type { Effect, EffectTransition } from './types/effects'

export { clampDerivedDmxChannel, DMX_CHANNEL_MAX, isValidDmxChannel } from './types/dmxChannels'
export type { BaseDmxFixture, DmxChannel } from './types/dmxChannels'

export {
  clampMergeMovingHeadFixtureConfig,
  DEFAULT_MOVING_HEAD_FIXTURE_CONFIG,
  DEFAULT_PAN_RANGE_DEG,
  DEFAULT_TILT_RANGE_DEG,
  FIXTURE_CONFIG_FIELDS,
  fixtureConfigFieldBounds,
  isFixtureConfigFlagField,
  normalizeFixtureConfig,
} from './types/movingHead'
export type {
  FixtureConfig,
  FixtureConfigFlagField,
  FixtureConfigNumberField,
  LegacyFixtureConfigFields,
} from './types/movingHead'

export {
  DEFAULT_BRIGHTNESS_SCALE_PERCENT,
  DEFAULT_STROBE_CHANNEL_VALUES,
  DEFAULT_WHITE_CHANNEL_MIX_MODE,
  EXTRA_CHANNEL_TYPES,
  FixtureTypes,
  isFixtureType,
  LEGACY_FIXTURE_RGB_STROBE,
  LEGACY_FIXTURE_RGBW,
  LEGACY_FIXTURE_RGBW_MH,
  LEGACY_FIXTURE_RGBW_STROBE,
  LightTypes,
  MIXABLE_CHANNEL_TYPES,
  WHITE_CHANNEL_MIX_MODES,
} from './types/fixtures'
export type {
  BrightnessScaling,
  ChannelView,
  DmxFixture,
  DmxLight,
  ExtraChannel,
  FixtureChannelLayout,
  ExtraChannelType,
  MixableChannelType,
  RgbDmxChannels,
  RgbFixture,
  RgbLight,
  RgbMovingHeadDmxChannels,
  RgbMovingHeadFixture,
  RgbMovingHeadLight,
  StrobeChannelValues,
  StrobeFixture,
  StrobeLight,
  TrackedLight,
  WhiteChannelMixMode,
} from './types/fixtures'

export {
  ConfigStrobeType,
  isLightTarget,
  isLocationGroup,
  LIGHT_TARGET_OPTIONS,
  LOCATION_OPTIONS,
  WIRE_SENDER_IDS,
} from './types/rigs'
export type {
  ConfigLightLayoutType,
  DmxRig,
  DmxRigsConfig,
  LightingConfiguration,
  LightTarget,
  LocationGroup,
  SenderSlotId,
  WireSenderId,
} from './types/rigs'

export { easingFunctions } from './types/cues'
export type {
  Cue,
  CueGroup,
  Easing,
  EffectSelector,
  EffectVariables,
  GroupedColorVariables,
  RandomRange,
  RandomTarget,
  ResolvableColor,
  ResolvableValue,
} from './types/cues'

export type {
  ArtNetSenderConfig,
  IpcSenderConfig,
  SacnSenderConfig,
  SenderConfig,
  Senders,
  SerialSenderConfig,
} from './types/senders'
