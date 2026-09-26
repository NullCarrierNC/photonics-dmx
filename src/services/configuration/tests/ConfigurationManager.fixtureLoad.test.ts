import { ConfigurationManager } from '../ConfigurationManager'
import { ConfigStrobeType, FixtureTypes } from '../../../photonics-dmx/types'

jest.mock('electron', () => ({
  app: {
    getPath: jest.fn(() => '/mock/app/data/path'),
  },
}))

jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  mkdirSync: jest.fn(),
  renameSync: jest.fn(),
}))

jest.mock('fs/promises', () => ({
  writeFile: jest.fn().mockResolvedValue(undefined),
  rename: jest.fn().mockResolvedValue(undefined),
  unlink: jest.fn().mockResolvedValue(undefined),
}))

import * as fs from 'fs'

const template = (fields: Record<string, unknown>): Record<string, unknown> => ({
  id: 'tpl-1',
  position: 0,
  fixture: FixtureTypes.RGB,
  label: 'RGB',
  name: 'RGB',
  isStrobeEnabled: false,
  channels: { masterDimmer: 1, red: 2, green: 3, blue: 4 },
  ...fields,
})

const layoutWith = (frontLights: unknown[]) => ({
  numLights: frontLights.length,
  lightLayout: { id: 'front', label: 'Front only' },
  strobeType: ConfigStrobeType.None,
  frontLights,
  backLights: [],
  strobeLights: [],
})

/**
 * Boots a manager against the given stored files, with empty defaults for the rest. `lightsFile` is
 * the whole of lights.json, and `lights` the list inside an unversioned one.
 */
function boot(files: {
  lights?: unknown[]
  lightsFile?: unknown
  layoutLights?: unknown[]
  layout?: Record<string, unknown>
}): ConfigurationManager {
  ;(fs.existsSync as jest.Mock).mockReturnValue(true)
  ;(fs.readFileSync as jest.Mock).mockImplementation((path: string) => {
    if (path.includes('prefs.json')) return JSON.stringify({ effectDebounce: 0 })
    if (path.includes('lights.json')) {
      return JSON.stringify(files.lightsFile ?? { lights: files.lights ?? [] })
    }
    if (path.includes('lightsLayout.json')) {
      return JSON.stringify({ ...layoutWith(files.layoutLights ?? []), ...files.layout })
    }
    return '{}'
  })
  return new ConfigurationManager()
}

const reportsFor = (cm: ConfigurationManager, fileName: string) =>
  cm.drainConfigCorruptRecovery().filter((r) => r.fileName === fileName)

describe('ConfigurationManager fixture loading', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('loads an RGB template missing blue with blue unassigned, and reports it', () => {
    const cm = boot({
      lights: [template({ channels: { masterDimmer: 1, red: 2, green: 3 } })],
    })

    expect(cm.getUserLights()[0].channels).toEqual({ masterDimmer: 1, red: 2, green: 3, blue: 0 })
    const reports = reportsFor(cm, 'lights.json')
    expect(reports).toEqual([
      expect.objectContaining({
        reason: 'repaired',
        message: expect.stringContaining('channels.blue'),
      }),
    ])
  })

  it('gives a strobe fixture with only a master dimmer an unassigned strobe channel', () => {
    const cm = boot({
      lights: [template({ fixture: FixtureTypes.STROBE, channels: { masterDimmer: 7 } })],
    })

    expect(cm.getUserLights()[0].channels).toEqual({ masterDimmer: 7, strobeChannel: 0 })
    expect(reportsFor(cm, 'lights.json')[0]?.message).toContain('channels.strobeChannel')
  })

  it('drops a channel the fixture type does not have', () => {
    const cm = boot({
      lights: [template({ channels: { masterDimmer: 1, red: 2, green: 3, blue: 4, pan: 5 } })],
    })

    expect(cm.getUserLights()[0].channels).toEqual({ masterDimmer: 1, red: 2, green: 3, blue: 4 })
    expect(reportsFor(cm, 'lights.json')[0]?.message).toContain('channels.pan')
  })

  it('reports nothing for a template that is already sound', () => {
    const cm = boot({ lights: [template({})] })

    expect(cm.getUserLights()[0].channels).toEqual({ masterDimmer: 1, red: 2, green: 3, blue: 4 })
    expect(reportsFor(cm, 'lights.json')).toEqual([])
  })

  it('gives a template stored with a null id a new id, and reports it', () => {
    const cm = boot({ lights: [template({ id: null })] })

    expect(cm.getUserLights()[0].id).toEqual(expect.any(String))
    expect(cm.getUserLights()[0].id).not.toBe('')
    expect(reportsFor(cm, 'lights.json')).toEqual([
      expect.objectContaining({ reason: 'repaired', message: expect.stringContaining('[0].id') }),
    ])
  })

  it('gives a template stored without an id a new id', () => {
    const { id: _id, ...stored } = template({})
    const cm = boot({ lights: [stored] })

    expect(cm.getUserLights()[0].id).toEqual(expect.any(String))
    expect(reportsFor(cm, 'lights.json')[0]?.message).toContain('[0].id')
  })

  it.each([
    ['an unversioned', [template({})]],
    ['a versioned', { version: 1, data: [template({})] }],
  ])('loads the templates from %s array', (_, lightsFile) => {
    const cm = boot({ lightsFile })

    expect(cm.getUserLights()).toEqual([expect.objectContaining({ id: 'tpl-1' })])
    const moved = (fs.renameSync as jest.Mock).mock.calls.some((c) =>
      String(c[0]).endsWith('lights.json'),
    )
    expect(moved).toBe(false)
    expect(reportsFor(cm, 'lights.json')).toEqual([])
  })

  it('moves a lights file aside when it names a fixture type no build wrote', () => {
    const cm = boot({ lights: [template({ fixture: 'laser' })] })

    expect(cm.getUserLights()).toEqual([])
    const moved = (fs.renameSync as jest.Mock).mock.calls.some((c) =>
      String(c[0]).endsWith('lights.json'),
    )
    expect(moved).toBe(true)
    expect(reportsFor(cm, 'lights.json')).toEqual([
      expect.objectContaining({ reason: 'schema', message: expect.stringContaining('laser') }),
    ])
  })

  it('repairs a layout light stored without a channel map', () => {
    const { channels: _channels, ...light } = template({})
    const cm = boot({
      layoutLights: [{ ...light, fixtureId: 'tpl-1', group: 'front', mount: 'floor' }],
    })

    expect(cm.getLightingLayout().frontLights[0].channels).toEqual({
      masterDimmer: 0,
      red: 0,
      green: 0,
      blue: 0,
    })
    expect(reportsFor(cm, 'lightsLayout.json')[0]?.message).toContain('frontLights[0].channels')
  })

  it('reports only the set-aside when a repaired file then fails its check', () => {
    const cm = boot({
      layout: { strobeType: 'Strobe' },
      layoutLights: [
        template({ fixtureId: 'tpl-1', group: 'front', mount: 'floor', channels: { red: 2 } }),
      ],
    })

    expect(reportsFor(cm, 'lightsLayout.json')).toEqual([
      expect.objectContaining({ reason: 'schema' }),
    ])
  })
})
