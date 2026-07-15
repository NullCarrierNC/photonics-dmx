import {
  evaluateLogicNode,
  type LogicNodeEvaluatorContext,
} from '../../../../cues/node/runtime/logicNodeEvaluator'
import type { ExecutionContext } from '../../../../cues/node/runtime/ExecutionContext'
import type { VariableValue } from '../../../../cues/node/runtime/executionTypes'
import type {
  RandomLogicNode,
  VariableLogicNode,
  LogicNode,
} from '../../../../cues/types/nodeCueTypes'

/**
 * Harness that declares a set of cue-scoped variables (so writes route to the cue store) but only
 * pre-seeds the values passed in `seed`. Lets us test init-when-absent without every declared var
 * already being present.
 */
function harness(declared: string[], seed: Record<string, VariableValue> = {}) {
  const cueStore = new Map<string, VariableValue>()
  const groupStore = new Map<string, VariableValue>()
  for (const [name, value] of Object.entries(seed)) cueStore.set(name, value)
  const variableDefinitions = declared.map((name) => ({
    name,
    type: 'number' as const,
    scope: 'cue' as const,
    initialValue: 0,
  }))
  const context = {
    cueLevelVarStore: cueStore,
    groupLevelVarStore: groupStore,
    cueData: {},
  } as unknown as ExecutionContext
  const evalCtx: LogicNodeEvaluatorContext = {
    cueId: 'g:c',
    lightManager: {} as never,
    cueLevelVarStore: cueStore,
    groupLevelVarStore: groupStore,
    variableDefinitions,
    executeNode: () => {},
  }
  const run = (node: LogicNode) => evaluateLogicNode(node, node.id, [], context, evalCtx)
  const val = (name: string): VariableValue | undefined => cueStore.get(name)
  return { run, val }
}

describe('multi-set variable node', () => {
  it('sets every listed assignment in one node', () => {
    const { run, val } = harness(['a', 'b', 'c'])
    const node: VariableLogicNode = {
      id: 'v1',
      type: 'logic',
      logicType: 'variable',
      mode: 'set',
      varName: 'ignored',
      valueType: 'number',
      assignments: [
        { varName: 'a', valueType: 'number', value: { source: 'literal', value: 1 } },
        { varName: 'b', valueType: 'string', value: { source: 'literal', value: 'hi' } },
        { varName: 'c', valueType: 'boolean', value: { source: 'literal', value: true } },
      ],
    }
    run(node)
    expect(val('a')).toEqual({ type: 'number', value: 1 })
    expect(val('b')).toEqual({ type: 'string', value: 'hi' })
    expect(val('c')).toEqual({ type: 'boolean', value: true })
    // The single-var fields are ignored when assignments is present.
    expect(val('ignored')).toBeUndefined()
  })

  it('still honours the legacy single-var fields when no assignments are given', () => {
    const { run, val } = harness(['solo'])
    const node: VariableLogicNode = {
      id: 'v2',
      type: 'logic',
      logicType: 'variable',
      mode: 'set',
      varName: 'solo',
      valueType: 'number',
      value: { source: 'literal', value: 42 },
    }
    run(node)
    expect(val('solo')).toEqual({ type: 'number', value: 42 })
  })

  it('init mode only writes assignments that are absent', () => {
    const { run, val } = harness(['present', 'absent'], {
      present: { type: 'number', value: 7 },
    })
    const node: VariableLogicNode = {
      id: 'v3',
      type: 'logic',
      logicType: 'variable',
      mode: 'init',
      varName: 'ignored',
      valueType: 'number',
      assignments: [
        { varName: 'present', valueType: 'number', value: { source: 'literal', value: 99 } },
        { varName: 'absent', valueType: 'number', value: { source: 'literal', value: 5 } },
      ],
    }
    run(node)
    expect(val('present')).toEqual({ type: 'number', value: 7 }) // untouched
    expect(val('absent')).toEqual({ type: 'number', value: 5 }) // seeded
  })
})

describe('multi-roll random node', () => {
  it('performs every roll into its own assignTo', () => {
    const { run, val } = harness(['x', 'y', 'pick'])
    // Degenerate ranges (min == max) make the integer rolls deterministic; a one-element choices
    // list makes the choice roll deterministic.
    const node: RandomLogicNode = {
      id: 'r1',
      type: 'logic',
      logicType: 'random',
      mode: 'random-integer',
      assignTo: 'unused',
      rolls: [
        {
          mode: 'random-integer',
          assignTo: 'x',
          min: { source: 'literal', value: 3 },
          max: { source: 'literal', value: 3 },
        },
        {
          mode: 'random-integer',
          assignTo: 'y',
          min: { source: 'literal', value: 8 },
          max: { source: 'literal', value: 8 },
        },
        { mode: 'random-choice', assignTo: 'pick', choices: ['only'] },
      ],
    }
    run(node)
    expect(val('x')).toEqual({ type: 'number', value: 3 })
    expect(val('y')).toEqual({ type: 'number', value: 8 })
    expect(val('pick')).toEqual({ type: 'string', value: 'only' })
    // Top-level assignTo is not rolled when rolls is present.
    expect(val('unused')).toBeUndefined()
  })

  it('still performs the single legacy roll when no rolls are given', () => {
    const { run, val } = harness(['n'])
    const node: RandomLogicNode = {
      id: 'r2',
      type: 'logic',
      logicType: 'random',
      mode: 'random-integer',
      assignTo: 'n',
      min: { source: 'literal', value: 4 },
      max: { source: 'literal', value: 4 },
    }
    run(node)
    expect(val('n')).toEqual({ type: 'number', value: 4 })
  })
})
