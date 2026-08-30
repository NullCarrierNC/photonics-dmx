/**
 * Data extraction utilities for the node execution engine.
 * Extracts values from CueData, AudioCueData, and configuration.
 */

import { DmxLightManager } from '../../../controllers/DmxLightManager'
import { CueData } from '../../types/cueTypes'
import { AudioCueData } from '../../types/audioCueTypes'
import { TrackedLight, LightTarget } from '../../../types'
import { NodeCueMode } from '../../types/nodeCueTypes'
import { parsePatternPropertyId, configLightGroupToLocationGroups } from '../utils/patternUtils'
import { getCueDomain } from '../../domains'

/**
 * Resolve a cue-data property against the family the running cue belongs to.
 *
 * `mode` is the cue's declared domain, carried from the file it was loaded from, so a frame missing
 * an optional field still resolves against the right family and yarg is distinguishable from rb3.
 * Adding a mode needs no edit here: the descriptor it registers supplies the extractor.
 */
export function extractCueDataValue(
  property: string,
  cueData: CueData | AudioCueData,
  cueId: string,
  mode: NodeCueMode,
): number | string | boolean {
  return getCueDomain(mode).extractCueData(property, cueData, cueId)
}

/**
 * Extract config data value based on property.
 * Returns either a number (for counts) or TrackedLight[] (for arrays).
 * Uses shared constants for DRY pattern filter handling.
 */
export function extractConfigDataValue(
  property: string,
  lightManager: DmxLightManager,
): number | TrackedLight[] {
  // Handle base properties
  switch (property) {
    case 'total-lights':
      return lightManager.getLightsInGroup(['front', 'back']).length
    case 'front-lights-count':
      return lightManager.getLightsInGroup('front').length
    case 'back-lights-count':
      return lightManager.getLightsInGroup('back').length
    case 'all-lights-array':
      return lightManager.getLightsInGroup(['front', 'back'])
    case 'front-lights-array':
      return lightManager.getLightsInGroup('front')
    case 'back-lights-array':
      return lightManager.getLightsInGroup('back')
    case 'strobe-lights-array':
      return lightManager.getLightsInGroup('strobe')
  }

  // Try to parse as a pattern filter property (DRY approach)
  const parsed = parsePatternPropertyId(property)
  if (parsed) {
    const locationGroups = configLightGroupToLocationGroups(parsed.group)
    return lightManager.getLights(locationGroups, parsed.target as LightTarget)
  }

  return 0
}
