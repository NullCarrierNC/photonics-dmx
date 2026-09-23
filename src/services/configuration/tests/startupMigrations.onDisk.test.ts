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
