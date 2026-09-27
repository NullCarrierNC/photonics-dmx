/**
 * The rules a value in a cue or effect file must meet, asked by the node editor fields, the compilers
 * and the load-time migrations alike. A rule answers null for a value it accepts, an error for one
 * the compiler refuses, and a warning for one that loads but will not do what it says.
 */
import {
  BLEND_MODE_OPTIONS,
  BRIGHTNESS_OPTIONS,
  COLOR_OPTIONS,
  LIGHT_TARGET_OPTIONS,
  RB3_SONG_EVENTS,
  YARG_SONG_EVENTS,
  isBlendMode,
  isBrightness,
  isColor,
  isLightTarget,
  isLocationGroup,
  isWaitCondition,
} from '../../types'
import type { WaitCondition } from '../../types'
import { EasingType, isEasingType } from '../../easing'
import { STAGE_DIRECTION_BEARING_DEG } from '../../helpers/stageDirections'
import { MAX_NODE_LAYER } from '../../constants/nodeConstants'
import type {
  ActionNode,
  LogicNode,
  NodeCueMode,
  ValueSource,
  VariableType,
} from '../types/nodeCueTypes'
import { RESERVED_VARIABLE_NAMES, VARIABLE_NAME_PATTERN } from '../types/nodeCueTypes'

export interface ValueIssue {
  severity: 'error' | 'warning'
  message: string
}

const error = (message: string): ValueIssue => ({ severity: 'error', message })
const warning = (message: string): ValueIssue => ({ severity: 'warning', message })

/** The kinds of text literal a rule here knows how to check. */
export type LiteralRule =
  | 'groups'
  | 'filter'
  | 'color'
  | 'brightness'
  | 'blend-mode'
  | 'easing'
  | 'wait-condition'

/**
 * The kinds of number literal a rule here knows how to check: a time in ms, a wait count, a level
 * from 0 to 1 and a layer.
 */
export type NumberRule = 'time' | 'count' | 'level' | 'layer'

/** Any kind of literal a rule here knows how to check. */
export type ValueRule = LiteralRule | NumberRule

export function isNumberRule(rule: ValueRule): rule is NumberRule {
  return rule === 'time' || rule === 'count' || rule === 'level' || rule === 'layer'
}

/** Every easing an action may name. */
const EASING_OPTIONS: readonly EasingType[] = Object.values(EasingType)

/** The easing an action plays with when it names none. */
export const DEFAULT_EASING = EasingType.SIN_IN_OUT

const LITERAL_DEFAULTS: Partial<Record<ValueRule, string>> = {
  'easing': DEFAULT_EASING,
  'blend-mode': 'replace',
}

/** What the runtime uses for a literal of this kind left out of the file, when it may be. */
export function literalDefault(rule: ValueRule): string | undefined {
  return LITERAL_DEFAULTS[rule]
}

/**
 * The wait conditions that fire in a mode. Audio analysis raises only beats, and the RB3 StageKit
 * stream only its LED and fog edges, which a YARG song never raises.
 */
export function waitConditionsFor(mode: NodeCueMode): readonly WaitCondition[] {
  if (mode === 'audio') return ['none', 'delay', 'beat']
  if (mode === 'rb3') return ['none', 'delay', ...RB3_SONG_EVENTS]
  return ['none', 'delay', ...YARG_SONG_EVENTS]
}

/** The values an editor offers for a literal of this kind, in the order it offers them. */
export function literalChoices(rule: LiteralRule, mode?: NodeCueMode): readonly string[] {
  switch (rule) {
    case 'groups':
      return []
    case 'filter':
      return LIGHT_TARGET_OPTIONS
    case 'color':
      return COLOR_OPTIONS
    case 'brightness':
      return BRIGHTNESS_OPTIONS
    case 'blend-mode':
      return BLEND_MODE_OPTIONS
    case 'easing':
      return EASING_OPTIONS
    case 'wait-condition':
      return mode ? waitConditionsFor(mode) : ['none', 'delay', ...YARG_SONG_EVENTS]
  }
}

/**
 * The group names in a comma-separated groups literal. A blank entry, as a trailing comma leaves,
 * names nothing and is skipped.
 */
export function groupNames(value: unknown): string[] {
  if (value === null || value === undefined) return []
  return String(value)
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name.length > 0)
}

function groupsIssue(value: unknown): ValueIssue | null {
  const names = groupNames(value)
  if (names.length === 0) return error('must target at least one group')
  const unknown = names.find((name) => !isLocationGroup(name))
  return unknown === undefined ? null : error(`'${unknown}' is not a known LocationGroup`)
}

