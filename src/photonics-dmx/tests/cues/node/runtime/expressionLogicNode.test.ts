import {
  evaluateLogicNode,
  type LogicNodeEvaluatorContext,
} from '../../../../cues/node/runtime/logicNodeEvaluator'
import type { ExecutionContext } from '../../../../cues/node/runtime/ExecutionContext'
import type { VariableValue } from '../../../../cues/node/runtime/executionTypes'
import type { ExpressionLogicNode, LogicNode } from '../../../../cues/types/nodeCueTypes'

/** Minimal evaluator harness: a shared cue-level var store, all vars scoped 'cue' (number). */
function harness(vars: Record<string, number>) {
  const cueStore = new Map<string, VariableValue>()
  const groupStore = new Map<string, VariableValue>()
  for (const [name, value] of Object.entries(vars)) cueStore.set(name, { type: 'number', value })
  const variableDefinitions = Object.keys(vars).map((name) => ({
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
    mode: 'yarg',
    lightManager: {} as never,
    cueLevelVarStore: cueStore,
    groupLevelVarStore: groupStore,
    variableDefinitions,
    executeNode: () => {},
  }
  const run = (node: LogicNode) => evaluateLogicNode(node, node.id, [], context, evalCtx)
  const num = (name: string): number | undefined => cueStore.get(name)?.value as number | undefined
  return { run, num }
}

const exprNode = (expression: string, assignTo = 'out'): ExpressionLogicNode => ({
  id: 'expr1',
  type: 'logic',
  logicType: 'expression',
  expression,
  assignTo,
})

describe('expression logic node (evaluator integration)', () => {
  it('writes the computed value to assignTo, resolving variables from the store', () => {
    // The shuffle progress lerp collapses a subtract + multiply + add chain into one node.
    const { run, num } = harness({ a: 0.2, b: 0.8, t: 0.5, p: 0 })
    run(exprNode('a + (b - a) * t', 'p'))
    expect(num('p')).toBeCloseTo(0.5)
  })

  it('supports functions and wrap parity with the math node', () => {
    const { run, num } = harness({ pick: 3, dir: 1, n: -1, vsel: 0, w: 0 })
    run(exprNode('pick * 2 + dir', 'vsel'))
    expect(num('vsel')).toBe(7)
    run(exprNode('wrap(n, 4)', 'w'))
    expect(num('w')).toBe(3)
  })

  it('resolves an undeclared/absent variable as 0 (does not crash the frame)', () => {
    const { run, num } = harness({ r: 0 })
    run(exprNode('missing + 5', 'r'))
    expect(num('r')).toBe(5)
  })

  it('leaves the target unchanged on a parse error instead of throwing', () => {
    const { run, num } = harness({ x: 1, r: 42 })
    expect(() => run(exprNode('x + ', 'r'))).not.toThrow()
    expect(num('r')).toBe(42) // parse error skipped the write; the prior value stands
  })
})
