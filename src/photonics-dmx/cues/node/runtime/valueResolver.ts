/**
 * Value resolution utilities for the node execution engine.
 * Resolves ValueSource objects to actual runtime values.
 */

import { Color, Brightness, BlendMode, LocationGroup, LightTarget } from '../../../types';
import { ValueSource, VariableType } from '../../types/nodeCueTypes';
import { ExecutionContext } from './ExecutionContext';
import { VariableValue } from './executionTypes';

/**
 * Resolve a value source to an actual value at runtime.
 */
export function resolveValue(
  expectedType: VariableType,
  source: ValueSource | undefined,
  context: ExecutionContext
): number | boolean | string {
  if (!source) {
    return expectedType === 'number' ? 0 : expectedType === 'boolean' ? false : '';
  }

  if (source.source === 'literal') {
    if (expectedType === 'string') {
      return String(source.value);
    }
    if (expectedType === 'number') {
      if (typeof source.value === 'boolean') {
        return source.value ? 1 : 0;
      }
      if (typeof source.value === 'string') {
        const parsed = parseFloat(source.value);
        return isNaN(parsed) ? 0 : parsed;
      }
      return typeof source.value === 'number' ? source.value : 0;
    }
    return source.value === true || source.value === 'true';
  }

  // Check cue-level store first, then group-level (use context's stores)
  const cueVar = context.cueLevelVarStore.get(source.name);
  const groupVar = context.groupLevelVarStore.get(source.name);
  const existing = cueVar ?? groupVar;
  
  if (existing) {
    if (expectedType === 'string') {
      return String(existing.value);
    }
    if (expectedType === 'number') {
      if (typeof existing.value === 'string') {
        const parsed = parseFloat(existing.value);
        return isNaN(parsed) ? 0 : parsed;
      }
      return typeof existing.value === 'number' ? existing.value : (existing.value ? 1 : 0);
    }
    return existing.value === true || existing.value === 'true';
  }

  // Use fallback
  if (expectedType === 'string') {
    return source.fallback !== undefined ? String(source.fallback) : '';
  }
  if (expectedType === 'number') {
    if (typeof source.fallback === 'number') return source.fallback;
    if (typeof source.fallback === 'boolean') return source.fallback ? 1 : 0;
    if (typeof source.fallback === 'string') {
      const parsed = parseFloat(source.fallback);
      return isNaN(parsed) ? 0 : parsed;
    }
    return 0;
  }

  return source.fallback === true || source.fallback === 'true';
}

/**
 * Infer variable type from value.
 */
export function inferType(value: number | string | boolean): VariableType {
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  return 'string';
}

/**
 * Resolve location groups from ValueSource (comma-separated string to array).
 */
export function resolveLocationGroups(
  source: ValueSource,
  context: ExecutionContext
): LocationGroup[] {
  const value = resolveValue('string', source, context);
  if (typeof value !== 'string') return ['front'];
  
  // Parse comma-separated groups: "front,back" → ['front', 'back']
  const validGroups: LocationGroup[] = ['front', 'back', 'strobe'];
  return value.split(',')
    .map(g => g.trim())
    .filter(g => validGroups.includes(g as LocationGroup)) as LocationGroup[];
}

/**
 * Resolve light target filter from ValueSource.
 */
export function resolveLightTarget(
  source: ValueSource,
  context: ExecutionContext
): LightTarget {
  const value = resolveValue('string', source, context);
  const valid: LightTarget[] = ['all', 'even', 'odd', 'random-1', 'random-2', 'random-3'];
  return valid.includes(value as LightTarget) ? (value as LightTarget) : 'all';
}

/**
 * Resolve color name from ValueSource.
 */
export function resolveColor(
  source: ValueSource,
  context: ExecutionContext
): Color {
  const value = resolveValue('string', source, context);
  const validColors: Color[] = [
    'red', 'orange', 'yellow', 'green', 'blue', 'purple', 'white', 'transparent'
  ];
  return validColors.includes(value as Color) ? (value as Color) : 'blue';
}

/**
 * Resolve brightness level from ValueSource.
 */
export function resolveBrightness(
  source: ValueSource,
  context: ExecutionContext
): Brightness {
  const value = resolveValue('string', source, context);
  const valid: Brightness[] = ['low', 'medium', 'high', 'max'];
  return valid.includes(value as Brightness) ? (value as Brightness) : 'medium';
}

/**
 * Resolve blend mode from ValueSource.
 */
export function resolveBlendMode(
  source: ValueSource | undefined,
  context: ExecutionContext
): BlendMode | undefined {
  if (!source) return undefined;
  const value = resolveValue('string', source, context);
  const valid: BlendMode[] = ['replace', 'add', 'multiply', 'overlay'];
  return valid.includes(value as BlendMode) ? (value as BlendMode) : 'replace';
}

/**
 * Get the appropriate variable store for a variable name.
 */
export function getVariableStore(
  varName: string,
  variableDefinitions: { name: string; scope: 'cue' | 'cue-group' }[],
  cueLevelVarStore: Map<string, VariableValue>,
  groupLevelVarStore: Map<string, VariableValue>
): Map<string, VariableValue> {
  // Check if variable is defined in cue-level registry
  const isCueLevel = variableDefinitions.some(v => v.name === varName && v.scope === 'cue');
  return isCueLevel ? cueLevelVarStore : groupLevelVarStore;
}
