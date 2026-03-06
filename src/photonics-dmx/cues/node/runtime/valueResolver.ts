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
} from '../../../types'
import { ValueSource, VariableType } from '../../types/nodeCueTypes'
import { COLOR_OPTIONS, LIGHT_TARGET_OPTIONS } from '../../../constants/options'
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
): number | boolean | string | TrackedLight[] {
  if (!source) {
    if (expectedType === 'light-array') return []
    return expectedType === 'number' ? 0 : expectedType === 'boolean' ? false : ''
  }

  if (source.source === 'literal') {
    if (expectedType === 'light-array') {
      return Array.isArray(source.value) ? (source.value as TrackedLight[]) : []
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
 * Resolve location groups from ValueSource (comma-separated string to array).
 */
export function resolveLocationGroups(
  source: ValueSource,
  context: ExecutionContext,
): LocationGroup[] {
  const value = resolveValue('string', source, context)
  if (typeof value !== 'string') return ['front']

  // Parse comma-separated groups: "front,back" → ['front', 'back']
  const validGroups: LocationGroup[] = ['front', 'back', 'strobe']
  return value
    .split(',')
    .map((g) => g.trim())
    .filter((g) => validGroups.includes(g as LocationGroup)) as LocationGroup[]
}

/**
 * Resolve light target filter from ValueSource.
 */
export function resolveLightTarget(source: ValueSource, context: ExecutionContext): LightTarget {
  const value = resolveValue('string', source, context)
  const valid: LightTarget[] = LIGHT_TARGET_OPTIONS
  return valid.includes(value as LightTarget) ? (value as LightTarget) : 'all'
}

/**
 * Resolve color name from ValueSource.
 */
export function resolveColor(source: ValueSource, context: ExecutionContext): Color {
  const value = resolveValue('string', source, context)
  const validColors: Color[] = COLOR_OPTIONS
  return validColors.includes(value as Color) ? (value as Color) : 'blue'
}

/**
 * Resolve brightness level from ValueSource.
 */
export function resolveBrightness(source: ValueSource, context: ExecutionContext): Brightness {
  const value = resolveValue('string', source, context)
  const valid: Brightness[] = ['low', 'medium', 'high', 'max']
  return valid.includes(value as Brightness) ? (value as Brightness) : 'medium'
}

/**
 * Resolve blend mode from ValueSource.
 */
export function resolveBlendMode(
  source: ValueSource | undefined,
  context: ExecutionContext,
): BlendMode | undefined {
  if (!source) return undefined
  const value = resolveValue('string', source, context)
  const valid: BlendMode[] = ['replace', 'add', 'multiply', 'overlay']
  return valid.includes(value as BlendMode) ? (value as BlendMode) : 'replace'
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
