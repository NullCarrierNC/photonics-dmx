import {
  Color,
  Brightness,
  BlendMode,
  LightTarget,
  LocationGroup,
  WaitCondition,
  WAIT_CONDITIONS,
  YargEventType,
  YARG_EVENT_TYPES,
} from '../types'
import { AudioEventType } from '../cues/types/nodeCueTypes'

export const COLOR_OPTIONS: Color[] = [
  'amber',
  'black',
  'blue',
  'chartreuse',
  'cyan',
  'green',
  'magenta',
  'orange',
  'purple',
  'red',
  'teal',
  'transparent',
  'vermilion',
  'violet',
  'white',
  'yellow',
]

export const BRIGHTNESS_OPTIONS: Brightness[] = ['low', 'medium', 'high', 'max', 'linear']

export const BLEND_MODE_OPTIONS: BlendMode[] = ['replace', 'add', 'multiply', 'overlay']

export const LOCATION_OPTIONS: LocationGroup[] = ['front', 'back', 'strobe']

export const LIGHT_TARGET_OPTIONS: LightTarget[] = [
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
]

/**
 * YARG event options for EVENT NODES - includes system events (cue-started, cue-called)
 * and song events (beat, measure, keyframe, instruments).
 * Excludes 'none' and 'delay' as those are only for action timing.
 */
export const YARG_EVENT_OPTIONS: YargEventType[] = YARG_EVENT_TYPES.filter(
  (c): c is Exclude<YargEventType, 'none' | 'delay'> => c !== 'none' && c !== 'delay',
)

/**
 * Wait conditions for ACTION TIMING - song-based conditions only (no system events).
 * Includes 'none' and 'delay' for action waitFor/waitUntil configuration.
 */
export const WAIT_CONDITIONS_WITH_NONE_DELAY: WaitCondition[] = [...WAIT_CONDITIONS]

export const AUDIO_EVENT_OPTIONS: AudioEventType[] = [
  'cue-started',
  'audio-beat',
  'audio-energy',
  'audio-trigger',
  'audio-centroid',
  'audio-flatness',
  'audio-hfc',
]

export const AUDIO_EVENT_OPTIONS_WITH_NONE_DELAY: (AudioEventType | 'none' | 'delay')[] = [
  'none',
  'delay',
  ...AUDIO_EVENT_OPTIONS,
]
