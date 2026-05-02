import { describe, expect, it } from '@jest/globals'
import { CueType } from '../../../../cues/types/cueTypes'
import {
  NodeCueCompiler,
  NodeCueCompilationError,
} from '../../../../cues/node/compiler/NodeCueCompiler'
import {
  EffectCompiler,
  EffectCompilationError,
} from '../../../../cues/node/compiler/EffectCompiler'
import type {
  ActionNode,
  YargLightingNodeCueDefinition,
  YargEffectDefinition,
} from '../../../../cues/types/nodeCueTypes'
import { createDefaultActionTiming } from '../../../../cues/types/nodeCueTypes'

/**
 * Cross-compiler parity:
 *
 * Each test case builds the smallest valid YARG cue and YARG effect (one event/listener wired to
 * one action), substitutes the same invalid action payload, and asserts both
 * `NodeCueCompiler.compileYargCue` and `EffectCompiler.compileYargEffect` reject with errors that
 * carry their compiler-specific class but identical messages.
 */

function baseValidAction(): ActionNode {
  return {
    id: 'a1',
    type: 'action',
    effectType: 'set-color',
    target: {
      groups: { source: 'literal', value: 'g1' },
      filter: { source: 'literal', value: 'all' },
    },
    color: {
      name: { source: 'literal', value: 'red' },
      brightness: { source: 'literal', value: 'high' },
    },
    timing: createDefaultActionTiming(),
  }
}

function buildCue(action: ActionNode): YargLightingNodeCueDefinition {
  return {
    id: 'cue-1',
    name: 'Test Cue',
    kind: 'lighting',
    cueType: CueType.BigRockEnding,
    style: 'primary',
    nodes: {
      events: [{ id: 'e1', type: 'event', eventType: 'beat' }],
      actions: [action],
    },
    connections: [{ from: 'e1', to: action.id }],
  } as YargLightingNodeCueDefinition
}

function buildEffect(action: ActionNode): YargEffectDefinition {
  return {
    id: 'effect-1',
    name: 'Test Effect',
    mode: 'yarg',
    nodes: {
      events: [],
      actions: [action],
      effectListeners: [{ id: 'l1', type: 'effect-listener' }],
    },
    connections: [{ from: 'l1', to: action.id }],
  } as YargEffectDefinition
}

interface ParityCase {
  description: string
  action: ActionNode
  expectedMessageMatch: RegExp
}

const PARITY_CASES: ParityCase[] = [
  {
    description: 'rejects missing target.groups',
    action: {
      ...baseValidAction(),
      target: {
        groups: undefined as unknown as ActionNode['target']['groups'],
        filter: { source: 'literal', value: 'all' },
      },
    },
    expectedMessageMatch: /must target at least one group/,
  },
  {
    description: 'rejects empty literal groups',
    action: {
      ...baseValidAction(),
      target: {
        groups: { source: 'literal', value: '' },
        filter: { source: 'literal', value: 'all' },
      },
    },
    expectedMessageMatch: /must target at least one group/,
  },
  {
    description: 'rejects missing target.filter',
    action: {
      ...baseValidAction(),
      target: {
        groups: { source: 'literal', value: 'g1' },
        filter: undefined as unknown as ActionNode['target']['filter'],
      },
    },
    expectedMessageMatch: /target\.filter is required/,
  },
  {
    description: 'rejects unknown literal LightTarget filter',
    action: {
      ...baseValidAction(),
      target: {
        groups: { source: 'literal', value: 'g1' },
        filter: { source: 'literal', value: 'not-a-real-target' },
      },
    },
    expectedMessageMatch: /target\.filter 'not-a-real-target' is not a known LightTarget/,
  },
  {
    description: 'rejects set-color without color',
    action: { ...baseValidAction(), effectType: 'set-color', color: undefined },
    expectedMessageMatch: /set-color.*must include color/,
  },
  {
    description: 'rejects set-position without position',
    action: {
      ...baseValidAction(),
      effectType: 'set-position',
      color: undefined,
      position: undefined,
    } as ActionNode,
    expectedMessageMatch: /set-position.*must include position/,
  },
  {
    description: 'rejects motion-pattern without motionPattern',
    action: {
      ...baseValidAction(),
      effectType: 'motion-pattern',
      color: undefined,
      motionPattern: undefined,
    } as ActionNode,
    expectedMessageMatch: /motion-pattern.*must include motionPattern/,
  },
  {
    description: 'rejects an unknown literal waitForCondition',
    action: {
      ...baseValidAction(),
      timing: {
        ...createDefaultActionTiming(),
        waitForCondition: { source: 'literal', value: 'definitely-not-a-condition' },
      },
    },
    expectedMessageMatch:
      /waitForCondition literal 'definitely-not-a-condition' is not a known wait condition/,
  },
  {
    description: 'rejects a negative literal waitForTime',
    action: {
      ...baseValidAction(),
      timing: {
        ...createDefaultActionTiming(),
        waitForTime: { source: 'literal', value: -1 },
      },
    },
    expectedMessageMatch: /waitForTime literal must be a non-negative finite number/,
  },
  {
    description: 'rejects a non-finite literal duration',
    action: {
      ...baseValidAction(),
      timing: {
        ...createDefaultActionTiming(),
        duration: { source: 'literal', value: Number.POSITIVE_INFINITY as unknown as number },
      },
    },
    expectedMessageMatch: /duration literal must be a non-negative finite number/,
  },
  {
    description: 'rejects an out-of-range literal level (must be 0..1)',
    action: {
      ...baseValidAction(),
      timing: {
        ...createDefaultActionTiming(),
        level: { source: 'literal', value: 5 },
      },
    },
    expectedMessageMatch: /timing\.level literal must be a number between 0 and 1/,
  },
  {
    description: 'rejects a non-positive optional waitForConditionCount literal',
    action: {
      ...baseValidAction(),
      timing: {
        ...createDefaultActionTiming(),
        waitForConditionCount: { source: 'literal', value: 0 },
      },
    },
    expectedMessageMatch: /waitForConditionCount literal must be a positive finite number/,
  },
]

describe('Cross-compiler action validation parity', () => {
  it('compiles the smallest valid cue + effect happily (sanity check)', () => {
    expect(() => NodeCueCompiler.compileYargCue(buildCue(baseValidAction()))).not.toThrow()
    expect(() => EffectCompiler.compileYargEffect(buildEffect(baseValidAction()))).not.toThrow()
  })

  for (const testCase of PARITY_CASES) {
    it(`${testCase.description} → both compilers reject with the same message`, () => {
      const cue = buildCue(testCase.action)
      const effect = buildEffect(testCase.action)

      let cueError: Error | null = null
      let effectError: Error | null = null
      try {
        NodeCueCompiler.compileYargCue(cue)
      } catch (e) {
        cueError = e as Error
      }
      try {
        EffectCompiler.compileYargEffect(effect)
      } catch (e) {
        effectError = e as Error
      }

      expect(cueError).toBeInstanceOf(NodeCueCompilationError)
      expect(effectError).toBeInstanceOf(EffectCompilationError)
      expect(cueError?.message).toMatch(testCase.expectedMessageMatch)
      expect(effectError?.message).toMatch(testCase.expectedMessageMatch)
      expect(cueError?.message).toBe(effectError?.message)
    })
  }
})
