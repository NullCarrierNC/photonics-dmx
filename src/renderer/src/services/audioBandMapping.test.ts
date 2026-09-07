/**
 * How FFT bins are assigned to the configured bands, and the onset windows derived alongside them.
 */
import { describe, expect, it } from '@jest/globals'
import type { AudioBandDefinition } from '../../../photonics-dmx/listeners/Audio/AudioTypes'
import { buildBinToBandMap } from './audioBandMapping'

function band(overrides: Partial<AudioBandDefinition> = {}): AudioBandDefinition {
  return { id: 'b', name: 'Band', minHz: 0, maxHz: 100, gain: 1, ...overrides }
}

/** 1000 Hz over 100 bins, so bin N sits at N times 10 Hz. */
const SAMPLE_RATE = 2000
const FFT_SIZE = 200
const BIN_COUNT = 100

describe('buildBinToBandMap', () => {
  it('assigns a bin to the band covering its centre frequency', () => {
    const bands = [
      band({ id: 'low', minHz: 0, maxHz: 200 }),
      band({ id: 'high', minHz: 200, maxHz: 400 }),
    ]

    const { binToBandMap } = buildBinToBandMap(SAMPLE_RATE, FFT_SIZE, BIN_COUNT, bands)

    expect(binToBandMap[0]).toBe(0)
    expect(binToBandMap[19]).toBe(0)
    expect(binToBandMap[20]).toBe(1)
    expect(binToBandMap[39]).toBe(1)
  })

  it('leaves a bin no band covers unassigned', () => {
    const bands = [band({ id: 'mid', minHz: 100, maxHz: 200 })]

    const { binToBandMap } = buildBinToBandMap(SAMPLE_RATE, FFT_SIZE, BIN_COUNT, bands)

    expect(binToBandMap[0]).toBe(-1)
    expect(binToBandMap[9]).toBe(-1)
    expect(binToBandMap[10]).toBe(0)
    expect(binToBandMap[20]).toBe(-1)
  })

  it('treats a band as closed at the top and open at the bottom', () => {
    const bands = [band({ minHz: 100, maxHz: 200 })]

    const { binToBandMap } = buildBinToBandMap(SAMPLE_RATE, FFT_SIZE, BIN_COUNT, bands)

    // 100 Hz is bin 10 and belongs to the band, 200 Hz is bin 20 and does not.
    expect(binToBandMap[10]).toBe(0)
    expect(binToBandMap[19]).toBe(0)
    expect(binToBandMap[20]).toBe(-1)
  })

  it('gives an overlapping bin to the first band that covers it', () => {
    const bands = [
      band({ id: 'wide', minHz: 0, maxHz: 400 }),
      band({ id: 'narrow', minHz: 100, maxHz: 200 }),
    ]

    const { binToBandMap } = buildBinToBandMap(SAMPLE_RATE, FFT_SIZE, BIN_COUNT, bands)

    expect(binToBandMap[15]).toBe(0)
  })

  it('covers every bin', () => {
    const bands = [band({ minHz: 0, maxHz: 20000 })]

    const { binToBandMap } = buildBinToBandMap(SAMPLE_RATE, FFT_SIZE, BIN_COUNT, bands)

    expect(binToBandMap.length).toBe(BIN_COUNT)
    expect(Array.from(binToBandMap).every((index) => index === 0)).toBe(true)
  })

  it('keeps the gains in the order the bands are configured', () => {
    const bands = [
      band({ id: 'a', minHz: 0, maxHz: 100, gain: 0.5 }),
      band({ id: 'b', minHz: 100, maxHz: 200, gain: 2 }),
    ]

    const { bandGains } = buildBinToBandMap(SAMPLE_RATE, FFT_SIZE, BIN_COUNT, bands)

    expect(bandGains).toEqual([0.5, 2])
  })
})

describe('buildBinToBandMap onset windows', () => {
  it('spans each band in bins', () => {
    const bands = [band({ id: 'low', minHz: 100, maxHz: 200 })]

    const { onsetConfigs } = buildBinToBandMap(SAMPLE_RATE, FFT_SIZE, BIN_COUNT, bands)

    expect(onsetConfigs).toEqual([{ id: 'low', startBin: 10, endBin: 20 }])
  })

  it('holds the end of a band that runs past the spectrum', () => {
    const bands = [band({ id: 'top', minHz: 0, maxHz: 20000 })]

    const { onsetConfigs } = buildBinToBandMap(SAMPLE_RATE, FFT_SIZE, BIN_COUNT, bands)

    expect(onsetConfigs[0].endBin).toBe(BIN_COUNT)
  })

  it('rounds a band that starts and ends between bins outwards', () => {
    const bands = [band({ id: 'odd', minHz: 105, maxHz: 195 })]

    const { onsetConfigs } = buildBinToBandMap(SAMPLE_RATE, FFT_SIZE, BIN_COUNT, bands)

    expect(onsetConfigs[0]).toEqual({ id: 'odd', startBin: 10, endBin: 20 })
  })
})
