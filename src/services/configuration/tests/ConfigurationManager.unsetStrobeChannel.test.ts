import * as nodePath from 'path'
import { describe, expect, it, jest } from '@jest/globals'
import { dialog } from 'electron'
import { readFile } from 'fs/promises'
import { ConfigurationManager } from '../ConfigurationManager'
import { DmxPublisher } from '../../../photonics-dmx/controllers/DmxPublisher'
import type { PublisherSenders } from '../../../photonics-dmx/controllers/SenderManager'
import { StrobeStateManager } from '../../../photonics-dmx/controllers/StrobeStateManager'
import { VenueFrameProcessor } from '../../../photonics-dmx/controllers/VenueFrameProcessor'
import { LightStateManager } from '../../../photonics-dmx/controllers/sequencer/LightStateManager'
import {
  ConfigStrobeType,
  FixtureTypes,
  type DmxRig,
  type RGBIO,
} from '../../../photonics-dmx/types'
import type { DmxValuesPayload } from '../../../shared/ipc/common'
import { CONFIG, RIGS } from '../../../shared/ipcChannels'
import { registerLightsRigsConfigHandlers } from '../../../main/ipc/config/lights-rigs-handlers'
import type { ControllerManager } from '../../../main/controllers/ControllerManager'

const APP_DATA = '/mock/app/data/path'

jest.mock('electron', () => ({
  app: { getPath: jest.fn(() => APP_DATA) },
  ipcMain: { handle: jest.fn(), on: jest.fn() },
  dialog: { showSaveDialog: jest.fn(), showOpenDialog: jest.fn() },
}))

/** The stored config file at a path, or null for a path the real disk serves. */
let mockStoredFile: (path: string) => string | null = () => null

// Only the config files are faked. Everything else reads the real disk.
jest.mock('fs', () => {
  const actual = jest.requireActual<typeof import('fs')>('fs')
  return {
    ...actual,
    existsSync: (path: import('fs').PathLike) =>
      mockStoredFile(String(path)) !== null || actual.existsSync(path),
    readFileSync: (
      path: import('fs').PathOrFileDescriptor,
      options?: Parameters<typeof actual.readFileSync>[1],
    ) => mockStoredFile(String(path)) ?? actual.readFileSync(path, options),
    writeFileSync: jest.fn(),
    mkdirSync: jest.fn(),
    renameSync: jest.fn(),
  }
})

jest.mock('fs/promises', () => ({
  readFile: jest.fn(),
  writeFile: jest.fn(() => Promise.resolve(undefined)),
  rename: jest.fn(() => Promise.resolve(undefined)),
  unlink: jest.fn(() => Promise.resolve(undefined)),
}))

/** A PAR template whose "Strobe Channel?" option is on with no channel number yet. */
const PAR = {
  id: 'tpl-par',
  position: 0,
  fixture: FixtureTypes.RGB,
  label: 'PAR',
  name: 'PAR',
  isStrobeEnabled: false,
  channels: { masterDimmer: 1, red: 2, green: 3, blue: 4, strobeChannel: 0 },
  strobeValues: { slow: 64, medium: 128, fast: 192, fastest: 255 },
}

function rigLight(
  id: string,
  channels: Record<string, number>,
  strobe: boolean,
): Record<string, unknown> {
  return {
    id,
    fixtureId: PAR.id,
    position: id === 'A' ? 1 : 2,
    fixture: FixtureTypes.RGB,
    label: 'PAR',
    name: 'PAR',
    isStrobeEnabled: strobe,
    group: 'front',
    mount: 'floor',
    channels,
  }
}

/**
 * A rig of two PARs where only B is used as a strobe. `strobeB` is B's stored strobe channel, which
 * a build that derived it from the template's offset left as a live address.
 */
function rigData(strobeB: number): Record<string, unknown> {
  const b = rigLight(
    'B',
    { masterDimmer: 5, red: 6, green: 7, blue: 8, strobeChannel: strobeB },
    true,
  )
  return {
    id: 'rig-1',
    name: 'Rig 1',
    active: true,
    config: {
      numLights: 2,
      lightLayout: { id: 'front', label: 'Front only' },
      strobeType: ConfigStrobeType.AllCapable,
      frontLights: [
        rigLight('A', { masterDimmer: 1, red: 2, green: 3, blue: 4, strobeChannel: 0 }, false),
        b,
      ],
      backLights: [],
      strobeLights: [b],
    },
  }
}

/** Boots a real manager over the stored lights and rigs files. */
function boot(files: { lights: unknown; rigs: unknown }): ConfigurationManager {
  mockStoredFile = (name) => {
    if (!nodePath.normalize(name).startsWith(nodePath.normalize(APP_DATA))) return null
    if (name.endsWith('prefs.json')) return JSON.stringify({ effectDebounce: 0 })
    if (name.endsWith('dmxRigs.json')) return JSON.stringify(files.rigs)
    if (name.endsWith('lights.json')) return JSON.stringify(files.lights)
    return '{}'
  }
  return new ConfigurationManager()
}

function savedByThisBuild(): DmxRig {
  const manager = boot({
    lights: { lights: [PAR] },
    rigs: { schemaVersion: 8, rigs: [rigData(0)] },
  })
  return manager.getActiveRigs()[0]!
}

/** Files as v0.7.0 wrote them, where B's unset strobe channel derived to master - 1. */
function savedByAnOlderBuild(): DmxRig {
  const manager = boot({
    lights: { version: 1, data: { lights: [PAR] } },
    rigs: { version: 1, data: { rigs: [rigData(4)] } },
  })
  return manager.getActiveRigs()[0]!
}

