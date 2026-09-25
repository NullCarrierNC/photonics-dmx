import type { VariableDefinition } from '../../types/nodeCueTypes'
import type { VariableValue } from './executionTypes'

/**
 * The value an effect parameter takes: what the raiser sent, or else the variable's initial value,
 * coerced to the variable's declared type so a number parameter holds a number however it arrived.
 */
export function effectParameterValue(
  given: VariableValue['value'] | undefined,
  variable: VariableDefinition,
): VariableValue['value'] {
  const value = given ?? variable.initialValue
  if (variable.type === 'number') {
    if (typeof value === 'number' && !Number.isNaN(value)) return value
    if (typeof value === 'string') {
      const n = parseFloat(value)
      return Number.isNaN(n) ? 0 : n
    }
  }
  if (variable.type === 'string' || variable.type === 'color' || variable.type === 'event') {
    return String(value)
  }
  return value
}
