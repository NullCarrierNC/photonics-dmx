import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

const mockGetPath = jest.fn()
jest.mock('electron', () => ({
  app: { getPath: (n: string) => mockGetPath(n) },
}))

import { ConfigurationManager } from '../ConfigurationManager'
import { DEFAULT_PREFERENCES } from '../configurationDefaults'

const createdDirs: string[] = []

function freshConfigDir(): string {
  const appData = fs.mkdtempSync(path.join(os.tmpdir(), 'photonics-startup-'))
  createdDirs.push(appData)
  mockGetPath.mockImplementation((name: string) => (name === 'appData' ? appData : os.tmpdir()))
  const dir = path.join(appData, 'Photonics.rocks')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function readData(dir: string, file: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')).data
}

function seedLayoutOnly(dir: string): void {
  const light = {
    id: 'l1',
    fixtureId: 'f1',
    fixture: 'rgb',
    label: 'l1',
    name: 'l1',
    isStrobeEnabled: false,
    channels: { masterDimmer: 1, red: 2, green: 3, blue: 4 },
    position: 0,
    group: 'front',
  }
  fs.writeFileSync(
    path.join(dir, 'lightsLayout.json'),
    JSON.stringify({
      version: 1,
      data: {
        numLights: 1,
        lightLayout: { id: 'front', label: 'Front' },
        strobeType: 'None',
        frontLights: [light],
        backLights: [],
        strobeLights: [],
      },
    }),
  )
}

// A read-only directory refuses the rename that moves a corrupt file aside, except on Windows,
// where the mode does not stop it, and for root.
const itWhenRenameCanBeRefused =
  process.platform === 'win32' || process.getuid?.() === 0 ? it.skip : it

/** Launches over a prefs.json that does not parse, in a directory that refuses the move-aside. */
function launchOverCorruptPrefsLeftInPlace(dir: string): ConfigurationManager {
  fs.writeFileSync(path.join(dir, 'prefs.json'), '{ "version": 6, "data": { not json')
  const mode = fs.statSync(dir).mode
  fs.chmodSync(dir, 0o555)
  try {
    return new ConfigurationManager()
  } finally {
    fs.chmodSync(dir, mode)
  }
}

afterAll(() => {
  for (const d of createdDirs) {
    fs.rmSync(d, { recursive: true, force: true })
  }
})

describe('startup migrations on a real config directory', () => {
  it('builds the first launch on the rig migrated from a layout and keeps it on disk', async () => {
    const dir = freshConfigDir()
    seedLayoutOnly(dir)

    const first = new ConfigurationManager()
    const activeAtBuild = first.getActiveRigs()
    // A delete of no rig queues behind every write the launch has started.
    await first.deleteDmxRig('no-such-rig')

    expect(activeAtBuild).toHaveLength(1)
    const rigId = activeAtBuild[0].id
    expect(first.getActiveRigs().map((rig) => rig.id)).toEqual([rigId])
    const onDisk = readData(dir, 'dmxRigs.json') as { rigs: Array<{ id: string }> }
    expect(onDisk.rigs.map((rig) => rig.id)).toEqual([rigId])
    expect(new ConfigurationManager().getActiveRigs().map((rig) => rig.id)).toEqual([rigId])
  })

  it('keeps a stray sender key folded when a preference is written straight after launch', async () => {
    const dir = freshConfigDir()
    const prefs: Record<string, unknown> = structuredClone(DEFAULT_PREFERENCES) as never
    delete prefs.enttecProConfig
    prefs.enttecProPort = '/dev/tty.usbserial-STRAY'
    fs.writeFileSync(path.join(dir, 'prefs.json'), JSON.stringify({ version: 6, data: prefs }))

    const cm = new ConfigurationManager()
    await cm.setPreference('complex', true)

    expect(cm.getPreference('enttecProConfig')?.port).toBe('/dev/tty.usbserial-STRAY')
    const onDisk = readData(dir, 'prefs.json') as {
      enttecProConfig?: { port?: string }
      complex?: boolean
    }
    expect(onDisk.complex).toBe(true)
    expect(onDisk.enttecProConfig?.port).toBe('/dev/tty.usbserial-STRAY')
    expect(onDisk).not.toHaveProperty('enttecProPort')
  })
})

describe('a corrupt prefs.json left in place at launch', () => {
  itWhenRenameCanBeRefused('saves once the user has deleted the file', async () => {
    const dir = freshConfigDir()
    const cm = launchOverCorruptPrefsLeftInPlace(dir)
    fs.unlinkSync(path.join(dir, 'prefs.json'))

    await cm.setPreference('clockRate', 50)
    await cm.setPreference('complex', false)

    expect(cm.getPreference('clockRate')).toBe(50)
    expect(readData(dir, 'prefs.json')).toMatchObject({ clockRate: 50, complex: false })
  })

  itWhenRenameCanBeRefused('keeps a hand repair of the file at the next save', async () => {
    const dir = freshConfigDir()
    const cm = launchOverCorruptPrefsLeftInPlace(dir)
    const repaired = { ...structuredClone(DEFAULT_PREFERENCES), clockRate: 33 }
    fs.writeFileSync(path.join(dir, 'prefs.json'), JSON.stringify({ version: 6, data: repaired }))

    await cm.setPreference('complex', false)

    expect(cm.getPreference('clockRate')).toBe(33)
    expect(readData(dir, 'prefs.json')).toMatchObject({ clockRate: 33, complex: false })
    expect(fs.readdirSync(dir).filter((f) => f.startsWith('prefs.corrupt-'))).toEqual([])
  })

  itWhenRenameCanBeRefused(
    'moves the file aside at the next save when it is left as it is',
    async () => {
      const dir = freshConfigDir()
      const cm = launchOverCorruptPrefsLeftInPlace(dir)

      await cm.setPreference('complex', false)

      const backups = fs.readdirSync(dir).filter((f) => f.startsWith('prefs.corrupt-'))
      expect(backups).toHaveLength(1)
      expect(fs.readFileSync(path.join(dir, backups[0]), 'utf8')).toContain('not json')
      expect(readData(dir, 'prefs.json')).toMatchObject({ complex: false })
    },
  )

  itWhenRenameCanBeRefused('says a relaunch reads a repaired file', () => {
    const cm = launchOverCorruptPrefsLeftInPlace(freshConfigDir())

    const [event] = cm.drainConfigCorruptRecovery()

    expect(event).toMatchObject({ fileName: 'prefs.json', reason: 'parse', leftInPlace: true })
    expect(event.message).toMatch(/relaunch/i)
  })
})

describe('a prefs.json written by a newer version', () => {
  it('uses its settings and saves nothing over it', async () => {
    const dir = freshConfigDir()
    const newer = { ...structuredClone(DEFAULT_PREFERENCES), clockRate: 25, fromNewer: true }
    const content = JSON.stringify({ version: 7, data: newer })
    fs.writeFileSync(path.join(dir, 'prefs.json'), content)

    const cm = new ConfigurationManager()
    const events = cm.drainConfigCorruptRecovery()
    await expect(cm.setPreference('complex', false)).rejects.toThrow(/newer version/)

    expect(cm.getPreference('clockRate')).toBe(25)
    expect(cm.getPreference('complex')).toBe(DEFAULT_PREFERENCES.complex)
    expect(fs.readFileSync(path.join(dir, 'prefs.json'), 'utf8')).toBe(content)
    expect(events).toEqual([
      expect.objectContaining({ fileName: 'prefs.json', reason: 'newerVersion' }),
    ])
  })
})

describe('a prefs.json whose data is null', () => {
  it('moves it aside and starts from the defaults', async () => {
    const dir = freshConfigDir()
    fs.writeFileSync(path.join(dir, 'prefs.json'), JSON.stringify({ version: 6, data: null }))

    const cm = new ConfigurationManager()
    await cm.setPreference('complex', false)

    expect(cm.drainConfigCorruptRecovery()).toEqual([
      expect.objectContaining({ fileName: 'prefs.json', reason: 'schema' }),
    ])
    expect(cm.getPreference('clockRate')).toBe(DEFAULT_PREFERENCES.clockRate)
    expect(fs.readdirSync(dir).filter((f) => f.startsWith('prefs.corrupt-'))).toHaveLength(1)
    expect(readData(dir, 'prefs.json')).toMatchObject({ complex: false })
  })
})
