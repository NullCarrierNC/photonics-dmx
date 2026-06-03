import type { Edge } from 'reactflow'
import type {
  AudioEventType,
  AudioEventNode,
  LogicNode,
} from '../../../../../photonics-dmx/cues/types/nodeCueTypes'
import type { EditorNode } from './types'

/**
 * Audio event types whose level-mode runtime path holds a single look continuously (scaled by the
 * live level) and does not step the graph. Timing/iteration logic downstream of such an event never
 * runs. Excludes cue-started/cue-called/audio-trigger (engine-driven, where timing works) and the
 * non-threshold types.
 */
const LEVEL_CAPABLE_AUDIO_EVENT_TYPES: ReadonlySet<AudioEventType> = new Set<AudioEventType>([
  'beat',
  'audio-energy',
  'audio-centroid',
  'audio-flatness',
  'audio-hfc',
])

/** Logic nodes that need an engine-stepped path; inert under level mode and re-fired under "during". */
const TIMING_LOGIC_TYPES: ReadonlySet<LogicNode['logicType']> = new Set<LogicNode['logicType']>([
  'delay',
  'for-each-light',
])

const LOGIC_TYPE_LABELS: Partial<Record<LogicNode['logicType'], string>> = {
  'delay': 'Delay',
  'for-each-light': 'For Each Light',
}

export interface TimingCompatResult {
  /** Ids of timing/iteration nodes wired into a context that fires them incorrectly (highlight these). */
  nodeIds: Set<string>
  /** One human-readable warning per offending node, in node order. */
  messages: string[]
}

function isLevelModeEvent(node: EditorNode): boolean {
  if (node.data.kind !== 'event') return false
  const payload = node.data.payload
  // Only AudioEventNode carries triggerMode; YargEventNode and the audio-trigger node do not.
  if (!('triggerMode' in payload)) return false
  const audioEvent = payload as AudioEventNode
  return (
    audioEvent.triggerMode === 'level' && LEVEL_CAPABLE_AUDIO_EVENT_TYPES.has(audioEvent.eventType)
  )
}

function isAudioTriggerNode(node: EditorNode | undefined): boolean {
  if (!node || node.data.kind !== 'event') return false
  return (node.data.payload as { eventType?: string }).eventType === 'audio-trigger'
}

/** The source port of an edge — from the live handle id, or the persisted `data.fromPort` for loaded graphs. */
function edgeFromPort(edge: Edge): string | null {
  if (edge.sourceHandle) return edge.sourceHandle
  const data = edge.data as { fromPort?: string | null } | undefined
  return data?.fromPort ?? null
}

function timingLogicType(node: EditorNode): LogicNode['logicType'] | null {
  if (node.data.kind !== 'logic') return null
  const { logicType } = node.data.payload as LogicNode
  return TIMING_LOGIC_TYPES.has(logicType) ? logicType : null
}

function nodeLabel(node: EditorNode, logicType: LogicNode['logicType']): string {
  return node.data.label || LOGIC_TYPE_LABELS[logicType] || logicType
}

/**
 * Find timing/iteration logic nodes (delay, for-each-light) wired into a trigger context that fires
 * them in a way that breaks their intended single-shot/sequencing behaviour:
 *
 *  - **reachable from a level-mode audio event** (audio-energy/beat/centroid/flatness/hfc with
 *    triggerMode 'level') — the level path holds one look and never steps the graph, so they are
 *    inert; and
 *  - **reachable from an audio-trigger node's "during" port** — that port re-fires every audio frame,
 *    so they run continuously instead of once.
 *
 * The audio-trigger "enter"/"exit" ports, edge-mode events, and cue-started/cue-called all run once
 * through the engine, where timing works, so they are NOT flagged. Warn-only by design: a node
 * reachable from BOTH a flagged and a working context is still flagged, but nothing is blocked.
 */
export function findIncompatibleTimingNodes(
  nodes: EditorNode[],
  edges: Edge[],
): TimingCompatResult {
  const adjacency = new Map<string, string[]>()
  for (const edge of edges) {
    const targets = adjacency.get(edge.source)
    if (targets) targets.push(edge.target)
    else adjacency.set(edge.source, [edge.target])
  }
  const nodeById = new Map(nodes.map((node) => [node.id, node]))

  const nodeIds = new Set<string>()
  const messages: string[] = []

  /** BFS downstream from `seedIds`, flagging any reachable timing node not already flagged. */
  const collect = (
    seedIds: string[],
    makeMessage: (node: EditorNode, logicType: LogicNode['logicType']) => string,
  ): void => {
    if (seedIds.length === 0) return
    // Seeds count as reachable: the audio-trigger "during" seeds are the during-edge targets
    // themselves (which may be the timing node directly). Level-mode seeds are event nodes, which
    // are never timing nodes, so including them is harmless.
    const reachable = new Set<string>(seedIds)
    const queue = [...seedIds]
    while (queue.length) {
      const id = queue.shift()!
      for (const next of adjacency.get(id) ?? []) {
        if (!reachable.has(next)) {
          reachable.add(next)
          queue.push(next)
        }
      }
    }
    for (const node of nodes) {
      if (!reachable.has(node.id) || nodeIds.has(node.id)) continue
      const logicType = timingLogicType(node)
      if (!logicType) continue
      nodeIds.add(node.id)
      messages.push(makeMessage(node, logicType))
    }
  }

  // Level-mode events: seed from the event itself (it has a single output port, so follow all edges).
  collect(
    nodes.filter(isLevelModeEvent).map((node) => node.id),
    (node, logicType) =>
      `"${nodeLabel(node, logicType)}" won't run under a level-mode trigger — level cues hold one look continuously and don't sequence or iterate. Use an edge-mode trigger for timed or stepped behaviour.`,
  )

  // Audio-trigger "during" port: seed from the during-edge targets only — "enter"/"exit" fire once
  // through the engine, where timing works, so they must not be flagged.
  collect(
    edges
      .filter(
        (edge) => isAudioTriggerNode(nodeById.get(edge.source)) && edgeFromPort(edge) === 'during',
      )
      .map((edge) => edge.target),
    (node, logicType) =>
      `"${nodeLabel(node, logicType)}" re-runs every frame under an audio trigger's "during" port — timing and iteration nodes there fire continuously instead of once. Move it to the trigger's "enter" or "exit" port for timed or stepped behaviour.`,
  )

  return { nodeIds, messages }
}
