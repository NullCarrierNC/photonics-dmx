import type { Node } from 'reactflow'
import type {
  ActionNode,
  AudioEventNodeUnion,
  EventRaiserNode,
  EventListenerNode,
  LogicNode,
  NodeCueFile,
  VariableDefinition,
  NetEventNode,
  EffectRaiserNode,
  EffectEventListenerNode,
  NotesNode,
  EffectFile,
} from '../../../../../photonics-dmx/cues/types/nodeCueTypes'

export type EditorMode = 'cue' | 'effect'

export type EditorNodeData = {
  kind:
    | 'event'
    | 'action'
    | 'logic'
    | 'event-raiser'
    | 'event-listener'
    | 'effect-raiser'
    | 'effect-listener'
    | 'notes'
  payload:
    | NetEventNode
    | AudioEventNodeUnion
    | ActionNode
    | LogicNode
    | EventRaiserNode
    | EventListenerNode
    | EffectRaiserNode
    | EffectEventListenerNode
    | NotesNode
  label: string
  effectName?: string
  parameterDefinitions?: VariableDefinition[]
}

export type EditorNode = Node<EditorNodeData>

/** An open file, its type tied to the editor mode it opened in. */
export type EditorDocument =
  | { mode: 'cue'; file: NodeCueFile; path: string | null }
  | { mode: 'effect'; file: EffectFile; path: string | null }

export type CueDocument = Extract<EditorDocument, { mode: 'cue' }>
export type EffectDocument = Extract<EditorDocument, { mode: 'effect' }>

export type EventOption<T extends string> = {
  value: T
  label: string
}

export type NotesVariant = 'notes' | 'info' | 'important'
