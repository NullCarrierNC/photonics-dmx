import type { Edge, ReactFlowInstance } from 'reactflow'
import type {
  ActionNode,
  AudioEventNode,
  AudioNodeCueDefinition,
  AudioEffectDefinition,
  Connection,
  EventRaiserNode,
  EventListenerNode,
  EffectRaiserNode,
  EffectEventListenerNode,
  EffectFile,
  NodeCueFile,
  NodeCueMode,
  LogicNode,
  YargEventNode,
  YargNodeCueDefinition,
  YargEffectDefinition,
  NotesNode,
} from '../../../../../photonics-dmx/cues/types/nodeCueTypes'
import type { EditorDocument, EditorNode } from './types'
import { getAudioEventLabel, getYargEventLabel } from './cueUtils'
import { isValidEditorEdge } from './edgeValidation'
import type { EditorMode } from './edgeValidation'

/** Edge data for editor edges (port info for logic/conditional nodes). */
export type EditorEdgeData = { fromPort?: string | null; toPort?: string | null }

type CueDefinition = YargNodeCueDefinition | AudioNodeCueDefinition
type EffectDefinition = YargEffectDefinition | AudioEffectDefinition

const DEFAULT_POS = {
  event: { x: 100, y: 100 },
  action: { x: 400, y: 100 },
  logic: { x: 260, y: 120 },
  eventRaiser: { x: 260, y: 200 },
  eventListener: { x: 260, y: 280 },
  effectRaiser: { x: 260, y: 360 },
  effectListener: { x: 100, y: 50 },
  notes: { x: 320, y: 240 },
} as const

type NodePositions = Record<string, { x: number; y: number }>

function buildEventNodes(
  events: (YargEventNode | AudioEventNode)[],
  nodePositions: NodePositions,
  mode: NodeCueMode,
): EditorNode[] {
  return events.map((event) => ({
    id: event.id,
    type: 'event' as const,
    position: nodePositions[event.id] ?? DEFAULT_POS.event,
    data: {
      kind: 'event' as const,
      label:
        mode === 'yarg'
          ? getYargEventLabel((event as YargEventNode).eventType)
          : getAudioEventLabel((event as AudioEventNode).eventType),
      payload: event,
    },
  }))
}

function buildActionNodes(actions: ActionNode[], nodePositions: NodePositions): EditorNode[] {
  return actions.map((action) => ({
    id: action.id,
    type: 'action' as const,
    position: nodePositions[action.id] ?? DEFAULT_POS.action,
    data: {
      kind: 'action' as const,
      label: `${action.effectType}`,
      payload: action,
    },
  }))
}

function buildLogicNodes(logic: LogicNode[], nodePositions: NodePositions): EditorNode[] {
  return logic.map((node) => ({
    id: node.id,
    type: 'logic' as const,
    position: nodePositions[node.id] ?? DEFAULT_POS.logic,
    data: {
      kind: 'logic' as const,
      label: node.logicType,
      payload: node,
    },
  }))
}

function buildEventRaiserNodes(
  raisers: EventRaiserNode[],
  nodePositions: NodePositions,
): EditorNode[] {
  return raisers.map((raiser) => ({
    id: raiser.id,
    type: 'event-raiser' as const,
    position: nodePositions[raiser.id] ?? DEFAULT_POS.eventRaiser,
    data: {
      kind: 'event-raiser' as const,
      label: `Raise: ${raiser.eventName}`,
      payload: raiser,
    },
  }))
}

function buildEventListenerNodes(
  listeners: EventListenerNode[],
  nodePositions: NodePositions,
): EditorNode[] {
  return listeners.map((listener) => ({
    id: listener.id,
    type: 'event-listener' as const,
    position: nodePositions[listener.id] ?? DEFAULT_POS.eventListener,
    data: {
      kind: 'event-listener' as const,
      label: `Listen: ${listener.eventName}`,
      payload: listener,
    },
  }))
}

function buildEffectRaiserNodes(
  raisers: EffectRaiserNode[],
  nodePositions: NodePositions,
  effectRefs: CueDefinition['effects'],
  effectDefinitions: Map<string, EffectDefinition> | undefined,
): EditorNode[] {
  return raisers.map((raiser) => {
    const effectRef = effectRefs?.find((e) => e.effectId === raiser.effectId)
    const effectName = effectRef?.name || raiser.effectId || 'none'
    const effectDef = effectDefinitions?.get(raiser.effectId)
    const parameterDefinitions = effectDef?.variables?.filter((v) => v.isParameter) ?? []
    return {
      id: raiser.id,
      type: 'effect-raiser' as const,
      position: nodePositions[raiser.id] ?? DEFAULT_POS.effectRaiser,
      data: {
        kind: 'effect-raiser' as const,
        label: `Effect: ${effectName}`,
        payload: raiser,
        effectName,
        parameterDefinitions,
      },
    }
  })
}

