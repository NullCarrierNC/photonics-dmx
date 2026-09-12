import { describe, expect, it } from '@jest/globals'
import { beatDurationMs, DEFAULT_BEAT_MS } from '../../helpers/tempo'

describe('beatDurationMs', () => {
  it.each([
    [60, 1000],
    [120, 500],
    [137.5, 436],
    [400, 150],
  ])('converts %s BPM to %sms', (bpm, expected) => {
    expect(beatDurationMs(bpm)).toBe(expected)
  })

  it.each([
    ['no tempo', 0],
    ['a negative tempo', -120],
    ['not a number', Number.NaN],
    ['infinity', Number.POSITIVE_INFINITY],
  ])('returns the fallback for %s', (_label, bpm) => {
    expect(beatDurationMs(bpm)).toBe(DEFAULT_BEAT_MS)
  })

  it('takes a caller-supplied fallback', () => {
    expect(beatDurationMs(0, 250)).toBe(250)
  })

  it('does not return a zero-length beat for an absurd tempo', () => {
    expect(beatDurationMs(1e9)).toBe(DEFAULT_BEAT_MS)
  })
})
