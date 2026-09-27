/**
 * Variable and event declarations a cue graph carries.
 */
import type { Color } from '../../../types'

/** Every variable/value type, the single source both the schema enums and the editor dropdowns derive
 *  from so they cannot drift from the VariableType union. */
export const VARIABLE_TYPES = [
  'number',
  'boolean',
  'string',
  'color',
  'light-array',
  'color-array',
  'cue-type',
  'event',
] as const

export type VariableType = (typeof VARIABLE_TYPES)[number]

/**
 * What a variable or event name may be: letters, digits and underscores, not starting with a digit.
 * The schemas, the variable editor and the load-time rename of older variable names all apply it.
 */
export const VARIABLE_NAME_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/

export function isVariableName(name: string): boolean {
  return VARIABLE_NAME_PATTERN.test(name)
}

export type ValueSource =
  | { source: 'literal'; value: number | boolean | string | Color[] }
  | { source: 'variable'; name: string }

export interface VariableDefinition {
  name: string
  type: VariableType
  scope: 'cue' | 'cue-group'
  initialValue: number | boolean | string | string[]
  description?: string
  isParameter?: boolean
  /** Constrained set of allowed literal values, driving a selector in the effect-raiser parameter UI */
  validValues?: string[]
}

export interface EventDefinition {
  name: string
  description?: string
}
