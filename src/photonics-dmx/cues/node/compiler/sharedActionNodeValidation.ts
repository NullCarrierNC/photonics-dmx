import type { ActionNode, ValueSource } from '../../types/nodeCueTypes'
import { MAX_NODE_LAYER } from '../../../constants/nodeConstants'
import { actionLiteralIssues } from '../cueValueRules'

/**
 * Structural validation shared by node cue and effect compilers for physically
 * equivalent action payloads (targets, set-position, set-color, motion-pattern,
 * timing config). Cue and effect compilers wrap thrown errors in their own error
 * type so callers can distinguish source files; the message text is identical
 * across both compilers (asserted by the parametrised parity test). Literal values
 * are judged by the cue value rules the editor fields also ask, and a rule's
 * warning does not stop a compile.
 */
export function validateSharedActionNodePayload(
  action: ActionNode,
  createError: (message: string) => Error,
): void {
  const label = action.label ?? action.id

  if (!action.target.groups) {
    throw createError(`Action '${label}' must target at least one group.`)
  }
  validateTargetFilter(action, label, createError)

  if (action.effectType === 'set-position') {
    validateSetPosition(action, label, createError)
  }
  if (action.effectType === 'set-color' && !action.color) {
    throw createError(`Action '${label}' (set-color) must include color.`)
  }
  if (action.effectType === 'motion-pattern' && !action.motionPattern) {
    throw createError(`Action '${label}' (motion-pattern) must include motionPattern.`)
  }

  validateTiming(action, label, createError)

  const refused = actionLiteralIssues(action).find(({ issue }) => issue.severity === 'error')
  if (refused) {
    throw createError(`Action '${label}' ${refused.field} ${refused.issue.message}.`)
  }

  validateLayer(action, label, createError)
}

function validateLayer(
  action: ActionNode,
  label: string,
  createError: (message: string) => Error,
): void {
  if (action.layer?.source !== 'literal') return
  const n = Number(action.layer.value)
  if (!Number.isFinite(n) || n < 0 || n > MAX_NODE_LAYER) {
    throw createError(
      `Action '${label}' layer literal must be a number from 0 to ${MAX_NODE_LAYER}.`,
    )
  }
}

function validateTargetFilter(
  action: ActionNode,
  label: string,
  createError: (message: string) => Error,
): void {
  const filter = action.target.filter
  if (!filter) {
    throw createError(`Action '${label}' target.filter is required (use 'all' for no filter).`)
  }
  if (!isValueSource(filter)) {
    throw createError(`Action '${label}' target.filter must be a ValueSource.`)
  }
}

function validateSetPosition(
  action: ActionNode,
  label: string,
  createError: (message: string) => Error,
): void {
  const pos = action.position
  if (!pos) {
    throw createError(`Action '${label}' (set-position) must include position.`)
  }
  const mode = pos.mode ?? 'absolute'
  if (mode === 'direction') {
    if (!pos.bearing || !pos.angle) {
      throw createError(
        `Action '${label}' (set-position, direction mode) must include bearing and angle.`,
      )
    }
  } else if (mode === 'offset') {
    if (!pos.pan || !pos.tilt) {
      throw createError(
        `Action '${label}' (set-position, offset mode) must include pan and tilt (degrees).`,
      )
    }
  } else {
    if (!pos.pan || !pos.tilt) {
      throw createError(
        `Action '${label}' (set-position, absolute mode) must include pan and tilt.`,
      )
    }
  }
}

function validateTiming(
  action: ActionNode,
  label: string,
  createError: (message: string) => Error,
): void {
  const timing = action.timing
  if (!timing || typeof timing !== 'object') {
    throw createError(`Action '${label}' timing is required.`)
  }

  validateRequiredTimingValueSource(timing.waitForCondition, label, 'waitForCondition', createError)
  validateRequiredTimingValueSource(timing.waitForTime, label, 'waitForTime', createError)
  validateRequiredTimingValueSource(timing.duration, label, 'duration', createError)
  validateRequiredTimingValueSource(
    timing.waitUntilCondition,
    label,
    'waitUntilCondition',
    createError,
  )
  validateRequiredTimingValueSource(timing.waitUntilTime, label, 'waitUntilTime', createError)

  validateNonNegativeNumberLiteral(timing.waitForTime, label, 'waitForTime', createError)
  validateNonNegativeNumberLiteral(timing.waitUntilTime, label, 'waitUntilTime', createError)
  validateNonNegativeNumberLiteral(timing.duration, label, 'duration', createError)

  validateOptionalPositiveNumberLiteral(
    timing.waitForConditionCount,
    label,
    'waitForConditionCount',
    createError,
  )
  validateOptionalPositiveNumberLiteral(
    timing.waitUntilConditionCount,
    label,
    'waitUntilConditionCount',
    createError,
  )

  if (timing.level !== undefined) {
    validateOptionalValueSource(timing.level, label, 'level', createError)
    if (timing.level.source === 'literal') {
      const v = Number(timing.level.value)
      if (!Number.isFinite(v) || v < 0 || v > 1) {
        throw createError(
          `Action '${label}' timing.level literal must be a number between 0 and 1.`,
        )
      }
    }
  }

  if (timing.easing !== undefined) {
    validateOptionalValueSource(timing.easing, label, 'easing', createError)
  }
}

function isValueSource(value: unknown): value is ValueSource {
  if (!value || typeof value !== 'object') return false
  const src = (value as { source?: unknown }).source
  if (src === 'literal') {
    return 'value' in (value as Record<string, unknown>)
  }
  if (src === 'variable') {
    return typeof (value as { name?: unknown }).name === 'string'
  }
  return false
}

function validateRequiredTimingValueSource(
  value: ValueSource | undefined,
  label: string,
  field: string,
  createError: (message: string) => Error,
): void {
  if (value === undefined || value === null) {
    throw createError(`Action '${label}' timing.${field} is required.`)
  }
  if (!isValueSource(value)) {
    throw createError(`Action '${label}' timing.${field} must be a ValueSource.`)
  }
}

function validateOptionalValueSource(
  value: ValueSource,
  label: string,
  field: string,
  createError: (message: string) => Error,
): void {
  if (!isValueSource(value)) {
    throw createError(`Action '${label}' timing.${field} must be a ValueSource.`)
  }
}

function validateNonNegativeNumberLiteral(
  value: ValueSource,
  label: string,
  field: string,
  createError: (message: string) => Error,
): void {
  if (value.source !== 'literal') return
  const n = Number(value.value)
  if (!Number.isFinite(n) || n < 0) {
    throw createError(
      `Action '${label}' timing.${field} literal must be a non-negative finite number.`,
    )
  }
}

function validateOptionalPositiveNumberLiteral(
  value: ValueSource | undefined,
  label: string,
  field: string,
  createError: (message: string) => Error,
): void {
  if (value === undefined || value === null) return
  if (!isValueSource(value)) {
    throw createError(`Action '${label}' timing.${field} must be a ValueSource.`)
  }
  if (value.source !== 'literal') return
  const n = Number(value.value)
  if (!Number.isFinite(n) || n <= 0) {
    throw createError(`Action '${label}' timing.${field} literal must be a positive finite number.`)
  }
}
