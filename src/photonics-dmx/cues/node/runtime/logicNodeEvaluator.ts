/**
 * Logic node evaluation for the node execution engine.
 * Handles all logic node types: variable, math, conditional, cue-data, config-data, etc.
 */

import { RENDERER_RECEIVE } from '../../../../shared/ipcChannels'
import { DmxLightManager } from '../../../controllers/DmxLightManager'
import { TrackedLight } from '../../../types'
import { randomBetween } from '../../../helpers/utils'
import { LogicNode, ValueSource, VariableDefinition, VariableType } from '../../types/nodeCueTypes'
import { ExecutionContext } from './ExecutionContext'
import { VariableValue } from './executionTypes'
import { Connection } from '../../types/nodeCueTypes'
import {
  resolveValue,
  inferType,
  getVariableStore,
  UninitializedVariableError,
} from './valueResolver'
import { extractCueDataValue, extractConfigDataValue } from './dataExtractors'

export interface LogicNodeEvaluatorContext {
  cueId: string
  lightManager: DmxLightManager
  cueLevelVarStore: Map<string, VariableValue>
  groupLevelVarStore: Map<string, VariableValue>
  variableDefinitions: VariableDefinition[]
  executeNode: (nodeId: string, context: ExecutionContext) => void
  /** Optional; when set, debugger nodes send payloads here (e.g. to renderer via IPC). */
  debugOutput?: (channel: string, data: unknown) => void
}

/**
 * Evaluate a logic node and determine which nodes to execute next.
 * This is where runtime variable evaluation happens.
 */
