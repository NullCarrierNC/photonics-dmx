// Controllable monotonic clock: the factory reads this `mock`-prefixed binding on every call, so
// reassigning it advances the pulse node's notion of "now" deterministically.
let mockNowMs = 0
jest.mock('../../../../../shared/time', () => ({
  monotonicNowMs: () => mockNowMs,
}))

import {
  evaluateLogicNode,
  type LogicNodeEvaluatorContext,
} from '../../../../cues/node/runtime/logicNodeEvaluator'
import type { ExecutionContext } from '../../../../cues/node/runtime/ExecutionContext'
import type { VariableValue } from '../../../../cues/node/runtime/executionTypes'
import type {
  LogicNode,
  PulseLogicNode,
  VariableDefinition,
} from '../../../../cues/types/nodeCueTypes'

/** Minimal evaluator harness: a shared cue-level var store, no lights, all vars scoped 'cue'. */
function harness(varNames: string[]) {
  const cueStore = new Map<string, VariableValue>()
  const groupStore = new Map<string, VariableValue>()
  const variableDefinitions: VariableDefinition[] = varNames.map((name) => ({
    name,
    type: 'number',
    scope: 'cue',
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
  const num = (name: string): number | undefined => cueStore.get(name)?.value as number | undefined
  return { cueStore, run, num }
}

const pulseNode = (over: Partial<PulseLogicNode> = {}): PulseLogicNode => ({
  id: 'pulse1',
  type: 'logic',
  logicType: 'pulse',
  outputs: [],
  interval: { source: 'literal', value: 500 },
  anchorVar: 'anchor',
  assignTo: 'idx',
  assignPhase: 'phase',
  ...over,
})

describe('pulse logic node', () => {
  it('captures the anchor on the first evaluation and advances index/phase with elapsed time', () => {
    const { run, num } = harness(['anchor', 'idx', 'phase'])
    const node = pulseNode()

    mockNowMs = 1000
    run(node)
    expect(num('anchor')).toBe(1000) // origin captured now
    expect(num('idx')).toBe(0)
    expect(num('phase')).toBe(0)

    mockNowMs = 1250 // +250ms = half of the 500ms interval
    run(node)
    expect(num('idx')).toBe(0)
    expect(num('phase')).toBeCloseTo(0.5)

    mockNowMs = 1500 // exactly one interval
    run(node)
    expect(num('idx')).toBe(1)
    expect(num('phase')).toBeCloseTo(0)

    mockNowMs = 2750 // 1750ms elapsed = 3.5 cycles
    run(node)
    expect(num('idx')).toBe(3)
    expect(num('phase')).toBeCloseTo(0.5)
  })

  it('derives the cycle rate from a beat-duration variable (tempo-locked)', () => {
    // 120 BPM -> 500ms beat: one cycle per 500ms.
    const at120 = harness(['anchor', 'idx', 'phase', 'beat'])
    at120.cueStore.set('beat', { type: 'number', value: 500 })
    const node120 = pulseNode({ interval: { source: 'variable', name: 'beat' } })
    mockNowMs = 10000
    at120.run(node120)
    mockNowMs = 11000 // 2 beats at 120 BPM
    at120.run(node120)
    expect(at120.num('idx')).toBe(2)

    // 240 BPM -> 250ms beat: same wall time yields twice the cycles.
    const at240 = harness(['anchor', 'idx', 'phase', 'beat'])
    at240.cueStore.set('beat', { type: 'number', value: 250 })
    const node240 = pulseNode({ interval: { source: 'variable', name: 'beat' } })
    mockNowMs = 10000
    at240.run(node240)
    mockNowMs = 11000 // 4 beats at 240 BPM
    at240.run(node240)
    expect(at240.num('idx')).toBe(4)
  })

  it('guards a zero/negative interval so the cycle math never divides by zero', () => {
    const { run, num } = harness(['anchor', 'idx', 'phase'])
    const node = pulseNode({ interval: { source: 'literal', value: 0 } })
    mockNowMs = 10000
    run(node)
    mockNowMs = 11000
    run(node)
    // Interval clamps to 1ms: index stays a finite number, not NaN/Infinity.
    expect(Number.isFinite(num('idx'))).toBe(true)
    expect(num('idx')).toBe(1000)
  })

  it('re-anchors after the anchor var is reset (cue re-activation)', () => {
    const { run, num, cueStore } = harness(['anchor', 'idx', 'phase'])
    const node = pulseNode()
    mockNowMs = 1000
    run(node)
    mockNowMs = 2000
    run(node)
    expect(num('idx')).toBe(2)

    // Simulate resetCueLevelVariables wiping cue-level state on cue-started.
    cueStore.delete('anchor')
    mockNowMs = 5000
    run(node)
    expect(num('anchor')).toBe(5000) // fresh origin
    expect(num('idx')).toBe(0)
  })

  it('is fps-independent: index/phase depend only on elapsed time, not evaluation count', () => {
    const sparse = harness(['anchor', 'idx', 'phase'])
    const node = pulseNode()
    mockNowMs = 1000
    sparse.run(node) // anchor
    mockNowMs = 1750
    sparse.run(node) // one extra frame, straight to 1750ms

    const dense = harness(['anchor', 'idx', 'phase'])
    mockNowMs = 1000
    dense.run(node) // anchor
    for (const t of [1100, 1250, 1400, 1600, 1750]) {
      mockNowMs = t
      dense.run(node) // many extra frames over the same span
    }

    expect(sparse.num('idx')).toBe(dense.num('idx'))
    expect(sparse.num('phase')).toBeCloseTo(dense.num('phase') as number)
    expect(sparse.num('idx')).toBe(1)
    expect(sparse.num('phase')).toBeCloseTo(0.5)
  })

  it('feeds wrap -> select-from-list to cycle through looks one step per interval', () => {
    const { run, num } = harness(['anchor', 'idx', 'phase', 'wrapped', 'out'])
    const pulse = pulseNode()
    const wrap: LogicNode = {
      id: 'wrap1',
      type: 'logic',
      logicType: 'math',
      outputs: [],
      operator: 'wrap',
      left: { source: 'variable', name: 'idx' },
      right: { source: 'literal', value: 3 },
      assignTo: 'wrapped',
    }
    const select: LogicNode = {
      id: 'select1',
      type: 'logic',
      logicType: 'select-from-list',
      outputs: [],
      list: [10, 20, 30],
      index: { source: 'variable', name: 'wrapped' },
      assignTo: 'out',
    }
    const step = () => {
      run(pulse)
      run(wrap)
      run(select)
    }

    mockNowMs = 10000
    step()
    expect(num('out')).toBe(10) // index 0 -> list[0]
    mockNowMs = 10500
    step()
    expect(num('out')).toBe(20) // index 1 -> list[1]
    mockNowMs = 11000
    step()
    expect(num('out')).toBe(30) // index 2 -> list[2]
    mockNowMs = 12000
    step()
    expect(num('out')).toBe(20) // index 4 -> wrap(4,3)=1 -> list[1]
  })
})
