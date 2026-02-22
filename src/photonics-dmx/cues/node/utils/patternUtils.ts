/**
 * Utility functions for pattern property ID handling.
 * Used by runtime (dataExtractors) and UI (LogicNodeEditor).
 */

import type { LocationGroup } from '../../../types'
import {
  CONFIG_LIGHT_GROUPS,
  ConfigLightGroup,
  PATTERN_TARGETS,
  PatternTarget,
} from '../../../constants/nodeConstants'

/**
 * Generate a pattern property ID from group and target
 */
export function getPatternPropertyId(group: ConfigLightGroup, target: PatternTarget): string {
  return `${group}-lights-${target}`
}

/**
 * Parse a pattern property ID into group and target
 */
export function parsePatternPropertyId(
  propertyId: string,
): { group: ConfigLightGroup; target: PatternTarget } | null {
  for (const group of CONFIG_LIGHT_GROUPS) {
    const prefix = `${group}-lights-`
    if (propertyId.startsWith(prefix)) {
      const target = propertyId.slice(prefix.length) as PatternTarget
      if (PATTERN_TARGETS.includes(target)) {
        return { group, target }
      }
    }
  }
  return null
}

/**
 * Map config light group to LocationGroup array for runtime use
 */
export function configLightGroupToLocationGroups(group: ConfigLightGroup): LocationGroup[] {
  switch (group) {
    case 'front':
      return ['front']
    case 'back':
      return ['back']
  }
}