function waitConditionIssue(value: unknown, mode: NodeCueMode | undefined): ValueIssue | null {
  if (!isWaitCondition(value)) return error(`'${String(value)}' is not a known wait condition`)
  if (mode && !waitConditionsFor(mode).includes(value)) {
    return warning(`'${value}' never fires in ${mode} mode, so this wait does not end on it`)
  }
  return null
}

/** Whether a number literal of this kind is one the file may hold, as the compilers read it. */
function numberIssue(rule: NumberRule, value: unknown): ValueIssue | null {
  const n = Number(value)
  const finite = Number.isFinite(n)
  switch (rule) {
    case 'time':
      return finite && n >= 0 ? null : error('must be a non-negative finite number')
    case 'count':
      return finite && n > 0 ? null : error('must be a positive finite number')
    case 'level':
      return finite && n >= 0 && n <= 1 ? null : error('must be a number between 0 and 1')
    case 'layer':
      return finite && n >= 0 && n <= MAX_NODE_LAYER
        ? null
        : error(`must be a number from 0 to ${MAX_NODE_LAYER}`)
  }
}

/**
 * Whether a literal of this kind is one the file may hold. `mode` narrows the wait conditions to
 * those that fire in it, and a condition from another mode is a warning.
 */
export function literalIssue(
  rule: ValueRule,
  value: unknown,
  mode?: NodeCueMode,
): ValueIssue | null {
  if (isNumberRule(rule)) return numberIssue(rule, value)
  switch (rule) {
    case 'groups':
      return groupsIssue(value)
    case 'filter':
      if (typeof value !== 'string' || value.length === 0)
        return error('must be a non-empty string')
      return isLightTarget(value) ? null : error(`'${value}' is not a known LightTarget`)
    case 'color':
      return isColor(value)
        ? null
        : warning(`'${String(value)}' is not a known Color and plays as blue`)
    case 'brightness':
      return isBrightness(value) ? null : error(`'${String(value)}' is not a known Brightness`)
    case 'blend-mode':
      return isBlendMode(value) ? null : error(`'${String(value)}' is not a known BlendMode`)
    case 'easing':
      return isEasingType(value) ? null : error(`'${String(value)}' is not a known easing`)
    case 'wait-condition':
      return waitConditionIssue(value, mode)
  }
}

/** A field of an action whose literal a rule here judges, named by its path in the action. */
interface ActionLiteralField {
  rule: ValueRule
  field: string
  source: ValueSource | undefined
}

/** The fields of an action that hold a ruled literal, in the order the compilers check them. */
function actionLiteralFields(action: ActionNode): ActionLiteralField[] {
  const { target, color, timing, layer } = action
  return [
    { rule: 'groups', field: 'target.groups', source: target?.groups },
    { rule: 'filter', field: 'target.filter', source: target?.filter },
    { rule: 'color', field: 'color.name', source: color?.name },
    { rule: 'brightness', field: 'color.brightness', source: color?.brightness },
    { rule: 'blend-mode', field: 'color.blendMode', source: color?.blendMode },
    { rule: 'wait-condition', field: 'timing.waitForCondition', source: timing?.waitForCondition },
    { rule: 'time', field: 'timing.waitForTime', source: timing?.waitForTime },
    { rule: 'count', field: 'timing.waitForConditionCount', source: timing?.waitForConditionCount },
    { rule: 'time', field: 'timing.duration', source: timing?.duration },
    {
      rule: 'wait-condition',
      field: 'timing.waitUntilCondition',
      source: timing?.waitUntilCondition,
    },
    { rule: 'time', field: 'timing.waitUntilTime', source: timing?.waitUntilTime },
    {
      rule: 'count',
      field: 'timing.waitUntilConditionCount',
      source: timing?.waitUntilConditionCount,
    },
    { rule: 'easing', field: 'timing.easing', source: timing?.easing },
    { rule: 'level', field: 'timing.level', source: timing?.level },
    { rule: 'layer', field: 'layer', source: layer },
  ]
}

/** Each issue the rules find in an action's literals, for a cue of `mode` when it is known. */
export function actionLiteralIssues(
  action: ActionNode,
  mode?: NodeCueMode,
): { field: string; issue: ValueIssue }[] {
  return actionLiteralFields(action).flatMap(({ rule, field, source }) => {
    if (source?.source !== 'literal') return []
    const issue = literalIssue(rule, source.value, mode)
    return issue ? [{ field, issue }] : []
  })
}

