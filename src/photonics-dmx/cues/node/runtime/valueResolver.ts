/**
 * Value resolution utilities for the node execution engine.
 * Resolves ValueSource objects to actual runtime values.
 */

import {
  Color,
  Brightness,
  BlendMode,
  LocationGroup,
  LightTarget,
  TrackedLight,
  isBlendMode,
  isBrightness,
  isColor,
  isLightTarget,
  isLocationGroup,
  isWaitCondition,
  WaitCondition,
} from '../../../types'
import { ValueSource, VariableType } from '../../types/nodeCueTypes'
import { ExecutionContext } from './ExecutionContext'
import { VariableValue } from './executionTypes'

/** Optional; when provided, variable lookups use scope-aware store (cue vs cue-group). */
type VariableDefinitionsForScope = { name: string; scope: 'cue' | 'cue-group' }[]

/** Thrown when a variable source references a variable that has not been initialized. */
export class UninitializedVariableError extends Error {
  constructor(public readonly varName: string) {
    super(`Variable "${varName}" is not initialized`)
    this.name = 'UninitializedVariableError'
  }
}

/**
 * Resolve a value source to an actual value at runtime.
 * When variableDefinitions is provided, variable sources are resolved from the scope-correct
 * store (cue vs cue-group) to match scope-aware writes. When not provided, falls back to
 * cue-level then group-level.
 */
export function resolveValue(
  expectedType: VariableType,
  source: ValueSource | undefined,
  context: ExecutionContext,
  variableDefinitions?: VariableDefinitionsForScope,
): number | boolean | string | TrackedLight[] | Color[] {
  if (!source) {
    if (expectedType === 'light-array' || expectedType === 'color-array') return []
    return expectedType === 'number' ? 0 : expectedType === 'boolean' ? false : ''
  }

  if (source.source === 'literal') {
    if (expectedType === 'light-array') {
      return Array.isArray(source.value) ? (source.value as TrackedLight[]) : []
    }
    if (expectedType === 'color-array') {
      return Array.isArray(source.value) ? (source.value as Color[]) : []
    }
    if (
      expectedType === 'string' ||
      expectedType === 'cue-type' ||
      expectedType === 'color' ||
      expectedType === 'event'
    ) {
      return String(source.value)
    }
    if (expectedType === 'number') {
      if (typeof source.value === 'boolean') {
        return source.value ? 1 : 0
      }
      if (typeof source.value === 'string') {
        const parsed = parseFloat(source.value)
        return isNaN(parsed) ? 0 : parsed
      }
      return typeof source.value === 'number' ? source.value : 0
    }
    return source.value === true || source.value === 'true'
  }

  // Variable source: use scope-aware store when definitions provided, else cue then group
  const existing = variableDefinitions
    ? (variableDefinitions.some((v) => v.name === source.name && v.scope === 'cue')
        ? context.cueLevelVarStore
        : context.groupLevelVarStore
      ).get(source.name)
    : context.cueLevelVarStore.get(source.name) ?? context.groupLevelVarStore.get(source.name)

  if (existing) {
    if (expectedType === 'light-array') {
      return existing.type === 'light-array' ? (existing.value as TrackedLight[]) : []
    }
    if (expectedType === 'color-array') {
      return existing.type === 'color-array' ? (existing.value as Color[]) : []
    }
    if (
      expectedType === 'string' ||
      expectedType === 'cue-type' ||
      expectedType === 'color' ||
      expectedType === 'event'
    ) {
      return String(existing.value)
    }
    if (expectedType === 'number') {
      if (typeof existing.value === 'string') {
        const parsed = parseFloat(existing.value)
        return isNaN(parsed) ? 0 : parsed
      }
      return typeof existing.value === 'number' ? existing.value : existing.value ? 1 : 0
    }
    return existing.value === true || existing.value === 'true'
  }

  throw new UninitializedVariableError(source.name)
}

/**
 * Infer variable type from value.
 */
export function inferType(value: number | string | boolean): VariableType {
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'number') return 'number'
  return 'string'
}

/**
 * Infer variable type from a value source, for an effect parameter the effect does not declare.
 * Falling back to a numeric type instead would turn "delay" or "yellow" into 0.
 */
export function inferSourceType(source: ValueSource | undefined): VariableType {
  if (!source || source.source !== 'literal') return 'string'
  const value = source.value
  if (typeof value === 'number') return 'number'
  if (typeof value === 'boolean') return 'boolean'
  if (Array.isArray(value)) return 'light-array'
  return 'string'
}

/**
 * Comma-separated group names ("front,back"), keeping the known ones, or the front group when
 * none is known.
 */
export function parseLocationGroups(value: unknown): LocationGroup[] {
  const groups =
    typeof value === 'string'
      ? value
          .split(',')
          .map((g) => g.trim())
          .filter(isLocationGroup)
      : []
  return groups.length > 0 ? groups : ['front']
}

export function parseLightTarget(value: unknown): LightTarget {
  return isLightTarget(value) ? value : 'all'
}

export function parseColor(value: unknown): Color {
  return isColor(value) ? value : 'blue'
}

export function parseBrightness(value: unknown): Brightness {
  return isBrightness(value) ? value : 'medium'
}

export function parseBlendMode(value: unknown): BlendMode {
  return isBlendMode(value) ? value : 'replace'
}

export function parseWaitCondition(value: unknown): WaitCondition {
  return isWaitCondition(value) ? value : 'none'
}

export function resolveLocationGroups(
  source: ValueSource,
  context: ExecutionContext,
): LocationGroup[] {
  return parseLocationGroups(resolveValue('string', source, context))
}

export function resolveLightTarget(source: ValueSource, context: ExecutionContext): LightTarget {
  return parseLightTarget(resolveValue('string', source, context))
}

export function resolveColor(source: ValueSource, context: ExecutionContext): Color {
  return parseColor(resolveValue('string', source, context))
}

export function resolveBrightness(source: ValueSource, context: ExecutionContext): Brightness {
  return parseBrightness(resolveValue('string', source, context))
}

export function resolveBlendMode(
  source: ValueSource | undefined,
  context: ExecutionContext,
): BlendMode | undefined {
  if (!source) return undefined
  return parseBlendMode(resolveValue('string', source, context))
}

/**
 * Get the appropriate variable store for a variable name.
 */
export function getVariableStore(
  varName: string,
  variableDefinitions: { name: string; scope: 'cue' | 'cue-group' }[],
  cueLevelVarStore: Map<string, VariableValue>,
  groupLevelVarStore: Map<string, VariableValue>,
): Map<string, VariableValue> {
  // Check if variable is defined in cue-level registry
  const isCueLevel = variableDefinitions.some((v) => v.name === varName && v.scope === 'cue')
  return isCueLevel ? cueLevelVarStore : groupLevelVarStore
}
