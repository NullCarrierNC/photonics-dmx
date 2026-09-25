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
 * The variable a variable source names. With variableDefinitions it is read from the store its
 * declared scope puts it in (cue vs cue-group), and without them from cue-level then group-level.
 */
function lookupVariable(
  name: string,
  context: ExecutionContext,
  variableDefinitions?: VariableDefinitionsForScope,
): VariableValue {
  const existing = variableDefinitions
    ? (variableDefinitions.some((v) => v.name === name && v.scope === 'cue')
        ? context.cueLevelVarStore
        : context.groupLevelVarStore
      ).get(name)
    : context.cueLevelVarStore.get(name) ?? context.groupLevelVarStore.get(name)
  if (!existing) throw new UninitializedVariableError(name)
  return existing
}

export function resolveNumber(
  source: ValueSource | undefined,
  context: ExecutionContext,
  variableDefinitions?: VariableDefinitionsForScope,
): number {
  if (!source) return 0
  if (source.source === 'literal') {
    const value = source.value
    if (typeof value === 'boolean') return value ? 1 : 0
    if (typeof value === 'string') {
      const parsed = parseFloat(value)
      return isNaN(parsed) ? 0 : parsed
    }
    return typeof value === 'number' ? value : 0
  }
  const value = lookupVariable(source.name, context, variableDefinitions).value
  if (typeof value === 'string') {
    const parsed = parseFloat(value)
    return isNaN(parsed) ? 0 : parsed
  }
  return typeof value === 'number' ? value : value ? 1 : 0
}

export function resolveBoolean(
  source: ValueSource | undefined,
  context: ExecutionContext,
  variableDefinitions?: VariableDefinitionsForScope,
): boolean {
  if (!source) return false
  const value =
    source.source === 'literal'
      ? source.value
      : lookupVariable(source.name, context, variableDefinitions).value
  return value === true || value === 'true'
}

/** A string, cue-type, colour or event value as text. */
export function resolveString(
  source: ValueSource | undefined,
  context: ExecutionContext,
  variableDefinitions?: VariableDefinitionsForScope,
): string {
  if (!source) return ''
  if (source.source === 'literal') return String(source.value)
  return String(lookupVariable(source.name, context, variableDefinitions).value)
}

function resolveLightArray(
  source: ValueSource | undefined,
  context: ExecutionContext,
  variableDefinitions?: VariableDefinitionsForScope,
): TrackedLight[] {
  if (!source || source.source === 'literal') return []
  const existing = lookupVariable(source.name, context, variableDefinitions)
  return existing.type === 'light-array' ? existing.value : []
}

export function resolveColorArray(
  source: ValueSource | undefined,
  context: ExecutionContext,
  variableDefinitions?: VariableDefinitionsForScope,
): Color[] {
  if (!source) return []
  if (source.source === 'literal') {
    return Array.isArray(source.value) ? source.value : []
  }
  const existing = lookupVariable(source.name, context, variableDefinitions)
  return existing.type === 'color-array' ? existing.value : []
}

/** A variable of `type` holding what `source` resolves to as that type. */
export function resolveVariableValue(
  type: VariableType,
  source: ValueSource | undefined,
  context: ExecutionContext,
  variableDefinitions?: VariableDefinitionsForScope,
): VariableValue {
  switch (type) {
    case 'number':
      return { type, value: resolveNumber(source, context, variableDefinitions) }
    case 'boolean':
      return { type, value: resolveBoolean(source, context, variableDefinitions) }
    case 'light-array':
      return { type, value: resolveLightArray(source, context, variableDefinitions) }
    case 'color-array':
      return { type, value: resolveColorArray(source, context, variableDefinitions) }
    default:
      return { type, value: resolveString(source, context, variableDefinitions) }
  }
}

/** A variable holding `value`, typed by what it holds. */
export function inferVariableValue(value: number | string | boolean): VariableValue {
  if (typeof value === 'boolean') return { type: 'boolean', value }
  if (typeof value === 'number') return { type: 'number', value }
  return { type: 'string', value }
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
  return parseLocationGroups(resolveString(source, context))
}

export function resolveLightTarget(source: ValueSource, context: ExecutionContext): LightTarget {
  return parseLightTarget(resolveString(source, context))
}

export function resolveColor(source: ValueSource, context: ExecutionContext): Color {
  return parseColor(resolveString(source, context))
}

export function resolveBrightness(source: ValueSource, context: ExecutionContext): Brightness {
  return parseBrightness(resolveString(source, context))
}

export function resolveBlendMode(
  source: ValueSource | undefined,
  context: ExecutionContext,
): BlendMode | undefined {
  if (!source) return undefined
  return parseBlendMode(resolveString(source, context))
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
