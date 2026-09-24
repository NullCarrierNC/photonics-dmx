import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

const mockGetPath = jest.fn()
jest.mock('electron', () => ({
  app: { getPath: (n: string) => mockGetPath(n) },
}))

import { ConfigurationManager } from '../ConfigurationManager'
import {
  ConfigStrobeType,
  FixtureTypes,
  type DmxFixture,
  type DmxRig,
} from '../../../photonics-dmx/types'

const STROBE_VALUES = { slow: 10, medium: 100, fast: 200, fastest: 250 }

const TEMPLATE: DmxFixture = {
  id: 'tpl-rgb',
  fixture: FixtureTypes.RGB,
  name: 'PAR 1',
  label: 'PAR 1',
  position: 0,
  isStrobeEnabled: false,
  channels: { masterDimmer: 1, red: 2, green: 3, blue: 4, strobeChannel: 5 },
  strobeValues: STROBE_VALUES,
}

/** A rig whose light snapshot predates the template's strobe channel. */
const STALE_RIG: DmxRig = {
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
}

let appData: string
let configDir: string

beforeAll(() => {
  appData = fs.mkdtempSync(path.join(os.tmpdir(), 'photonics-rig-sync-'))
  configDir = path.join(appData, 'Photonics.rocks')
  mockGetPath.mockImplementation((name: string) => (name === 'appData' ? appData : os.tmpdir()))
})

afterAll(() => {
  fs.rmSync(appData, { recursive: true, force: true })
})

function managerOver(rigs: DmxRig[]): ConfigurationManager {
  fs.rmSync(configDir, { recursive: true, force: true })
  fs.mkdirSync(configDir, { recursive: true })
  fs.writeFileSync(
    path.join(configDir, 'lights.json'),
    JSON.stringify({ version: 1, data: { lights: [TEMPLATE] } }),
  )
  fs.writeFileSync(
    path.join(configDir, 'dmxRigs.json'),
    JSON.stringify({ version: 1, data: { schemaVersion: 3, rigs } }),
  )
  return new ConfigurationManager()
}

const storedRigs = (): DmxRig[] =>
  JSON.parse(fs.readFileSync(path.join(configDir, 'dmxRigs.json'), 'utf8')).data.rigs

const firstLight = (rig: DmxRig) => rig.config.frontLights[0]!

describe('ConfigurationManager rig alignment on write', () => {
  it('aligns a rig saved with a stale light snapshot to its template', async () => {
    const config = managerOver([])

    await config.saveDmxRig(STALE_RIG)

    expect(firstLight(storedRigs()[0]).channels).toMatchObject({ strobeChannel: 15 })
    expect(firstLight(config.getDmxRigs()[0]).strobeValues).toEqual(STROBE_VALUES)
  })

  it('realigns the rigs after one template changes', async () => {
    const config = managerOver([STALE_RIG])

    await config.updateUserLight('tpl-rgb', (stored) => ({ ...stored, name: 'Wash PAR' }))

    expect(firstLight(storedRigs()[0]).name).toBe('Wash PAR')
    expect(firstLight(config.getDmxRigs()[0]).name).toBe('Wash PAR')
  })
})
