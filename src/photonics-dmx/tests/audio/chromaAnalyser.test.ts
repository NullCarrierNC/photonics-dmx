/**
 * Unit tests for ChromaAnalyser.
 */

import { computeChromagram } from '../../listeners/Audio/ChromaAnalyser'

const A4_HZ = 440
const SAMPLE_RATE = 44100
const FFT_SIZE = 2048
const BIN_SIZE = SAMPLE_RATE / FFT_SIZE

describe('ChromaAnalyser', () => {
  it('returns 12 values', () => {
    const data = new Uint8Array(1024)
    data[100] = 255
    const chroma = computeChromagram(data, BIN_SIZE)
    expect(chroma.length).toBe(12)
  })

  it('normalises so max is 1', () => {
    const data = new Uint8Array(1024)
    for (let i = 0; i < 1024; i++) data[i] = 100
    const chroma = computeChromagram(data, BIN_SIZE)
    const max = Math.max(...chroma)
    expect(max).toBe(1)
  })

  it('lights up pitch class for single frequency (A4)', () => {
    const data = new Uint8Array(1024)
    const binForA4 = Math.round(A4_HZ / BIN_SIZE)
    data[binForA4] = 255
    const chroma = computeChromagram(data, BIN_SIZE)
    expect(chroma[9]).toBeGreaterThan(0)
    expect(chroma[9]).toBe(1)
  })

  it('ignores bin 0 (below 20 Hz)', () => {
    const data = new Uint8Array(1024)
    data[0] = 255
    const chroma = computeChromagram(data, BIN_SIZE)
    expect(chroma.every((c) => c === 0)).toBe(true)
  })
})
