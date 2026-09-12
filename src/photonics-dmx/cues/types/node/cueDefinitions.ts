/**
 * Cue definitions and the files they are persisted in.
 */
import type { ActionNode } from './actionNodes'
import type { AudioEventNodeUnion, BaseEventNode, NetEventNode } from './eventNodes'
import type {
  Connection,
  NetCueMode,
  NodeCueGroupMeta,
  NodeGraph,
  NodeLayoutMetadata,
} from './graph'
import type { EventDefinition, VariableDefinition } from './variables'
import { CueType } from '../cueTypes'

export interface BaseCueDefinition {
  id: string
  name: string
  description?: string
  nodes: NodeGraph<BaseEventNode, ActionNode>
  connections: Connection[]
  layout?: NodeLayoutMetadata
  variables?: VariableDefinition[]
  events?: EventDefinition[]
  effects?: EffectReference[] // NEW: registered effects
}

// Effect reference in cue
export interface EffectReference {
  effectId: string // ID of the effect
  effectFileId: string // ID of the effect file/group
  name: string // Display name (cached for UI)
}

export interface NetLightingNodeCueDefinition extends BaseCueDefinition {
  kind: 'lighting'
  cueType: CueType
  style: 'primary' | 'secondary'
  nodes: NodeGraph<NetEventNode, ActionNode>
}

/** YARG motion program: same event model as lighting, runs in parallel (random selection). */
export interface NetMotionNodeCueDefinition extends BaseCueDefinition {
  kind: 'motion'
  nodes: NodeGraph<NetEventNode, ActionNode>
}

export type NetNodeCueDefinition = NetLightingNodeCueDefinition | NetMotionNodeCueDefinition

/** Layering for audio node cues: primary = base look, secondary/strobe = overlay (addEffect). Strobe is excluded from Game Mode primary rotation. */
export type AudioCueLayerStyle = 'primary' | 'secondary' | 'strobe'

export interface AudioLightingNodeCueDefinition extends BaseCueDefinition {
  kind: 'lighting'
  cueTypeId: string
  /** Defaults to primary when omitted. Strobe uses the same runtime layering as secondary. */
  style?: AudioCueLayerStyle
  nodes: NodeGraph<AudioEventNodeUnion, ActionNode>
}

/** Audio motion program: audio event graph, runs in parallel with lighting audio cues. */
export interface AudioMotionNodeCueDefinition extends BaseCueDefinition {
  kind: 'motion'
  nodes: NodeGraph<AudioEventNodeUnion, ActionNode>
}

export type AudioNodeCueDefinition = AudioLightingNodeCueDefinition | AudioMotionNodeCueDefinition

/**
 * A cue file for either mode of the net family. The two differ only by the `mode` discriminant,
 * so they share one interface: the file's directory is what pins the mode, and the vocabulary a mode
 * may author lives in its domain descriptor rather than in the file shape.
 */
export interface NetNodeCueFile {
  /** Schema version. */
  version: 1
  /** Bundled content revision, used at startup to refresh defaults from the app bundle. */
  cueVersion?: number
  mode: NetCueMode
  group: NodeCueGroupMeta
  cues: NetNodeCueDefinition[]
  bundled?: boolean
}

export interface AudioNodeCueFile {
  /** Schema version. */
  version: 1
  /** Bundled content revision, used at startup to refresh defaults from the app bundle. */
  cueVersion?: number
  mode: 'audio'
  group: NodeCueGroupMeta
  cues: AudioNodeCueDefinition[]
  bundled?: boolean
}

/**
 * RB3 cue-mode file. Cues compile through the YARG path (RB3 cue mode reuses the YARG
 * cue-selection machinery against its own registry instance), so `cues` are YARG cue
 * definitions, only the `mode` discriminant and the target registry differ.
 */
export type NodeCueFile = NetNodeCueFile | AudioNodeCueFile
