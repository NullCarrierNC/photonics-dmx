/**
 * The rules a value in a cue or effect file must meet, asked by the node editor fields, the compilers
 * and the load-time migrations alike. A rule answers null for a value it accepts, an error for one
 * the compiler refuses, and a warning for one that loads but will not do what it says.
 */
import {
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
import type { ActionNode, NodeCueMode, ValueSource } from '../types/nodeCueTypes'

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

/** The easing an action plays with when it names none. */
export const DEFAULT_EASING = EasingType.SIN_IN_OUT

/**
 * The wait conditions that fire in a mode. Audio analysis raises only beats, and the RB3 StageKit
 * stream only its LED and fog edges, which a YARG song never raises.
 */
function waitConditionsFor(mode: NodeCueMode): readonly WaitCondition[] {
  if (mode === 'audio') return ['none', 'delay', 'beat']
  if (mode === 'rb3') return ['none', 'delay', ...RB3_SONG_EVENTS]
  return ['none', 'delay', ...YARG_SONG_EVENTS]
}

/**
 * The group names in a comma-separated groups literal. A blank entry, as a trailing comma leaves,
 * names nothing and is skipped.
 */
function groupNames(value: unknown): string[] {
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
