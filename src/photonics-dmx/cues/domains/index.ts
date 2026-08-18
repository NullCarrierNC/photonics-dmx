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
import { getCueVocabulary, type CueVocabulary } from './vocabulary'
import { isNetEventTriggered, extractNetCueDataValue } from './net'
import { extractAudioCueDataValue } from './audio'

export type CueFamily = 'net' | 'audio'

export interface CueDomainDescriptor extends CueVocabulary {
  id: NodeCueMode
  family: CueFamily
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

export const CUE_DOMAIN_DESCRIPTORS: Record<NodeCueMode, CueDomainDescriptor> = {
  yarg: {
    ...netRuntime,
    ...getCueVocabulary('yarg'),
    id: 'yarg',
    effectMode: 'yarg',
    // RB3 is its own domain (a single always-active gameplay cue), not a YARG-selectable look, so
    // it is excluded from the YARG lighting picker.
    cueTypesFor: (kind) =>
      kind === 'motion' ? [] : Object.values(CueType).filter((t) => t !== CueType.RB3),
  },
  rb3: {
    ...netRuntime,
    ...getCueVocabulary('rb3'),
    id: 'rb3',
    effectMode: 'yarg',
    cueTypesFor: (kind) => (kind === 'motion' ? [] : [CueType.RB3]),
  },
  audio: {
    ...getCueVocabulary('audio'),
    id: 'audio',
    family: 'audio',
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
