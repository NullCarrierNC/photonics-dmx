/**
 * Cue modes, group metadata, and the node graph shell that holds events and actions.
 */
import type { ActionNode } from './actionNodes'
import type {
  BaseEventNode,
  EffectEventListenerNode,
  EffectRaiserNode,
  EventListenerNode,
  EventRaiserNode,
} from './eventNodes'
import type { LogicNode } from './logicNodes'
import type { VariableDefinition } from './variables'

export type NodeCueMode = 'yarg' | 'audio' | 'rb3'

/**
 * The modes whose cue identity arrives from outside, keyed by `CueType` over a `CueData` frame and
 * dispatched by a cue handler against a registry, as {@link INetCue} cues. Membership is the frame
 * contract rather than the transport, so the cue simulator qualifies by synthesising the same frames
 * and any future network trigger joins without widening anything. Audio is the other family, deriving
 * its cue from signal analysis over audio frames.
 */
export type NetCueMode = Exclude<NodeCueMode, 'audio'>

/** Lighting = colour/intensity cues, motion = pan/tilt / motion-pattern (parallel layer). */
export type NodeCueKind = 'lighting' | 'motion'

/** How often a random motion program is chosen from enabled groups. */
export type MotionGroupSelectionMode = 'oncePerSong' | 'perCueChange' | 'none'

// Effect mode - typed like cues
export type EffectMode = 'yarg' | 'audio'

export interface NodeCueGroupMeta {
  id: string
  name: string
  description?: string
  variables?: VariableDefinition[]
  /** When true, this group is set as the registry default (fallback) group after load. */
  isDefault?: boolean
  /** When true, this group is set as the registry stage-kit group after load. */
  isStageKit?: boolean
}

export interface NodeLayoutMetadata {
  nodePositions: Record<string, { x: number; y: number }>
  viewport?: { x: number; y: number; zoom: number }
}

export interface Connection {
  from: string
  to: string
  fromPort?: string
  toPort?: string
}

export type NotesStyle = 'notes' | 'info' | 'important'

// Notes node - for documentation only, not part of execution
export interface NotesNode {
  id: string
  type: 'notes'
  label?: string
  title?: string // Optional title for the note
  style?: NotesStyle
  note: string // Text content of the note
}

export interface NodeGraph<TEvent extends BaseEventNode, TAction extends ActionNode> {
  events: TEvent[]
  actions: TAction[]
  logic?: LogicNode[]
  eventRaisers?: EventRaiserNode[]
  eventListeners?: EventListenerNode[]
  effectRaisers?: EffectRaiserNode[]
  effectListeners?: EffectEventListenerNode[]
  notes?: NotesNode[] // Notes nodes for documentation
}
