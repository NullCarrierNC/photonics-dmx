import type { EditorNode } from './types'
import type {
  ActionNode,
  EffectRaiserNode,
  EventListenerNode,
  EventRaiserNode,
  LogicNode,
  ValueSource,
} from '../../../../../photonics-dmx/cues/types/nodeCueTypes'
import { expressionVariables } from '../../../../../photonics-dmx/cues/node/runtime/expressionEvaluator'

/**
 * Every place `varName` is read in the open graph, as display strings for the variable registry.
 *
 * Reports the node kind, its id, its label when it has one, and which field on the node holds the
 * reference, so a variable rename or delete can show exactly what it would break.
 */
export function collectVariableReferences(nodes: EditorNode[], varName: string): string[] {
  const references: string[] = []
  const addReference = (nodeType: string, nodeId: string, label?: string, detail?: string) => {
    const labelSuffix = label ? ` "${label}"` : ''
    const detailSuffix = detail ? ` (${detail})` : ''
    references.push(`${nodeType} ${nodeId}${labelSuffix}${detailSuffix}`)
  }
  const checkValueSource = (
    source: ValueSource | undefined,
    nodeType: string,
    nodeId: string,
    nodeLabel: string | undefined,
    detail: string,
  ) => {
    if (source?.source === 'variable' && source.name === varName) {
      addReference(nodeType, nodeId, nodeLabel, detail)
    }
  }
  const checkVarName = (
    name: string | undefined,
    nodeType: string,
    nodeId: string,
    nodeLabel: string | undefined,
    detail: string,
  ) => {
    if (name === varName) {
      addReference(nodeType, nodeId, nodeLabel, detail)
    }
  }

  for (const node of nodes) {
    const nodeId = node.id
    const nodeLabel = typeof node.data.label === 'string' ? node.data.label : undefined
    if (node.data.kind === 'action') {
      const action = node.data.payload as ActionNode
      const nodeType = 'Action Node'
      checkValueSource(action.target?.groups, nodeType, nodeId, nodeLabel, 'target.groups')
      checkValueSource(action.target?.filter, nodeType, nodeId, nodeLabel, 'target.filter')
      checkValueSource(action.color?.name, nodeType, nodeId, nodeLabel, 'color.name')
      checkValueSource(action.color?.brightness, nodeType, nodeId, nodeLabel, 'color.brightness')
      checkValueSource(action.color?.blendMode, nodeType, nodeId, nodeLabel, 'color.blendMode')
      checkValueSource(action.color?.opacity, nodeType, nodeId, nodeLabel, 'color.opacity')
      checkValueSource(action.layer, nodeType, nodeId, nodeLabel, 'layer')
      if (action.timing) {
        checkValueSource(
          action.timing.waitForTime,
          nodeType,
          nodeId,
          nodeLabel,
          'timing.waitForTime',
        )
        checkValueSource(
          action.timing.waitForConditionCount,
          nodeType,
          nodeId,
          nodeLabel,
          'timing.waitForConditionCount',
        )
        checkValueSource(action.timing.duration, nodeType, nodeId, nodeLabel, 'timing.duration')
        checkValueSource(
          action.timing.waitUntilTime,
          nodeType,
          nodeId,
          nodeLabel,
          'timing.waitUntilTime',
        )
        checkValueSource(
          action.timing.waitUntilConditionCount,
          nodeType,
          nodeId,
          nodeLabel,
          'timing.waitUntilConditionCount',
        )
        checkValueSource(action.timing.level, nodeType, nodeId, nodeLabel, 'timing.level')
        checkValueSource(action.timing.easing, nodeType, nodeId, nodeLabel, 'timing.easing')
      }
    }

    if (node.data.kind === 'logic') {
      const logicNode = node.data.payload as LogicNode
      const nodeType = `Logic Node (${logicNode.logicType})`
      switch (logicNode.logicType) {
        case 'variable':
          checkVarName(logicNode.varName, nodeType, nodeId, nodeLabel, 'varName')
          checkValueSource(logicNode.value, nodeType, nodeId, nodeLabel, 'value')
          for (const assignment of logicNode.assignments ?? []) {
            checkVarName(assignment.varName, nodeType, nodeId, nodeLabel, 'assignments.varName')
            checkValueSource(assignment.value, nodeType, nodeId, nodeLabel, 'assignments.value')
          }
          break
        case 'math':
          checkValueSource(logicNode.left, nodeType, nodeId, nodeLabel, 'left')
          checkValueSource(logicNode.right, nodeType, nodeId, nodeLabel, 'right')
          checkVarName(logicNode.assignTo, nodeType, nodeId, nodeLabel, 'assignTo')
          break
        case 'conditional':
          checkValueSource(logicNode.left, nodeType, nodeId, nodeLabel, 'left')
          checkValueSource(logicNode.right, nodeType, nodeId, nodeLabel, 'right')
          break
        case 'cue-data':
        case 'config-data':
          checkVarName(logicNode.assignTo, nodeType, nodeId, nodeLabel, 'assignTo')
          break
        case 'lights-from-index':
          checkVarName(logicNode.sourceVariable, nodeType, nodeId, nodeLabel, 'sourceVariable')
          checkValueSource(logicNode.index, nodeType, nodeId, nodeLabel, 'index')
          checkVarName(logicNode.assignTo, nodeType, nodeId, nodeLabel, 'assignTo')
          break
        case 'color-from-index':
          checkValueSource(logicNode.colors, nodeType, nodeId, nodeLabel, 'colors')
          checkValueSource(logicNode.index, nodeType, nodeId, nodeLabel, 'index')
          checkVarName(logicNode.assignTo, nodeType, nodeId, nodeLabel, 'assignTo')
          break
        case 'array-length':
        case 'reverse-lights':
        case 'create-pairs':
        case 'reverse-colors':
        case 'shuffle-colors':
          checkVarName(logicNode.sourceVariable, nodeType, nodeId, nodeLabel, 'sourceVariable')
          checkVarName(logicNode.assignTo, nodeType, nodeId, nodeLabel, 'assignTo')
          break
        case 'concat-lights':
        case 'concat-colors':
          for (const sourceVar of logicNode.sourceVariables ?? []) {
            checkVarName(sourceVar, nodeType, nodeId, nodeLabel, 'sourceVariables')
          }
          checkVarName(logicNode.assignTo, nodeType, nodeId, nodeLabel, 'assignTo')
          break
        case 'build-ring':
          checkVarName(logicNode.assignTo, nodeType, nodeId, nodeLabel, 'assignTo')
          checkVarName(logicNode.assignGroupSize, nodeType, nodeId, nodeLabel, 'assignGroupSize')
          break
        case 'delay':
          checkValueSource(logicNode.delayTime, nodeType, nodeId, nodeLabel, 'delayTime')
          break
        case 'debugger':
          checkValueSource(logicNode.message, nodeType, nodeId, nodeLabel, 'message')
          for (const loggedVar of logicNode.variablesToLog ?? []) {
            checkVarName(loggedVar, nodeType, nodeId, nodeLabel, 'variablesToLog')
          }
          break
        case 'expression':
          for (const usedVar of expressionVariables(logicNode.expression)) {
            checkVarName(usedVar, nodeType, nodeId, nodeLabel, 'expression')
          }
          checkVarName(logicNode.assignTo, nodeType, nodeId, nodeLabel, 'assignTo')
          break
        case 'clamp':
          checkValueSource(logicNode.value, nodeType, nodeId, nodeLabel, 'value')
          checkValueSource(logicNode.min, nodeType, nodeId, nodeLabel, 'min')
          checkValueSource(logicNode.max, nodeType, nodeId, nodeLabel, 'max')
          checkVarName(logicNode.assignTo, nodeType, nodeId, nodeLabel, 'assignTo')
          break
        case 'select-from-list':
          checkValueSource(logicNode.index, nodeType, nodeId, nodeLabel, 'index')
          checkVarName(logicNode.assignTo, nodeType, nodeId, nodeLabel, 'assignTo')
          break
        case 'pulse':
          checkValueSource(logicNode.interval, nodeType, nodeId, nodeLabel, 'interval')
          checkVarName(logicNode.anchorVar, nodeType, nodeId, nodeLabel, 'anchorVar')
          checkVarName(logicNode.assignTo, nodeType, nodeId, nodeLabel, 'assignTo')
          checkVarName(logicNode.assignPhase, nodeType, nodeId, nodeLabel, 'assignPhase')
          break
        case 'frame-gate':
          checkValueSource(logicNode.divisor, nodeType, nodeId, nodeLabel, 'divisor')
          break
        case 'tempo':
          checkVarName(logicNode.assignBeatMs, nodeType, nodeId, nodeLabel, 'assignBeatMs')
          checkVarName(logicNode.assignBarMs, nodeType, nodeId, nodeLabel, 'assignBarMs')
          checkVarName(logicNode.assignPhraseMs, nodeType, nodeId, nodeLabel, 'assignPhraseMs')
          checkVarName(logicNode.assignCycles, nodeType, nodeId, nodeLabel, 'assignCycles')
          checkValueSource(logicNode.beatsPerBar, nodeType, nodeId, nodeLabel, 'beatsPerBar')
          checkValueSource(logicNode.barsPerPhrase, nodeType, nodeId, nodeLabel, 'barsPerPhrase')
          checkValueSource(logicNode.minBeatMs, nodeType, nodeId, nodeLabel, 'minBeatMs')
          checkValueSource(logicNode.maxBeatMs, nodeType, nodeId, nodeLabel, 'maxBeatMs')
          checkValueSource(logicNode.fallbackBeatMs, nodeType, nodeId, nodeLabel, 'fallbackBeatMs')
          break
        case 'indexed-variable':
          checkVarName(logicNode.varName, nodeType, nodeId, nodeLabel, 'varName')
          checkValueSource(logicNode.index, nodeType, nodeId, nodeLabel, 'index')
          checkValueSource(logicNode.value, nodeType, nodeId, nodeLabel, 'value')
          checkVarName(logicNode.assignTo, nodeType, nodeId, nodeLabel, 'assignTo')
          break
        case 'led-changed':
          checkVarName(logicNode.assignIndex, nodeType, nodeId, nodeLabel, 'assignIndex')
          checkVarName(logicNode.assignColor, nodeType, nodeId, nodeLabel, 'assignColor')
          checkVarName(logicNode.assignEdge, nodeType, nodeId, nodeLabel, 'assignEdge')
          break
        case 'random':
          checkVarName(logicNode.sourceVariable, nodeType, nodeId, nodeLabel, 'sourceVariable')
          checkValueSource(logicNode.min, nodeType, nodeId, nodeLabel, 'min')
          checkValueSource(logicNode.max, nodeType, nodeId, nodeLabel, 'max')
          checkValueSource(logicNode.count, nodeType, nodeId, nodeLabel, 'count')
          checkVarName(logicNode.assignTo, nodeType, nodeId, nodeLabel, 'assignTo')
          for (const roll of logicNode.rolls ?? []) {
            checkVarName(roll.sourceVariable, nodeType, nodeId, nodeLabel, 'rolls.sourceVariable')
            checkValueSource(roll.min, nodeType, nodeId, nodeLabel, 'rolls.min')
            checkValueSource(roll.max, nodeType, nodeId, nodeLabel, 'rolls.max')
            checkValueSource(roll.count, nodeType, nodeId, nodeLabel, 'rolls.count')
            checkVarName(roll.assignTo, nodeType, nodeId, nodeLabel, 'rolls.assignTo')
          }
          break
        case 'shuffle-lights':
          checkVarName(logicNode.sourceVariable, nodeType, nodeId, nodeLabel, 'sourceVariable')
          checkVarName(logicNode.assignTo, nodeType, nodeId, nodeLabel, 'assignTo')
          break
        case 'for-each-light':
          checkVarName(logicNode.sourceVariable, nodeType, nodeId, nodeLabel, 'sourceVariable')
          checkVarName(
            logicNode.currentLightVariable,
            nodeType,
            nodeId,
            nodeLabel,
            'currentLightVariable',
          )
          checkVarName(
            logicNode.currentIndexVariable,
            nodeType,
            nodeId,
            nodeLabel,
            'currentIndexVariable',
          )
          checkValueSource(logicNode.groupSize, nodeType, nodeId, nodeLabel, 'groupSize')
          break
      }
    }

    if (node.data.kind === 'effect-raiser') {
      const raiser = node.data.payload as EffectRaiserNode
      const nodeType = 'Effect Raiser Node'
      const parameterValues = raiser.parameterValues ?? {}
      for (const [paramName, value] of Object.entries(parameterValues)) {
        checkValueSource(value, nodeType, nodeId, nodeLabel, `parameterValues.${paramName}`)
      }
    }
  }

  return references
}

/** Every event raiser and listener on the live canvas that names `eventName`. */
export function collectEventReferencesFromFlow(nodes: EditorNode[], eventName: string): string[] {
  const references: string[] = []

  for (const node of nodes) {
    if (node.data.kind === 'event-raiser') {
      const raiser = node.data.payload as EventRaiserNode
      if (raiser.eventName === eventName) {
        references.push(`Event Raiser: ${raiser.label ?? raiser.id}`)
      }
    } else if (node.data.kind === 'event-listener') {
      const listener = node.data.payload as EventListenerNode
      if (listener.eventName === eventName) {
        references.push(`Event Listener: ${listener.label ?? listener.id}`)
      }
    }
  }

  return references
}
