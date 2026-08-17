import {
  evaluateLogicNode,
  type LogicNodeEvaluatorContext,
} from '../../../../cues/node/runtime/logicNodeEvaluator'
import type { ExecutionContext } from '../../../../cues/node/runtime/ExecutionContext'
import type { VariableValue } from '../../../../cues/node/runtime/executionTypes'
import type { IndexedVariableLogicNode, LogicNode } from '../../../../cues/types/nodeCueTypes'

/** Declares the listed cue-scoped variables (so slot and target writes route to the cue store). */
function harness(declared: string[]) {
  const cueStore = new Map<string, VariableValue>()
  const groupStore = new Map<string, VariableValue>()
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
    mode: 'yarg',
    lightManager: {} as never,
    cueLevelVarStore: cueStore,
    groupLevelVarStore: groupStore,
    variableDefinitions,
    executeNode: () => {},
  }
  const run = (node: LogicNode) => evaluateLogicNode(node, node.id, [], context, evalCtx)
  const raw = (name: string): VariableValue | undefined => cueStore.get(name)
  const seedNumber = (name: string, value: number) => cueStore.set(name, { type: 'number', value })
  return { run, raw, seedNumber }
}

const setSlot = (varName: string, index: number, value: number): IndexedVariableLogicNode => ({
  id: 'ix',
  type: 'logic',
  logicType: 'indexed-variable',
  mode: 'set',
  varName,
  index: { source: 'literal', value: index },
  valueType: 'number',
  value: { source: 'literal', value },
})

const getSlot = (varName: string, index: number, assignTo: string): IndexedVariableLogicNode => ({
  id: 'ix',
  type: 'logic',
  logicType: 'indexed-variable',
  mode: 'get',
  varName,
  index: { source: 'literal', value: index },
  valueType: 'number',
  assignTo,
})

describe('indexed-variable logic node', () => {
  it('writes each slot under a `${varName}#${index}` key without colliding', () => {
    const { run, raw } = harness(['lit'])
    run(setSlot('lit', 3, 1))
    run(setSlot('lit', 5, 1))
    expect(raw('lit#3')).toEqual({ type: 'number', value: 1 })
    expect(raw('lit#5')).toEqual({ type: 'number', value: 1 })
    // The base name itself is never written.
    expect(raw('lit')).toBeUndefined()
  })

  it('reads a set slot back into assignTo', () => {
    const { run, raw } = harness(['lit', 'out'])
    run(setSlot('lit', 2, 7))
    run(getSlot('lit', 2, 'out'))
    expect(raw('out')).toEqual({ type: 'number', value: 7 })
  })

  it('get on an empty slot writes the type zero (not a stale value)', () => {
    const { run, raw } = harness(['lit', 'out'])
    run(setSlot('lit', 2, 9)) // a DIFFERENT slot is set
    run(getSlot('lit', 4, 'out')) // slot 4 was never set
    expect(raw('out')).toEqual({ type: 'number', value: 0 })
  })

  it('resolves the index from a variable', () => {
    const { run, raw, seedNumber } = harness(['lit', 'i', 'out'])
    seedNumber('i', 6)
    run({
      id: 'ix',
      type: 'logic',
      logicType: 'indexed-variable',
      mode: 'set',
      varName: 'lit',
      index: { source: 'variable', name: 'i' },
      valueType: 'number',
      value: { source: 'literal', value: 1 },
    })
    expect(raw('lit#6')).toEqual({ type: 'number', value: 1 })
    run(getSlot('lit', 6, 'out'))
    expect(raw('out')).toEqual({ type: 'number', value: 1 })
  })

  it('get on an empty light-array slot writes [] (not a string that would crash .map)', () => {
    const { run, raw } = harness(['group', 'out'])
    run({
      id: 'ix',
      type: 'logic',
      logicType: 'indexed-variable',
      mode: 'get',
      varName: 'group',
      index: { source: 'literal', value: 0 },
      valueType: 'light-array',
      assignTo: 'out',
    })
    expect(raw('out')).toEqual({ type: 'light-array', value: [] })
  })

  it('get on an empty colour slot writes the transparent zero', () => {
    const { run, raw } = harness(['litColor', 'out'])
    run({
      id: 'ix',
      type: 'logic',
      logicType: 'indexed-variable',
      mode: 'get',
      varName: 'litColor',
      index: { source: 'literal', value: 0 },
      valueType: 'color',
      assignTo: 'out',
    })
    expect(raw('out')).toEqual({ type: 'color', value: 'transparent' })
  })

  it('coerces a NaN index to slot 0 rather than a #NaN junk slot', () => {
    const { run, raw, seedNumber } = harness(['lit', 'bad'])
    seedNumber('bad', NaN)
    run({
      id: 'ix',
      type: 'logic',
      logicType: 'indexed-variable',
      mode: 'set',
      varName: 'lit',
      index: { source: 'variable', name: 'bad' },
      valueType: 'number',
      value: { source: 'literal', value: 1 },
    })
    expect(raw('lit#0')).toEqual({ type: 'number', value: 1 })
    expect(raw('lit#NaN')).toBeUndefined()
  })
})
