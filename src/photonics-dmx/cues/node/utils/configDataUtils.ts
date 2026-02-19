/**
 * Utility functions for config data property metadata.
 * Used by UI components (LogicNodeEditor).
 */

import { CONFIG_LIGHT_GROUPS, PATTERN_TARGETS } from '../../../constants/nodeConstants'
import { getPatternPropertyId } from './patternUtils'

/**
 * Config data property metadata for UI display
 */
export interface ConfigDataPropertyMeta {
  id: string
  label: string
  type: 'number' | 'light-array'
  category?: string
}

/**
 * Generate UI metadata for config data properties
 */
export function getConfigDataPropertiesMeta(): ConfigDataPropertyMeta[] {
  const result: ConfigDataPropertyMeta[] = [
    { id: 'total-lights', label: 'Total Lights', type: 'number' },
    { id: 'front-lights-count', label: 'Front Lights Count', type: 'number' },
    { id: 'back-lights-count', label: 'Back Lights Count', type: 'number' },
    { id: 'all-lights-array', label: 'All Lights Array', type: 'light-array' },
    { id: 'front-lights-array', label: 'Front Lights Array', type: 'light-array' },
    { id: 'back-lights-array', label: 'Back Lights Array', type: 'light-array' },
  ]

  // Add pattern filter properties
  for (const group of CONFIG_LIGHT_GROUPS) {
    const groupLabel = group.charAt(0).toUpperCase() + group.slice(1)

    for (const target of PATTERN_TARGETS) {
      const targetLabel = target.charAt(0).toUpperCase() + target.slice(1).replace(/-/g, ' ')
      result.push({
        id: getPatternPropertyId(group, target),
        label: `${groupLabel} Lights - ${targetLabel}`,
        type: 'light-array',
        category: `${groupLabel} Patterns`,
      })
    }
  }

  return result
}
