import { AudioEventType } from '../cues/types/nodeCueTypes'

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
