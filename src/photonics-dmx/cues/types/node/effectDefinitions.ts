/**
 * Reusable effect definitions and the files they are persisted in.
 */
import type { ActionNode } from './actionNodes'
import type { AudioEventNode, BaseEventNode, NetEventNode } from './eventNodes'
import type { Connection, NodeGraph, NodeLayoutMetadata } from './graph'
import type { EventDefinition, VariableDefinition } from './variables'

// Effect definition (like CueDefinition but for effects)
export interface BaseEffectDefinition {
  id: string
  name: string
  description?: string
  nodes: NodeGraph<BaseEventNode, ActionNode>
  connections: Connection[]
  layout?: NodeLayoutMetadata
  variables?: VariableDefinition[] // Effect-local variables (some may be parameters with isParameter: true)
  events?: EventDefinition[] // Effect-scoped runtime events
}

export interface YargEffectDefinition extends BaseEffectDefinition {
  mode: 'yarg'
  nodes: NodeGraph<NetEventNode, ActionNode>
}

export interface AudioEffectDefinition extends BaseEffectDefinition {
  mode: 'audio'
  nodes: NodeGraph<AudioEventNode, ActionNode>
}

export type EffectDefinition = YargEffectDefinition | AudioEffectDefinition

// Effect file structure (parallel to NodeCueFile)
export interface EffectGroupMeta {
  id: string
  name: string
  description?: string
}

export interface YargEffectFile {
  version: 1
  /** Bundled content revision, used at startup to refresh defaults from the app bundle. */
  cueVersion?: number
  mode: 'yarg'
  group: EffectGroupMeta
  effects: YargEffectDefinition[]
  bundled?: boolean
}

export interface AudioEffectFile {
  version: 1
  /** Bundled content revision, used at startup to refresh defaults from the app bundle. */
  cueVersion?: number
  mode: 'audio'
  group: EffectGroupMeta
  effects: AudioEffectDefinition[]
  bundled?: boolean
}

export type EffectFile = YargEffectFile | AudioEffectFile
