/**
 * Tests for NodeCueCompiler: unreachable actions, effects-only cue.
 */

import {
  NodeCueCompiler,
  NodeCueCompilationError,
} from '../../../../cues/node/compiler/NodeCueCompiler'
import type { NetNodeCueDefinition, ActionNode } from '../../../../cues/types/nodeCueTypes'
import { CueType } from '../../../../cues/types/cueTypes'

function minimalAction(id: string, overrides?: Partial<ActionNode['timing']>): ActionNode {
  const timing = {
    waitForCondition: { source: 'literal' as const, value: 'none' },
    waitForTime: { source: 'literal' as const, value: 0 },
    duration: { source: 'literal' as const, value: 200 },
    waitUntilCondition: { source: 'literal' as const, value: 'none' },
    waitUntilTime: { source: 'literal' as const, value: 0 },
    easing: { source: 'literal' as const, value: 'sinInOut' },
    level: { source: 'literal' as const, value: 1 },
    ...overrides,
  }
  return {
    id,
    type: 'action',
    effectType: 'set-color',
    target: {
      groups: { source: 'literal', value: 'front' },
      filter: { source: 'literal', value: 'all' },
    },
    color: {
      name: { source: 'literal', value: 'blue' },
      brightness: { source: 'literal', value: 'medium' },
      blendMode: { source: 'literal', value: 'replace' },
    },
    timing,
  }
}

describe('NodeCueCompiler', () => {
  describe('compileYargCue', () => {
    it('throws when action node is unreachable from any event', () => {
      const definition: NetNodeCueDefinition = {
        id: 'unreach-cue',
        name: 'Unreachable Cue',
        kind: 'lighting',
        cueType: CueType.Chorus,
        style: 'primary',
        nodes: {
          events: [{ id: 'event-1', type: 'event', eventType: 'beat' }],
          actions: [
            minimalAction('action-1'),
            minimalAction('action-2'), // no connection from event or listener to this one
          ],
        },
        connections: [{ from: 'event-1', to: 'action-1' }],
        layout: { nodePositions: {} },
      }

      expect(() => NodeCueCompiler.compileCue(definition, 'yarg')).toThrow(NodeCueCompilationError)
      expect(() => NodeCueCompiler.compileCue(definition, 'yarg')).toThrow(/not reachable/i)
    })

    it('compiles cue with only effectRaisers and no actions', () => {
      const definition: NetNodeCueDefinition = {
        id: 'effects-only-cue',
        name: 'Effects Only',
        kind: 'lighting',
        cueType: CueType.Chorus,
        style: 'primary',
        nodes: {
          events: [{ id: 'event-1', type: 'event', eventType: 'beat' }],
          actions: [],
          effectRaisers: [{ id: 'raiser-1', type: 'effect-raiser', effectId: 'eff-1' }],
        },
        connections: [{ from: 'event-1', to: 'raiser-1' }],
        layout: { nodePositions: {} },
      }

      const compiled = NodeCueCompiler.compileCue(definition, 'yarg')
      expect(compiled).toBeDefined()
      expect(compiled.actionMap.size).toBe(0)
      expect(compiled.effectRaiserMap.size).toBe(1)
    })
  })
})
