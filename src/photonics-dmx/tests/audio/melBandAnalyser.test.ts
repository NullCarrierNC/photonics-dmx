/**
 * Unit tests for MelBandAnalyser.
 */

import { MelBandAnalyser } from '../../listeners/Audio/MelBandAnalyser'

const SAMPLE_RATE = 44100
const FFT_SIZE = 2048

describe('MelBandAnalyser', () => {
  it('builds filterbank and returns numBands values', () => {
    const analyser = new MelBandAnalyser(SAMPLE_RATE, FFT_SIZE, 24)
    const data = new Uint8Array(1024)
    for (let i = 0; i < 1024; i++) data[i] = 100
    const bands = analyser.computeMelBands(data)
    expect(bands.length).toBe(24)
    bands.forEach((v) => {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    })
  })

  it('returns higher energy in low bands when low bins have energy', () => {
    const analyser = new MelBandAnalyser(SAMPLE_RATE, FFT_SIZE, 24)
    const lowBass = new Uint8Array(1024)
    for (let i = 0; i < 20; i++) lowBass[i] = 255
    const highBass = new Uint8Array(1024)
    for (let i = 500; i < 520; i++) highBass[i] = 255
    const bandsLow = analyser.computeMelBands(lowBass)
    const bandsHigh = analyser.computeMelBands(highBass)
    const sumLow = bandsLow.slice(0, 6).reduce((a, b) => a + b, 0)
    const sumHigh = bandsHigh.slice(0, 6).reduce((a, b) => a + b, 0)
    expect(sumLow).toBeGreaterThan(sumHigh)
  })

  it('returns zero bands for silent input', () => {
    const analyser = new MelBandAnalyser(SAMPLE_RATE, FFT_SIZE, 24)
    const data = new Uint8Array(1024)
    const bands = analyser.computeMelBands(data)
    expect(bands.every((v) => v === 0)).toBe(true)
  })
})
