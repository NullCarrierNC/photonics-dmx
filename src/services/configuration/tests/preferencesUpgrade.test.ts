import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

const mockGetPath = jest.fn()
jest.mock('electron', () => ({
  app: { getPath: (n: string) => mockGetPath(n) },
}))

import { PreferencesConfigFile } from '../PreferencesConfigFile'
import { DEFAULT_PREFERENCES } from '../configurationDefaults'
import { createDefaultCueDomains } from '../cueDomainTypes'

const createdDirs: string[] = []

function freshAppData(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'photonics-prefs-'))
  createdDirs.push(dir)
  mockGetPath.mockImplementation((name: string) => (name === 'appData' ? dir : os.tmpdir()))
  return dir
}

function seedPrefs(appData: string, version: number, data: unknown): void {
  const configDir = path.join(appData, 'Photonics.rocks')
  fs.mkdirSync(configDir, { recursive: true })
  fs.writeFileSync(path.join(configDir, 'prefs.json'), JSON.stringify({ version, data }))
}

afterAll(() => {
  for (const d of createdDirs) {
    fs.rmSync(d, { recursive: true, force: true })
  }
})

describe('PreferencesConfigFile upgrade path', () => {
  it('migrates a stored v5 file (four domains) without corrupt-recovery and seeds rb3', () => {
    const appData = freshAppData()
    const all = createDefaultCueDomains()
    seedPrefs(appData, 5, {
      ...DEFAULT_PREFERENCES,
      effectDebounce: 77,
      cueDomains: {
        yarg: { ...all.yarg, enabledGroups: ['stagekit', 'mine'] },
        audio: all.audio,
        yargMotion: all.yargMotion,
        audioMotion: all.audioMotion,
      },
    })

    const onCorruptRecovery = jest.fn()
    const prefs = new PreferencesConfigFile({ onCorruptRecovery }).get()

    expect(onCorruptRecovery).not.toHaveBeenCalled()
    expect(prefs.effectDebounce).toBe(77)
    expect(prefs.cueDomains.yarg.enabledGroups).toEqual(['stagekit', 'mine'])
    expect(prefs.cueDomains.rb3).toBeDefined()
    expect(prefs.cueDomains.rb3Motion).toBeDefined()
  })

  it('loads a stored clock rate slower than the window as the slowest in it', () => {
    const appData = freshAppData()
    seedPrefs(appData, 6, { ...DEFAULT_PREFERENCES, clockRate: 100, effectDebounce: 12 })

    const onCorruptRecovery = jest.fn()
    const prefs = new PreferencesConfigFile({ onCorruptRecovery }).get()

    expect(onCorruptRecovery).not.toHaveBeenCalled()
    expect(prefs.clockRate).toBe(50)
    expect(prefs.effectDebounce).toBe(12)
  })

  it('loads a stored sACN universe the protocol does not define as the lowest one it does', () => {
    const appData = freshAppData()
    seedPrefs(appData, 6, {
      ...DEFAULT_PREFERENCES,
      effectDebounce: 33,
      sacnConfig: { ...DEFAULT_PREFERENCES.sacnConfig, universe: 0 },
    })

    const onCorruptRecovery = jest.fn()
    const prefs = new PreferencesConfigFile({ onCorruptRecovery }).get()

    expect(onCorruptRecovery).not.toHaveBeenCalled()
    expect(prefs.sacnConfig?.universe).toBe(1)
    expect(prefs.effectDebounce).toBe(33)
  })

  it('seeds cue domains missing from a same-version v6 file instead of wiping it', () => {
    const appData = freshAppData()
    const all = createDefaultCueDomains()
    // A v6 file written before a domain was added to CUE_DOMAINS: rb3/rb3Motion absent. Without
    // load-time seeding the AJV required-check would fail and corrupt-recovery would wipe prefs.
    seedPrefs(appData, 6, {
      ...DEFAULT_PREFERENCES,
      effectDebounce: 55,
      cueDomains: {
        yarg: { ...all.yarg, enabledGroups: ['stagekit', 'mine'] },
        audio: all.audio,
        yargMotion: all.yargMotion,
        audioMotion: all.audioMotion,
      },
    })

    const onCorruptRecovery = jest.fn()
    const prefs = new PreferencesConfigFile({ onCorruptRecovery }).get()

    expect(onCorruptRecovery).not.toHaveBeenCalled()
    expect(prefs.effectDebounce).toBe(55)
    expect(prefs.cueDomains.yarg.enabledGroups).toEqual(['stagekit', 'mine'])
    expect(prefs.cueDomains.rb3).toBeDefined()
    expect(prefs.cueDomains.rb3Motion).toBeDefined()
  })

  it('completes a half-written cue domain instead of wiping the file', () => {
    const appData = freshAppData()
    const all = createDefaultCueDomains()
    // A domain present but short of knownGroups and disabledCues, which a write interrupted part
    // way or a hand edit leaves behind. The AJV required-check runs per domain, so without
    // load-time repair this one domain costs the user every setting in the file.
    seedPrefs(appData, 6, {
      ...DEFAULT_PREFERENCES,
      clockRate: 42,
      cueDomains: { ...all, rb3Motion: { enabledGroups: ['mine'] } },
    })

    const onCorruptRecovery = jest.fn()
    const prefs = new PreferencesConfigFile({ onCorruptRecovery }).get()

    expect(onCorruptRecovery).not.toHaveBeenCalled()
    expect(prefs.clockRate).toBe(42)
    expect(prefs.cueDomains.rb3Motion.enabledGroups).toEqual(['mine'])
    expect(prefs.cueDomains.rb3Motion.knownGroups).toEqual([])
    expect(prefs.cueDomains.rb3Motion.disabledCues).toEqual({})
  })

  it('loads a same-version v6 file that predates whiteChannelMixMode without wiping it', () => {
    const appData = freshAppData()
    const { whiteChannelMixMode: _omitted, ...withoutKey } = DEFAULT_PREFERENCES
    seedPrefs(appData, 6, { ...withoutKey, effectDebounce: 77 })

    const onCorruptRecovery = jest.fn()
    const prefs = new PreferencesConfigFile({ onCorruptRecovery }).get()

    expect(onCorruptRecovery).not.toHaveBeenCalled()
    expect(prefs.effectDebounce).toBe(77)
    expect(prefs.whiteChannelMixMode).toBeUndefined()
  })

  it('loads a same-version v6 file that predates venuePostProcessingEnabled without wiping it', () => {
    const appData = freshAppData()
    const { venuePostProcessingEnabled: _omitted, ...withoutKey } = DEFAULT_PREFERENCES
    seedPrefs(appData, 6, { ...withoutKey, effectDebounce: 88 })

    const onCorruptRecovery = jest.fn()
    const prefs = new PreferencesConfigFile({ onCorruptRecovery }).get()

    expect(onCorruptRecovery).not.toHaveBeenCalled()
    expect(prefs.effectDebounce).toBe(88)
    expect(prefs.venuePostProcessingEnabled).toBeUndefined()
  })

  it('loads a same-version v6 file that predates the blackout shortcut without wiping it', () => {
    const appData = freshAppData()
    const {
      blackoutShortcutKey: _omittedKey,
      blackoutShortcutScope: _omittedScope,
      ...withoutKeys
    } = DEFAULT_PREFERENCES
    seedPrefs(appData, 6, { ...withoutKeys, effectDebounce: 99 })

    const onCorruptRecovery = jest.fn()
    const prefs = new PreferencesConfigFile({ onCorruptRecovery }).get()

    expect(onCorruptRecovery).not.toHaveBeenCalled()
    expect(prefs.effectDebounce).toBe(99)
    // Optional keys stay absent rather than being seeded, so every reader defaults for itself.
    expect(prefs.blackoutShortcutKey).toBeUndefined()
    expect(prefs.blackoutShortcutScope).toBeUndefined()
  })

  it('migrates a stored v4 file end-to-end without throwing or recovering', () => {
    const appData = freshAppData()
    const all = createDefaultCueDomains()
    seedPrefs(appData, 4, {
      ...DEFAULT_PREFERENCES,
      effectDebounce: 21,
      cueDomains: {
        yarg: all.yarg,
        audio: all.audio,
        yargMotion: all.yargMotion,
        audioMotion: all.audioMotion,
      },
    })

    const onCorruptRecovery = jest.fn()
    const prefs = new PreferencesConfigFile({ onCorruptRecovery }).get()

    expect(onCorruptRecovery).not.toHaveBeenCalled()
    expect(prefs.effectDebounce).toBe(21)
    expect(prefs.cueDomains.rb3).toBeDefined()
    expect(prefs.cueDomains.rb3Motion).toBeDefined()
  })
})