/**
 * Whether a colour list may hold `value`. The list plays without a name this build does not know,
 * so one is a warning.
 */
export function colorListIssue(value: unknown): ValueIssue | null {
  if (!Array.isArray(value)) return null
  const unknown = value.find((entry) => !isColor(entry))
  return unknown === undefined
    ? null
    : warning(`'${String(unknown)}' is not a known Color and the list plays without it`)
}

/** A field of a logic node that holds a colour or, for a palette, a colour list. */
interface LogicColorField {
  field: string
  source: ValueSource | undefined
  list?: boolean
}

/** The variables a logic node's fields may read, as a file declares them. */
type DeclaredVariables = ReadonlyArray<{ name: string; type: string; validValues?: string[] }>

/**
 * The fields of a logic node that hold a colour. A conditional operand holds one when the other
 * side reads a declared colour variable, which compares it as a colour, unless that variable lists
 * the values it may hold.
 */
function logicColorFields(node: LogicNode, variables: DeclaredVariables): LogicColorField[] {
  switch (node.logicType) {
    case 'color-from-index':
      return [{ field: 'colors', source: node.colors, list: true }]
    case 'variable': {
      if (node.mode === 'get') return []
      const assignments = node.assignments ?? []
      if (assignments.length === 0) {
        return node.valueType === 'color' ? [{ field: 'value', source: node.value }] : []
      }
      return assignments.flatMap((assignment, index) =>
        assignment.valueType === 'color'
          ? [{ field: `assignments[${index}].value`, source: assignment.value }]
          : [],
      )
    }
    case 'indexed-variable':
      return node.mode === 'set' && node.valueType === 'color'
        ? [{ field: 'value', source: node.value }]
        : []
    case 'conditional': {
      const readsColor = (source: ValueSource | undefined): boolean => {
        if (source?.source !== 'variable') return false
        const variable = variables.find((v) => v.name === source.name)
        return variable?.type === 'color' && !variable.validValues?.length
      }
      return [
        ...(readsColor(node.right) ? [{ field: 'left', source: node.left }] : []),
        ...(readsColor(node.left) ? [{ field: 'right', source: node.right }] : []),
      ]
    }
    default:
      return []
  }
}

/**
 * Each issue the rules find in a logic node's literals, named by the field holding it. `variables`
 * are those the node's graph declares.
 */
export function logicLiteralIssues(
  node: LogicNode,
  variables: DeclaredVariables,
): { field: string; issue: ValueIssue }[] {
  return logicColorFields(node, variables).flatMap(({ field, source, list }) => {
    if (source?.source !== 'literal') return []
    const issue = list ? colorListIssue(source.value) : literalIssue('color', source.value)
    return issue ? [{ field, issue }] : []
  })
}

/**
 * Whether a variable or event name fits {@link VARIABLE_NAME_PATTERN}, as the schema requires of
 * both. A variable name must also meet {@link variableNameIssue}.
 */
export function nameIssue(kind: 'variable' | 'event', name: string): ValueIssue | null {
  if (VARIABLE_NAME_PATTERN.test(name)) return null
  return error(
    `"${name}" is not a valid ${kind} name. Use letters, digits and underscores, starting with a letter or underscore`,
  )
}

/** Whether a literal is one of a field's own choices, for a field no rule here covers. */
export function choiceIssue(value: unknown, choices: readonly string[]): ValueIssue | null {
  const text = String(value ?? '')
  if (choices.includes(text)) return null
  return error(text === '' ? 'Select a value' : `'${text}' is not a known value`)
}

/** The type a value field takes: one variable type, or any of them. */
export type FieldType = VariableType | 'either'

/**
 * Whether a variable of type `actual` can feed a field of type `expected`. Colours, cue types and
 * events are strings to a string field, and a string can hold a colour or a cue type.
 */
export function variableTypeFits(expected: FieldType, actual: string): boolean {
  if (expected === 'either' || expected === actual) return true
  switch (expected) {
    case 'color':
      return actual === 'string'
    case 'string':
      return actual === 'color' || actual === 'cue-type' || actual === 'event'
    case 'cue-type':
      return actual === 'string'
    default:
      return false
  }
}

/**
 * Whether a field of type `expected` reading variable `name` reads what it expects, given the
 * declared variables. A name none declares is a scratch variable some logic node writes, which the
 * rules take on trust.
 */
