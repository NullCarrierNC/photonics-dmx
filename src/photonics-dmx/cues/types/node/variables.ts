/**
 * Variable and event declarations a cue graph carries.
 */
import { EXPRESSION_BUILTIN_NAMES } from '../../node/runtime/expressionEvaluator'

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

/**
 * Names no variable may take, since an expression reads them as its built-in functions and
 * constants. Event names are never read in an expression and may take them.
 */
export const RESERVED_VARIABLE_NAMES: readonly string[] = EXPRESSION_BUILTIN_NAMES

/** A name that fits {@link VARIABLE_NAME_PATTERN} and is not a built-in expression name. */
export function isVariableName(name: string): boolean {
  return VARIABLE_NAME_PATTERN.test(name) && !RESERVED_VARIABLE_NAMES.includes(name)
}

/** A single value, written in the node or read from a variable. */
export type ValueSource =
  | { source: 'literal'; value: number | boolean | string }
  | { source: 'variable'; name: string }

/**
 * A palette's colours: a literal list of colour names, which may hold a name this build does not
 * know, or a color-array variable.
 */
export type ColorListValueSource =
  | { source: 'literal'; value: string[] }
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
  /**
   * The names a load renamed this parameter from. A raiser an older build wrote passes it by one of
   * them, so the raiser's key takes this name.
   */
  formerNames?: string[]
}

export interface EventDefinition {
  name: string
  description?: string
}