function buildEffectListenerNodes(
  listeners: EffectEventListenerNode[],
  nodePositions: NodePositions,
): EditorNode[] {
  return listeners.map((listener) => ({
    id: listener.id,
    type: 'effect-listener' as const,
    position: nodePositions[listener.id] ?? DEFAULT_POS.effectListener,
    data: {
      kind: 'effect-listener' as const,
      label: 'Effect Listener',
      payload: listener,
    },
  }))
}

function buildNotesNodes(notes: NotesNode[], nodePositions: NodePositions): EditorNode[] {
  return notes.map((node) => ({
    id: node.id,
    type: 'notes' as const,
    position: nodePositions[node.id] ?? DEFAULT_POS.notes,
    data: {
      kind: 'notes' as const,
      label: 'Notes',
      payload: node,
    },
  }))
}

type ConnectionInput = { from: string; to: string; fromPort?: string; toPort?: string }

function connectionsToEdges(connections: ConnectionInput[]): Edge[] {
  return connections.map((connection, index) => ({
    id: `${connection.from}-${connection.to}-${connection.fromPort ?? 'any'}-${index}`,
    source: connection.from,
    sourceHandle: connection.fromPort ?? undefined,
    target: connection.to,
    data: {
      fromPort: connection.fromPort ?? null,
      toPort: connection.toPort ?? null,
    },
  }))
}

/** Payloads extracted from flow nodes/edges for cue or effect document. */
export type NodeGraphPayloads = {
  events: (YargEventNode | AudioEventNode)[]
  actions: ActionNode[]
  logic: LogicNode[]
  eventRaisers: EventRaiserNode[]
  eventListeners: EventListenerNode[]
  effectRaisers?: EffectRaiserNode[]
  effectListeners?: EffectEventListenerNode[]
  notes: NotesNode[]
}

function flowToNodesAndConnections(
  nodes: EditorNode[],
  edges: Edge[],
  editorMode: EditorMode,
): {
  layoutPositions: Record<string, { x: number; y: number }>
  nodes: NodeGraphPayloads
  connections: Connection[]
} {
  const layoutPositions: Record<string, { x: number; y: number }> = {}
  nodes.forEach((node) => {
    layoutPositions[node.id] = { x: node.position.x, y: node.position.y }
  })

  const validEdges = edges.filter((edge) => {
    const sourceNode = nodes.find((n) => n.id === edge.source)
    const targetNode = nodes.find((n) => n.id === edge.target)
    if (!sourceNode || !targetNode) return false
    return isValidEditorEdge(sourceNode.data.kind, targetNode.data.kind, editorMode)
  })

  const connections: Connection[] = validEdges.map((edge) => {
    const data = edge.data as EditorEdgeData | undefined
    return {
      from: edge.source,
      to: edge.target,
      fromPort: data?.fromPort ?? undefined,
      toPort: data?.toPort ?? undefined,
    }
  })

  const eventNodes = nodes.filter((n) => n.data.kind === 'event')
  const actionNodes = nodes.filter((n) => n.data.kind === 'action')
  const logicNodes = nodes.filter((n) => n.data.kind === 'logic')
  const eventRaiserNodes = nodes.filter((n) => n.data.kind === 'event-raiser')
  const eventListenerNodes = nodes.filter((n) => n.data.kind === 'event-listener')
  const effectRaiserNodes = nodes.filter((n) => n.data.kind === 'effect-raiser')
  const effectListenerNodes = nodes.filter((n) => n.data.kind === 'effect-listener')
  const notesNodes = nodes.filter((n) => n.data.kind === 'notes')

  const payload: NodeGraphPayloads = {
    events: eventNodes.map((n) => n.data.payload) as (YargEventNode | AudioEventNode)[],
    actions: actionNodes.map((n) => n.data.payload as ActionNode),
    logic: logicNodes.map((n) => n.data.payload as LogicNode),
    eventRaisers: eventRaiserNodes.map((n) => n.data.payload as EventRaiserNode),
    eventListeners: eventListenerNodes.map((n) => n.data.payload as EventListenerNode),
    notes: notesNodes.map((n) => n.data.payload as NotesNode),
  }
  if (editorMode === 'cue') {
    payload.effectRaisers = effectRaiserNodes.map((n) => n.data.payload as EffectRaiserNode)
  } else {
    payload.effectListeners = effectListenerNodes.map(
      (n) => n.data.payload as EffectEventListenerNode,
    )
  }

  return { layoutPositions, nodes: payload, connections }
}

const cueModeOf = (cue: CueDefinition): NodeCueMode => ('cueType' in cue ? 'yarg' : 'audio')

