/**
 * What each mode may author: the event types and cue-data properties its files can name.
 *
 * Split out from the descriptors so the cue editor can read a mode's vocabulary without importing
 * the runtime hooks alongside it. Those reach the monotonic clock, which is a `perf_hooks` reference
 * the renderer cannot bundle, so a vocabulary lookup from the editor has to stop short of them.
 */

import { NODE_SYSTEM_EVENTS, YARG_SONG_EVENTS, RB3_SONG_EVENTS } from '../../types'
import { AUDIO_EVENT_OPTIONS } from '../../constants/options'
import {
  YARG_CUE_DATA_PROPERTY_META,
  RB3_CUE_DATA_PROPERTY_META,
  AUDIO_CUE_DATA_PROPERTY_META,
} from '../../constants/cueDataPropertyMeta'
import type { NodeCueMode } from '../types/nodeCueTypes'

export interface CueVocabulary {
  /** The event types this mode may author, driving the editor lists and the bundled-cue audit. */
  eventTypes: readonly string[]
  /**
   * The cue-data properties this mode may author, same role as `eventTypes`. Narrower than what the
   * extractor resolves: the union stays readable so an existing file outside this list keeps working.
   */
  cueDataProperties: readonly string[]
}

const propertyIds = (meta: readonly { id: string }[]): readonly string[] => meta.map((m) => m.id)

export const CUE_VOCABULARIES: Record<NodeCueMode, CueVocabulary> = {
  yarg: {
    eventTypes: [...NODE_SYSTEM_EVENTS, ...YARG_SONG_EVENTS],
    cueDataProperties: propertyIds(YARG_CUE_DATA_PROPERTY_META),
  },
  rb3: {
    // The StageKit stream yields lifecycle plus LED/fog edges only, so the tempo, keyframe and
    // instrument events are not authorable here: picking one would wait forever.
    eventTypes: [...NODE_SYSTEM_EVENTS, ...RB3_SONG_EVENTS],
    cueDataProperties: propertyIds(RB3_CUE_DATA_PROPERTY_META),
  },
  audio: {
    eventTypes: AUDIO_EVENT_OPTIONS,
    cueDataProperties: propertyIds(AUDIO_CUE_DATA_PROPERTY_META),
  },
}

export function getCueVocabulary(mode: NodeCueMode): CueVocabulary {
  return CUE_VOCABULARIES[mode]
}
