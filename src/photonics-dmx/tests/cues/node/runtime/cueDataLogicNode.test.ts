import {
  evaluateLogicNode,
  type LogicNodeEvaluatorContext,
} from '../../../../cues/node/runtime/logicNodeEvaluator'
import { ExecutionContext } from '../../../../cues/node/runtime/ExecutionContext'
import type { VariableValue } from '../../../../cues/node/runtime/executionTypes'
import { UnknownValueWarnings } from '../../../../cues/node/runtime/valueResolver'
import type { CueData } from '../../../../cues/types/cueTypes'
import type {
  CueDataLogicNode,
  NetEventNode,
  NodeCueMode,
} from '../../../../cues/types/nodeCueTypes'

/** Reads `property` from a frame carrying none of the net fields, and returns what it stored. */
function readFromEmptyFrame(
  property: CueDataLogicNode['dataProperty'],
  mode: NodeCueMode = 'yarg',
): VariableValue | undefined {
  const cueStore = new Map<string, VariableValue>()
  const groupStore = new Map<string, VariableValue>()
  const ev: NetEventNode = { id: 'ev', type: 'event', eventType: 'beat' }
  const context = new ExecutionContext(
    ev,
    {} as CueData,
    cueStore,
    groupStore,
    new UnknownValueWarnings('cue'),
  )
  const evalCtx: LogicNodeEvaluatorContext = {
    cueId: 'cue',
    mode,
    cueLevelVarStore: cueStore,
    groupLevelVarStore: groupStore,
    variableDefinitions: [{ name: 'held', type: 'string', scope: 'cue', initialValue: '' }],
    executeNode: () => {},
  }
  const node: CueDataLogicNode = {
    id: 'read',
    type: 'logic',
    logicType: 'cue-data',
    dataProperty: property,
    assignTo: 'held',
  }
  evaluateLogicNode(node, node.id, [], context, evalCtx)
  return cueStore.get('held')
}

describe('cue-data read of a field the frame lacks', () => {
  it('stores empty text for a text property', () => {
    expect(readFromEmptyFrame('song-section')).toEqual({ type: 'string', value: '' })
    expect(readFromEmptyFrame('venue-size', 'rb3')).toEqual({ type: 'string', value: '' })
  })

  it('stores 0 for a count', () => {
    expect(readFromEmptyFrame('bass-note-count')).toEqual({ type: 'number', value: 0 })
  })

  it('stores false for a flag', () => {
    expect(readFromEmptyFrame('fog-state')).toEqual({ type: 'boolean', value: false })
  })
})
