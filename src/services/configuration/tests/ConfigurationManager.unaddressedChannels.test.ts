import * as nodePath from 'path'
import { describe, expect, it, jest } from '@jest/globals'
import { ConfigurationManager } from '../ConfigurationManager'
import { DmxPublisher } from '../../../photonics-dmx/controllers/DmxPublisher'
import { SenderManager } from '../../../photonics-dmx/controllers/SenderManager'
import { StrobeStateManager } from '../../../photonics-dmx/controllers/StrobeStateManager'
import { LightStateManager } from '../../../photonics-dmx/controllers/sequencer/LightStateManager'
import { noopRuntimeBroadcaster } from '../../../photonics-dmx/runtime/broadcaster'
import {
  loadRigExportFixtures,
  prepareImportedRig,
  reconcileImportedTemplates,
  validateRigExportFile,
} from '../../../photonics-dmx/helpers/rigImportExport'
import { migrateLightingConfiguration } from '../../../photonics-dmx/helpers/lightingConfigMigration'
import { validateDmxRigPayload } from '../../../main/ipc/validation/fixtureValidation'
import {
  ConfigStrobeType,
  FixtureTypes,
  type DmxRig,
  type RgbFixture,
  type RGBIO,
} from '../../../photonics-dmx/types'

const APP_DATA = '/mock/app/data/path'
const HISTORICAL = nodePath.join(__dirname, '../../../photonics-dmx/tests/historical')

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

/** One rig of the given lights, as the rigs file stores it. */
function rigOf(frontLights: Array<Record<string, unknown>>): Record<string, unknown> {
  return {
    id: 'rig-1',
    name: 'Rig 1',
    active: true,
    config: {
      numLights: frontLights.length,
      lightLayout: { id: 'front', label: 'Front only' },
      strobeType: ConfigStrobeType.None,
      frontLights,
      backLights: [],
      strobeLights: [],
    },
  }
}

interface OlderReleaseSet {
  lights: { data: { lights: Array<{ channels: Record<string, number> }> } }
  rigs: {
    data: { rigs: Array<{ config: { frontLights: Array<{ id: string; channels: object }> } }> }
  }
}

/** The lights and rigs files an older release left, from the historical corpus. */
function readOlderReleaseSet(release: string): OlderReleaseSet {
  const { readFileSync } = jest.requireActual<typeof import('fs')>('fs')
  const read = (file: string): string =>
    readFileSync(nodePath.join(HISTORICAL, release, file), 'utf-8')
  return { lights: JSON.parse(read('lights.json')), rigs: JSON.parse(read('dmxRigs.json')) }
}

/** Boots a real manager over the given stored lights and rigs file texts. */
function bootFiles(lightsText: string, rigsText: string): ConfigurationManager {
  mockStoredFile = (name) => {
    if (!name.startsWith(APP_DATA)) return null
    if (name.endsWith('prefs.json')) return JSON.stringify({ effectDebounce: 0 })
    if (name.endsWith('dmxRigs.json')) return rigsText
    if (name.endsWith('lights.json')) return lightsText
    return '{}'
  }
  return new ConfigurationManager()
}

/** Boots a real manager over stored lights and rigs files holding one rig of two lights. */
function boot(
  template: Record<string, unknown>,
  lightB: Record<string, unknown>,
  lightA = rigLight('A', { masterDimmer: 1, red: 2, green: 3, blue: 4 }),
) {
  const rigs = { schemaVersion: 8, rigs: [rigOf([lightA, lightB])] }
  return bootFiles(JSON.stringify({ lights: [template] }), JSON.stringify(rigs))
}

function rgbio(fields: Partial<RGBIO>): RGBIO {
  return { red: 0, green: 0, blue: 0, intensity: 0, opacity: 1, blendMode: 'replace', ...fields }
}

/** The first frame a real publisher sends for the given light states, or {} when it sends none. */
function publishRaw(rig: DmxRig, states: Record<string, RGBIO>): Record<number, number> {
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
  return frames[0] ?? {}
}