export function evaluateLogicNode(
  logicNode: LogicNode,
  nodeId: string,
  edges: Connection[],
  context: ExecutionContext,
  evaluatorContext: LogicNodeEvaluatorContext,
): string[] {
  const { cueId, lightManager, cueLevelVarStore, groupLevelVarStore, variableDefinitions } =
    evaluatorContext

  const getVarStore = (varName: string) =>
    getVariableStore(varName, variableDefinitions, cueLevelVarStore, groupLevelVarStore)

  switch (logicNode.logicType) {
    case 'variable': {
      if (logicNode.mode !== 'get') {
        const value = resolveValue(
          logicNode.valueType,
          logicNode.value,
          context,
          variableDefinitions,
        )
        const varStore = getVarStore(logicNode.varName)

        if (logicNode.mode === 'init') {
          if (!varStore.has(logicNode.varName)) {
            varStore.set(logicNode.varName, { type: logicNode.valueType, value })
          }
        } else {
          varStore.set(logicNode.varName, { type: logicNode.valueType, value })
        }
      }
      return edges.map((edge) => edge.to)
    }

    case 'math': {
      const left = Number(resolveValue('number', logicNode.left, context, variableDefinitions))
      const right = Number(resolveValue('number', logicNode.right, context, variableDefinitions))
      let result = 0

      switch (logicNode.operator) {
        case 'add':
          result = left + right
          break
        case 'subtract':
          result = left - right
          break
        case 'multiply':
          result = left * right
          break
        case 'divide':
          result = right === 0 ? 0 : left / right
          break
        case 'modulus':
          result = right === 0 ? 0 : left % right
          break
      }

      if (logicNode.assignTo) {
        const varStore = getVarStore(logicNode.assignTo)
        varStore.set(logicNode.assignTo, { type: 'number', value: result })
      }

      return edges.map((edge) => edge.to)
    }

    case 'conditional': {
      const resolveType = (source: ValueSource | undefined): VariableType => {
        if (!source) return 'number'
        if (source.source === 'literal') {
          if (Array.isArray(source.value)) return 'light-array'
          if (typeof source.value === 'boolean') return 'boolean'
          if (typeof source.value === 'number') return 'number'
          return 'string'
        }
        const cueVar = context.cueLevelVarStore.get(source.name)
        const groupVar = context.groupLevelVarStore.get(source.name)
        const existing = cueVar ?? groupVar
        if (existing) return existing.type as VariableType
        return 'number'
      }

      let leftType = resolveType(logicNode.left)
      let rightType = resolveType(logicNode.right)

      // When one side is a variable (strongly typed) and the other is a literal,
      // coerce the literal's effective type to match -- prevents JSON serialisation
      // artefacts (e.g. "1" instead of 1) from changing comparison semantics.
      if (logicNode.left?.source === 'variable' && logicNode.right?.source === 'literal') {
        rightType = leftType
      } else if (logicNode.left?.source === 'literal' && logicNode.right?.source === 'variable') {
        leftType = rightType
      }

      const useStringCompare =
        leftType === 'string' ||
        rightType === 'string' ||
        leftType === 'cue-type' ||
        rightType === 'cue-type' ||
        leftType === 'color' ||
        rightType === 'color' ||
        leftType === 'event' ||
        rightType === 'event'
      const useBooleanCompare = leftType === 'boolean' || rightType === 'boolean'

      let outcome = false

      if (logicNode.comparator === '==' || logicNode.comparator === '!=') {
        if (useBooleanCompare) {
          const left = resolveValue('boolean', logicNode.left, context, variableDefinitions)
          const right = resolveValue('boolean', logicNode.right, context, variableDefinitions)
          outcome = logicNode.comparator === '==' ? left === right : left !== right
        } else if (useStringCompare) {
          const left = resolveValue('string', logicNode.left, context, variableDefinitions)
          const right = resolveValue('string', logicNode.right, context, variableDefinitions)
          outcome = logicNode.comparator === '==' ? left === right : left !== right
        } else {
          const left = Number(resolveValue('number', logicNode.left, context, variableDefinitions))
          const right = Number(
            resolveValue('number', logicNode.right, context, variableDefinitions),
          )
          outcome = logicNode.comparator === '==' ? left === right : left !== right
        }
      } else {
        const left = Number(resolveValue('number', logicNode.left, context, variableDefinitions))
        const right = Number(resolveValue('number', logicNode.right, context, variableDefinitions))
        switch (logicNode.comparator) {
          case '>':
            outcome = left > right
            break
          case '>=':
            outcome = left >= right
            break
          case '<':
            outcome = left < right
            break
          case '<=':
            outcome = left <= right
            break
        }
      }

      const branch = outcome ? 'true' : 'false'
      const targeted = edges.filter((edge) => edge.fromPort === branch)
      return targeted.map((edge) => edge.to)
    }

    case 'cue-data': {
      const value = extractCueDataValue(logicNode.dataProperty, context.cueData, cueId)

      if (logicNode.assignTo) {
        const varStore = getVarStore(logicNode.assignTo)
        const type = inferType(value)
        varStore.set(logicNode.assignTo, { type, value })
      }

      return edges.map((edge) => edge.to)
    }

    case 'config-data': {
      const value = extractConfigDataValue(logicNode.dataProperty, lightManager)

      if (logicNode.assignTo) {
        const varStore = getVarStore(logicNode.assignTo)
        const type = Array.isArray(value) ? 'light-array' : 'number'
        varStore.set(logicNode.assignTo, { type, value })
      }

      return edges.map((edge) => edge.to)
    }

    case 'lights-from-index': {
      // Get the source light array variable
      const sourceVarStore = getVarStore(logicNode.sourceVariable)
      const sourceVar = sourceVarStore.get(logicNode.sourceVariable)

      if (!sourceVar || sourceVar.type !== 'light-array') {
        console.warn(
          `lights-from-index node ${nodeId}: source variable "${logicNode.sourceVariable}" is not a light-array`,
        )
        return edges.map((edge) => edge.to)
      }

      const lightsArray = sourceVar.value as TrackedLight[]

      if (lightsArray.length === 0) {
        console.warn(`lights-from-index node ${nodeId}: source array is empty`)
        return edges.map((edge) => edge.to)
      }

      // Resolve the index value - could be a number, string (comma-separated), or variable
      let indices: number[] = []

      if (logicNode.index.source === 'literal') {
        // Handle literal value - could be a number or comma-separated string
        const indexValue = logicNode.index.value
        if (typeof indexValue === 'number') {
          indices = [Math.floor(indexValue)]
        } else if (typeof indexValue === 'string') {
          // Parse comma-separated list of integers
          indices = indexValue
            .split(',')
            .map((s) => s.trim())
            .map((s) => {
              const parsed = parseInt(s, 10)
              return isNaN(parsed) ? null : parsed
            })
            .filter((idx): idx is number => idx !== null)
        } else {
          // Try to parse as number
          const parsed = Number(indexValue)
          if (!isNaN(parsed)) {
            indices = [Math.floor(parsed)]
          }
        }
      } else {
        // Handle variable source
        const varName = logicNode.index.name
        const cueVar = context.cueLevelVarStore.get(varName)
        const groupVar = context.groupLevelVarStore.get(varName)
        const varValue = cueVar ?? groupVar

        if (varValue) {
          if (varValue.type === 'number') {
            // Single number variable
            indices = [Math.floor(Number(varValue.value))]
          } else if (varValue.type === 'string') {
            // String variable - could be a single number or comma-separated list
            const strValue = String(varValue.value)
            if (strValue.includes(',')) {
              // Comma-separated list
              indices = strValue
                .split(',')
                .map((s) => s.trim())
                .map((s) => {
                  const parsed = parseInt(s, 10)
                  return isNaN(parsed) ? null : parsed
                })
                .filter((idx): idx is number => idx !== null)
            } else {
              // Single number as string
              const parsed = parseInt(strValue, 10)
              if (!isNaN(parsed)) {
                indices = [parsed]
              }
            }
          } else if (Array.isArray(varValue.value)) {
            // Array variable - assume it's an array of numbers (for future support)
            indices = (varValue.value as unknown[])
              .map((v) => {
                const num = typeof v === 'number' ? v : Number(v)
                return isNaN(num) ? null : Math.floor(num)
              })
              .filter((idx): idx is number => idx !== null)
          } else {
            // Try to parse as number
            const parsed = Number(varValue.value)
            if (!isNaN(parsed)) {
              indices = [Math.floor(parsed)]
            }
          }
        } else {
          throw new UninitializedVariableError(logicNode.index.name)
        }
      }

      // If no valid indices found, return early
      if (indices.length === 0) {
        console.warn(`lights-from-index node ${nodeId}: no valid indices found`)
        return edges.map((edge) => edge.to)
      }

      // Apply wraparound (modulo) and extract lights
      const selectedLights = indices.map((index) => {
        const wrappedIndex =
          ((index % lightsArray.length) + lightsArray.length) % lightsArray.length
        return lightsArray[wrappedIndex]
      })

      // Assign the array of lights to the target variable
      const targetVarStore = getVarStore(logicNode.assignTo)
      targetVarStore.set(logicNode.assignTo, {
        type: 'light-array',
        value: selectedLights,
      })

      return edges.map((edge) => edge.to)
    }

    case 'array-length': {
      // Get the source light array variable
      const sourceVarStore = getVarStore(logicNode.sourceVariable)
      const sourceVar = sourceVarStore.get(logicNode.sourceVariable)

      let length = 0
      if (sourceVar && sourceVar.type === 'light-array') {
        const lightsArray = sourceVar.value as TrackedLight[]
        length = lightsArray.length
      } else {
        console.warn(
          `array-length node ${nodeId}: source variable "${logicNode.sourceVariable}" is not a light-array`,
        )
      }

      // Assign the length to the target variable
      const targetVarStore = getVarStore(logicNode.assignTo)
      targetVarStore.set(logicNode.assignTo, { type: 'number', value: length })

      return edges.map((edge) => edge.to)
    }

    case 'reverse-lights': {
      // Get the source light array variable
      const sourceVarStore = getVarStore(logicNode.sourceVariable)
      const sourceVar = sourceVarStore.get(logicNode.sourceVariable)

      if (!sourceVar || sourceVar.type !== 'light-array') {
        console.warn(
          `reverse-lights node ${nodeId}: source variable "${logicNode.sourceVariable}" is not a light-array`,
        )
        return edges.map((edge) => edge.to)
      }

      const lightsArray = sourceVar.value as TrackedLight[]
      const reversedLights = [...lightsArray].reverse()

      // Assign the reversed array to the target variable
      const targetVarStore = getVarStore(logicNode.assignTo)
      targetVarStore.set(logicNode.assignTo, { type: 'light-array', value: reversedLights })

      return edges.map((edge) => edge.to)
    }

    case 'create-pairs': {
      // Get the source light array variable
      const sourceVarStore = getVarStore(logicNode.sourceVariable)
      const sourceVar = sourceVarStore.get(logicNode.sourceVariable)

      if (!sourceVar || sourceVar.type !== 'light-array') {
        console.warn(
          `create-pairs node ${nodeId}: source variable "${logicNode.sourceVariable}" is not a light-array`,
        )
        return edges.map((edge) => edge.to)
      }

      const lightsArray = sourceVar.value as TrackedLight[]
      let pairedLights: TrackedLight[]

      if (logicNode.pairType === 'opposite') {
        // Create opposite pairs: [0,4], [1,5], [2,6], [3,7] -> flattened to [0,4,1,5,2,6,3,7]
        pairedLights = createOppositePairs(lightsArray)
      } else {
        // Create diagonal pairs: [6,2], [5,1], [4,0], [3,7] -> flattened
        pairedLights = createDiagonalPairs(lightsArray)
      }

      // Assign the paired lights to the target variable
      const targetVarStore = getVarStore(logicNode.assignTo)
      targetVarStore.set(logicNode.assignTo, { type: 'light-array', value: pairedLights })

      return edges.map((edge) => edge.to)
    }

    case 'concat-lights': {
      // Concatenate multiple light arrays into one
      const concatResult: TrackedLight[] = []

      for (const varName of logicNode.sourceVariables) {
        const sourceVarStore = getVarStore(varName)
        const sourceVar = sourceVarStore.get(varName)

        if (sourceVar && sourceVar.type === 'light-array') {
          concatResult.push(...(sourceVar.value as TrackedLight[]))
        } else {
          console.warn(
            `concat-lights node ${nodeId}: variable "${varName}" is not a light-array, skipping`,
          )
        }
      }

      // Assign the concatenated array to the target variable
      const targetVarStore = getVarStore(logicNode.assignTo)
      targetVarStore.set(logicNode.assignTo, { type: 'light-array', value: concatResult })

      return edges.map((edge) => edge.to)
    }

    case 'delay': {
      // Delay nodes are handled specially in the execution engine (they block).
      // This case just returns the next nodes - the actual delay happens in NodeExecutionEngine.
      return edges.map((edge) => edge.to)
    }

    case 'shuffle-lights': {
      const sourceVarStore = getVarStore(logicNode.sourceVariable)
      const sourceVar = sourceVarStore.get(logicNode.sourceVariable)

      if (!sourceVar || sourceVar.type !== 'light-array') {
        console.warn(
          `shuffle-lights node ${nodeId}: source variable "${logicNode.sourceVariable}" is not a light-array`,
        )
        return edges.map((edge) => edge.to)
      }

      const lightsArray = sourceVar.value as TrackedLight[]
      const shuffled = [...lightsArray].sort(() => Math.random() - 0.5)
      const targetVarStore = getVarStore(logicNode.assignTo)
      targetVarStore.set(logicNode.assignTo, { type: 'light-array', value: shuffled })
      return edges.map((edge) => edge.to)
    }

    case 'random': {
      const varStore = getVarStore(logicNode.assignTo)
      if (logicNode.mode === 'random-integer') {
        const minVal = Number(
          resolveValue(
            'number',
            logicNode.min ?? { source: 'literal', value: 0 },
            context,
            variableDefinitions,
          ),
        )
        const maxVal = Number(
          resolveValue(
            'number',
            logicNode.max ?? { source: 'literal', value: 1 },
            context,
            variableDefinitions,
          ),
        )
        const min = Math.floor(minVal)
        const max = Math.floor(maxVal)
        const result = min <= max ? randomBetween(min, max) : min
        varStore.set(logicNode.assignTo, { type: 'number', value: result })
      } else if (logicNode.mode === 'random-choice') {
        const choices = logicNode.choices ?? []
        const result = choices.length > 0 ? choices[randomBetween(0, choices.length - 1)] ?? '' : ''
        varStore.set(logicNode.assignTo, { type: 'string', value: result })
      } else if (logicNode.mode === 'random-light') {
        const sourceVarStore = getVarStore(logicNode.sourceVariable ?? '')
        const sourceVar = sourceVarStore.get(logicNode.sourceVariable ?? '')
        if (!sourceVar || sourceVar.type !== 'light-array') {
          console.warn(
            `random node ${nodeId}: source variable "${logicNode.sourceVariable}" is not a light-array`,
          )
          return edges.map((edge) => edge.to)
        }
        const lightsArray = sourceVar.value as TrackedLight[]
        const countVal = Number(
          resolveValue(
            'number',
            logicNode.count ?? { source: 'literal', value: 1 },
            context,
            variableDefinitions,
          ),
        )
        const count = Math.max(0, Math.min(Math.floor(countVal), lightsArray.length))
        const shuffled = [...lightsArray].sort(() => Math.random() - 0.5)
        const picked = shuffled.slice(0, count)
        varStore.set(logicNode.assignTo, { type: 'light-array', value: picked })
      }
      return edges.map((edge) => edge.to)
    }

    case 'debugger': {
      // Log the message
      const message = String(
        resolveValue('string', logicNode.message, context, variableDefinitions),
      )
      console.log(`[DebuggerNode] ${message}`)

      // Log checked variables with their current values
      const variablesForLog = logicNode.variablesToLog.map((varName) => {
        const varStore = getVarStore(varName)
        const variable = varStore.get(varName)
        return {
          name: varName,
          value: variable ? variable.value : undefined,
        }
      })

      for (const varName of logicNode.variablesToLog) {
        const varStore = getVarStore(varName)
        const variable = varStore.get(varName)
        if (variable) {
          console.log(`[DebuggerNode] ${varName}:`, variable.value)
        } else {
          console.log(`[DebuggerNode] ${varName}: <undefined>`)
        }
      }

      evaluatorContext.debugOutput?.(RENDERER_RECEIVE.DEBUG_LOG, {
        message,
        variables: variablesForLog,
        timestamp: Date.now(),
      })

      return edges.map((edge) => edge.to)
    }
  }

  return edges.map((edge) => edge.to)
}

