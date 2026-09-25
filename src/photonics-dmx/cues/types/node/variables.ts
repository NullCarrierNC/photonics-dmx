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

export type ValueSource =
  | { source: 'literal'; value: number | boolean | string | Color[] }
  | { source: 'variable'; name: string }

export interface VariableDefinition {
  name: string
  type: VariableType
  scope: 'cue' | 'cue-group'
  initialValue: number | boolean | string | Color[]
  description?: string
  isParameter?: boolean
  /** Constrained set of allowed literal values, driving a selector in the effect-raiser parameter UI */
  validValues?: string[]
}

export interface EventDefinition {
  name: string
  description?: string
}
