import { normalizeVenuePostProcessingEnabled } from '../configurationDefaults'

describe('normalizeVenuePostProcessingEnabled', () => {
  it('passes a stored boolean through', () => {
    expect(normalizeVenuePostProcessingEnabled(true)).toBe(true)
    expect(normalizeVenuePostProcessingEnabled(false)).toBe(false)
  })

  it('treats anything else as enabled', () => {
    expect(normalizeVenuePostProcessingEnabled(undefined)).toBe(true)
    expect(normalizeVenuePostProcessingEnabled(null)).toBe(true)
    expect(normalizeVenuePostProcessingEnabled('false')).toBe(true)
    expect(normalizeVenuePostProcessingEnabled(0)).toBe(true)
  })
})
