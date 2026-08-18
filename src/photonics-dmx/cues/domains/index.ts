/**
 * One descriptor per cue mode, giving the runtime a single place to resolve behaviour from a cue's
 * declared domain.
 *
 * Two families sit underneath: `net` covers the modes whose cue identity arrives from outside keyed
 * by `CueType` over a `CueData` frame (yarg, rb3, and any future network trigger), `audio` derives
 * its cue from signal analysis. Runtime hooks are family-level because both net modes share one
 * frame shape. What each mode owns individually is its authoring vocabulary and its effect tree.
 */

import type { CueData } from '../types/cueTypes'
import { CueType } from '../types/cueTypes'
import type { AudioCueData } from '../types/audioCueTypes'
import type {
  AudioCueDataProperty,
  EffectMode,
  NetCueDataProperty,
  NodeCueKind,
  NodeCueMode,
} from '../types/nodeCueTypes'
import {
  YARG_CUE_DATA_PROPERTY_META,
  RB3_CUE_DATA_PROPERTY_META,
  AUDIO_CUE_DATA_PROPERTY_META,
} from '../../constants/cueDataPropertyMeta'
import { NODE_SYSTEM_EVENTS, YARG_SONG_EVENTS, RB3_SONG_EVENTS } from '../../types'
import { AUDIO_EVENT_OPTIONS } from '../../constants/options'
import { isNetEventTriggered, extractNetCueDataValue } from './net'
import { extractAudioCueDataValue } from './audio'

export type CueFamily = 'net' | 'audio'

export interface CueDomainDescriptor {
  id: NodeCueMode
  family: CueFamily
  /** The event types this mode may author, driving the editor lists and the bundled-cue audit. */
  eventTypes: readonly string[]
  /**
   * The cue-data properties this mode may author, same role as `eventTypes`. Narrower than what the
   * extractor resolves: the union stays readable so an existing file outside this list keeps working.
   */
  cueDataProperties: readonly string[]
  /** Which effect tree this mode's cues raise effects from. RB3 folds onto the yarg tree. */
  effectMode: EffectMode
  /**
   * Whether a per-frame condition fires. Family-level: the net gate is the full ladder, and audio
   * returns false because audio cues resolve their own entry nodes in `BaseAudioNodeCue` rather than
   * through this gate.
   */
  isEventTriggered(eventType: string, cueData: CueData, triggerOnColorChange?: boolean): boolean
  /**
   * The cue types a file of this mode may declare, for the editor's picker. Motion cues are keyed by
   * a user-defined id rather than a fixed enum, so they have no enumerable set and yield none.
   * `extraTypes` carries the types a registry has learnt at runtime, which only audio uses.
   */
  cueTypesFor(kind: NodeCueKind, ctx: { extraTypes: readonly string[] }): readonly string[]
  /** Resolve one cue-data property against this family's frame shape. */
  extractCueData(
    property: string,
    cueData: CueData | AudioCueData,
    cueId: string,
  ): number | string | boolean
}

const NET_EVENT_VOCABULARY = [...NODE_SYSTEM_EVENTS, ...YARG_SONG_EVENTS] as const
const RB3_EVENT_VOCABULARY = [...NODE_SYSTEM_EVENTS, ...RB3_SONG_EVENTS] as const

/**
 * Shared by both net modes: one gate and one extractor over the one `CueData` shape. The extractor
 * resolves the whole net superset rather than the mode's authoring list, so an existing rb3 file that
 * reads a property outside its own vocabulary keeps working.
 */
const netRuntime = {
  family: 'net' as const,
  isEventTriggered: isNetEventTriggered,
  extractCueData: (property: string, cueData: CueData | AudioCueData, cueId: string) =>
    extractNetCueDataValue(property as NetCueDataProperty, cueData as CueData, cueId),
}

const propertyIds = (meta: readonly { id: string }[]): readonly string[] => meta.map((m) => m.id)

export const CUE_DOMAIN_DESCRIPTORS: Record<NodeCueMode, CueDomainDescriptor> = {
  yarg: {
    ...netRuntime,
    id: 'yarg',
    eventTypes: NET_EVENT_VOCABULARY,
    cueDataProperties: propertyIds(YARG_CUE_DATA_PROPERTY_META),
    effectMode: 'yarg',
    // RB3 is its own domain (a single always-active gameplay cue), not a YARG-selectable look, so
    // it is excluded from the YARG lighting picker.
    cueTypesFor: (kind) =>
      kind === 'motion' ? [] : Object.values(CueType).filter((t) => t !== CueType.RB3),
  },
  rb3: {
    ...netRuntime,
    id: 'rb3',
    // The StageKit stream yields lifecycle plus LED/fog edges only, so the tempo, keyframe and
    // instrument events are not authorable here: picking one would wait forever.
    eventTypes: RB3_EVENT_VOCABULARY,
    cueDataProperties: propertyIds(RB3_CUE_DATA_PROPERTY_META),
    effectMode: 'yarg',
    cueTypesFor: (kind) => (kind === 'motion' ? [] : [CueType.RB3]),
  },
  audio: {
    id: 'audio',
    family: 'audio',
    eventTypes: AUDIO_EVENT_OPTIONS,
    cueDataProperties: propertyIds(AUDIO_CUE_DATA_PROPERTY_META),
    effectMode: 'audio',
    cueTypesFor: (kind, ctx) => (kind === 'motion' ? [] : ctx.extraTypes),
    isEventTriggered: () => false,
    extractCueData: (property, cueData, cueId) =>
      extractAudioCueDataValue(property as AudioCueDataProperty, cueData as AudioCueData, cueId),
  },
}

export function getCueDomain(mode: NodeCueMode): CueDomainDescriptor {
  return CUE_DOMAIN_DESCRIPTORS[mode]
}
