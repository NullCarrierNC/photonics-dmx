/**
 * Tests for dataExtractors: YARG cue data properties and extractConfigDataValue.
 */

import {
  extractYargCueDataValue,
  extractConfigDataValue,
} from '../../../../cues/node/runtime/dataExtractors'
import type { CueData } from '../../../../cues/types/cueTypes'
import type { DmxLightManager } from '../../../../controllers/DmxLightManager'
import type { TrackedLight } from '../../../../types'

function minimalCueData(overrides?: Partial<CueData>): CueData {
  return {
    datagramVersion: 1,
    platform: 'Unknown',
    currentScene: 'Gameplay',
    pauseState: 'Unpaused',
    venueSize: 'Small',
    beatsPerMinute: 120,
    songSection: 'Verse',
    guitarNotes: [],
    bassNotes: [],
    drumNotes: [],
    keysNotes: [],
    vocalNote: 0,
    harmony0Note: 0,
    harmony1Note: 0,
    harmony2Note: 0,
    lightingCue: 'Chorus',
    postProcessing: 'Default',
    fogState: false,
    strobeState: 'Strobe_Off',
    performer: 1,
    keyframe: 'kf-1',
    bonusEffect: true,
    beat: 'Strong',
    previousCue: 'Intro',
    executionCount: 5,
    cueStartTime: Date.now() - 10000,
    timeSinceLastCue: 500,
    totalScore: 10000,
    ...overrides,
  } as CueData
}

describe('dataExtractors', () => {
  describe('extractYargCueDataValue', () => {
    it('extracts previous-cue', () => {
      const cueData = minimalCueData({ previousCue: 'Intro' as any })
      expect(extractYargCueDataValue('previous-cue', cueData, 'my-cue')).toBe('Intro')
    })

    it('extracts song-section', () => {
      const cueData = minimalCueData({ songSection: 'Chorus' as any })
      expect(extractYargCueDataValue('song-section', cueData, 'my-cue')).toBe('Chorus')
    })

    it('extracts beat-type', () => {
      const cueData = minimalCueData({ beat: 'Strong' as any })
      expect(extractYargCueDataValue('beat-type', cueData, 'my-cue')).toBe('Strong')
    })

    it('extracts keyframe', () => {
      const cueData = minimalCueData({ keyframe: 'custom-key' })
      expect(extractYargCueDataValue('keyframe', cueData, 'my-cue')).toBe('custom-key')
    })

    it('extracts venue-size', () => {
      const cueData = minimalCueData({ venueSize: 'Large' })
      expect(extractYargCueDataValue('venue-size', cueData, 'my-cue')).toBe('Large')
    })

    it('extracts bass-note-count', () => {
      const cueData = minimalCueData({ bassNotes: [1, 2, 3] as any })
      expect(extractYargCueDataValue('bass-note-count', cueData, 'my-cue')).toBe(3)
    })

    it('extracts drum-note-count', () => {
      const cueData = minimalCueData({ drumNotes: [1, 2] as any })
      expect(extractYargCueDataValue('drum-note-count', cueData, 'my-cue')).toBe(2)
    })

    it('extracts keys-note-count', () => {
      const cueData = minimalCueData({ keysNotes: [1, 2, 3, 4] as any })
      expect(extractYargCueDataValue('keys-note-count', cueData, 'my-cue')).toBe(4)
    })

    it('extracts time-since-cue-start', () => {
      const start = Date.now() - 5000
      const cueData = minimalCueData({ cueStartTime: start })
      const result = extractYargCueDataValue('time-since-cue-start', cueData, 'my-cue') as number
      expect(result).toBeGreaterThanOrEqual(4000)
      expect(result).toBeLessThanOrEqual(6000)
    })

    it('extracts time-since-last-cue', () => {
      const cueData = minimalCueData({ timeSinceLastCue: 300 })
      expect(extractYargCueDataValue('time-since-last-cue', cueData, 'my-cue')).toBe(300)
    })

    it('extracts fog-state', () => {
      const cueData = minimalCueData({ fogState: true })
      expect(extractYargCueDataValue('fog-state', cueData, 'my-cue')).toBe(true)
    })

    it('extracts bonus-effect', () => {
      const cueData = minimalCueData({ bonusEffect: true })
      expect(extractYargCueDataValue('bonus-effect', cueData, 'my-cue')).toBe(true)
    })

    it('extracts performer', () => {
      const cueData = minimalCueData({ performer: 2 })
      expect(extractYargCueDataValue('performer', cueData, 'my-cue')).toBe(2)
    })
  })

  describe('extractConfigDataValue', () => {
    it('returns lights array for known pattern property front-lights-odd', () => {
      const mockLights: TrackedLight[] = [
        { id: 'f1', position: 0, config: {} as any },
        { id: 'f2', position: 1, config: {} as any },
      ]
      const mockLightManager = {
        getLights: jest.fn().mockReturnValue(mockLights),
        getLightsInGroup: jest.fn(),
      } as unknown as DmxLightManager

      const result = extractConfigDataValue('front-lights-odd', mockLightManager)

      expect(Array.isArray(result)).toBe(true)
      expect(result).toEqual(mockLights)
      expect(mockLightManager.getLights).toHaveBeenCalledWith(['front'], 'odd')
    })

    it('returns 0 for unknown property ID', () => {
      const mockLightManager = {
        getLights: jest.fn(),
        getLightsInGroup: jest.fn(),
      } as unknown as DmxLightManager

      const result = extractConfigDataValue('unknown-property-id', mockLightManager)

      expect(result).toBe(0)
      expect(mockLightManager.getLights).not.toHaveBeenCalled()
    })
  })
})
