import { cubicIn, cubicInOut, cubicOut, EasingFunction, linear, quadraticIn, quadraticInOut, quadraticOut, sinIn, sinInOut, sinOut } from "./easing";

/**
 * Represents available colors in the lighting system
 */
export type Color =  'red' | 'blue' | 'yellow' | 'green' | 'orange' | 'purple' |
'chartreuse' | 'teal' | 'violet' | 'magenta' | 'vermilion' | 'amber' |
'white' | 'black' | 'transparent';

/**
 * Represents how a color should blend with colors on lower layers
 */
export type BlendMode = 'replace' | 'add' | 'multiply' | 'overlay';

/**
 * Represents brightness levels for lights
 */
export type Brightness = 'low' | 'medium' | 'high' | 'max';

/**
 * Interface representing RGB, Intensity, Pan/Tilt values for a light
 */
export interface RGBIO {
  red: number; // 0-255
  green: number; // 0-255
  blue: number; // 0-255
  intensity: number; // 0-255

  pan?: number;
  tilt?: number;
  
  opacity: number; // 0.0 to 1.0, controls overall contribution strength
  blendMode: BlendMode; // How this color should blend with lower layers
}

/**
 * Interface representing a layer of a light with its RGBIP values
 */
export interface LightLayer {
  layer: number;
  value: RGBIO;
}

/**
 * Interface representing a virtual light with multiple layers
 */
export interface VirtualLight {
  id: string;
  layers: LightLayer[];
}

/**
 * Interface representing the current state of a light
 */
export interface LightState {
  id: string;
  value: RGBIO;
}

/**
 * Interface defining a transition for light effects
 */
export interface Transition {
  transform: {
    color: RGBIO;
    easing: string; // e.g., "sin.in"
    duration: number; // in milliseconds
  };
  layer: number;
}

/**
 * Interface representing a lighting effect with transitions
 */
export interface Effect {
  id: string;
  description: string;
  transitions: EffectTransition[];
}

/**
 * Represents conditions that can trigger waiting in effects
 */
export type WaitCondition =
  | 'none'
  | 'delay'
  | 'beat'
  | 'measure'
  | 'half-beat'
  | 'keyframe'
  | 'green'
  | 'red'
  | 'yellow'
  | 'blue'
  | 'orange';

/**
 * Interface defining a transition within an effect
 */
export interface EffectTransition {
  lights: TrackedLight[];
  layer: number;

  waitForCondition: WaitCondition;
  waitForTime: number; // in milliseconds
  transform: {
    color: RGBIO;
    easing: string;
    duration: number; // in milliseconds
  };
  waitUntilCondition: WaitCondition;
  waitUntilTime: number; // in milliseconds
}

/**
 * Fixture Types Enumeration
 */
export enum FixtureTypes {
  RGB = 'rgb',
  RGBW = 'rgbw',
  RGBS = 'rgb/s',
  RGBWS = 'rgbw/s',
  STROBE = 'strobe',
  RGBMH = 'rgb/mh',
  RGBWMH = 'rgbw/mh',
}

/**
 * DMX-related types
 */
export type DmxChannel = {
  universe: number;
  channel: number;
  value: number; // 0-255
};

export interface BaseDmxFixture {
  masterDimmer: number;
}

export interface RgbDmxChannels extends BaseDmxFixture {
  red: number;
  green: number;
  blue: number;
}

export interface RgbStrobeDmxChannels extends RgbDmxChannels {
  strobeSpeed: number;
}

export interface RgbwDmxChannels extends RgbDmxChannels {
  white: number;
}

export interface RgbwStrobeDmxCannels extends RgbwDmxChannels {
  strobeSpeed: number;
}

export interface MovingHeadDmxChannels {
  pan: number;
  tilt: number;
}

export interface FixtureConfig {
  panHome: number;
  panMin: number;
  panMax: number;
  tiltHome: number;
  tiltMin: number;
  tiltMax: number;
  invert: boolean;
}

export interface RgbMovingHeadDmxChannels extends MovingHeadDmxChannels, RgbDmxChannels { }

export interface RgbwMovingHeadDmxChannels extends MovingHeadDmxChannels, RgbwDmxChannels { }

export interface StrobeDmxChannels extends BaseDmxFixture {
  strobeSpeed: number;
}

export type TrackedLight = {
  id: string;
  position: number,
  config?: FixtureConfig;
};

