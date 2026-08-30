import { describe, expect, it } from '@jest/globals'
import {
  evaluateAudioEvent,
  getAudioEventValue,
  type AudioEventState,
} from '../../../../cues/node/runtime/audioEventEvaluator'
import type { AudioCueData } from '../../../../cues/types/audioCueTypes'
import type { AudioEventNode } from '../../../../cues/types/nodeCueTypes'
import { DEFAULT_AUDIO_CONFIG } from '../../../../listeners/Audio/AudioConfig'

function frame(audio: Record<string, unknown> = {}): AudioCueData {
  return {
    timestamp: 0,
    executionCount: 1,
    audioData: {
      timestamp: 0,
      overallLevel: 0,
      bpm: 120,
      beatDetected: false,
      energy: 0,
      ...audio,
    },
    config: DEFAULT_AUDIO_CONFIG,
    enabledBandCount: 0,
  } as unknown as AudioCueData
}

function event(over: Partial<AudioEventNode> = {}): AudioEventNode {
  return {
    id: 'ev',
    type: 'event',
    eventType: 'audio-energy',
    threshold: 0.5,
    triggerMode: 'level',
    ...over,
  } as AudioEventNode
}

describe('audioEventEvaluator', () => {
  describe('getAudioEventValue', () => {
    it('maps beat to 1 only when a beat is detected', () => {
      expect(getAudioEventValue('beat', frame({ beatDetected: true }))).toBe(1)
      expect(getAudioEventValue('beat', frame({ beatDetected: false }))).toBe(0)
    })

    it('reads clamped energy and returns 0 for entry/trigger event types', () => {
      expect(getAudioEventValue('audio-energy', frame({ energy: 0.7 }))).toBeCloseTo(0.7)
      expect(getAudioEventValue('audio-energy', frame({ energy: 2 }))).toBe(1)
      expect(getAudioEventValue('cue-started', frame({ energy: 1 }))).toBe(0)
      expect(getAudioEventValue('audio-trigger', frame({ energy: 1 }))).toBe(0)
    })
  })

  describe('evaluateAudioEvent level mode', () => {
    it('reports active with a normalized intensity above the threshold', () => {
      const state: AudioEventState = { previousValue: 0, active: false }
      const result = evaluateAudioEvent(event({ threshold: 0.5 }), frame({ energy: 0.8 }), state)
      expect(result.mode).toBe('level')
      expect(result).toMatchObject({ active: true })
      // (0.8 - 0.5) / (1 - 0.5) = 0.6
      expect(result.intensity).toBeCloseTo(0.6)
      expect(state.active).toBe(true)
    })

    it('is inactive with zero intensity below the threshold', () => {
      const state: AudioEventState = { previousValue: 0, active: false }
      const result = evaluateAudioEvent(event({ threshold: 0.5 }), frame({ energy: 0.2 }), state)
      expect(result).toMatchObject({ mode: 'level', active: false, intensity: 0 })
    })
  })

  describe('evaluateAudioEvent edge mode', () => {
    it('fires once on a rising edge and not again while held above the threshold', () => {
      const beat = event({ eventType: 'beat', triggerMode: 'edge', threshold: 0.5 })
      const state: AudioEventState = { previousValue: 0, active: false }

      const first = evaluateAudioEvent(beat, frame({ beatDetected: true }), state)
      expect(first).toMatchObject({ mode: 'edge', triggered: true })

      // Held high: previousValue is now 1, so no new rising edge.
      const second = evaluateAudioEvent(beat, frame({ beatDetected: true }), state)
      expect(second).toMatchObject({ mode: 'edge', triggered: false })
    })

    it('suppresses the edge when onset gating is on and no band onset clears the threshold', () => {
      const beat = event({
        eventType: 'beat',
        triggerMode: 'edge',
        threshold: 0.5,
        useOnsetGating: true,
        onsetThreshold: 0.3,
      })
      const state: AudioEventState = { previousValue: 0, active: false }
      const result = evaluateAudioEvent(
        beat,
        frame({ beatDetected: true, bandOnsets: { a: 0.1 } }),
        state,
      )
      expect(result).toMatchObject({ mode: 'edge', triggered: false })
    })
  })
})
