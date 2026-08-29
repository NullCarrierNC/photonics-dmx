import { collectEventReferencesFromFlow, collectVariableReferences } from './graphReferences'
import type { EditorNode, EditorNodeData } from './types'
import type {
  ActionNode,
  EffectRaiserNode,
  EventListenerNode,
  EventRaiserNode,
  LogicNode,
} from '../../../../../photonics-dmx/cues/types/nodeCueTypes'

function node(
  id: string,
  data: Partial<EditorNodeData> & Pick<EditorNodeData, 'kind'>,
): EditorNode {
  return {
    id,
    position: { x: 0, y: 0 },
    data: { label: '', payload: {}, ...data } as EditorNodeData,
  } as EditorNode
}

const fromVariable = (name: string) => ({ source: 'variable' as const, name })

describe('collectVariableReferences', () => {
  it('reports an action node field fed from the variable, with the field that holds it', () => {
    const action = { target: { groups: fromVariable('colour') } } as unknown as ActionNode
    const nodes = [node('action-1', { kind: 'action', payload: action, label: 'Wash' })]

    expect(collectVariableReferences(nodes, 'colour')).toEqual([
      'Action Node action-1 "Wash" (target.groups)',
    ])
  })

  it('omits the label suffix when the node has none', () => {
    const action = { layer: fromVariable('depth') } as unknown as ActionNode
    const nodes = [node('action-1', { kind: 'action', payload: action })]

    expect(collectVariableReferences(nodes, 'depth')).toEqual(['Action Node action-1 (layer)'])
  })

  it('ignores a field holding a literal rather than the variable', () => {
    const action = {
      layer: { source: 'literal', value: 3 },
      color: { name: fromVariable('other') },
    } as unknown as ActionNode
    const nodes = [node('action-1', { kind: 'action', payload: action })]

    expect(collectVariableReferences(nodes, 'depth')).toEqual([])
  })

  it('reports a logic node that assigns to the variable, naming its logic type', () => {
    const logic = { logicType: 'math', assignTo: 'depth' } as unknown as LogicNode
    const nodes = [node('logic-1', { kind: 'logic', payload: logic })]

    expect(collectVariableReferences(nodes, 'depth')).toEqual([
      'Logic Node (math) logic-1 (assignTo)',
    ])
  })

  it('reports a variable read inside an expression', () => {
    const logic = {
      logicType: 'expression',
      expression: 'beat * 2 + offset',
      assignTo: 'result',
    } as unknown as LogicNode
    const nodes = [node('logic-1', { kind: 'logic', payload: logic })]

    expect(collectVariableReferences(nodes, 'offset')).toEqual([
      'Logic Node (expression) logic-1 (expression)',
    ])
    expect(collectVariableReferences(nodes, 'result')).toEqual([
      'Logic Node (expression) logic-1 (assignTo)',
    ])
  })

  it('reports an effect raiser parameter bound to the variable, naming the parameter', () => {
    const raiser = {
      parameterValues: { speed: fromVariable('bpm'), colour: { source: 'literal', value: 'red' } },
    } as unknown as EffectRaiserNode
    const nodes = [node('raiser-1', { kind: 'effect-raiser', payload: raiser })]

    expect(collectVariableReferences(nodes, 'bpm')).toEqual([
      'Effect Raiser Node raiser-1 (parameterValues.speed)',
    ])
  })

  it('collects every reference across nodes and fields', () => {
    const action = {
      layer: fromVariable('shared'),
      color: { opacity: fromVariable('shared') },
    } as unknown as ActionNode
    const logic = { logicType: 'variable', varName: 'shared' } as unknown as LogicNode
    const nodes = [
      node('action-1', { kind: 'action', payload: action }),
      node('logic-1', { kind: 'logic', payload: logic }),
    ]

    expect(collectVariableReferences(nodes, 'shared')).toEqual([
      'Action Node action-1 (color.opacity)',
      'Action Node action-1 (layer)',
      'Logic Node (variable) logic-1 (varName)',
    ])
  })

  it('returns nothing for a variable no node mentions', () => {
    const action = { layer: fromVariable('depth') } as unknown as ActionNode
    const nodes = [node('action-1', { kind: 'action', payload: action })]

    expect(collectVariableReferences(nodes, 'unused')).toEqual([])
    expect(collectVariableReferences([], 'depth')).toEqual([])
  })
})

describe('collectEventReferencesFromFlow', () => {
  it('reports unsaved raisers and listeners on the live canvas', () => {
    const raiser = { id: 'r-live', eventName: 'drop', label: 'Live Drop' } as EventRaiserNode
    const listener = { id: 'l-live', eventName: 'drop' } as EventListenerNode
    const nodes = [
      node('r-live', { kind: 'event-raiser', payload: raiser }),
      node('l-live', { kind: 'event-listener', payload: listener }),
    ]

    expect(collectEventReferencesFromFlow(nodes, 'drop')).toEqual([
      'Event Raiser: Live Drop',
      'Event Listener: l-live',
    ])
  })

  it('returns nothing when the canvas has no matching event nodes', () => {
    const raiser = { id: 'r1', eventName: 'other' } as EventRaiserNode
    const nodes = [node('r1', { kind: 'event-raiser', payload: raiser })]

    expect(collectEventReferencesFromFlow(nodes, 'drop')).toEqual([])
  })
})
