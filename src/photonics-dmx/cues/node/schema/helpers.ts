import Ajv, { DefinedError, JSONSchemaType } from 'ajv'
import addFormats from 'ajv-formats'
import {
  AudioEventType,
  Connection,
  LogicNode,
  ValueSource,
  VariableDefinition,
} from '../../types/nodeCueTypes'
import { YargEventType, YARG_EVENT_TYPES as YARG_EVENT_TYPES_SOURCE } from '../../../types'
import { AUDIO_EVENT_OPTIONS_WITH_NONE_DELAY } from '../../../constants/options'

// All event types for YARG event nodes (includes system events + song events)
export const YARG_EVENT_TYPES: YargEventType[] = [...YARG_EVENT_TYPES_SOURCE]

export const AUDIO_EVENT_TYPES: AudioEventType[] = AUDIO_EVENT_OPTIONS_WITH_NONE_DELAY.filter(
  (t) => t !== 'audio-trigger',
)

export const LOGIC_COMPARATORS = ['>', '>=', '<', '<=', '==', '!='] as const
export const MATH_OPERATORS = ['add', 'subtract', 'multiply', 'divide', 'modulus'] as const

export const ajv = new Ajv({
  allErrors: true,
  allowUnionTypes: true,
  strict: false,
})
addFormats(ajv)

export const formatErrors = (errors: DefinedError[] | null | undefined): string[] => {
  if (!errors || errors.length === 0) {
    return ['Unknown validation error']
  }

  return errors.map((err) => {
    const instancePath = err.instancePath || 'file'
    const message = err.message || 'Invalid value'
    if (err.params && typeof err.params === 'object' && 'allowedValues' in err.params) {
      const p = err.params as { allowedValues: unknown }
      if (Array.isArray(p.allowedValues) && p.allowedValues.length > 0) {
        return `${instancePath}: ${message} (${(p.allowedValues as string[]).join(', ')})`
      }
    }
    return `${instancePath}: ${message}`
  })
}

export interface StructuredValidationError {
  instancePath: string
  message: string
}

export const extractStructuredErrors = (
  errors: DefinedError[] | null | undefined,
): StructuredValidationError[] => {
  if (!errors?.length) return []
  return errors.map((err) => ({
    instancePath: err.instancePath || '',
    message: err.message || 'Invalid value',
  }))
}

/**
 * Detects circular dependencies that would cause infinite synchronous execution.
 * Only logic-only cycles are reported; cycles that include at least one action node
 * are allowed because the runtime advances phase on action completion, so the loop
 * breaks across async boundaries.
 */
export const detectCycles = (
  connections: Connection[],
  nodeIds: Set<string>,
  actionIds: Set<string>,
): string[] => {
  const errors: string[] = []

  const actionToAction = new Map<string, string[]>()
  for (const conn of connections) {
    if (nodeIds.has(conn.from) && nodeIds.has(conn.to)) {
      const existing = actionToAction.get(conn.from) ?? []
      existing.push(conn.to)
      actionToAction.set(conn.from, existing)
    }
  }

  const visited = new Set<string>()
  const recursionStack = new Set<string>()

  const dfs = (nodeId: string, path: string[]): boolean => {
    visited.add(nodeId)
    recursionStack.add(nodeId)

    const neighbours = actionToAction.get(nodeId) ?? []
    for (const neighbour of neighbours) {
      if (!visited.has(neighbour)) {
        if (dfs(neighbour, [...path, neighbour])) {
          return true
        }
      } else if (recursionStack.has(neighbour)) {
        const cycleStart = path.indexOf(neighbour)
        const cycle = cycleStart >= 0 ? path.slice(cycleStart) : path
        cycle.push(neighbour)
        const cycleHasAction = cycle.some((id) => actionIds.has(id))
        if (!cycleHasAction) {
          errors.push(`Circular dependency detected: ${cycle.join(' → ')}`)
        }
        return true
      }
    }

    recursionStack.delete(nodeId)
    return false
  }

  for (const nodeId of nodeIds) {
    if (!visited.has(nodeId)) {
      dfs(nodeId, [nodeId])
    }
  }

  return errors
}

/**
 * Semantic check: conditional nodes that compare a literal against a variable
 * with validValues must use a literal that is in the variable's validValues list.
 */
export const checkConditionalValidValues = (
  name: string,
  domain: 'cue' | 'effect',
  logicNodes: LogicNode[],
  variableDefinitions: VariableDefinition[],
  errors: string[],
): void => {
  const varMap = new Map(variableDefinitions.map((v) => [v.name, v]))
  for (const node of logicNodes) {
    if (node.logicType !== 'conditional') continue
    const left = node.left
    const right = node.right
    const literalStr = (s: ValueSource | undefined): string | null =>
      s?.source === 'literal' && s.value != null ? String(s.value) : null
    const varNameFrom = (s: ValueSource | undefined): string | null =>
      s?.source === 'variable' ? s.name : null
    const leftLiteral = literalStr(left)
    const rightVar = varNameFrom(right)
    const rightLiteral = literalStr(right)
    const leftVar = varNameFrom(left)
    if (leftLiteral !== null && rightVar !== null) {
      const def = varMap.get(rightVar)
      if (def?.validValues?.length && !def.validValues.includes(leftLiteral)) {
        errors.push(
          `${domain} '${name}': Conditional '${node.id}' compares literal "${leftLiteral}" against variable "${rightVar}" — valid values are: ${def.validValues.join(', ')}`,
        )
      }
    }
    if (rightLiteral !== null && leftVar !== null) {
      const def = varMap.get(leftVar)
      if (def?.validValues?.length && !def.validValues.includes(rightLiteral)) {
        errors.push(
          `${domain} '${name}': Conditional '${node.id}' compares literal "${rightLiteral}" against variable "${leftVar}" — valid values are: ${def.validValues.join(', ')}`,
        )
      }
    }
  }
}

// Re-export JSONSchemaType for other schema modules
export type { JSONSchemaType }
