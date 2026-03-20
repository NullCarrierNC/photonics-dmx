/**
 * Unit tests for SpectralFeatureExtractor.
 */

import {
  spectralCentroid,
  spectralFlatness,
  spectralRolloff,
  spectralCrest,
  hfc,
  spectralSpread,
  zeroCrossingRate,
  extractAll,
} from '../../listeners/Audio/SpectralFeatureExtractor'

const SAMPLE_RATE = 44100
const FFT_SIZE = 2048
const BIN_SIZE = SAMPLE_RATE / FFT_SIZE
const NYQUIST = SAMPLE_RATE / 2

describe('SpectralFeatureExtractor', () => {
  describe('spectralCentroid', () => {
    it('returns 0 for silent spectrum', () => {
      const data = new Uint8Array(1024)
      expect(spectralCentroid(data, BIN_SIZE, NYQUIST)).toBe(0)
    })

    it('returns low value when energy is at low bins', () => {
      const data = new Uint8Array(1024)
      data[0] = 255
      data[1] = 255
      expect(spectralCentroid(data, BIN_SIZE, NYQUIST)).toBeLessThan(0.1)
    })

    it('returns higher value when energy is at high bins', () => {
      const data = new Uint8Array(1024)
      data[1000] = 255
      data[1001] = 255
      expect(spectralCentroid(data, BIN_SIZE, NYQUIST)).toBeGreaterThan(0.8)
    })
  })

  describe('spectralFlatness', () => {
    it('returns high flatness (near 1) for flat spectrum', () => {
      const data = new Uint8Array(1024)
      for (let i = 0; i < 1024; i++) data[i] = 100
      expect(spectralFlatness(data)).toBeGreaterThan(0.9)
    })

    it('returns low flatness for single-peak spectrum', () => {
      const data = new Uint8Array(1024)
      data[50] = 255
      expect(spectralFlatness(data)).toBeLessThan(0.5)
    })
  })

  describe('spectralRolloff', () => {
    it('returns 0 for silent spectrum', () => {
      const data = new Uint8Array(1024)
      expect(spectralRolloff(data, BIN_SIZE, 0.85, NYQUIST)).toBe(0)
    })

    it('returns low value when energy is concentrated at low bins', () => {
      const data = new Uint8Array(1024)
      for (let i = 0; i < 10; i++) data[i] = 255
      expect(spectralRolloff(data, BIN_SIZE, 0.85, NYQUIST)).toBeLessThan(0.1)
    })
  })

  describe('spectralCrest', () => {
    it('returns 0 for silent spectrum', () => {
      const data = new Uint8Array(1024)
      expect(spectralCrest(data)).toBe(0)
    })

    it('returns high value for peaky spectrum', () => {
      const data = new Uint8Array(1024)
      for (let i = 0; i < 1024; i++) data[i] = 10
      data[100] = 255
      expect(spectralCrest(data)).toBeGreaterThan(0.5)
    })
  })

  describe('hfc', () => {
    it('returns 0 for silent spectrum', () => {
      const data = new Uint8Array(1024)
      expect(hfc(data)).toBe(0)
    })

    it('returns higher value when high bins have energy', () => {
      const low = new Uint8Array(1024)
      low[0] = 255
      const high = new Uint8Array(1024)
      high[500] = 255
      expect(hfc(high)).toBeGreaterThan(hfc(low))
    })
  })

  describe('spectralSpread', () => {
    it('returns 0 for single-bin spectrum', () => {
      const data = new Uint8Array(1024)
      data[100] = 255
      const centroidHz = spectralCentroid(data, BIN_SIZE, NYQUIST) * NYQUIST
      expect(spectralSpread(data, BIN_SIZE, centroidHz, NYQUIST)).toBeLessThan(0.01)
    })
  })

  describe('zeroCrossingRate', () => {
    it('returns 0 for DC signal', () => {
      const data = new Float32Array(100).fill(0.5)
      expect(zeroCrossingRate(data)).toBe(0)
    })

    it('returns high value for alternating sign', () => {
      const data = new Float32Array(100)
      for (let i = 0; i < 100; i++) data[i] = i % 2 === 0 ? 0.5 : -0.5
      expect(zeroCrossingRate(data)).toBeGreaterThan(0.9)
    })
  })

  describe('extractAll', () => {
    it('returns all features in 0–1 range', () => {
      const freq = new Uint8Array(1024)
      for (let i = 0; i < 200; i++) freq[i] = 50 + Math.floor(Math.random() * 100)
      const time = new Float32Array(2048)
      for (let i = 0; i < 2048; i++) time[i] = (Math.random() - 0.5) * 2
      const out = extractAll(freq, time, BIN_SIZE, SAMPLE_RATE)
      expect(out.spectralCentroid).toBeGreaterThanOrEqual(0)
      expect(out.spectralCentroid).toBeLessThanOrEqual(1)
      expect(out.spectralFlatness).toBeGreaterThanOrEqual(0)
      expect(out.spectralFlatness).toBeLessThanOrEqual(1)
      expect(out.spectralRolloff).toBeGreaterThanOrEqual(0)
      expect(out.spectralRolloff).toBeLessThanOrEqual(1)
      expect(out.spectralCrest).toBeGreaterThanOrEqual(0)
      expect(out.spectralSpread).toBeGreaterThanOrEqual(0)
      expect(out.hfcOnset).toBeGreaterThanOrEqual(0)
      expect(out.hfcOnset).toBeLessThanOrEqual(1)
      expect(out.zeroCrossingRate).toBeGreaterThanOrEqual(0)
      expect(out.zeroCrossingRate).toBeLessThanOrEqual(1)
    })

    it('handles null time domain', () => {
      const freq = new Uint8Array(1024)
      freq[10] = 255
      const out = extractAll(freq, null, BIN_SIZE, SAMPLE_RATE)
      expect(out.zeroCrossingRate).toBe(0)
      expect(out.spectralCentroid).toBeGreaterThan(0)
    })
  })
})
