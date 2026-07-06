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
