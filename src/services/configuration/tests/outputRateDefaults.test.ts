import { describe, expect, it } from '@jest/globals'
import { DEFAULT_PREFERENCES } from '../configurationDefaults'

describe('shipped DMX output rates', () => {
  it('sends every frame the publisher makes through the network outputs', () => {
    const publisherHz = DEFAULT_PREFERENCES.globalDmxPublishingRateHz

    expect(DEFAULT_PREFERENCES.sacnConfig?.refreshRateHz).toBe(publisherHz)
    expect(DEFAULT_PREFERENCES.artNetConfig?.refreshRateHz).toBe(publisherHz)
  })
})