/** The non-zero channels of the first frame a real publisher sends for the given light states. */
function publishOnce(rig: DmxRig, states: Record<string, RGBIO>): Record<number, number> {
  const lit: Record<number, number> = {}
  for (const [channel, value] of Object.entries(publishRaw(rig, states))) {
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

describe('rig lights of a template with no master, loaded and published', () => {
  const NO_MASTER = { ...PAR, channels: { masterDimmer: 0, red: 2, green: 3, blue: 4 } }
  const SPOT = { ...PAR, id: 'tpl-spot', name: 'Spot', label: 'Spot' }
  const white = rgbio({ red: 255, green: 255, blue: 255, intensity: 255 })
  const spotRed = rgbio({ red: 200, intensity: 128 })

  /** A at 1 and B at 5 from the template with no master, and C at 9 from one with a master. */
  function bootBackToBack(): ConfigurationManager {
    const lightC = {
      ...rigLight('C', { masterDimmer: 9, red: 10, green: 11, blue: 12 }),
      fixtureId: SPOT.id,
    }
    const rigs = {
      schemaVersion: 8,
      rigs: [
        rigOf([
          rigLight('A', { masterDimmer: 1, red: 3, green: 4, blue: 5 }),
          rigLight('B', { masterDimmer: 5, red: 7, green: 8, blue: 9 }),
          lightC,
        ]),
      ],
    }
    return bootFiles(JSON.stringify({ lights: [NO_MASTER, SPOT] }), JSON.stringify(rigs))
  }

  it('writes no channel of a light whose template has no master, its master included', () => {
    const rig = bootBackToBack().getDmxRigs()[0]

    expect(publishOnce(rig, { A: white })).toEqual({})
    expect(publishRaw(rig, { A: white, B: white, C: spotRed })).toEqual({
      9: 128,
      10: 200,
      11: 0,
      12: 0,
    })
  })

  it('drives the lights again from their own masters once the template has a master', async () => {
    const manager = bootBackToBack()

    const withMaster: RgbFixture[] = [PAR, SPOT].map((t) => ({ ...t, fixture: FixtureTypes.RGB }))
    await manager.saveUserLights(withMaster)

    expect(publishOnce(manager.getDmxRigs()[0], { A: white, B: spotRed })).toEqual({
      1: 255,
      2: 255,
      3: 255,
      4: 255,
      5: 128,
      6: 200,
    })
  })

  it('reloads a saved unplaced light with nothing to report, and accepts it back from a save', () => {
    const saved = bootBackToBack().getDmxRigs()
    const reloaded = bootFiles(
      JSON.stringify({ lights: [NO_MASTER, SPOT] }),
      JSON.stringify({ schemaVersion: 8, rigs: saved }),
    )

    const reports = reloaded
      .drainConfigCorruptRecovery()
      .filter((r) => r.fileName === 'dmxRigs.json')
    expect(reports).toEqual([])
    expect(reloaded.getDmxRigs()).toEqual(saved)
    expect(validateDmxRigPayload(saved[0])).toEqual({ ok: true, value: saved[0] })
  })

  it('writes nothing for a light an older release left with a template with no master', () => {
    const older = readOlderReleaseSet('v0.7.0-alpha.7')
    older.lights.data.lights[0].channels = { masterDimmer: 0, red: 2, green: 3, blue: 4 }
    const [par, spot] = older.rigs.data.rigs[0].config.frontLights
    par.channels = { masterDimmer: 1, red: 3, green: 4, blue: 5 }
    const manager = bootFiles(JSON.stringify(older.lights), JSON.stringify(older.rigs))

    const frame = publishRaw(manager.getDmxRigs()[0], { [par.id]: white, [spot.id]: spotRed })

    expect(Object.keys(frame).map(Number)).toEqual([11, 12, 13, 14, 15, 16])
  })

  it('writes nothing for an imported light whose template has no master', async () => {
    const manager = boot(PAR, rigLight('B', { masterDimmer: 11, red: 12, green: 13, blue: 14 }))
    const exportedLights = [
      { ...rigLight('A', { masterDimmer: 1, red: 3, green: 4, blue: 5 }), fixtureId: 'tpl-imp' },
      { ...rigLight('B', { masterDimmer: 5, red: 7, green: 8, blue: 9 }), fixtureId: 'tpl-imp' },
      rigLight('C', { masterDimmer: 9, red: 10, green: 11, blue: 12 }),
    ]
    const exported = {
      formatVersion: 1,
      type: 'photonics-rig',
      rig: rigOf(exportedLights),
      templates: [{ ...NO_MASTER, id: 'tpl-imp' }, PAR],
    }

    const envelope = validateRigExportFile(JSON.parse(JSON.stringify(exported)))
    if (!envelope.ok) throw new Error(envelope.error)
    const loaded = loadRigExportFixtures(envelope.value, [])
    if (!loaded.ok) throw new Error(loaded.error)
    const validated = validateDmxRigPayload(loaded.rig)
    if (!validated.ok) throw new Error(validated.error)
    const { config } = migrateLightingConfiguration(validated.value.config, {
      skipLegacyRename: true,
    })
    const { templatesToAdd, fixtureIdMap } = reconcileImportedTemplates(
      loaded.templates,
      manager.getUserLights(),
    )
    await manager.saveUserLights([...manager.getUserLights(), ...templatesToAdd])
    const prepared = prepareImportedRig({ ...validated.value, config }, fixtureIdMap, ['Rig 1'])
    await manager.saveDmxRig(prepared)
    const imported = manager.getDmxRigs().find((rig) => rig.id === prepared.id)
    if (!imported) throw new Error('The imported rig was not saved')
    const [lightA, lightB, lightC] = imported.config.frontLights

    const frame = publishRaw(imported, {
      [lightA.id]: white,
      [lightB.id]: white,
      [lightC.id]: spotRed,
    })

    expect(frame).toEqual({ 9: 128, 10: 200, 11: 0, 12: 0 })
  })
})
