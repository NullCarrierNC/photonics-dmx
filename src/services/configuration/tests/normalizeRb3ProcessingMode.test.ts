import { normalizeRb3ProcessingMode } from '../configurationDefaults'

describe('normalizeRb3ProcessingMode', () => {
  it('passes the two valid modes through', () => {
    expect(normalizeRb3ProcessingMode('direct')).toBe('direct')
    expect(normalizeRb3ProcessingMode('cue')).toBe('cue')
  })

  it('normalizes anything else to cue', () => {
    expect(normalizeRb3ProcessingMode('Direct')).toBe('cue')
    expect(normalizeRb3ProcessingMode('')).toBe('cue')
    expect(normalizeRb3ProcessingMode(undefined)).toBe('cue')
    expect(normalizeRb3ProcessingMode(null)).toBe('cue')
    expect(normalizeRb3ProcessingMode(42)).toBe('cue')
  })
})
