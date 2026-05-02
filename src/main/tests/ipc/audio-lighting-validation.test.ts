import { describe, expect, it } from '@jest/globals'
import { validateAudioLightingData } from '../../ipc/audioLightingValidation'

describe('validateAudioLightingData', () => {
  const validFrame = {
    timestamp: Date.now(),
    overallLevel: 0.5,
    bpm: 120,
    beatDetected: false,
    energy: 0.3,
  }

  it('accepts a minimal valid frame', () => {
    const r = validateAudioLightingData(validFrame)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.timestamp).toBe(validFrame.timestamp)
      expect(r.value.bpm).toBe(120)
    }
  })

  it('accepts bpm null', () => {
    const r = validateAudioLightingData({ ...validFrame, bpm: null })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.bpm).toBeNull()
  })

  it('rejects non-object', () => {
    const r = validateAudioLightingData(null)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/plain object/)
  })

  it('rejects invalid overallLevel', () => {
    const r = validateAudioLightingData({ ...validFrame, overallLevel: 2 })
    expect(r.ok).toBe(false)
  })

  it('rejects missing beatDetected', () => {
    const r = validateAudioLightingData({ ...validFrame, beatDetected: undefined })
    expect(r.ok).toBe(false)
  })

  it('accepts optional spectral fields when valid', () => {
    const r = validateAudioLightingData({
      ...validFrame,
      spectralCentroid: 0.4,
      melBands: [0.1, 0.2],
    })
    expect(r.ok).toBe(true)
  })

  it('rejects invalid melBands element', () => {
    const r = validateAudioLightingData({
      ...validFrame,
      melBands: [0.1, NaN],
    })
    expect(r.ok).toBe(false)
  })

  it('rejects oversized rawFrequencyData arrays', () => {
    const huge = new Array(32769).fill(0)
    const r = validateAudioLightingData({ ...validFrame, rawFrequencyData: huge })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/rawFrequencyData length/)
  })

  it('rejects oversized melBands arrays', () => {
    const huge = new Array(257).fill(0)
    const r = validateAudioLightingData({ ...validFrame, melBands: huge })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/melBands length/)
  })

  it('rejects oversized chromagram arrays', () => {
    const huge = new Array(65).fill(0)
    const r = validateAudioLightingData({ ...validFrame, chromagram: huge })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/chromagram length/)
  })

  it('rejects bandSpectralFeatures with too many keys', () => {
    const features: Record<string, { flatness: number; crest: number; centroid: number }> = {}
    for (let i = 0; i <= 256; i++) {
      features[`b${i}`] = { flatness: 0, crest: 0, centroid: 0 }
    }
    const r = validateAudioLightingData({ ...validFrame, bandSpectralFeatures: features })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/bandSpectralFeatures has \d+ keys/)
  })

  it('rejects Infinity on required numeric fields', () => {
    expect(validateAudioLightingData({ ...validFrame, overallLevel: Infinity }).ok).toBe(false)
    expect(validateAudioLightingData({ ...validFrame, energy: Infinity }).ok).toBe(false)
    expect(validateAudioLightingData({ ...validFrame, timestamp: Infinity }).ok).toBe(false)
  })

  it('rejects out-of-range optional spectral fields', () => {
    expect(validateAudioLightingData({ ...validFrame, spectralCentroid: 1.5 }).ok).toBe(false)
    expect(validateAudioLightingData({ ...validFrame, spectralFlatness: -0.1 }).ok).toBe(false)
    expect(validateAudioLightingData({ ...validFrame, hfcOnset: 2 }).ok).toBe(false)
    expect(validateAudioLightingData({ ...validFrame, zeroCrossingRate: -1 }).ok).toBe(false)
  })

  it('rejects bpmConfidence: null (type does not allow null)', () => {
    const r = validateAudioLightingData({ ...validFrame, bpmConfidence: null })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/bpmConfidence must be omitted/)
  })

  it('accepts boundary values 0 and 1 on unit-interval fields', () => {
    const r = validateAudioLightingData({
      ...validFrame,
      amplitude: 0,
      spectralCentroid: 1,
      spectralFlatness: 0,
      hfcOnset: 1,
    })
    expect(r.ok).toBe(true)
  })
})