describe('PreferencesConfigFile required-key seeding', () => {
  it.each(['clockRate', 'effectDebounce', 'complex', 'cueConsistencyWindow'] as const)(
    'seeds a same-version v6 file missing %s instead of wiping it',
    (missingKey) => {
      const appData = freshAppData()
      const stored: Record<string, unknown> = {
        ...DEFAULT_PREFERENCES,
        effectDebounce: 91,
        cueDomains: createDefaultCueDomains(),
      }
      delete stored[missingKey]
      seedPrefs(appData, 6, stored)

      const onCorruptRecovery = jest.fn()
      const prefs = new PreferencesConfigFile({ onCorruptRecovery }).get()

      expect(onCorruptRecovery).not.toHaveBeenCalled()
      expect(prefs[missingKey]).toEqual(DEFAULT_PREFERENCES[missingKey])
      // Everything else the file carried survives.
      if (missingKey !== 'effectDebounce') {
        expect(prefs.effectDebounce).toBe(91)
      }
    },
  )

  it('keeps a stored value that happens to match nothing in the defaults', () => {
    const appData = freshAppData()
    seedPrefs(appData, 6, {
      ...DEFAULT_PREFERENCES,
      clockRate: 7,
      cueDomains: createDefaultCueDomains(),
    })

    const prefs = new PreferencesConfigFile().get()

    expect(prefs.clockRate).toBe(7)
  })
})
