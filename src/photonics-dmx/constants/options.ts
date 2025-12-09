import { Color, Brightness, BlendMode, LightTarget, LocationGroup, WaitCondition } from '../types';
import { AudioEventType } from '../cues/types/nodeCueTypes';

export const COLOR_OPTIONS: Color[] = [
  'red', 'blue', 'yellow', 'green', 'cyan', 'orange', 'purple',
  'chartreuse', 'teal', 'violet', 'magenta', 'vermilion', 'amber',
  'white', 'black', 'transparent'
];

export const BRIGHTNESS_OPTIONS: Brightness[] = ['low', 'medium', 'high', 'max'];

export const BLEND_MODE_OPTIONS: BlendMode[] = ['replace', 'add', 'multiply', 'overlay'];

export const LOCATION_OPTIONS: LocationGroup[] = ['front', 'back', 'strobe'];

export const LIGHT_TARGET_OPTIONS: LightTarget[] = [
  'all', 'even', 'odd', 'half-1', 'half-2',
  'outter-half-major', 'outter-half-minor',
  'inner-half-major', 'inner-half-minor',
  'third-1', 'third-2', 'third-3',
  'quarter-1', 'quarter-2', 'quarter-3', 'quarter-4',
  'linear', 'inverse-linear',
  'random-1', 'random-2', 'random-3', 'random-4'
];

export const YARG_EVENT_OPTIONS: WaitCondition[] = [
  'cue-started', 'beat', 'measure', 'half-beat', 'keyframe',
  'guitar-open', 'guitar-green', 'guitar-red', 'guitar-yellow', 'guitar-blue', 'guitar-orange',
  'bass-open', 'bass-green', 'bass-red', 'bass-yellow', 'bass-blue', 'bass-orange',
  'keys-open', 'keys-green', 'keys-red', 'keys-yellow', 'keys-blue', 'keys-orange',
  'drum-kick', 'drum-red', 'drum-yellow', 'drum-blue', 'drum-green',
  'drum-yellow-cymbal', 'drum-blue-cymbal', 'drum-green-cymbal'
];

export const WAIT_CONDITIONS_WITH_NONE_DELAY: WaitCondition[] = ['none', 'delay', ...YARG_EVENT_OPTIONS];

export const AUDIO_EVENT_OPTIONS: AudioEventType[] = [
  'audio-beat',
  'audio-range1', 'audio-range2', 'audio-range3', 'audio-range4', 'audio-range5',
  'audio-energy'
];

export const AUDIO_EVENT_OPTIONS_WITH_NONE_DELAY: (AudioEventType | 'none' | 'delay')[] = [
  'none',
  'delay',
  ...AUDIO_EVENT_OPTIONS
];
