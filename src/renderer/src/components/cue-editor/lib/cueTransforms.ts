import type { Edge, ReactFlowInstance } from 'reactflow'
import type {
  AudioEventNode,
  AudioNodeCueDefinition,
  AudioEffectDefinition,
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

/** Edge data for editor edges (port info for logic/conditional nodes). */
export type EditorEdgeData = { fromPort?: string | null; toPort?: string | null }

type CueDefinition = YargNodeCueDefinition | AudioNodeCueDefinition
type EffectDefinition = YargEffectDefinition | AudioEffectDefinition

const cueModeOf = (cue: CueDefinition): NodeCueMode => ('cueType' in cue ? 'yarg' : 'audio')

const cueToFlow = (
  cue: CueDefinition | null,
  effectDefinitions?: Map<string, EffectDefinition>,
): { nodes: EditorNode[]; edges: Edge[] } => {
  if (!cue) return { nodes: [], edges: [] }

  const cueMode = cueModeOf(cue)
  const nodePositions = cue.layout?.nodePositions ?? {}
  const nodes: EditorNode[] = [
    ...cue.nodes.events.map((event) => ({
      id: event.id,
      type: 'event' as const,
      position: nodePositions[event.id] ?? { x: 100, y: 100 },
      data: {
        kind: 'event' as const,
        label:
          cueMode === 'yarg'
            ? getYargEventLabel((event as YargEventNode).eventType)
            : getAudioEventLabel((event as AudioEventNode).eventType),
        payload: event,
      },
    })),
    ...cue.nodes.actions.map((action) => ({
      id: action.id,
      type: 'action' as const,
      position: nodePositions[action.id] ?? { x: 400, y: 100 },
      data: {
        kind: 'action' as const,
        label: `${action.effectType}`,
        payload: action,
      },
    })),
    ...(cue.nodes.logic ?? []).map((logic: LogicNode) => ({
      id: logic.id,
      type: 'logic' as const,
      position: nodePositions[logic.id] ?? { x: 260, y: 120 },
      data: {
        kind: 'logic' as const,
        label: logic.logicType,
        payload: logic,
      },
    })),
    ...(cue.nodes.eventRaisers ?? []).map((raiser: EventRaiserNode) => ({
      id: raiser.id,
      type: 'event-raiser' as const,
      position: nodePositions[raiser.id] ?? { x: 260, y: 200 },
      data: {
        kind: 'event-raiser' as const,
        label: `Raise: ${raiser.eventName}`,
        payload: raiser,
      },
    })),
    ...(cue.nodes.eventListeners ?? []).map((listener: EventListenerNode) => ({
      id: listener.id,
      type: 'event-listener' as const,
      position: nodePositions[listener.id] ?? { x: 260, y: 280 },
      data: {
        kind: 'event-listener' as const,
        label: `Listen: ${listener.eventName}`,
        payload: listener,
      },
    })),
    ...(cue.nodes.effectRaisers ?? []).map((raiser: EffectRaiserNode) => {
      // Look up effect name from cue's effects array
      const effectRef = cue.effects?.find((e) => e.effectId === raiser.effectId)
      const effectName = effectRef?.name || raiser.effectId || 'none'
      // Get effect definition if available
      const effectDef = effectDefinitions?.get(raiser.effectId)
      // Extract parameter definitions (variables with isParameter: true)
      const parameterDefinitions = effectDef?.variables?.filter((v) => v.isParameter) ?? []
      return {
        id: raiser.id,
        type: 'effect-raiser' as const,
        position: nodePositions[raiser.id] ?? { x: 260, y: 360 },
        data: {
          kind: 'effect-raiser' as const,
          label: `Effect: ${effectName}`,
          payload: raiser,
          effectName, // Pass name to node component
          parameterDefinitions, // Pass parameter definitions to node component
        },
      }
    }),
    ...(cue.nodes.notes ?? []).map((notes: NotesNode) => ({
      id: notes.id,
      type: 'notes' as const,
      position: nodePositions[notes.id] ?? { x: 320, y: 240 },
      data: {
        kind: 'notes' as const,
        label: 'Notes',
        payload: notes,
      },
    })),
  ]

  const edges: Edge[] = cue.connections.map((connection, index) => ({
    id: `${connection.from}-${connection.to}-${connection.fromPort ?? 'any'}-${index}`,
    source: connection.from,
    sourceHandle: connection.fromPort ?? undefined,
    target: connection.to,
    data: {
      fromPort: connection.fromPort ?? null,
      toPort: connection.toPort ?? null,
    },
  }))

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

  const layoutPositions: Record<string, { x: number; y: number }> = {}
  nodes.forEach((node) => {
    layoutPositions[node.id] = {
      x: node.position.x,
      y: node.position.y,
    }
  })

  const eventNodes = nodes.filter((node) => node.data.kind === 'event')
  const actionNodes = nodes.filter((node) => node.data.kind === 'action')
  const logicNodes = nodes.filter((node) => node.data.kind === 'logic')
  const eventRaiserNodes = nodes.filter((node) => node.data.kind === 'event-raiser')
  const eventListenerNodes = nodes.filter((node) => node.data.kind === 'event-listener')
  const effectRaiserNodes = nodes.filter((node) => node.data.kind === 'effect-raiser')
  const notesNodes = nodes.filter((node) => node.data.kind === 'notes')

  const validEdges = edges.filter((edge) => {
    const sourceNode = nodes.find((node) => node.id === edge.source)
    const targetNode = nodes.find((node) => node.id === edge.target)
    if (!sourceNode || !targetNode) return false

    const validSourceKinds = [
      'event',
      'action',
      'logic',
      'event-raiser',
      'event-listener',
      'effect-raiser',
    ]
    const validTargetKinds = ['action', 'logic', 'event-raiser', 'effect-raiser']

    // Event raiser can have children, event listener cannot have inputs
    if (sourceNode.data.kind === 'event-listener') {
      return validTargetKinds.includes(targetNode.data.kind)
    }

    // All other nodes can connect to actions, logic, event-raisers, or effect-raisers
    if (
      validSourceKinds.includes(sourceNode.data.kind) &&
      validTargetKinds.includes(targetNode.data.kind)
    ) {
      return true
    }
    return false
  })

  const updatedCue = {
    ...currentCueDefinition,
    nodes: {
      events: eventNodes.map((node) => node.data.payload) as YargEventNode[] | AudioEventNode[],
      actions: actionNodes.map((node) => node.data.payload),
      logic: logicNodes.map((node) => node.data.payload as LogicNode),
      eventRaisers: eventRaiserNodes.map((node) => node.data.payload as EventRaiserNode),
      eventListeners: eventListenerNodes.map((node) => node.data.payload as EventListenerNode),
      effectRaisers: effectRaiserNodes.map((node) => node.data.payload as EffectRaiserNode),
      notes: notesNodes.map((node) => node.data.payload as NotesNode),
    },
    connections: validEdges.map((edge) => {
      const data = edge.data as EditorEdgeData | undefined
      return {
        from: edge.source,
        to: edge.target,
        fromPort: data?.fromPort ?? undefined,
        toPort: data?.toPort ?? undefined,
      }
    }),
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

  const effectMode = effectModeOf(effect)
  const nodePositions = effect.layout?.nodePositions ?? {}
  const nodes: EditorNode[] = [
    ...(effect.nodes.events ?? []).map((event) => ({
      id: event.id,
      type: 'event' as const,
      position: nodePositions[event.id] ?? { x: 100, y: 100 },
      data: {
        kind: 'event' as const,
        label:
          effectMode === 'yarg'
            ? getYargEventLabel((event as YargEventNode).eventType)
            : getAudioEventLabel((event as AudioEventNode).eventType),
        payload: event,
      },
    })),
    ...effect.nodes.actions.map((action) => ({
      id: action.id,
      type: 'action' as const,
      position: nodePositions[action.id] ?? { x: 400, y: 100 },
      data: {
        kind: 'action' as const,
        label: `${action.effectType}`,
        payload: action,
      },
    })),
    ...(effect.nodes.logic ?? []).map((logic: LogicNode) => ({
      id: logic.id,
      type: 'logic' as const,
      position: nodePositions[logic.id] ?? { x: 260, y: 120 },
      data: {
        kind: 'logic' as const,
        label: logic.logicType,
        payload: logic,
      },
    })),
    ...(effect.nodes.eventRaisers ?? []).map((raiser: EventRaiserNode) => ({
      id: raiser.id,
      type: 'event-raiser' as const,
      position: nodePositions[raiser.id] ?? { x: 260, y: 200 },
      data: {
        kind: 'event-raiser' as const,
        label: `Raise: ${raiser.eventName}`,
        payload: raiser,
      },
    })),
    ...(effect.nodes.eventListeners ?? []).map((listener: EventListenerNode) => ({
      id: listener.id,
      type: 'event-listener' as const,
      position: nodePositions[listener.id] ?? { x: 260, y: 280 },
      data: {
        kind: 'event-listener' as const,
        label: `Listen: ${listener.eventName}`,
        payload: listener,
      },
    })),
    ...(effect.nodes.effectListeners ?? []).map((listener: EffectEventListenerNode) => ({
      id: listener.id,
      type: 'effect-listener' as const,
      position: nodePositions[listener.id] ?? { x: 100, y: 50 },
      data: {
        kind: 'effect-listener' as const,
        label: 'Effect Listener',
        payload: listener,
      },
    })),
    ...(effect.nodes.notes ?? []).map((notes: NotesNode) => ({
      id: notes.id,
      type: 'notes' as const,
      position: nodePositions[notes.id] ?? { x: 320, y: 240 },
      data: {
        kind: 'notes' as const,
        label: 'Notes',
        payload: notes,
      },
    })),
  ]

  const edges: Edge[] = effect.connections.map((connection, index) => ({
    id: `${connection.from}-${connection.to}-${connection.fromPort ?? 'any'}-${index}`,
    source: connection.from,
    sourceHandle: connection.fromPort ?? undefined,
    target: connection.to,
    data: {
      fromPort: connection.fromPort ?? null,
      toPort: connection.toPort ?? null,
    },
  }))

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

  const layoutPositions: Record<string, { x: number; y: number }> = {}
  nodes.forEach((node) => {
    layoutPositions[node.id] = {
      x: node.position.x,
      y: node.position.y,
    }
  })

  const eventNodes = nodes.filter((node) => node.data.kind === 'event')
  const actionNodes = nodes.filter((node) => node.data.kind === 'action')
  const logicNodes = nodes.filter((node) => node.data.kind === 'logic')
  const eventRaiserNodes = nodes.filter((node) => node.data.kind === 'event-raiser')
  const eventListenerNodes = nodes.filter((node) => node.data.kind === 'event-listener')
  const effectListenerNodes = nodes.filter((node) => node.data.kind === 'effect-listener')
  const notesNodes = nodes.filter((node) => node.data.kind === 'notes')

  const validEdges = edges.filter((edge) => {
    const sourceNode = nodes.find((node) => node.id === edge.source)
    const targetNode = nodes.find((node) => node.id === edge.target)
    if (!sourceNode || !targetNode) return false

    const validSourceKinds = [
      'event',
      'action',
      'logic',
      'event-raiser',
      'event-listener',
      'effect-listener',
    ]
    const validTargetKinds = ['action', 'logic', 'event-raiser']

    // Event listener and effect listener cannot have inputs
    if (sourceNode.data.kind === 'event-listener' || sourceNode.data.kind === 'effect-listener') {
      return validTargetKinds.includes(targetNode.data.kind)
    }

    // All other nodes can connect to actions, logic, or event-raisers
    if (
      validSourceKinds.includes(sourceNode.data.kind) &&
      validTargetKinds.includes(targetNode.data.kind)
    ) {
      return true
    }
    return false
  })

  const updatedEffect = {
    ...currentEffectDefinition,
    nodes: {
      events: eventNodes.map((node) => node.data.payload) as YargEventNode[] | AudioEventNode[],
      actions: actionNodes.map((node) => node.data.payload),
      logic: logicNodes.map((node) => node.data.payload as LogicNode),
      eventRaisers: eventRaiserNodes.map((node) => node.data.payload as EventRaiserNode),
      eventListeners: eventListenerNodes.map((node) => node.data.payload as EventListenerNode),
      effectListeners: effectListenerNodes.map(
        (node) => node.data.payload as EffectEventListenerNode,
      ),
      notes: notesNodes.map((node) => node.data.payload as NotesNode),
    },
    connections: validEdges.map((edge) => {
      const data = edge.data as EditorEdgeData | undefined
      return {
        from: edge.source,
        to: edge.target,
        fromPort: data?.fromPort ?? undefined,
        toPort: data?.toPort ?? undefined,
      }
    }),
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