export function variableIssue(
  name: string,
  expected: FieldType,
  variables: ReadonlyArray<{ name: string; type: string }>,
): ValueIssue | null {
  if (name === '') return error('Select a variable')
  const variable = variables.find((v) => v.name === name)
  if (!variable) return null
  if (variableTypeFits(expected, variable.type)) return null
  return warning(`'${name}' is a ${variable.type} variable, and this field takes ${expected}`)
}

/**
 * The variable types a target's groups can read: a light-array names its own lights, and a string
 * holds group names.
 */
export const GROUPS_VARIABLE_TYPES: readonly string[] = ['string', 'light-array']

/**
 * Whether a target's groups can read variable `name`, given the declared variables. A name none
 * declares is taken on trust, as {@link variableIssue} takes it.
 */
export function groupsVariableIssue(
  name: string,
  variables: ReadonlyArray<{ name: string; type: string }>,
): ValueIssue | null {
  if (name === '') return error('Select a variable')
  const variable = variables.find((v) => v.name === name)
  if (!variable || GROUPS_VARIABLE_TYPES.includes(variable.type)) return null
  return warning(
    `'${name}' is a ${variable.type} variable, and this field takes a string or light-array variable`,
  )
}

/** The ruled action fields each variable of a graph feeds directly, by variable name. */
function variableRules(actions: readonly ActionNode[]): Map<string, ValueRule[]> {
  const rules = new Map<string, ValueRule[]>()
  for (const action of actions) {
    for (const { rule, source } of actionLiteralFields(action)) {
      if (source?.source !== 'variable') continue
      const fed = rules.get(source.name) ?? []
      if (!fed.includes(rule)) fed.push(rule)
      rules.set(source.name, fed)
    }
  }
  return rules
}

/** Effect parameters named for the field they conventionally carry, whatever they feed. */
const PARAMETER_NAME_RULES: Readonly<Record<string, LiteralRule>> = {
  waitUntilCondition: 'wait-condition',
  waitForCondition: 'wait-condition',
  brightness: 'brightness',
  colorBrightness: 'brightness',
  lowBrightness: 'brightness',
  startBrightness: 'brightness',
  endBrightness: 'brightness',
  blendMode: 'blend-mode',
}

/** What an effect declares about one of its parameters. */
export interface EffectParameter {
  name: string
  type: VariableType
  validValues?: string[]
}

/**
 * The rules a raiser's literal for `parameter` must meet: those of the action fields it feeds in the
 * effect, and the one its name conventionally carries.
 */
export function parameterRules(
  parameter: EffectParameter,
  effectActions: readonly ActionNode[],
): ValueRule[] {
  const rules = [...(variableRules(effectActions).get(parameter.name) ?? [])]
  const named = PARAMETER_NAME_RULES[parameter.name]
  if (named && !rules.includes(named)) rules.push(named)
  return rules
}

const asWarning = (issue: ValueIssue | null): ValueIssue | null =>
  issue && { severity: 'warning', message: issue.message }

function parameterTypeIssue(type: VariableType, value: unknown): ValueIssue | null {
  switch (type) {
    case 'number': {
      const n = typeof value === 'string' ? parseFloat(value) : value
      return typeof n === 'number' && Number.isFinite(n)
        ? null
        : warning(`'${String(value)}' is not a number`)
    }
    case 'boolean':
      return typeof value === 'boolean' || value === 'true' || value === 'false'
        ? null
        : warning(`'${String(value)}' is not true or false`)
    case 'color':
      return asWarning(literalIssue('color', value))
    case 'light-array':
      return warning('A light array comes only from a light-array variable')
    case 'color-array':
      return warning('A colour list comes only from a color-array variable')
    default:
      return null
  }
}

/**
 * Whether a raiser passes `parameter` a value the effect can use. The effect falls back to a default
 * for one it cannot, so every finding is a warning and an older file keeps loading.
 */
export function raiserParameterIssue(
  parameter: EffectParameter,
  source: ValueSource | undefined,
  context: {
    effectActions: readonly ActionNode[]
    variables: ReadonlyArray<{ name: string; type: string }>
    mode?: NodeCueMode
  },
): ValueIssue | null {
  if (!source) return null
  if (source.source === 'variable') {
    return asWarning(variableIssue(source.name, parameter.type, context.variables))
  }
  const typeIssue = parameterTypeIssue(parameter.type, source.value)
  if (typeIssue) return typeIssue
  if (parameter.validValues) return asWarning(choiceIssue(source.value, parameter.validValues))
  for (const rule of parameterRules(parameter, context.effectActions)) {
    const issue = literalIssue(rule, source.value, context.mode)
    if (issue) return asWarning(issue)
  }
  return null
}

