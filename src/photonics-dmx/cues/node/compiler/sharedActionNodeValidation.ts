import type { ActionNode, ValueSource } from '../../types/nodeCueTypes'
import { WAIT_CONDITIONS, type LightTarget } from '../../../types'

/**
 * Structural validation shared by node cue and effect compilers for physically
 * equivalent action payloads (targets, set-position, set-color, motion-pattern,
 * timing config). Cue and effect compilers wrap thrown errors in their own error
 * type so callers can distinguish source files; the message text is identical
 * across both compilers (asserted by the parametrised parity test).
 */
export function validateSharedActionNodePayload(
  action: ActionNode,
  createError: (message: string) => Error,
): void {
  const label = action.label ?? action.id

  validateTargetGroups(action, label, createError)
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
}

function validateTargetGroups(
  action: ActionNode,
  label: string,
  createError: (message: string) => Error,
): void {
  if (!action.target.groups) {
    throw createError(`Action '${label}' must target at least one group.`)
  }
  if (action.target.groups.source === 'literal') {
    const v = action.target.groups.value as unknown
    if (
      v == null ||
      v === '' ||
      (Array.isArray(v) && v.length === 0) ||
      (!Array.isArray(v) && !v)
    ) {
      throw createError(`Action '${label}' must target at least one group.`)
    }
  }
}

const KNOWN_LIGHT_TARGETS = new Set<LightTarget>([
  'all',
  'even',
  'odd',
  'half-1',
  'half-2',
  'outter-half-major',
  'outter-half-minor',
  'inner-half-major',
  'inner-half-minor',
  'third-1',
  'third-2',
  'third-3',
  'quarter-1',
  'quarter-2',
  'quarter-3',
  'quarter-4',
  'linear',
  'inverse-linear',
  'random-1',
  'random-2',
  'random-3',
  'random-4',
])

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
  if (filter.source === 'literal') {
    const value = filter.value
    if (typeof value !== 'string' || value.length === 0) {
      throw createError(`Action '${label}' target.filter literal must be a non-empty string.`)
    }
    if (!KNOWN_LIGHT_TARGETS.has(value as LightTarget)) {
      throw createError(`Action '${label}' target.filter '${value}' is not a known LightTarget.`)
    }
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

const KNOWN_WAIT_CONDITIONS = new Set<string>(WAIT_CONDITIONS)

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

  validateConditionLiteral(timing.waitForCondition, label, 'waitForCondition', createError)
  validateConditionLiteral(timing.waitUntilCondition, label, 'waitUntilCondition', createError)

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
    if (timing.easing.source === 'literal' && typeof timing.easing.value !== 'string') {
      throw createError(`Action '${label}' timing.easing literal must be a string.`)
    }
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

function validateConditionLiteral(
  value: ValueSource,
  label: string,
  field: string,
  createError: (message: string) => Error,
): void {
  if (value.source !== 'literal') return
  const v = value.value
  if (typeof v !== 'string' || !KNOWN_WAIT_CONDITIONS.has(v)) {
    throw createError(
      `Action '${label}' timing.${field} literal '${String(v)}' is not a known wait condition.`,
    )
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
