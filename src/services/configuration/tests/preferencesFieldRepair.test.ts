import { describe, expect, it, jest } from '@jest/globals'
import { repairInvalidPreferenceFields } from '../preferencesFieldRepair'
import { DEFAULT_PREFERENCES, type AppPreferences } from '../configurationDefaults'
import { createDefaultCueDomainPrefs, createDefaultCueDomains } from '../cueDomainTypes'

const stored = (overrides: Record<string, unknown>): AppPreferences =>
  ({
    ...structuredClone(DEFAULT_PREFERENCES),
    effectDebounce: 77,
    ...overrides,
  }) as AppPreferences

const withDomainField = (domain: string, field: string, value: unknown): AppPreferences => {
  const prefs = stored({})
  ;(prefs.cueDomains as unknown as Record<string, Record<string, unknown>>)[domain][field] = value
  return prefs
}

describe('repairInvalidPreferenceFields', () => {
  it('returns valid preferences untouched and reports nothing', () => {
    const prefs = stored({})
    const report = jest.fn()
    expect(repairInvalidPreferenceFields(prefs, report)).toBe(prefs)
    expect(report).not.toHaveBeenCalled()
  })

  it('resets a wrong-typed top-level value and keeps the rest', () => {
    const report = jest.fn()
    const repaired = repairInvalidPreferenceFields(stored({ clockRate: 'fast' }), report)
    expect(repaired.clockRate).toBe(DEFAULT_PREFERENCES.clockRate)
    expect(repaired.effectDebounce).toBe(77)
    expect(report).toHaveBeenCalledWith(expect.stringContaining('clockRate'))
  })

  it('resets one cue domain field and keeps the domain', () => {
    const prefs = withDomainField('yargMotion', 'probabilityPercent', '50')
    prefs.cueDomains.yargMotion.enabledGroups = ['mine']
    const repaired = repairInvalidPreferenceFields(prefs)
    expect(repaired.cueDomains.yargMotion.probabilityPercent).toBe(
      createDefaultCueDomainPrefs('yargMotion').probabilityPercent,
    )
    expect(repaired.cueDomains.yargMotion.enabledGroups).toEqual(['mine'])
  })

  it.each([
    ['selectionMode', 'sometimes'],
    ['activeCueRef', { groupId: 'g' }],
    ['disabledCues', { groupA: 3 }],
  ])('resets a bad %s', (field, value) => {
    const repaired = repairInvalidPreferenceFields(withDomainField('yarg', field, value))
    const expected = (createDefaultCueDomainPrefs('yarg') as unknown as Record<string, unknown>)[
      field
    ]
    expect((repaired.cueDomains.yarg as unknown as Record<string, unknown>)[field]).toEqual(
      expected,
    )
  })

  it('rebuilds cueDomains when it is not an object', () => {
    const repaired = repairInvalidPreferenceFields(stored({ cueDomains: 3 }))
    expect(repaired.cueDomains).toEqual(createDefaultCueDomains())
  })

  it('leaves the defaults unshared with the repaired copy', () => {
    const repaired = repairInvalidPreferenceFields(stored({ cueDomains: 3 }))
    repaired.cueDomains.yarg.enabledGroups.push('changed')
    expect(DEFAULT_PREFERENCES.cueDomains.yarg.enabledGroups).not.toContain('changed')
  })

  it('returns data it cannot repair as it was, so the file is still set aside', () => {
    const notPrefs = [] as unknown as AppPreferences
    expect(repairInvalidPreferenceFields(notPrefs)).toBe(notPrefs)
  })
})
