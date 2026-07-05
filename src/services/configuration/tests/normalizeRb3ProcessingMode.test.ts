import { normalizeRb3ProcessingMode } from '../configurationDefaults'

describe('normalizeRb3ProcessingMode', () => {
  it('passes the two valid modes through', () => {
    expect(normalizeRb3ProcessingMode('direct')).toBe('direct')
    expect(normalizeRb3ProcessingMode('cue')).toBe('cue')
  })

  it('normalizes anything else to direct', () => {
    expect(normalizeRb3ProcessingMode('Cue')).toBe('direct')
    expect(normalizeRb3ProcessingMode('')).toBe('direct')
    expect(normalizeRb3ProcessingMode(undefined)).toBe('direct')
    expect(normalizeRb3ProcessingMode(null)).toBe('direct')
    expect(normalizeRb3ProcessingMode(42)).toBe('direct')
  })
})
