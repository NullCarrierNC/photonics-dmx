import { WaitCondition, WAIT_CONDITIONS } from '../types'
import { AudioEventType } from '../cues/types/nodeCueTypes'

/**
 * Wait conditions for ACTION TIMING - song-based conditions only (no system events).
 * Includes 'none' and 'delay' for action waitFor/waitUntil configuration.
 */
export const WAIT_CONDITIONS_WITH_NONE_DELAY: WaitCondition[] = [...WAIT_CONDITIONS]

export const AUDIO_EVENT_OPTIONS: AudioEventType[] = [
  'cue-started',
  'cue-called',
  'beat',
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
