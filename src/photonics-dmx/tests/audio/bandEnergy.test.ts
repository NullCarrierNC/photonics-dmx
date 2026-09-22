import { describe, expect, it } from '@jest/globals'
import { getBandEnergy } from '../../listeners/Audio/bandEnergy'

/** 1024 bins at 48 kHz with a 2048-point FFT, so each bin is 23.4375 Hz wide. */
const SAMPLE_RATE = 48000
const FFT_SIZE = 2048

describe('getBandEnergy', () => {
  it('reads an analyser byte buffer as it comes, without a copy', () => {
    const bins = new Uint8Array(1024).fill(51)

    expect(getBandEnergy(bins, SAMPLE_RATE, FFT_SIZE, 20, 220)).toBeCloseTo(0.2)
  })

  it('gives the same energy for the same bins in a plain array', () => {
    const bytes = new Uint8Array(1024).map((_, i) => i % 256)

    expect(getBandEnergy(bytes, SAMPLE_RATE, FFT_SIZE, 100, 4000)).toBe(
      getBandEnergy(Array.from(bytes), SAMPLE_RATE, FFT_SIZE, 100, 4000),
    )
  })
})