/**
 * Creates opposite pairs from a light array and flattens them.
 * For 8 lights: [0,4], [1,5], [2,6], [3,7] -> [0,4,1,5,2,6,3,7]
 * Pairs are interleaved so that indexing by 2 gives a pair.
 */
function createOppositePairs(lights: TrackedLight[]): TrackedLight[] {
  const result: TrackedLight[] = []
  const halfLength = Math.floor(lights.length / 2)

  for (let i = 0; i < halfLength; i++) {
    result.push(lights[i])
    result.push(lights[i + halfLength])
  }

  // If odd number of lights, include the middle light at the end
  if (lights.length % 2 !== 0) {
    result.push(lights[halfLength])
  }

  return result
}

/**
 * Creates diagonal pairs for sweep patterns and flattens them.
 * For 8 lights: [6,2], [5,1], [4,0], [3,7] -> [6,2,5,1,4,0,3,7]
 * For 4 lights: [2], [1], [0], [3] -> [2,1,0,3]
 * Pairs are interleaved so that indexing by 2 gives a pair.
 */
function createDiagonalPairs(lights: TrackedLight[]): TrackedLight[] {
  const result: TrackedLight[] = []

  if (lights.length >= 8) {
    // For 8+ lights: diagonal sweep pattern (6|2) → (5|1) → (4|0) → (3|7)
    result.push(lights[6], lights[2])
    result.push(lights[5], lights[1])
    result.push(lights[4], lights[0])
    result.push(lights[3], lights[7])
  } else if (lights.length >= 4) {
    // For 4-7 lights: single-light diagonal pattern
    result.push(lights[Math.min(2, lights.length - 1)])
    result.push(lights[Math.min(1, lights.length - 1)])
    result.push(lights[0])
    result.push(lights[Math.min(3, lights.length - 1)])
  } else {
    // For fewer lights, just return them in order
    result.push(...lights)
  }

  return result
}
