import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals'

const mockGetPath = jest.fn<(name: string) => string>()
jest.mock('electron', () => ({
  app: { getPath: (n: string) => mockGetPath(n) },
}))

const mockUnwritable = new Map<string, number>()
jest.mock('fs/promises', () => {
  const actual = jest.requireActual<typeof import('fs/promises')>('fs/promises')
  return {
    ...actual,
    writeFile: (file: string, ...rest: [string, BufferEncoding]) => {
      const name = path.basename(file).replace(/^\.(.+)\.tmp\..*$/, '$1')
      const allowed = mockUnwritable.get(name)
      if (allowed !== undefined) {
        if (allowed <= 0) {
          return Promise.reject(new Error(`EACCES: permission denied, open '${name}'`))
        }
        mockUnwritable.set(name, allowed - 1)
      }
      return actual.writeFile(file, ...rest)
    },
  }
})

import { ConfigurationManager } from '../../../services/configuration/ConfigurationManager'
import { ConsoleModeController } from '../../controllers/ConsoleModeController'
import {
  ConfigStrobeType,
  DEFAULT_MOVING_HEAD_FIXTURE_CONFIG,
  FixtureTypes,
  type DmxRig,
  type RgbMovingHeadFixture,
} from '../../../photonics-dmx/types'

const TEMPLATE: RgbMovingHeadFixture = {
  id: 'tpl-mh',
  fixture: FixtureTypes.RGBMH,
  name: 'Spot',
  label: 'Spot',
  position: 0,
  isStrobeEnabled: false,
  channels: { masterDimmer: 1, red: 2, green: 3, blue: 4, pan: 5, tilt: 6 },
  config: { ...DEFAULT_MOVING_HEAD_FIXTURE_CONFIG },
}

const RIG: DmxRig = {
  id: 'rig-1',
  name: 'Rig 1',
  active: true,
  config: {
    numLights: 1,
    lightLayout: { id: 'two-rows', label: 'Two Rows (one in front of the other)' },
    strobeType: ConfigStrobeType.None,
    frontLights: [
      {
        ...TEMPLATE,
        id: 'mh-1',
        fixtureId: 'tpl-mh',
        position: 1,
        group: 'front',
        universe: 1,
        mount: 'floor',
        channels: { masterDimmer: 11, red: 12, green: 13, blue: 14, pan: 15, tilt: 16 },
      },
    ],
    backLights: [],
    strobeLights: [],
  },
}

let appData: string
let configDir: string

beforeAll(() => {
  appData = fs.mkdtempSync(path.join(os.tmpdir(), 'photonics-console-restore-'))
  configDir = path.join(appData, 'Photonics.rocks')
  mockGetPath.mockImplementation((name: string) => (name === 'appData' ? appData : os.tmpdir()))
})

afterAll(() => {
  fs.rmSync(appData, { recursive: true, force: true })
})

beforeEach(() => {
  mockUnwritable.clear()
  fs.rmSync(configDir, { recursive: true, force: true })
  fs.mkdirSync(configDir, { recursive: true })
  fs.writeFileSync(
    path.join(configDir, 'lights.json'),
    JSON.stringify({ version: 1, data: { lights: [TEMPLATE] } }),
  )
  fs.writeFileSync(
    path.join(configDir, 'dmxRigs.json'),
    JSON.stringify({ version: 1, data: { schemaVersion: 3, rigs: [RIG] } }),
  )
})

const stored = <T>(file: string): T =>
  JSON.parse(fs.readFileSync(path.join(configDir, file), 'utf8')).data

const rigPanHomeOnDisk = () =>
  stored<{ rigs: DmxRig[] }>('dmxRigs.json').rigs[0].config.frontLights[0].config?.panHome

const templatePanHomeOnDisk = () =>
  stored<{ lights: RgbMovingHeadFixture[] }>('lights.json').lights[0].config?.panHome

/**
 * Runs one pan home edit through the console against the files on disk, each named file taking
 * the given number of writes from the edit onwards and refusing every write after them.
 */
async function editPanHome(writesLeft: Record<string, number>) {
  const config = new ConfigurationManager()
  // Each save queues behind the one the load starts for a file it migrates.
  await config.saveUserLights(config.getUserLights())
  await config.saveDmxRig(RIG)
  for (const [file, left] of Object.entries(writesLeft)) mockUnwritable.set(file, left)
  let restarts = 0
  const controller = new ConsoleModeController({
    getConfig: () => config,
    ensureInitialized: () => Promise.resolve(),
    getDmxPublisher: () => null,
    getListenerSnapshot: () => ({ yarg: false, rb3: false }),
    getIsAudioEnabled: () => false,
    getLifecyclePhase: () => 'consoleMode',
    pauseYarg: () => Promise.resolve(),
    pauseRb3: () => Promise.resolve(),
    pauseAudio: () => Promise.resolve(),
    restartControllers: async () => {
      restarts++
    },
    announceConsoleLeft: () => {},
  })
  const result = await controller.setConsoleFixtureConfig({
    rigId: 'rig-1',
    lightId: 'mh-1',
    fixtureId: 'tpl-mh',
    config: { panHome: 80 },
  })
  return { result, restarts: () => restarts }
}

describe('Console fixture edit on a template file that cannot be written', () => {
  it('puts the rig back and answers with the write error alone while the template file stays unwritable', async () => {
    const before = rigPanHomeOnDisk()
    const { result, restarts } = await editPanHome({ 'lights.json': 0 })

    expect(result).toEqual({
      success: false,
      error: "Failed to save configuration: Error: EACCES: permission denied, open 'lights.json'",
    })
    expect(rigPanHomeOnDisk()).toBe(before)
    expect(templatePanHomeOnDisk()).toBe(before)
    expect(restarts()).toBe(0)
  })

  it('restarts and names the rig when the rig file refuses the put back as well', async () => {
    const { result, restarts } = await editPanHome({ 'lights.json': 0, 'dmxRigs.json': 1 })

    expect(result).toEqual({
      success: false,
      error: expect.stringMatching(/\. The rig change could not be undone and is still saved\.$/),
    })
    expect(rigPanHomeOnDisk()).toBe(80)
    expect(restarts()).toBe(1)
  })
})