export interface DmxFixture { // The physical light
  id: string | null;
  position: number;
  fixture: FixtureTypes;
  label: string;
  name: string;
  isStrobeEnabled: boolean;
  group?: string;
  channels: RgbDmxChannels | RgbStrobeDmxChannels | RgbwDmxChannels | RgbwStrobeDmxCannels | StrobeDmxChannels | RgbMovingHeadDmxChannels | RgbwMovingHeadDmxChannels;
  config?: FixtureConfig;
  universe?: number;
}

export interface DmxLight extends DmxFixture {
  fixtureId: string;
}

/**
 * Light Types Definition
 */
export const LightTypes: DmxFixture[] = [
  {
    id: null,
    position: 0,
    fixture: FixtureTypes.RGB,
    label: "RGB",
    name: "RGB",
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
    label: "RGBW",
    name: "RGBW",
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
    label: "RGB/MH",
    name: "RGB/MH",
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
      panHome: 0,
      panMin: 0,
      panMax: 255,
      tiltHome: 0,
      tiltMin: 0,
      tiltMax: 255,
      invert: false,
    },
    universe: 1,
  },
  {
    id: null,
    position: 0,
    fixture: FixtureTypes.RGBWMH,
    label: "RGBW/MH",
    name: "RGBW/MH",
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
      panHome: 0,
      panMin: 0,
      panMax: 255,
      tiltHome: 0,
      tiltMin: 0,
      tiltMax: 255,
      invert: false,
    },
    universe: 1,
  },
  {
    id: null,
    position: 0,
    fixture: FixtureTypes.STROBE,
    label: "Strobe",
    name: "Strobe",
    isStrobeEnabled: false,
    group: '',
    channels: {
      masterDimmer: 0,
      strobeSpeed: 0,
    },
    universe: 1,
  },
];

export enum ConfigStrobeType {
  None = 'None',
  Dedicated = 'Dedicated',
  AllCapable = 'AllCapable',
}

export interface ConfigLightLayoutType {
  id: string;
  label: string;
}

/**
 * Lighting Configuration Interface
 */
export interface LightingConfiguration {
  numLights: number;
  lightLayout: ConfigLightLayoutType;
  strobeType: ConfigStrobeType;

  frontLights: DmxLight[];
  backLights: DmxLight[];
  strobeLights: DmxLight[];
}

/**
 * Defines the location a light can be placed.
 */
export type LocationGroup = 'front' | 'back' | 'strobe';

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
  | 'random-4';

/**
 * A cue is a group of effects with their own triggers
 */
export type Cue = {
  id: string;
  description: string;
  effects: [Effect];
  trigger: WaitCondition;
};

/**
 * Variables scoped to groups or targets
 * For example:
 * {
 *   "even": { "r": { "start": 100, "end": 150 }, "g":0, "b":255, "i":255 },
 *   "odd":  { "r": { "start": 200, "end":255 }, "g":255, "b":0, "i":255 }
 * }
 */
export interface GroupedColorVariables {
  [targetGroup: string]: ResolvableColor;
}

/**
 * effectVariables can define multiple sets of group-based color variables
 * e.g. { "colorsByGroup": { "even": {...}, "odd": {...} } }
 */
export interface EffectVariables {
  [varName: string]: ResolvableValue;
}

/**
 * Represents a range for random selection.
 */
export type RandomRange = { start: number; end: number };

/**
 * Defines a random target selection.
 */
export interface RandomTarget {
  type: 'random';
  count: number;
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
  | { [key: string]: ResolvableValue };

/**
 * Colors can reference random values or be fixed.
 */
export interface ResolvableColor {
  r?: ResolvableValue;
  g?: ResolvableValue;
  b?: ResolvableValue;
  i?: ResolvableValue;
  w?: ResolvableValue;
}

export type EffectSelector = {
  id: string;
  yargDescription: string;
  rb3Description: string;
  groupName?: string;
};

export interface CueGroup {
  id: string;
  name: string;
  description: string;
}

export type Easing = {
  name: string;
  f: EasingFunction;
};

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
};

export type Senders = 'sacn' | 'ipc' | 'enttecpro' | 'artnet';
export interface SenderConfig {
  sender: Senders
  port?: string
  host?: string
  universe?: number
  net?: number
  subnet?: number
  subuni?: number
  artNetPort?: number
}

