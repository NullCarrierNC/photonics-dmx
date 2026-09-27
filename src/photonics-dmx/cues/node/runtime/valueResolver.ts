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
import type { ExecutionContext } from './ExecutionContext'
import type { VariableValue } from './executionTypes'
import { createLogger } from '../../../../shared/logger'

const log = createLogger('valueResolver')

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

/** A number from an authored or stored value, with 0 for anything unreadable. */
export function toNumber(raw: unknown): number {
  if (typeof raw === 'boolean') return raw ? 1 : 0
  const n = typeof raw === 'string' ? parseFloat(raw) : raw
  return typeof n === 'number' && !Number.isNaN(n) ? n : 0
}

export function resolveNumber(
  source: ValueSource | undefined,
  context: ExecutionContext,
  variableDefinitions?: VariableDefinitionsForScope,
): number {
  if (!source) return 0
  return toNumber(
    source.source === 'literal'
      ? source.value
      : lookupVariable(source.name, context, variableDefinitions).value,
  )
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

/** A string, cue-type, colour or event value as text. A light array has no text, and warns. */
export function resolveString(
  source: ValueSource | undefined,
  context: ExecutionContext,
  variableDefinitions?: VariableDefinitionsForScope,
): string {
  if (!source) return ''
  if (source.source === 'literal') return String(source.value)
  const held = lookupVariable(source.name, context, variableDefinitions)
  return held.type === 'light-array'
    ? context.unknownValues.lightArrayAsText(source.name)
    : String(held.value)
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

/** A colour list. A literal list plays without the names this build does not know. */
export function resolveColorArray(
  source: ValueSource | undefined,
  context: ExecutionContext,
  variableDefinitions?: VariableDefinitionsForScope,
): Color[] {
  if (!source) return []
  if (source.source === 'literal') {
    return Array.isArray(source.value) ? source.value.filter(isColor) : []
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
    case 'color':
      return { type, value: parseColor(resolveString(source, context, variableDefinitions)) }
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
 * The unknown values one loaded cue has warned about. A cue re-reads its values on every dispatch,
 * so each text warns once for each cue that reads it, and a cue loaded afresh warns again.
 */
export class UnknownValueWarnings {
  private readonly reported = new Set<string>()

  constructor(private readonly cueId: string) {}

  /** Warns `message` the first time `key` is reported. */
  private reportOnce(key: string, message: string): void {
    if (this.reported.has(key)) return
    this.reported.add(key)
    log.warn(message)
  }

  /**
   * Warns that `value` is not a known `kind`. An undefined value is a source with nothing to read,
   * such as a variable the caller could not look up, and takes its fallback quietly.
   */
  report(kind: string, value: unknown, outcome: string): void {
    if (value === undefined) return
    const text = String(value)
    this.reportOnce(`${kind}:${text}`, `Unknown ${kind} "${text}" in cue ${this.cueId}, ${outcome}`)
  }

  /** The text a light-array variable read as text gives, which is none. Warns once per variable. */
  lightArrayAsText(name: string): string {
    this.reportOnce(
      `light-array text:${name}`,
      `Light-array variable '${name}' read as text in cue ${this.cueId}, which reads as no text`,
    )
    return ''
  }
}

/**
 * Comma-separated group names ("front,back"), keeping the known ones. Text naming no known group
 * targets no lights, and warns.
 */
export function parseLocationGroups(
  value: unknown,
  warnings: UnknownValueWarnings,
): LocationGroup[] {
  const groups =
    typeof value === 'string'
      ? value
          .split(',')
          .map((g) => g.trim())
          .filter(isLocationGroup)
      : []
  if (groups.length === 0) warnings.report('light group', value, 'lighting nothing')
  return groups
}

/** A light filter, or every light of the groups for text naming no filter, which warns. */
export function parseLightTarget(value: unknown, warnings: UnknownValueWarnings): LightTarget {
  if (isLightTarget(value)) return value
  warnings.report('light filter', value, 'lighting every light of the groups')
  return 'all'
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

/** A wait condition, or no wait for text naming no condition, which warns. */
export function parseWaitCondition(value: unknown, warnings: UnknownValueWarnings): WaitCondition {
  if (isWaitCondition(value)) return value
  warnings.report('wait condition', value, 'waiting for nothing')
  return 'none'
}

/** The groups a target names. A light-array variable targets its own lights and names none. */
export function resolveLocationGroups(
  source: ValueSource,
  context: ExecutionContext,
): LocationGroup[] {
  if (source.source === 'variable' && lookupVariable(source.name, context).type === 'light-array') {
    return []
  }
  return parseLocationGroups(resolveString(source, context), context.unknownValues)
}

export function resolveLightTarget(source: ValueSource, context: ExecutionContext): LightTarget {
  return parseLightTarget(resolveString(source, context), context.unknownValues)
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
