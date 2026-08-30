/**
 * A rig with no lights in a group is a valid setup, so a node reading that group resolves to
 * nothing usable on every pass. These tests cover the once-per-rig warning, its per-rig
 * attribution, and evaluation carrying on to the downstream nodes.
 */
import { jest } from '@jest/globals'
import {
  evaluateLogicNode,
  type LogicNodeEvaluatorContext,
} from '../../../../cues/node/runtime/logicNodeEvaluator'
import type { ExecutionContext } from '../../../../cues/node/runtime/ExecutionContext'
import type { VariableValue } from '../../../../cues/node/runtime/executionTypes'
import type { DmxLightManager } from '../../../../controllers/DmxLightManager'
import type { Connection, LightsFromIndexLogicNode } from '../../../../cues/types/nodeCueTypes'

/** Evaluator wired to one cue, with `backLights` declared and left empty. */
function harness(options: { cueId?: string; rigLabel?: string; rigId?: string } = {}) {
  const cueStore = new Map<string, VariableValue>()
  const groupStore = new Map<string, VariableValue>()
  cueStore.set('backLights', { type: 'light-array', value: [] })

  const context = {
    cueLevelVarStore: cueStore,
    groupLevelVarStore: groupStore,
    cueData: {},
  } as unknown as ExecutionContext

  const evalCtx: LogicNodeEvaluatorContext = {
    cueId: options.cueId ?? 'yarg-fade:cue-fade-frenzy',
    mode: 'yarg',
    lightManager: {
      rigLabel: options.rigLabel ?? '',
      rigId: options.rigId ?? '',
    } as unknown as DmxLightManager,
    cueLevelVarStore: cueStore,
    groupLevelVarStore: groupStore,
    variableDefinitions: [
      { name: 'backLights', type: 'light-array', scope: 'cue', initialValue: [] },
      { name: 'curBpick', type: 'light-array', scope: 'cue', initialValue: [] },
    ],
    executeNode: () => {},
  }

  const edges: Connection[] = [{ from: 'bpick', to: 'downstream' }]
  const run = (nodeId: string) =>
    evaluateLogicNode(pickFromEmpty(nodeId), nodeId, edges, context, evalCtx)
  return { run }
}

const pickFromEmpty = (id: string): LightsFromIndexLogicNode => ({
  id,
  type: 'logic',
  logicType: 'lights-from-index',
  sourceVariable: 'backLights',
  index: { source: 'literal', value: 0 },
  assignTo: 'curBpick',
})

describe('lights-from-index against an empty group', () => {
  let warn: jest.SpiedFunction<typeof console.warn>

  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warn.mockRestore()
  })

  it('warns once however many times the node runs', () => {
    // Distinct node ids per test keep the module-level once-only set from crossing tests.
    const { run } = harness()

    run('warn-once-node')
    run('warn-once-node')
    run('warn-once-node')

    const emptyWarnings = warn.mock.calls.filter((call) =>
      String(call[0]).includes('source array is empty'),
    )
    expect(emptyWarnings).toHaveLength(1)
  })

  it('continues to the downstream nodes on every pass', () => {
    const { run } = harness()

    expect(run('continues-node')).toEqual(['downstream'])
    expect(run('continues-node')).toEqual(['downstream'])
  })

  it('warns separately for each rig and names the rig', () => {
    harness({ rigId: 'rig-a', rigLabel: 'Mix RGB&MH' }).run('per-rig-node')
    harness({ rigId: 'rig-b', rigLabel: '4 lights' }).run('per-rig-node')

    const emptyWarnings = warn.mock.calls
      .map((call) => String(call[0]))
      .filter((message) => message.includes('source array is empty'))

    expect(emptyWarnings).toHaveLength(2)
    expect(emptyWarnings[0]).toContain('[rig: Mix RGB&MH]')
    expect(emptyWarnings[1]).toContain('[rig: 4 lights]')
  })

  it('warns for both rigs when two rigs share a name', () => {
    // Rig names are not unique, so suppression keys on the id.
    harness({ rigId: 'rig-a', rigLabel: 'My Rig' }).run('shared-name-node')
    harness({ rigId: 'rig-b', rigLabel: 'My Rig' }).run('shared-name-node')

    const emptyWarnings = warn.mock.calls
      .map((call) => String(call[0]))
      .filter((message) => message.includes('source array is empty'))

    expect(emptyWarnings).toHaveLength(2)
  })
})
