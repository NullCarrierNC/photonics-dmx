/**
 * Tests for pattern property ID and config light group utilities.
 */

import {
  getPatternPropertyId,
  parsePatternPropertyId,
  configLightGroupToLocationGroups,
} from '../../../../cues/node/utils/patternUtils'
import { CONFIG_LIGHT_GROUPS, PATTERN_TARGETS } from '../../../../constants/nodeConstants'

describe('patternUtils', () => {
  describe('parsePatternPropertyId', () => {
    it('parses valid front-lights-odd', () => {
      const result = parsePatternPropertyId('front-lights-odd')
      expect(result).toEqual({ group: 'front', target: 'odd' })
    })

    it('parses valid back-lights-even', () => {
      const result = parsePatternPropertyId('back-lights-even')
      expect(result).toEqual({ group: 'back', target: 'even' })
    })

    it('returns null for invalid format', () => {
      expect(parsePatternPropertyId('invalid')).toBeNull()
      expect(parsePatternPropertyId('')).toBeNull()
      expect(parsePatternPropertyId('front-lights')).toBeNull()
    })

    it('returns null for non-config-group prefix (strobe not in CONFIG_LIGHT_GROUPS)', () => {
      const result = parsePatternPropertyId('strobe-lights-all')
      expect(result).toBeNull()
    })

    it('returns null when target is not in PATTERN_TARGETS', () => {
      const result = parsePatternPropertyId('front-lights-all')
      expect(result).toBeNull()
    })
  })

  describe('getPatternPropertyId', () => {
    it('produces well-formed string for front and odd', () => {
      expect(getPatternPropertyId('front', 'odd')).toBe('front-lights-odd')
    })

    it('produces well-formed string for back and even', () => {
      expect(getPatternPropertyId('back', 'even')).toBe('back-lights-even')
    })
  })

  describe('round-trip getPatternPropertyId and parsePatternPropertyId', () => {
    it('round-trips for all group and target combinations', () => {
      for (const group of CONFIG_LIGHT_GROUPS) {
        for (const target of PATTERN_TARGETS) {
          const id = getPatternPropertyId(group, target)
          const parsed = parsePatternPropertyId(id)
          expect(parsed).toEqual({ group, target })
        }
      }
    })
  })

  describe('configLightGroupToLocationGroups', () => {
    it('maps front to [front]', () => {
      expect(configLightGroupToLocationGroups('front')).toEqual(['front'])
    })

    it('maps back to [back]', () => {
      expect(configLightGroupToLocationGroups('back')).toEqual(['back'])
    })
  })
})
