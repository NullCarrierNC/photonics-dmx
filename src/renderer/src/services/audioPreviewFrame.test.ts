/**
 * What counts as a preview-worthy change between two analysis frames.
 */
import { describe, expect, it } from '@jest/globals'
import type { AudioLightingData } from '../../../photonics-dmx/listeners/Audio/AudioTypes'
import { previewFrameChanged } from './audioPreviewFrame'

const THRESHOLD = 0.01

function frame(overrides: Partial<AudioLightingData> = {}): AudioLightingData {
  return {
    timestamp: 0,
    overallLevel: 0.5,
    bpm: 120,
    beatDetected: false,
    energy: 0.5,
    ...overrides,
  }
}

describe('previewFrameChanged', () => {
  it('passes the first frame through', () => {
    expect(previewFrameChanged(null, frame(), THRESHOLD)).toBe(true)
  })

  it('holds a frame that matches the last one', () => {
    expect(previewFrameChanged(frame(), frame(), THRESHOLD)).toBe(false)
  })

  it('passes a beat edge in either direction', () => {
    expect(previewFrameChanged(frame(), frame({ beatDetected: true }), THRESHOLD)).toBe(true)
    expect(previewFrameChanged(frame({ beatDetected: true }), frame(), THRESHOLD)).toBe(true)
  })

  it('passes a tempo change', () => {
    expect(previewFrameChanged(frame(), frame({ bpm: 128 }), THRESHOLD)).toBe(true)
  })

  it('passes a tempo that drops out', () => {
    expect(previewFrameChanged(frame(), frame({ bpm: null }), THRESHOLD)).toBe(true)
  })

  it('passes a change in tempo confidence', () => {
    expect(
      previewFrameChanged(frame({ bpmConfidence: 0.2 }), frame({ bpmConfidence: 0.9 }), THRESHOLD),
    ).toBe(true)
  })

  it('reads absent confidence as zero rather than a change', () => {
    expect(previewFrameChanged(frame({ bpmConfidence: 0 }), frame(), THRESHOLD)).toBe(false)
    expect(previewFrameChanged(frame(), frame({ bpmConfidence: 0.5 }), THRESHOLD)).toBe(true)
  })

  it('passes energy that moves past the threshold', () => {
    expect(previewFrameChanged(frame({ energy: 0.5 }), frame({ energy: 0.52 }), THRESHOLD)).toBe(
      true,
    )
  })

  it('holds energy that moves less than the threshold', () => {
    expect(previewFrameChanged(frame({ energy: 0.5 }), frame({ energy: 0.505 }), THRESHOLD)).toBe(
      false,
    )
  })

  /**
   * Zero to the threshold is one of the few pairs whose difference is exact in binary floating
   * point, so it lands on the boundary rather than near it.
   */
  it('holds energy that moves by the threshold itself', () => {
    expect(previewFrameChanged(frame({ energy: 0 }), frame({ energy: THRESHOLD }), THRESHOLD)).toBe(
      false,
    )
  })
})

describe('previewFrameChanged spectrum sampling', () => {
  /** Bins the sampler reads: first, middle and last. */
  const spectrum = (first: number, middle: number, last: number): number[] => [
    first,
    0,
    middle,
    0,
    last,
  ]

  const withBins = (bins: number[]): AudioLightingData => frame({ rawFrequencyData: bins })

  it('passes a moved first bin', () => {
    expect(
      previewFrameChanged(withBins(spectrum(0, 0, 0)), withBins(spectrum(9, 0, 0)), THRESHOLD),
    ).toBe(true)
  })

  it('passes a moved middle bin', () => {
    expect(
      previewFrameChanged(withBins(spectrum(0, 0, 0)), withBins(spectrum(0, 9, 0)), THRESHOLD),
    ).toBe(true)
  })

  it('passes a moved last bin', () => {
    expect(
      previewFrameChanged(withBins(spectrum(0, 0, 0)), withBins(spectrum(0, 0, 9)), THRESHOLD),
    ).toBe(true)
  })

  it('holds bins that move by two steps or fewer', () => {
    expect(
      previewFrameChanged(withBins(spectrum(0, 0, 0)), withBins(spectrum(2, 2, 2)), THRESHOLD),
    ).toBe(false)
  })

  it('misses a bin the sampler does not read', () => {
    const before = withBins([0, 0, 0, 0, 0])
    const after = withBins([0, 200, 0, 200, 0])

    expect(previewFrameChanged(before, after, THRESHOLD)).toBe(false)
  })

  it('passes a spectrum that changes length', () => {
    expect(previewFrameChanged(withBins([0, 0, 0]), withBins([0, 0, 0, 0]), THRESHOLD)).toBe(true)
  })

  it('passes a spectrum that appears', () => {
    expect(previewFrameChanged(frame(), withBins([0, 0, 0]), THRESHOLD)).toBe(true)
  })

  it('holds two frames that both carry no spectrum', () => {
    expect(previewFrameChanged(frame(), frame(), THRESHOLD)).toBe(false)
  })
})
