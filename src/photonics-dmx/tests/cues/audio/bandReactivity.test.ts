import { describe, it, expect } from '@jest/globals'
import { evaluateBandTrigger, type BandTriggerState } from '../../../cues/audio/bandReactivity'
import type { AudioTriggerNode } from '../../../cues/types/nodeCueTypes'
import type { AudioLightingData } from '../../../listeners/Audio/AudioTypes'

function makeState(): BandTriggerState {
  return {
    smoothedBandEnergy: new Map(),
    bandSmoothTime: new Map(),
    triggerPhase: new Map(),
    triggerEnterTime: new Map(),
  }
}

const trigger = {
  id: 't1',
  type: 'event',
  eventType: 'audio-trigger',
  frequencyRange: { minHz: 20, maxHz: 200 },
  threshold: 0.5,
} as unknown as AudioTriggerNode

// getBandEnergy averages bin/255 over the band, so a uniform level array yields that level as energy.
function audio(level: number): AudioLightingData {
  return {
    rawFrequencyData: new Array(32).fill(Math.round(level * 255)),
    sampleRate: 1000,
    fftSize: 64,
  } as unknown as AudioLightingData
}

describe('evaluateBandTrigger', () => {
  it('fires enter+during on the rising edge, during while held, exit on release', () => {
    const state = makeState()
    expect(evaluateBandTrigger(trigger, audio(0.2), [], state, 0)?.fire).toEqual([]) // below: idle
    expect(evaluateBandTrigger(trigger, audio(0.9), [], state, 10)?.fire).toEqual([
      'enter',
      'during',
    ])
    expect(evaluateBandTrigger(trigger, audio(0.9), [], state, 20)?.fire).toEqual(['during']) // held
    expect(evaluateBandTrigger(trigger, audio(0.1), [], state, 30)?.fire).toEqual(['exit']) // release
    expect(evaluateBandTrigger(trigger, audio(0.1), [], state, 40)?.fire).toEqual([]) // stays idle
  })

  it('returns null when the frame has no FFT data', () => {
    const state = makeState()
    const noData = {
      rawFrequencyData: [],
      sampleRate: 1000,
      fftSize: 64,
    } as unknown as AudioLightingData
    expect(evaluateBandTrigger(trigger, noData, [], state, 0)).toBeNull()
  })

  it('exposes the band metrics in the trigger context', () => {
    const state = makeState()
    const result = evaluateBandTrigger(trigger, audio(0.8), [], state, 0)
    expect(result?.context.triggerFrequencyMin).toBe(20)
    expect(result?.context.triggerFrequencyMax).toBe(200)
    expect(result?.context.triggerLevel).toBeGreaterThan(0)
  })
})