/** Picks a rig export file, then saves its templates and rig the way the import modal does. */
async function importedFromARigFile(): Promise<DmxRig> {
  const manager = boot({ lights: { lights: [] }, rigs: { schemaVersion: 8, rigs: [] } })
  const handlers = new Map<string, (...args: unknown[]) => Promise<unknown>>()
  const ipcMain = {
    handle: (channel: string, handler: (...args: unknown[]) => Promise<unknown>) =>
      handlers.set(channel, handler),
    on: jest.fn(),
  }
  const controllers: Pick<ControllerManager, 'getConfig' | 'restartControllers'> = {
    getConfig: () => manager,
    restartControllers: () => Promise.resolve(),
  }
  registerLightsRigsConfigHandlers(ipcMain as never, controllers as ControllerManager)
  const invoke = (channel: string, payload?: unknown): Promise<unknown> => {
    const handler = handlers.get(channel)
    if (!handler) throw new Error(`${channel} is not registered`)
    return handler(null, payload)
  }

  const file = { formatVersion: 1, type: 'photonics-rig', rig: rigData(0), templates: [PAR] }
  jest.mocked(dialog.showOpenDialog).mockResolvedValue({
    canceled: false,
    filePaths: ['/in/rig.json'],
  })
  jest.mocked(readFile).mockResolvedValue(JSON.stringify(file))
  const picked = (await invoke(RIGS.IMPORT_PICK)) as { rig: DmxRig; templates: unknown[] }
  await invoke(CONFIG.SAVE_MY_LIGHTS, picked.templates)
  await invoke(CONFIG.SAVE_DMX_RIG, picked.rig)
  return manager.getActiveRigs()[0]!
}

function rgbio(fields: Partial<RGBIO>): RGBIO {
  return { red: 0, green: 0, blue: 0, intensity: 0, opacity: 1, blendMode: 'replace', ...fields }
}

// The blended stream a flashing strobe cue hands the publisher: B alternates between the flash
// and dark while A holds a steady blue.
const FLASH_ON = {
  A: rgbio({ blue: 255, intensity: 255 }),
  B: rgbio({ red: 255, green: 255, blue: 255, intensity: 255 }),
}
const FLASH_OFF = { A: rgbio({ blue: 255, intensity: 255 }), B: rgbio({}) }
const FLASHES = [FLASH_ON, FLASH_OFF, FLASH_ON, FLASH_OFF]

const B_LIT = [255, 255, 255, 255]
const B_DARK = [0, 0, 0, 0]

interface Published {
  /** B's master, red, green and blue on the wire, per frame. */
  wire: number[][]
  /** The same four channels in the preview's IPC buffer, per frame. */
  preview: number[][]
}

/** Publishes each frame through a real publisher with the `fast` strobe active. */
function publishUnderFastStrobe(rig: DmxRig, venue?: VenueFrameProcessor): Published {
  const wireFrames: Array<Record<number, number>> = []
  const previewFrames: Array<Record<number, number>> = []
  const senders: PublisherSenders = {
    getEnabledWireSenders: () => ['sacn'],
    isIpcEnabled: () => true,
    send: (_wireId, buffer) => {
      wireFrames.push({ ...buffer })
      return Promise.resolve(true)
    },
    sendIpc: (payload: DmxValuesPayload) => {
      if (payload.kind === 'rigs') previewFrames.push({ ...payload.rigBuffers[rig.id] })
    },
  }
  const strobe = new StrobeStateManager()
  const publisher = new DmxPublisher(
    senders,
    new LightStateManager(),
    strobe,
    venue ? { frameProcessor: venue } : {},
  )
  publisher.updateActiveRigs([rig])
  strobe.setActive('fast', 'net')

  const published: Published = { wire: [], preview: [] }
  const channelsOfB = (frame: Record<number, number> | undefined): number[] =>
    [5, 6, 7, 8].map((channel) => frame?.[channel] ?? -1)
  for (const states of FLASHES) {
    wireFrames.length = 0
    previewFrames.length = 0
    publisher.publish(new Map(Object.entries(states)))
    published.wire.push(channelsOfB(wireFrames.at(-1)))
    published.preview.push(channelsOfB(previewFrames.at(-1)))
  }
  publisher.shutdown()
  return published
}

describe('a strobe-enabled light whose strobe channel has no address, under a fast strobe', () => {
  it.each([
    ['saved by this build', savedByThisBuild],
    ['saved by an older build', savedByAnOlderBuild],
    ['imported from a rig file', importedFromARigFile],
  ])('flashes to dark on its off frames when %s', async (_label, load) => {
    const rig = await load()

    expect(publishUnderFastStrobe(rig).wire).toEqual([B_LIT, B_DARK, B_LIT, B_DARK])
  })

  it('flashes the same way in the preview', () => {
    expect(publishUnderFastStrobe(savedByThisBuild()).preview).toEqual([
      B_LIT,
      B_DARK,
      B_LIT,
      B_DARK,
    ])
  })

  it('flashes to dark on its off frames through a venue trail', () => {
    const venue = new VenueFrameProcessor()
    venue.setVenuePostProcessing('Trails')

    expect(publishUnderFastStrobe(savedByThisBuild(), venue).wire).toEqual([
      B_LIT,
      B_DARK,
      B_LIT,
      B_DARK,
    ])
  })
})
