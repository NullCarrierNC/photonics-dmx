import { describe, expect, it } from '@jest/globals'
import type { Edge } from 'reactflow'
import type {
  AudioEventNode,
  AudioEventType,
  LogicNode,
} from '../../../../../photonics-dmx/cues/types/nodeCueTypes'
import type { EditorNode, EditorNodeData } from './types'
import { findIncompatibleTimingNodes } from './levelModeCompat'

function makeNode(
  id: string,
  kind: EditorNodeData['kind'],
  payload: object,
  label: string,
): EditorNode {
  return {
    id,
    type: kind,
    position: { x: 0, y: 0 },
    data: { kind, payload: payload as EditorNodeData['payload'], label },
  }
}

function audioEvent(
  id: string,
  eventType: AudioEventType,
  triggerMode: 'edge' | 'level',
): EditorNode {
  return makeNode(
    id,
    'event',
    { id, type: 'event', eventType, triggerMode, threshold: 0.5 } as AudioEventNode,
    eventType,
  )
}

function audioTrigger(id: string): EditorNode {
  // The audio-trigger node has no triggerMode; its enter/exit ports run once through the engine.
  return makeNode(id, 'event', { id, type: 'event', eventType: 'audio-trigger' }, 'audio-trigger')
}

function logic(id: string, logicType: LogicNode['logicType']): EditorNode {
  return makeNode(id, 'logic', { id, type: 'logic', logicType }, logicType)
}

function action(id: string): EditorNode {
  return makeNode(id, 'action', { id, type: 'action', effectType: 'set-color' }, 'set-color')
}

/** Freshly-drawn edge: port lives on the live `sourceHandle`. */
function edge(source: string, target: string, fromPort?: string): Edge {
  return {
    id: `${source}->${target}:${fromPort ?? 'any'}`,
    source,
    target,
    sourceHandle: fromPort ?? null,
    data: fromPort ? { fromPort } : undefined,
  }
}

/** Loaded-graph edge: port persisted only in `data.fromPort` (no live sourceHandle). */
function loadedEdge(source: string, target: string, fromPort: string): Edge {
  return { id: `${source}->${target}`, source, target, sourceHandle: null, data: { fromPort } }
}

describe('findIncompatibleTimingNodes — level-mode events', () => {
  it('flags a delay directly downstream of a level-mode audio event', () => {
    const nodes = [audioEvent('e', 'audio-energy', 'level'), logic('d', 'delay'), action('a')]
    const result = findIncompatibleTimingNodes(nodes, [edge('e', 'd'), edge('d', 'a')])
    expect(result.nodeIds.has('d')).toBe(true)
    expect(result.messages).toHaveLength(1)
    expect(result.messages[0]).toContain('level-mode')
  })

  it('does not flag a delay under an edge-mode event', () => {
    const nodes = [audioEvent('e', 'audio-energy', 'edge'), logic('d', 'delay'), action('a')]
    expect(findIncompatibleTimingNodes(nodes, [edge('e', 'd'), edge('d', 'a')]).nodeIds.size).toBe(
      0,
    )
  })

  it('flags a delay reachable indirectly (through other logic) from a level event', () => {
    const nodes = [audioEvent('e', 'beat', 'level'), logic('v', 'variable'), logic('d', 'delay')]
    expect(
      findIncompatibleTimingNodes(nodes, [edge('e', 'v'), edge('v', 'd')]).nodeIds.has('d'),
    ).toBe(true)
  })

  it('flags for-each-light under a level event', () => {
    const nodes = [audioEvent('e', 'audio-energy', 'level'), logic('f', 'for-each-light')]
    expect(findIncompatibleTimingNodes(nodes, [edge('e', 'f')]).nodeIds.has('f')).toBe(true)
  })

  it('flags a delay reachable from BOTH an edge and a level event (warn-only)', () => {
    const nodes = [
      audioEvent('lvl', 'audio-energy', 'level'),
      audioEvent('edg', 'beat', 'edge'),
      logic('d', 'delay'),
    ]
    expect(
      findIncompatibleTimingNodes(nodes, [edge('lvl', 'd'), edge('edg', 'd')]).nodeIds.has('d'),
    ).toBe(true)
  })

  it('does not flag delay under cue-started or cue-called even when triggerMode is level', () => {
    const started = [audioEvent('e', 'cue-started', 'level'), logic('d', 'delay')]
    expect(findIncompatibleTimingNodes(started, [edge('e', 'd')]).nodeIds.size).toBe(0)
    const called = [audioEvent('e2', 'cue-called', 'level'), logic('d2', 'delay')]
    expect(findIncompatibleTimingNodes(called, [edge('e2', 'd2')]).nodeIds.size).toBe(0)
  })

  it('does not flag non-timing logic nodes downstream of a level event', () => {
    const nodes = [audioEvent('e', 'audio-energy', 'level'), logic('v', 'variable')]
    expect(findIncompatibleTimingNodes(nodes, [edge('e', 'v')]).nodeIds.size).toBe(0)
  })

  it('returns empty when there are no level-mode or audio-trigger nodes', () => {
    const nodes = [logic('d', 'delay'), action('a')]
    expect(findIncompatibleTimingNodes(nodes, [edge('d', 'a')]).nodeIds.size).toBe(0)
  })
})

describe('findIncompatibleTimingNodes — audio-trigger ports', () => {
  it('flags a delay on the "during" port', () => {
    const nodes = [audioTrigger('t'), logic('d', 'delay')]
    const result = findIncompatibleTimingNodes(nodes, [edge('t', 'd', 'during')])
    expect(result.nodeIds.has('d')).toBe(true)
    expect(result.messages[0]).toContain('during')
  })

  it('does NOT flag a delay on the "exit" port (fires once through the engine)', () => {
    const nodes = [audioTrigger('t'), logic('d', 'delay')]
    expect(findIncompatibleTimingNodes(nodes, [edge('t', 'd', 'exit')]).nodeIds.size).toBe(0)
  })

  it('does NOT flag a delay on the "enter" port', () => {
    const nodes = [audioTrigger('t'), logic('d', 'delay')]
    expect(findIncompatibleTimingNodes(nodes, [edge('t', 'd', 'enter')]).nodeIds.size).toBe(0)
  })

  it('flags a delay reachable indirectly from the "during" port', () => {
    const nodes = [audioTrigger('t'), logic('m', 'math'), logic('d', 'delay')]
    expect(
      findIncompatibleTimingNodes(nodes, [edge('t', 'm', 'during'), edge('m', 'd')]).nodeIds.has(
        'd',
      ),
    ).toBe(true)
  })

  it('flags for-each-light on the "during" port', () => {
    const nodes = [audioTrigger('t'), logic('f', 'for-each-light')]
    expect(findIncompatibleTimingNodes(nodes, [edge('t', 'f', 'during')]).nodeIds.has('f')).toBe(
      true,
    )
  })

  it('flags a "during" delay on a loaded graph (port only in data.fromPort)', () => {
    const nodes = [audioTrigger('t'), logic('d', 'delay')]
    expect(
      findIncompatibleTimingNodes(nodes, [loadedEdge('t', 'd', 'during')]).nodeIds.has('d'),
    ).toBe(true)
  })

  it('does not flag non-timing logic on the "during" port', () => {
    const nodes = [audioTrigger('t'), logic('v', 'variable')]
    expect(findIncompatibleTimingNodes(nodes, [edge('t', 'v', 'during')]).nodeIds.size).toBe(0)
  })
})
