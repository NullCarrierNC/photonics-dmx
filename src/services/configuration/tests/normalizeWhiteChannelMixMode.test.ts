import { normalizeWhiteChannelMixMode } from '../configurationDefaults'

describe('normalizeWhiteChannelMixMode', () => {
  it('passes the three valid modes through', () => {
    expect(normalizeWhiteChannelMixMode('w-only')).toBe('w-only')
    expect(normalizeWhiteChannelMixMode('strobe-rgbw')).toBe('strobe-rgbw')
    expect(normalizeWhiteChannelMixMode('always-rgbw')).toBe('always-rgbw')
  })

  it('normalizes anything else to always-rgbw', () => {
    expect(normalizeWhiteChannelMixMode('Always-RGBW')).toBe('always-rgbw')
    expect(normalizeWhiteChannelMixMode('')).toBe('always-rgbw')
    expect(normalizeWhiteChannelMixMode(undefined)).toBe('always-rgbw')
    expect(normalizeWhiteChannelMixMode(null)).toBe('always-rgbw')
    expect(normalizeWhiteChannelMixMode(42)).toBe('always-rgbw')
  })
})
