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
import type { ActionNode, NodeCueMode, ValueSource, VariableType } from '../types/nodeCueTypes'

export interface ValueIssue {
  severity: 'error' | 'warning'
  message: string
}

const error = (message: string): ValueIssue => ({ severity: 'error', message })
const warning = (message: string): ValueIssue => ({ severity: 'warning', message })

/** The kinds of literal a rule here knows how to check. */
export type LiteralRule =
  | 'groups'
  | 'filter'
  | 'color'
  | 'brightness'
  | 'blend-mode'
  | 'easing'
  | 'wait-condition'

/** Every easing an action may name. */
const EASING_OPTIONS: readonly EasingType[] = Object.values(EasingType)

/** The easing an action plays with when it names none. */
export const DEFAULT_EASING = EasingType.SIN_IN_OUT

const LITERAL_DEFAULTS: Partial<Record<LiteralRule, string>> = {
  'easing': DEFAULT_EASING,
  'blend-mode': 'replace',
}

/** What the runtime uses for a literal of this kind left out of the file, when it may be. */
export function literalDefault(rule: LiteralRule): string | undefined {
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

/**
 * Whether a literal of this kind is one the file may hold. `mode` narrows the wait conditions to
 * those that fire in it, and a condition from another mode is a warning.
 */
export function literalIssue(
  rule: LiteralRule,
  value: unknown,
  mode?: NodeCueMode,
): ValueIssue | null {
  switch (rule) {
    case 'groups':
      return groupsIssue(value)
    case 'filter':
      if (typeof value !== 'string' || value.length === 0)
        return error('must be a non-empty string')
      return isLightTarget(value) ? null : error(`'${value}' is not a known LightTarget`)
    case 'color':
      return isColor(value) ? null : error(`'${String(value)}' is not a known Color`)
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
  rule: LiteralRule
  field: string
  source: ValueSource | undefined
}

/** The fields of an action that hold a ruled literal, in the order the compilers check them. */
function actionLiteralFields(action: ActionNode): ActionLiteralField[] {
  const { target, color, timing } = action
  return [
    { rule: 'groups', field: 'target.groups', source: target?.groups },
    { rule: 'filter', field: 'target.filter', source: target?.filter },
    { rule: 'color', field: 'color.name', source: color?.name },
    { rule: 'brightness', field: 'color.brightness', source: color?.brightness },
    { rule: 'blend-mode', field: 'color.blendMode', source: color?.blendMode },
    { rule: 'wait-condition', field: 'timing.waitForCondition', source: timing?.waitForCondition },
    {
      rule: 'wait-condition',
      field: 'timing.waitUntilCondition',
      source: timing?.waitUntilCondition,
    },
    { rule: 'easing', field: 'timing.easing', source: timing?.easing },
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