const cueToFlow = (
  cue: CueDefinition | null,
  effectDefinitions?: Map<string, EffectDefinition>,
): { nodes: EditorNode[]; edges: Edge[] } => {
  if (!cue) return { nodes: [], edges: [] }
  const mode = cueModeOf(cue)
  const nodePositions = cue.layout?.nodePositions ?? {}
  const nodes: EditorNode[] = [
    ...buildEventNodes(cue.nodes.events, nodePositions, mode),
    ...buildActionNodes(cue.nodes.actions, nodePositions),
    ...buildLogicNodes(cue.nodes.logic ?? [], nodePositions),
    ...buildEventRaiserNodes(cue.nodes.eventRaisers ?? [], nodePositions),
    ...buildEventListenerNodes(cue.nodes.eventListeners ?? [], nodePositions),
    ...buildEffectRaiserNodes(
      cue.nodes.effectRaisers ?? [],
      nodePositions,
      cue.effects,
      effectDefinitions,
    ),
    ...buildNotesNodes(cue.nodes.notes ?? [], nodePositions),
  ]
  const edges = connectionsToEdges(cue.connections)
  return { nodes, edges }
}

const updateDocumentFromFlow = (
  editorDoc: EditorDocument | null,
  currentCueDefinition: CueDefinition | null,
  nodes: EditorNode[],
  edges: Edge[],
  reactFlowInstance: ReactFlowInstance | null,
): NodeCueFile | null => {
  if (!editorDoc || !currentCueDefinition || editorDoc.mode !== 'cue') return null
  const {
    layoutPositions,
    nodes: payload,
    connections,
  } = flowToNodesAndConnections(nodes, edges, 'cue')
  const updatedCue = {
    ...currentCueDefinition,
    nodes: {
      events: payload.events,
      actions: payload.actions,
      logic: payload.logic,
      eventRaisers: payload.eventRaisers,
      eventListeners: payload.eventListeners,
      effectRaisers: payload.effectRaisers ?? [],
      notes: payload.notes,
    },
    connections,
    layout: {
      nodePositions: layoutPositions,
      viewport: reactFlowInstance
        ? reactFlowInstance.toObject().viewport
        : currentCueDefinition.layout?.viewport,
    },
  }
  const updatedCues = (editorDoc.file as NodeCueFile).cues.map((cue) =>
    cue.id === updatedCue.id ? updatedCue : cue,
  )
  return {
    ...(editorDoc.file as NodeCueFile),
    cues: updatedCues,
  }
}

export { cueToFlow, updateDocumentFromFlow }

// ============================================================================
// Effect Transform Functions
// ============================================================================

const effectModeOf = (effect: EffectDefinition): NodeCueMode => effect.mode as NodeCueMode

const effectToFlow = (effect: EffectDefinition | null): { nodes: EditorNode[]; edges: Edge[] } => {
  if (!effect) return { nodes: [], edges: [] }
  const mode = effectModeOf(effect)
  const nodePositions = effect.layout?.nodePositions ?? {}
  const nodes: EditorNode[] = [
    ...buildEventNodes(effect.nodes.events ?? [], nodePositions, mode),
    ...buildActionNodes(effect.nodes.actions, nodePositions),
    ...buildLogicNodes(effect.nodes.logic ?? [], nodePositions),
    ...buildEventRaiserNodes(effect.nodes.eventRaisers ?? [], nodePositions),
    ...buildEventListenerNodes(effect.nodes.eventListeners ?? [], nodePositions),
    ...buildEffectListenerNodes(effect.nodes.effectListeners ?? [], nodePositions),
    ...buildNotesNodes(effect.nodes.notes ?? [], nodePositions),
  ]
  const edges = connectionsToEdges(effect.connections)
  return { nodes, edges }
}

const updateEffectDocumentFromFlow = (
  editorDoc: EditorDocument | null,
  currentEffectDefinition: EffectDefinition | null,
  nodes: EditorNode[],
  edges: Edge[],
  reactFlowInstance: ReactFlowInstance | null,
): EffectFile | null => {
  if (!editorDoc || !currentEffectDefinition || editorDoc.mode !== 'effect') return null
  const {
    layoutPositions,
    nodes: payload,
    connections,
  } = flowToNodesAndConnections(nodes, edges, 'effect')
  const updatedEffect = {
    ...currentEffectDefinition,
    nodes: {
      events: payload.events,
      actions: payload.actions,
      logic: payload.logic,
      eventRaisers: payload.eventRaisers,
      eventListeners: payload.eventListeners,
      effectListeners: payload.effectListeners ?? [],
      notes: payload.notes,
    },
    connections,
    layout: {
      nodePositions: layoutPositions,
      viewport: reactFlowInstance
        ? reactFlowInstance.toObject().viewport
        : currentEffectDefinition.layout?.viewport,
    },
  }
  const updatedEffects = (editorDoc.file as EffectFile).effects.map((eff) =>
    eff.id === updatedEffect.id ? updatedEffect : eff,
  )
  return {
    ...(editorDoc.file as EffectFile),
    effects: updatedEffects,
  }
}

export { effectToFlow, updateEffectDocumentFromFlow }
