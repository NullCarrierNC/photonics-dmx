import { validateAppPreferencesData } from '../configDataValidators'
import { createDefaultCueDomains } from '../cueDomainTypes'

type Prefs = Parameters<typeof validateAppPreferencesData>[0]

function validPrefs(): Prefs {
  return {
    effectDebounce: 0,
    complex: false,
    cueDomains: createDefaultCueDomains(),
    cueConsistencyWindow: 2000,
    clockRate: 10,
  } as unknown as Prefs
}

describe('validateAppPreferencesData selectionMode enum', () => {
  it('accepts the default cue domains', () => {
    expect(validateAppPreferencesData(validPrefs()).valid).toBe(true)
  })

  it('accepts every valid selectionMode (lighting and motion)', () => {
    for (const mode of ['oncePerSong', 'perCueChange', 'withinSong', 'none'] as const) {
      const p = validPrefs()
      p.cueDomains.yarg.selectionMode = mode
      expect(validateAppPreferencesData(p).valid).toBe(true)
    }
  })

  it('rejects a corrupt selectionMode so it routes to corruption-recovery instead of a silent default', () => {
    const p = validPrefs()
    ;(p.cueDomains.yarg as { selectionMode: string }).selectionMode = 'garbage'
    expect(validateAppPreferencesData(p).valid).toBe(false)
  })
})
