import { describe, expect, it } from '@jest/globals'
import {
  evaluateLogicNode,
  type LogicNodeEvaluatorContext,
} from '../../../../cues/node/runtime/logicNodeEvaluator'
import { ExecutionContext } from '../../../../cues/node/runtime/ExecutionContext'
import type { VariableValue } from '../../../../cues/node/runtime/executionTypes'
import type { CueData } from '../../../../cues/types/cueTypes'
import type {
  Connection,
  LogicNode,
  NetEventNode,
  ValueSource,
  VariableDefinition,
} from '../../../../cues/types/nodeCueTypes'
import { UnknownValueWarnings } from '../../../../cues/node/runtime/valueResolver'

function harness() {
  const cueStore = new Map<string, VariableValue>()
  const groupStore = new Map<string, VariableValue>()
  const variableDefinitions: VariableDefinition[] = [
    { name: 'c', type: 'color', scope: 'cue', initialValue: 'white' },
    { name: 's', type: 'string', scope: 'cue', initialValue: '' },
  ]
  const ev: NetEventNode = { id: 'ev', type: 'event', eventType: 'beat' }
  const context = new ExecutionContext(
    ev,
    {} as CueData,
    cueStore,
    groupStore,
    new UnknownValueWarnings('test'),
  )
  const evalCtx: LogicNodeEvaluatorContext = {
    cueId: 'g:c',
    mode: 'yarg',
    cueLevelVarStore: cueStore,
    groupLevelVarStore: groupStore,
    variableDefinitions,
    executeNode: () => {},
  }
  const run = (node: LogicNode, edges: Connection[] = []) =>
    evaluateLogicNode(node, node.id, edges, context, evalCtx)
  return { run, cueStore }
}

const setColor = (value: ValueSource): LogicNode => ({
  id: 'set',
  type: 'logic',
  logicType: 'variable',
  mode: 'set',
  varName: 'c',
  valueType: 'color',
  value,
})

const compareWith = (left: ValueSource, right: ValueSource): LogicNode => ({
  id: 'cond',
  type: 'logic',
  logicType: 'conditional',
  comparator: '==',
  left,
  right,
})

const branches: Connection[] = [
  { from: 'cond', to: 'matched', fromPort: 'true' },
  { from: 'cond', to: 'missed', fromPort: 'false' },
]

describe('colour variable logic nodes', () => {
  it('stores a known colour a set node writes', () => {
    const { run, cueStore } = harness()
    run(setColor({ source: 'literal', value: 'red' }))
    expect(cueStore.get('c')).toEqual({ type: 'color', value: 'red' })
  })

  it('stores blue for an unknown colour a set node writes', () => {
    const { run, cueStore } = harness()
    run(setColor({ source: 'literal', value: 'mauve' }))
    expect(cueStore.get('c')).toEqual({ type: 'color', value: 'blue' })
  })

  it('stores blue when set from a string variable that holds no colour', () => {
    const { run, cueStore } = harness()
    cueStore.set('s', { type: 'string', value: 'mauve' })
    run(setColor({ source: 'variable', name: 's' }))
    expect(cueStore.get('c')).toEqual({ type: 'color', value: 'blue' })
  })

  it('compares a colour variable set from an unknown colour as blue', () => {
    const { run } = harness()
    run(setColor({ source: 'literal', value: 'mauve' }))
    const next = run(
      compareWith({ source: 'variable', name: 'c' }, { source: 'literal', value: 'blue' }),
      branches,
    )
    expect(next).toEqual(['matched'])
  })

  it.each([
    ['right', { source: 'variable', name: 'c' }, { source: 'literal', value: 'mauve' }],
    ['left', { source: 'literal', value: 'mauve' }, { source: 'variable', name: 'c' }],
  ] as const)(
    'compares an unknown colour on the %s of a colour variable as blue',
    (_side, left, right) => {
      const { run } = harness()
      run(setColor({ source: 'literal', value: 'blue' }))
      expect(run(compareWith(left, right), branches)).toEqual(['matched'])
    },
  )
})
