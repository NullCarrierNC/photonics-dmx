import { describe, expect, it, jest } from '@jest/globals'
import { ConfigurationManager } from '../ConfigurationManager'
import { DmxPublisher } from '../../../photonics-dmx/controllers/DmxPublisher'
import { SenderManager } from '../../../photonics-dmx/controllers/SenderManager'
import { StrobeStateManager } from '../../../photonics-dmx/controllers/StrobeStateManager'
import { LightStateManager } from '../../../photonics-dmx/controllers/sequencer/LightStateManager'
import { noopRuntimeBroadcaster } from '../../../photonics-dmx/runtime/broadcaster'
import {
  ConfigStrobeType,
  FixtureTypes,
  type DmxRig,
  type RGBIO,
} from '../../../photonics-dmx/types'

const APP_DATA = '/mock/app/data/path'

jest.mock('electron', () => ({
  app: { getPath: jest.fn(() => APP_DATA) },
}))

/** The stored config file at a path, or null for a path the real disk serves. */
let mockStoredFile: (path: string) => string | null = () => null

// Only the config files are faked. Everything else reads the real disk, which the native sender
// bindings need in order to load.
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
  writeFile: jest.fn(() => Promise.resolve(undefined)),
  rename: jest.fn(() => Promise.resolve(undefined)),
  unlink: jest.fn(() => Promise.resolve(undefined)),
}))

const PAR = {
  id: 'tpl-par',
  position: 0,
  fixture: FixtureTypes.RGB,
  label: 'PAR',
  name: 'PAR',
  isStrobeEnabled: false,
  channels: { masterDimmer: 1, red: 2, green: 3, blue: 4 },
}

function rigLight(id: string, channels: Record<string, unknown>): Record<string, unknown> {
  return {
    id,
    fixtureId: PAR.id,
    position: id === 'A' ? 1 : 2,
    fixture: FixtureTypes.RGB,
    label: 'PAR',
    name: 'PAR',
    isStrobeEnabled: false,
    group: 'front',
    universe: 1,
    mount: 'floor',
    channels,
  }
}

/** Boots a real manager over stored lights and rigs files holding one rig of two lights. */
function boot(template: Record<string, unknown>, lightB: Record<string, unknown>) {
  const rigs = {
    schemaVersion: 8,
    rigs: [
      {
        id: 'rig-1',
        name: 'Rig 1',
        active: true,
        config: {
          numLights: 2,
          lightLayout: { id: 'front', label: 'Front only' },
          strobeType: ConfigStrobeType.None,
          frontLights: [rigLight('A', { masterDimmer: 1, red: 2, green: 3, blue: 4 }), lightB],
          backLights: [],
          strobeLights: [],
        },
      },
    ],
  }
  mockStoredFile = (name) => {
    if (!name.startsWith(APP_DATA)) return null
    if (name.endsWith('prefs.json')) return JSON.stringify({ effectDebounce: 0 })
    if (name.endsWith('dmxRigs.json')) return JSON.stringify(rigs)
    if (name.endsWith('lights.json')) return JSON.stringify({ lights: [template] })
    return '{}'
  }
  return new ConfigurationManager()
}

function rgbio(fields: Partial<RGBIO>): RGBIO {
  return { red: 0, green: 0, blue: 0, intensity: 0, opacity: 1, blendMode: 'replace', ...fields }
}

/** The non-zero channels of the first frame a real publisher sends for the given light states. */
function publishOnce(rig: DmxRig, states: Record<string, RGBIO>): Record<number, number> {
  const senderManager = new SenderManager({
    broadcaster: noopRuntimeBroadcaster(),
    hasReceivers: () => false,
  })
  const frames: Array<Record<number, number>> = []
  jest.spyOn(senderManager, 'getEnabledWireSenders').mockReturnValue(['sacn'])
  jest.spyOn(senderManager, 'send').mockImplementation((_wireId, buffer) => {
    frames.push({ ...buffer })
    return Promise.resolve(true)
  })
  const publisher = new DmxPublisher(
    senderManager,
    new LightStateManager(),
    new StrobeStateManager(),
  )
  publisher.updateActiveRigs([rig])
  publisher.publish(new Map(Object.entries(states)))
  publisher.shutdown()
  const lit: Record<number, number> = {}
  for (const [channel, value] of Object.entries(frames[0] ?? {})) {
    if (value !== 0) lit[Number(channel)] = value
  }
  return lit
}

describe('rig lights with an unassigned channel or no address, loaded and published', () => {
  it.each([
    ['out of range', 600],
    ['unassigned', 0],
    ['fractional', 11.5],
  ])('keeps a light whose master is %s dark beside a light at 1 to 4', (_label, master) => {
    const manager = boot(PAR, rigLight('B', { masterDimmer: master, red: 12, green: 13, blue: 14 }))
    const rig = manager.getDmxRigs()[0]

    const frame = publishOnce(rig, {
      A: rgbio({ intensity: 90 }),
      B: rgbio({ red: 200, intensity: 255 }),
    })

    expect(frame).toEqual({ 1: 90 })
  })

  it('reports a master it cannot use as a repair of the rigs file', () => {
    const manager = boot(PAR, rigLight('B', { masterDimmer: 600, red: 601, green: 602, blue: 603 }))

    const reports = manager
      .drainConfigCorruptRecovery()
      .filter((r) => r.fileName === 'dmxRigs.json')

    expect(reports).toEqual([
      expect.objectContaining({
        reason: 'repaired',
        message: expect.stringContaining('frontLights[1].channels.masterDimmer'),
      }),
    ])
  })

  it('leaves the channel before a light untouched when its template strobe channel is unset', () => {
    const unsetStrobe = { ...PAR, channels: { ...PAR.channels, strobeChannel: 0 } }
    const manager = boot(unsetStrobe, rigLight('B', { masterDimmer: 5, red: 6, green: 7, blue: 8 }))
    const rig = manager.getDmxRigs()[0]

    const frame = publishOnce(rig, {
      A: rgbio({ blue: 255, intensity: 255 }),
      B: rgbio({}),
    })

    expect(frame).toEqual({ 1: 255, 4: 255 })
  })
})