/** An initial value as a variable of `type` reads it, which is the value a file should hold. */
export function initialValueAsRead(type: VariableType, raw: unknown): unknown {
  switch (type) {
    case 'number': {
      if (typeof raw === 'boolean') return raw ? 1 : 0
      const n = typeof raw === 'string' ? parseFloat(raw) : raw
      return typeof n === 'number' && Number.isFinite(n) ? n : 0
    }
    case 'boolean':
      return raw === true || raw === 'true'
    case 'color':
      return isColor(raw) ? raw : 'blue'
    case 'color-array':
      return Array.isArray(raw) ? raw.filter(isColor) : []
    case 'light-array':
      return []
    default:
      return typeof raw === 'string' ? raw : String(raw)
  }
}

/**
 * A colour name this build does not know in a colour or colour list initial value. The cue plays it
 * as blue, or leaves it out of the list, so it loads with a warning.
 */
function unknownColorIssue(type: VariableType, value: unknown): ValueIssue | null {
  if (type === 'color' && typeof value === 'string') {
    return warning(`'${value}' is not a known Color and plays as blue`)
  }
  if (type !== 'color-array' || !Array.isArray(value)) return null
  if (!value.every((entry) => typeof entry === 'string')) return null
  return colorListIssue(value)
}

/**
 * Whether a variable may take `name`: expressions read variables by name, so it meets
 * {@link nameIssue} and is none of the names an expression reads as its own.
 */
export function variableNameIssue(name: string): ValueIssue | null {
  const patternIssue = nameIssue('variable', name)
  if (patternIssue) return patternIssue
  if (RESERVED_VARIABLE_NAMES.includes(name))
    return error(`'${name}' is a built-in expression name`)
  return null
}

/**
 * Whether a variable of `type` may start as `value`: it must be the value it reads as, so a file
 * never says one thing while the cue runs another. A colour name this build does not know is a
 * warning.
 */
export function initialValueIssue(type: VariableType, value: unknown): ValueIssue | null {
  const read = initialValueAsRead(type, value)
  if (JSON.stringify(read) === JSON.stringify(value)) return null
  const colorIssue = unknownColorIssue(type, value)
  if (colorIssue) return colorIssue
  const shown = (v: unknown) => (typeof v === 'string' ? `'${v}'` : JSON.stringify(v))
  return error(`${shown(value)} is not a ${type} value, it reads as ${shown(read)}`)
}

/**
 * Whether a conditional reading `source` compares what the author sees. It compares an array as a
 * number, and an array reads as 0 whatever it holds.
 */
export function compareOperandIssue(
  source: ValueSource | undefined,
  variables: ReadonlyArray<{ name: string; type: string }>,
): ValueIssue | null {
  if (source?.source !== 'variable') return null
  const type = variables.find((v) => v.name === source.name)?.type
  if (type !== 'light-array' && type !== 'color-array') return null
  return warning(
    `'${source.name}' is a ${type} variable, which a compare reads as 0. An array-length node gives its size`,
  )
}

/**
 * Whether a value is one of a field's fixed choices, for a field the runtime reads with a fallback.
 * The file still loads, so a value off the list is a warning.
 */
export function unlistedIssue(value: string, choices: readonly string[]): ValueIssue | null {
  return choices.includes(value) ? null : warning(`'${value}' is not one of this field's choices`)
}

/**
 * Whether a raiser names one of the effects in `effectIds`. The schema refuses a raiser that names
 * none, and one naming an effect the cue does not hold still loads.
 */
export function effectIdIssue(effectId: string, effectIds: readonly string[]): ValueIssue | null {
  if (effectId === '') return error('Select an effect')
  return unlistedIssue(effectId, effectIds)
}

/** Whether a bearing literal names a stage direction or a number of degrees. */
export function bearingIssue(value: unknown): ValueIssue | null {
  if (typeof value === 'number') return Number.isFinite(value) ? null : warning('Not a bearing')
  const text = String(value ?? '')
    .trim()
    .toLowerCase()
  if (Object.prototype.hasOwnProperty.call(STAGE_DIRECTION_BEARING_DEG, text)) return null
  if (Number.isFinite(Number.parseFloat(text))) return null
  return warning(`'${String(value)}' is not a stage direction or a number of degrees`)
}
