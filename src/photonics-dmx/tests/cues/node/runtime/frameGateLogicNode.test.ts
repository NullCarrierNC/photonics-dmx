import {
  evaluateLogicNode,
  type LogicNodeEvaluatorContext,
} from '../../../../cues/node/runtime/logicNodeEvaluator'
import type { ExecutionContext } from '../../../../cues/node/runtime/ExecutionContext'
import type { VariableValue } from '../../../../cues/node/runtime/executionTypes'
import type { FrameGateLogicNode } from '../../../../cues/types/nodeCueTypes'
import type { Connection } from '../../../../cues/types/nodeCueTypes'

/** Harness with the two ports wired to distinct target ids so we can read which branch fired. */
function harness() {
  const cueStore = new Map<string, VariableValue>()
  const context = {
    cueLevelVarStore: cueStore,
    groupLevelVarStore: new Map(),
    cueData: {},
  } as unknown as ExecutionContext
  const evalCtx: LogicNodeEvaluatorContext = {
    cueId: 'g:c',
    lightManager: {} as never,
    cueLevelVarStore: cueStore,
    groupLevelVarStore: new Map(),
    variableDefinitions: [],
    executeNode: () => {},
  }
  const edges: Connection[] = [
    { from: 'fg', to: 'fired', fromPort: 'true' },
    { from: 'fg', to: 'idle', fromPort: 'false' },
  ]
  const node: FrameGateLogicNode = {
    id: 'fg',
    type: 'logic',
    logicType: 'frame-gate',
    divisor: { source: 'literal', value: 4 },
  }
  /** Run one frame; returns 'true' if the fired branch was taken, 'false' otherwise. */
  const tick = (): 'true' | 'false' =>
    evaluateLogicNode(node, node.id, edges, context, evalCtx).includes('fired') ? 'true' : 'false'
  return { tick, cueStore }
}

describe('frame-gate logic node', () => {
  it('fires the true port every Nth evaluation and false otherwise', () => {
    const { tick } = harness()
    // divisor 4: frames 1,2,3 -> false, frame 4 -> true, 5,6,7 -> false, 8 -> true ...
    expect([tick(), tick(), tick(), tick()]).toEqual(['false', 'false', 'false', 'true'])
    expect([tick(), tick(), tick(), tick()]).toEqual(['false', 'false', 'false', 'true'])
  })

  it('keeps its counter in an internal cue-store key (no authored variable)', () => {
    const { tick, cueStore } = harness()
    tick()
    tick()
    expect(cueStore.get('__framegate_fg')?.value).toBe(2)
  })

  it('restarts the phase when the cue-store is cleared (activation reset)', () => {
    const { tick, cueStore } = harness()
    tick()
    tick()
    tick() // count 3
    cueStore.clear() // resetCueLevelVariables clears the store on activation
    // Phase restarts: three falses then a true again, not off-by-the-stale-count.
    expect([tick(), tick(), tick(), tick()]).toEqual(['false', 'false', 'false', 'true'])
  })
})
