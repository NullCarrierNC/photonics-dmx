import { afterAll, afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import type { IpcMain } from 'electron'
import { CONFIG } from '../../../shared/ipcChannels'
import { ConfigStrobeType, FixtureTypes, type DmxFixture } from '../../../photonics-dmx/types'

const mockGetPath = jest.fn<(name: string) => string>()
jest.mock('electron', () => ({
  app: { getPath: (name: string) => mockGetPath(name) },
  dialog: { showSaveDialog: jest.fn(), showOpenDialog: jest.fn() },
}))

// Renames go through the real implementation unless a test refuses the one onto dmxRigs.json.
jest.mock('fs/promises', () => {
  const actual = jest.requireActual<typeof import('fs/promises')>('fs/promises')
  return { ...actual, rename: jest.fn(actual.rename) }
})

import * as fsPromises from 'fs/promises'
import { ConfigurationManager } from '../../../services/configuration/ConfigurationManager'
import { registerLightsRigsConfigHandlers } from '../../ipc/config/lights-rigs-handlers'
import type { ControllerManager } from '../../controllers/ControllerManager'

const renameMock = jest.mocked(fsPromises.rename)
const realRename = jest.requireActual<typeof import('fs/promises')>('fs/promises').rename

const TEMPLATE: DmxFixture = {
  id: 'tpl-rgb',
  fixture: FixtureTypes.RGB,
  name: 'PAR 1',
  label: 'PAR 1',
  position: 0,
  isStrobeEnabled: false,
  channels: { masterDimmer: 1, red: 2, green: 3, blue: 4 },
}

const TEMPLATE_WITH_STROBE: DmxFixture = {
  ...TEMPLATE,
  channels: { masterDimmer: 1, red: 2, green: 3, blue: 4, strobeChannel: 5 },
  strobeValues: { slow: 10, medium: 100, fast: 200, fastest: 250 },
}

const RIGS = {
  schemaVersion: 3,
  rigs: [
    {
      id: 'rig-1',
      name: 'Rig 1',
      active: true,
      config: {
        numLights: 1,
        lightLayout: { id: 'two-rows', label: 'Two Rows (one in front of the other)' },
        strobeType: ConfigStrobeType.AllCapable,
        frontLights: [
          {
            id: 'l-1',
            fixtureId: 'tpl-rgb',
            position: 1,
            fixture: FixtureTypes.RGB,
            label: 'PAR 1',
            name: 'PAR 1',
            isStrobeEnabled: true,
            group: 'front',
            universe: 1,
            mount: 'floor',
            channels: { masterDimmer: 11, red: 12, green: 13, blue: 14 },
          },
        ],
        backLights: [],
        strobeLights: [],
      },
    },
  ],
}

let appData: string
let configDir: string

beforeAll(() => {
  appData = fs.mkdtempSync(path.join(os.tmpdir(), 'photonics-save-my-lights-'))
  configDir = path.join(appData, 'Photonics.rocks')
  mockGetPath.mockImplementation((name) => (name === 'appData' ? appData : os.tmpdir()))
})

afterAll(() => {
  fs.rmSync(appData, { recursive: true, force: true })
})

afterEach(() => {
  renameMock.mockImplementation(realRename)
})

const readStored = <T>(name: string): T =>
  JSON.parse(fs.readFileSync(path.join(configDir, name), 'utf8')).data

/** A real ConfigurationManager over a fresh directory, and the SAVE_MY_LIGHTS handler over it. */
function setup(): {
  config: ConfigurationManager
  restartControllers: jest.Mock<() => Promise<void>>
  save: (lights: DmxFixture[]) => Promise<{ success: boolean; error?: string }>
} {
  fs.rmSync(configDir, { recursive: true, force: true })
  fs.mkdirSync(configDir, { recursive: true })
  fs.writeFileSync(
    path.join(configDir, 'lights.json'),
    JSON.stringify({ version: 1, data: { lights: [TEMPLATE] } }),
  )
  fs.writeFileSync(path.join(configDir, 'dmxRigs.json'), JSON.stringify({ version: 1, data: RIGS }))
  const config = new ConfigurationManager()
  const restartControllers = jest.fn(async () => {})
  const handlers = new Map<string, (event: unknown, data: unknown) => Promise<unknown>>()
  const ipcMain = {
    handle: (channel: string, handler: (event: unknown, data: unknown) => Promise<unknown>) =>
      handlers.set(channel, handler),
  }
  const controllerManager = { getConfig: () => config, restartControllers }
  registerLightsRigsConfigHandlers(
    ipcMain as Pick<IpcMain, 'handle'> as IpcMain,
    controllerManager as Pick<
      ControllerManager,
      'getConfig' | 'restartControllers'
    > as ControllerManager,
  )
  const handler = handlers.get(CONFIG.SAVE_MY_LIGHTS)!
  const save = (lights: DmxFixture[]) =>
    handler(null, lights) as Promise<{ success: boolean; error?: string }>
  return { config, restartControllers, save }
}

describe('SAVE_MY_LIGHTS over a real configuration', () => {
  it('saves the templates, realigns the rig and restarts', async () => {
    const { config, restartControllers, save } = setup()

    const result = await save([TEMPLATE_WITH_STROBE])

    expect(result).toEqual({ success: true })
    expect(readStored<{ lights: DmxFixture[] }>('lights.json').lights).toEqual([
      TEMPLATE_WITH_STROBE,
    ])
    const rig = readStored<typeof RIGS>('dmxRigs.json').rigs[0]
    expect(rig.config.frontLights[0].channels).toMatchObject({ strobeChannel: 15 })
    expect(config.getUserLights()).toEqual([TEMPLATE_WITH_STROBE])
    expect(restartControllers).toHaveBeenCalledTimes(1)
  })

  it('leaves both files as they were when the rig write fails', async () => {
    const { config, restartControllers, save } = setup()
    renameMock.mockImplementation((from, to) =>
      String(to).endsWith('dmxRigs.json')
        ? Promise.reject(Object.assign(new Error('ENOSPC: no space left'), { code: 'ENOSPC' }))
        : realRename(from, to),
    )

    const result = await save([TEMPLATE_WITH_STROBE])

    expect(result.success).toBe(false)
    expect(readStored<{ lights: DmxFixture[] }>('lights.json').lights).toEqual([TEMPLATE])
    expect(readStored<typeof RIGS>('dmxRigs.json')).toEqual(RIGS)
    expect(config.getUserLights()).toEqual([TEMPLATE])
    expect(restartControllers).not.toHaveBeenCalled()
  })
})
