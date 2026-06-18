import { describe, expect, it } from '@jest/globals'
import {
  CueType,
  STROBE_CUE_TYPES,
  cueTypeToStrobeSlot,
  isStrobeCueType,
} from '../../cues/types/cueTypes'

describe('isStrobeCueType', () => {
  it('returns true for every strobe variant including Strobe_Off', () => {
    for (const type of STROBE_CUE_TYPES) {
      expect(isStrobeCueType(type)).toBe(true)
    }
  })

  it('returns false for non-strobe cues', () => {
    expect(isStrobeCueType(CueType.Default)).toBe(false)
    expect(isStrobeCueType(CueType.Frenzy)).toBe(false)
    expect(isStrobeCueType(CueType.NoCue)).toBe(false)
  })
})

describe('cueTypeToStrobeSlot', () => {
  it('maps each strobe speed cue to its slot', () => {
    expect(cueTypeToStrobeSlot(CueType.Strobe_Slow)).toBe('slow')
    expect(cueTypeToStrobeSlot(CueType.Strobe_Medium)).toBe('medium')
    expect(cueTypeToStrobeSlot(CueType.Strobe_Fast)).toBe('fast')
    expect(cueTypeToStrobeSlot(CueType.Strobe_Fastest)).toBe('fastest')
  })

  it('returns null for Strobe_Off and non-strobe cues', () => {
    expect(cueTypeToStrobeSlot(CueType.Strobe_Off)).toBeNull()
    expect(cueTypeToStrobeSlot(CueType.Default)).toBeNull()
  })
})
