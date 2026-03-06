/**
 * Tests for NodeCueCompiler: calculateActionDuration, unreachable actions, effects-only cue.
 */

import {
  NodeCueCompiler,
  NodeCueCompilationError,
  calculateActionDuration,
} from '../../../../cues/node/compiler/NodeCueCompiler'
import type { YargNodeCueDefinition, ActionNode } from '../../../../cues/types/nodeCueTypes'
import { CueType } from '../../../../cues/types/cueTypes'

function minimalAction(id: string, overrides?: Partial<ActionNode['timing']>): ActionNode {
  const timing = {
    waitForCondition: { source: 'literal' as const, value: 'none' },
    waitForTime: { source: 'literal' as const, value: 0 },
    duration: { source: 'literal' as const, value: 200 },
    waitUntilCondition: { source: 'literal' as const, value: 'none' },
    waitUntilTime: { source: 'literal' as const, value: 0 },
    easing: 'sinInOut' as const,
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
  describe('calculateActionDuration', () => {
    it('returns sum of waitForTime + duration + waitUntilTime when all are literal', () => {
      const action = minimalAction('a1', {
        waitForTime: { source: 'literal', value: 100 },
        duration: { source: 'literal', value: 250 },
        waitUntilTime: { source: 'literal', value: 50 },
      })
      expect(calculateActionDuration(action)).toBe(400)
    })

    it('clamps negative values to zero per term', () => {
      const action = minimalAction('a1', {
        waitForTime: { source: 'literal', value: -10 },
        duration: { source: 'literal', value: 100 },
        waitUntilTime: { source: 'literal', value: -5 },
      })
      expect(calculateActionDuration(action)).toBe(100)
    })

    it('uses default for variable-source fields at compile time', () => {
      const action = minimalAction('a1', {
        waitForTime: { source: 'variable', name: 't1' },
        duration: { source: 'variable', name: 'dur' },
        waitUntilTime: { source: 'variable', name: 't2' },
      })
      // Variable sources use default per term at compile time: 0+200+0
      expect(calculateActionDuration(action)).toBe(200)
    })
  })

  describe('compileYargCue', () => {
    it('throws when action node is unreachable from any event', () => {
      const definition: YargNodeCueDefinition = {
        id: 'unreach-cue',
        name: 'Unreachable Cue',
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

      expect(() => NodeCueCompiler.compileYargCue(definition)).toThrow(NodeCueCompilationError)
      expect(() => NodeCueCompiler.compileYargCue(definition)).toThrow(/not reachable/i)
    })

    it('compiles cue with only effectRaisers and no actions', () => {
      const definition: YargNodeCueDefinition = {
        id: 'effects-only-cue',
        name: 'Effects Only',
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

      const compiled = NodeCueCompiler.compileYargCue(definition)
      expect(compiled).toBeDefined()
      expect(compiled.actionMap.size).toBe(0)
      expect(compiled.effectRaiserMap.size).toBe(1)
    })
  })
})
