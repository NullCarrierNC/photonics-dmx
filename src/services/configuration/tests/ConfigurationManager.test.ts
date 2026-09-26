import { ConfigurationManager } from '../ConfigurationManager'
import { ConfigStrobeType, FixtureTypes, type RgbFixture } from '../../../photonics-dmx/types'

// Mock electron app
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
import * as fsPromises from 'fs/promises'

describe('ConfigurationManager', () => {
  let configManager: ConfigurationManager

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks()

    // Mock file system responses
    ;(fs.existsSync as jest.Mock).mockReturnValue(true)
    ;(fs.readFileSync as jest.Mock).mockImplementation((path: string) => {
      if (path.includes('prefs.json')) {
        return JSON.stringify({ effectDebounce: 0, complex: true })
      } else if (path.includes('lights.json')) {
        return JSON.stringify({ lights: [] })
      } else if (path.includes('lightsLayout.json')) {
        return JSON.stringify({
          numLights: 0,
          lightLayout: { id: 'default-layout', label: 'Default Layout' },
          strobeType: ConfigStrobeType.None,
          frontLights: [],
          backLights: [],
          strobeLights: [],
        })
      }
      return '{}'
    })

    configManager = new ConfigurationManager()
  })

  describe('Preferences', () => {
    test('should get preference value', () => {
      const value = configManager.getPreference('effectDebounce')
      expect(value).toBe(0)
    })

    test('should set preference value', async () => {
      await configManager.setPreference('effectDebounce', 100)
      expect(fsPromises.writeFile).toHaveBeenCalled()
    })

    test('should get all preferences', () => {
      const prefs = configManager.getAllPreferences()
      expect(prefs).toMatchObject({
        effectDebounce: 0,
        complex: true,
        enttecProConfig: { port: '' },
        cueDomains: expect.objectContaining({
          yarg: expect.objectContaining({ enabledGroups: expect.any(Array) }),
        }),
      })
    })

    test('should update multiple preferences', async () => {
      await configManager.updatePreferences({ effectDebounce: 50, complex: false })
      expect(fsPromises.writeFile).toHaveBeenCalled()
    })

    test('merges a partial nested setting into the stored one', async () => {
      const sacnConfig = {
        universe: 7,
        networkInterface: '10.0.0.5',
        useUnicast: true,
        unicastDestination: '10.0.0.9',
        refreshRateHz: 30,
      }
      await configManager.updatePreferences({ sacnConfig })

      await configManager.updatePreferences({ sacnConfig: { universe: 3 } } as never)

      expect(configManager.getPreference('sacnConfig')).toEqual({ ...sacnConfig, universe: 3 })
    })

    test('never stores whether audio is running', async () => {
      await configManager.updatePreferences({
        audioConfig: { enabled: true, sensitivity: 3 },
      } as never)

      const stored = configManager.getPreference('audioConfig')
      expect(stored).not.toHaveProperty('enabled')
      expect(stored?.sensitivity).toBe(3)
      expect(stored?.fftSize).toBeDefined()
    })

    test('holds a motion selection mode to the three a motion domain can take', async () => {
      // withinSong is legal in the schema but only means something for lighting, so reading a
      // motion domain straight through would answer outside the union its channel declares.
      await configManager.updateCueDomain('rb3Motion', { selectionMode: 'withinSong' })
      expect(configManager.getRb3MotionGroupSelectionMode()).toBe('perCueChange')

      await configManager.updateCueDomain('yargMotion', { selectionMode: 'withinSong' })
      expect(configManager.getMotionGroupSelectionMode()).toBe('perCueChange')
    })

    test('keeps a motion selection mode the domain does take', async () => {
      await configManager.updateCueDomain('rb3Motion', { selectionMode: 'oncePerSong' })
      expect(configManager.getRb3MotionGroupSelectionMode()).toBe('oncePerSong')
    })
  })

  describe('User Lights', () => {
    test('should get user lights', () => {
      const lights = configManager.getUserLights()
      expect(lights).toEqual([])
    })

    test('should update user lights', async () => {
      const mockLights: RgbFixture[] = [
        {
          id: '1',
          fixture: FixtureTypes.RGB,
          name: 'Test Light',
          position: -1,
          label: 'Test',
          isStrobeEnabled: false,
          channels: { red: 1, green: 2, blue: 3, masterDimmer: 4 },
        },
      ]
      await configManager.saveUserLights(mockLights)
      expect(fsPromises.writeFile).toHaveBeenCalled()
    })

    test('changes one template from the stored list, keeping a save that landed meanwhile', async () => {
      const light = (id: string, name: string): RgbFixture => ({
        id,
        fixture: FixtureTypes.RGB,
        name,
        position: -1,
        label: name,
        isStrobeEnabled: false,
        channels: { red: 1, green: 2, blue: 3, masterDimmer: 4 },
      })
      await configManager.saveUserLights([light('1', 'One')])

      await Promise.all([
        configManager.saveUserLights([light('1', 'One'), light('2', 'Two')]),
        configManager.updateUserLight('1', (stored) => ({ ...stored, name: 'Renamed' })),
      ])

      expect(configManager.getUserLights().map((l) => [l.id, l.name])).toEqual([
        ['1', 'Renamed'],
        ['2', 'Two'],
      ])
    })

    test('writes nothing for a template that is gone', async () => {
      jest.mocked(fsPromises.writeFile).mockClear()

      await configManager.updateUserLight('missing', (stored) => ({ ...stored, name: 'x' }))

      expect(fsPromises.writeFile).not.toHaveBeenCalled()
    })

    test('should get light library (default templates)', () => {
      const library = configManager.getLightLibrary()
      expect(library).toBeDefined()
      expect(Array.isArray(library)).toBe(true)
    })
  })

  describe('Fixture schema migration on load', () => {
    /** Boots a manager against an on-disk library + layout holding pre-collapse rgbw fixtures. */
    const bootWithLegacyRgbw = (): ConfigurationManager => {
      ;(fs.readFileSync as jest.Mock).mockImplementation((path: string) => {
        if (path.includes('prefs.json')) {
          return JSON.stringify({ effectDebounce: 0, complex: true })
        }
        if (path.includes('lights.json')) {
          return JSON.stringify({
            lights: [
              {
                id: 'tpl-rgbw',
                position: 0,
                fixture: 'rgbw',
                label: 'RGBW',
                name: 'RGBW',
                isStrobeEnabled: false,
                channels: { masterDimmer: 1, red: 2, green: 3, blue: 4, white: 5 },
              },
            ],
          })
        }
        if (path.includes('lightsLayout.json')) {
          return JSON.stringify({
            numLights: 1,
            lightLayout: { id: 'front', label: 'Front only' },
            strobeType: ConfigStrobeType.None,
            frontLights: [
              {
                id: 'l1',
                fixtureId: 'tpl-rgbw',
                position: 1,
                fixture: 'rgbw',
                label: 'RGBW',
                name: 'RGBW',
                isStrobeEnabled: false,
                group: 'front',
                mount: 'floor',
                channels: { masterDimmer: 11, red: 12, green: 13, blue: 14, white: 15 },
              },
            ],
            backLights: [],
            strobeLights: [],
          })
        }
        return '{}'
      })
      return new ConfigurationManager()
    }

    test('collapses a stored rgbw template onto rgb plus a white extra channel', () => {
      const lights = bootWithLegacyRgbw().getUserLights()
      expect(lights[0].fixture).toBe(FixtureTypes.RGB)
      expect(lights[0].extraChannels).toEqual([{ type: 'white', channel: 5 }])
      expect(lights[0].channels).not.toHaveProperty('white')
    })

    test('collapses rgbw lights in the stored lighting layout too', () => {
      const layout = bootWithLegacyRgbw().getLightingLayout()
      expect(layout.frontLights[0].fixture).toBe(FixtureTypes.RGB)
      expect(layout.frontLights[0].extraChannels).toEqual([{ type: 'white', channel: 15 }])
    })
  })

  describe('Lighting Layout', () => {
    test('should get lighting layout', () => {
      const layout = configManager.getLightingLayout()
      expect(layout).toEqual({
        numLights: 0,
        lightLayout: { id: 'default-layout', label: 'Default Layout' },
        strobeType: ConfigStrobeType.None,
        frontLights: [],
        backLights: [],
        strobeLights: [],
      })
    })

    test('should update lighting layout', async () => {
      const newLayout = {
        numLights: 4,
        lightLayout: { id: 'front', label: 'Front only' },
        strobeType: ConfigStrobeType.None,
        frontLights: [],
        backLights: [],
        strobeLights: [],
      }
      await configManager.updateLightingLayout(newLayout)
      expect(fsPromises.writeFile).toHaveBeenCalled()
    })
  })

  describe('Schema Versioning', () => {
    test('should handle legacy non-versioned format', () => {
      // Mock legacy format (no version info)
      ;(fs.readFileSync as jest.Mock).mockImplementation((path: string) => {
        if (path.includes('prefs.json')) {
          return JSON.stringify({ effectDebounce: 50, complex: false })
        }
        return '{}'
      })

      const configManager = new ConfigurationManager()
      const value = configManager.getPreference('effectDebounce')
      expect(value).toBe(50)
    })

    test('should handle versioned format', () => {
      // Mock versioned format
      ;(fs.readFileSync as jest.Mock).mockImplementation((path: string) => {
        if (path.includes('prefs.json')) {
          return JSON.stringify({
            version: 1,
            data: { effectDebounce: 75, complex: true },
          })
        }
        return '{}'
      })

      const configManager = new ConfigurationManager()
      const value = configManager.getPreference('effectDebounce')
      expect(value).toBe(75)
    })

    test('should save in versioned format', async () => {
      // Reset mocks for this specific test
      jest.clearAllMocks()
      ;(fsPromises.writeFile as jest.Mock).mockResolvedValue(undefined)
      ;(fsPromises.rename as jest.Mock).mockResolvedValue(undefined)

      // Mock default format for this test
      ;(fs.existsSync as jest.Mock).mockReturnValue(true)
      ;(fs.readFileSync as jest.Mock).mockImplementation((path: string) => {
        if (path.includes('prefs.json')) {
          return JSON.stringify({ effectDebounce: 0, complex: true })
        } else if (path.includes('lights.json')) {
          return JSON.stringify({ lights: [] })
        } else if (path.includes('lightsLayout.json')) {
          return JSON.stringify({
            numLights: 0,
            lightLayout: { id: 'default-layout', label: 'Default Layout' },
            strobeType: ConfigStrobeType.None,
            frontLights: [],
            backLights: [],
            strobeLights: [],
          })
        }
        return '{}'
      })

      const testConfigManager = new ConfigurationManager()
      await testConfigManager.setPreference('effectDebounce', 100)

      // Verify the saved data includes version information (writeFile is called with temp path and content)
      const writeCalls = (fsPromises.writeFile as jest.Mock).mock.calls.filter((c) =>
        String(c[0]).includes('prefs.json'),
      )
      expect(writeCalls.length).toBeGreaterThanOrEqual(1)
      const lastWriteCall = writeCalls[writeCalls.length - 1]
      const content = lastWriteCall[1]
      const savedData = JSON.parse(content)
      expect(savedData).toHaveProperty('version', 7)
      expect(savedData).toHaveProperty('data')
      expect(savedData.data).toHaveProperty('effectDebounce', 100)
    })
  })

  describe('Corrupt config on disk (Phase 3)', () => {
    it('renames an unparsable prefs file, uses defaults, and reports recovery', () => {
      ;(fs.readFileSync as jest.Mock).mockImplementation((path: string) => {
        if (path.includes('prefs.json')) {
          return '{ "broken": true'
        }
        if (path.includes('lights.json')) {
          return JSON.stringify({ lights: [] })
        }
        if (path.includes('lightsLayout.json')) {
          return JSON.stringify({
            numLights: 0,
            lightLayout: { id: 'default-layout', label: 'Default Layout' },
            strobeType: ConfigStrobeType.None,
            frontLights: [],
            backLights: [],
            strobeLights: [],
          })
        }
        if (path.includes('dmxRigs.json')) {
          return JSON.stringify({ version: 1, data: { rigs: [] } })
        }
        return '{}'
      })
      const cm = new ConfigurationManager()
      expect(fs.renameSync).toHaveBeenCalled()
      const renameCall = (fs.renameSync as jest.Mock).mock.calls.find((c) =>
        String(c[0]).endsWith('prefs.json'),
      )
      expect(renameCall).toBeDefined()
      expect(String(renameCall![1])).toMatch(/\.corrupt-.*\.json$/)
      expect(String(renameCall![1])).toContain('prefs')

      const reported = cm.drainConfigCorruptRecovery()
      expect(reported.some((r) => r.fileName === 'prefs.json' && r.reason === 'parse')).toBe(true)
    })

    it('renames an unreadable prefs file, uses defaults, and reports recovery', () => {
      ;(fs.readFileSync as jest.Mock).mockImplementation((path: string) => {
        if (path.includes('prefs.json')) {
          throw Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' })
        }
        if (path.includes('lights.json')) {
          return JSON.stringify({ lights: [] })
        }
        if (path.includes('lightsLayout.json')) {
          return JSON.stringify({
            numLights: 0,
            lightLayout: { id: 'default-layout', label: 'Default Layout' },
            strobeType: ConfigStrobeType.None,
            frontLights: [],
            backLights: [],
            strobeLights: [],
          })
        }
        if (path.includes('dmxRigs.json')) {
          return JSON.stringify({ version: 1, data: { rigs: [] } })
        }
        return '{}'
      })

      const cm = new ConfigurationManager()

      const renameCall = (fs.renameSync as jest.Mock).mock.calls.find((c) =>
        String(c[0]).endsWith('prefs.json'),
      )
      expect(renameCall).toBeDefined()
      expect(String(renameCall![1])).toMatch(/\.corrupt-.*\.json$/)

      const reported = cm.drainConfigCorruptRecovery()
      expect(reported.some((r) => r.fileName === 'prefs.json' && r.reason === 'read')).toBe(true)
    })

    it('does not write default prefs to disk if preserving the corrupt file by rename fails', () => {
      ;(fs.readFileSync as jest.Mock).mockImplementation((path: string) => {
        if (path.includes('prefs.json')) {
          return '{ "broken": true'
        }
        if (path.includes('lights.json')) {
          return JSON.stringify({ lights: [] })
        }
        if (path.includes('lightsLayout.json')) {
          return JSON.stringify({
            numLights: 0,
            lightLayout: { id: 'default-layout', label: 'Default Layout' },
            strobeType: ConfigStrobeType.None,
            frontLights: [],
            backLights: [],
            strobeLights: [],
          })
        }
        if (path.includes('dmxRigs.json')) {
          return JSON.stringify({ version: 1, data: { rigs: [] } })
        }
        return '{}'
      })
      ;(fs.renameSync as jest.Mock).mockImplementation((from: string) => {
        if (String(from).includes('prefs.json')) {
          throw new Error('EBUSY')
        }
      })
      ;(fsPromises.writeFile as jest.Mock).mockClear()
      new ConfigurationManager()
      const prefsWrites = (fsPromises.writeFile as jest.Mock).mock.calls.filter((c) =>
        String(c[0]).toLowerCase().includes('prefs'),
      )
      expect(prefsWrites).toHaveLength(0)
    })

    it('renames a valid JSON file that fails schema validation, uses defaults, and reports recovery', () => {
      ;(fs.readFileSync as jest.Mock).mockImplementation((path: string) => {
        if (path.includes('dmxRigs.json')) {
          return JSON.stringify({ version: 1, data: { rigs: 1 } })
        }
        if (path.includes('prefs.json')) {
          return JSON.stringify({ effectDebounce: 0, complex: true })
        }
        if (path.includes('lights.json')) {
          return JSON.stringify({ lights: [] })
        }
        if (path.includes('lightsLayout.json')) {
          return JSON.stringify({
            numLights: 0,
            lightLayout: { id: 'default-layout', label: 'Default Layout' },
            strobeType: ConfigStrobeType.None,
            frontLights: [],
            backLights: [],
            strobeLights: [],
          })
        }
        return '{}'
      })
      const cm = new ConfigurationManager()
      expect(fs.renameSync).toHaveBeenCalled()
      const nameMatch = (fs.renameSync as jest.Mock).mock.calls.find((c) =>
        String(c[0]).endsWith('dmxRigs.json'),
      )
      expect(nameMatch).toBeDefined()

      const reported = cm.drainConfigCorruptRecovery()
      expect(reported.some((r) => r.fileName === 'dmxRigs.json' && r.reason === 'schema')).toBe(
        true,
      )
    })
  })

  describe('Rig sync against fixture templates', () => {
    it('aligns stale rig snapshots to current templates at load and persists the result', async () => {
      // The user's saved rig was created before Strobe Channel? was enabled on the template, so
      // its frontLights[0].channels record is missing strobeChannel and there is no strobeValues.
      // The current template (lights.json) has both, and the load reconciles them.
      ;(fs.readFileSync as jest.Mock).mockImplementation((path: string) => {
        if (path.includes('prefs.json')) {
          return JSON.stringify({ effectDebounce: 0 })
        }
        if (path.includes('lights.json')) {
          return JSON.stringify({
            version: 1,
            data: {
              lights: [
                {
                  id: 'tpl-rgb',
                  fixture: FixtureTypes.RGB,
                  name: 'PAR 1',
                  label: 'PAR 1',
                  position: 0,
                  isStrobeEnabled: false,
                  channels: { masterDimmer: 1, red: 2, green: 3, blue: 4, strobeChannel: 5 },
                  strobeValues: { slow: 10, medium: 100, fast: 200, fastest: 250 },
                },
              ],
            },
          })
        }
        if (path.includes('lightsLayout.json')) {
          return JSON.stringify({
            numLights: 0,
            lightLayout: { id: 'default-layout', label: 'Default Layout' },
            strobeType: ConfigStrobeType.None,
            frontLights: [],
            backLights: [],
            strobeLights: [],
          })
        }
        if (path.includes('dmxRigs.json')) {
          return JSON.stringify({
            version: 1,
            data: {
              schemaVersion: 3,
              rigs: [
                {
                  id: 'rig-1',
                  name: 'Rig 1',
                  active: true,
                  config: {
                    numLights: 1,
                    lightLayout: {
                      id: 'two-rows',
                      label: 'Two Rows (one in front of the other)',
                    },
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
                        // stale: no strobeChannel, no strobeValues
                        channels: { masterDimmer: 11, red: 12, green: 13, blue: 14 },
                      },
                    ],
                    backLights: [],
                    strobeLights: [],
                  },
                },
              ],
            },
          })
        }
        return '{}'
      })

      const cm = new ConfigurationManager()
      const rigs = cm.getDmxRigs()
      const synced = rigs[0]!.config.frontLights[0]!
      // strobe channel filled from template offset (5 - 1 = 4, applied to master 11 → 15)
      expect(synced.channels).toHaveProperty('strobeChannel', 15)
      // strobeValues materialised from the template
      expect(synced.strobeValues).toEqual({ slow: 10, medium: 100, fast: 200, fastest: 250 })
      // rig-owned fields preserved
      expect(synced.id).toBe('l-1')
      expect(synced.isStrobeEnabled).toBe(true)
      expect(synced.mount).toBe('floor')
      // change was persisted back to disk
      await new Promise((resolve) => setImmediate(resolve))
      const rigsWrites = (fsPromises.writeFile as jest.Mock).mock.calls.filter((c) =>
        String(c[0]).includes('dmxRigs.json'),
      )
      expect(rigsWrites.length).toBeGreaterThan(0)
    })

    it('writes nothing when the rigs are read', async () => {
      // Same stale-rig setup: the saved rig is missing strobeChannel/strobeValues, which the load
      // heals. getActiveRigs/getDmxRig call getDmxRigs() in bursts, and none of them writes.
      ;(fs.readFileSync as jest.Mock).mockImplementation((path: string) => {
        if (path.includes('prefs.json')) {
          return JSON.stringify({ effectDebounce: 0 })
        }
        if (path.includes('lights.json')) {
          return JSON.stringify({
            version: 1,
            data: {
              lights: [
                {
                  id: 'tpl-rgb',
                  fixture: FixtureTypes.RGB,
                  name: 'PAR 1',
                  label: 'PAR 1',
                  position: 0,
                  isStrobeEnabled: false,
                  channels: { masterDimmer: 1, red: 2, green: 3, blue: 4, strobeChannel: 5 },
                  strobeValues: { slow: 10, medium: 100, fast: 200, fastest: 250 },
                },
              ],
            },
          })
        }
        if (path.includes('dmxRigs.json')) {
          return JSON.stringify({
            version: 1,
            data: {
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
            },
          })
        }
        return '{}'
      })

      const cm = new ConfigurationManager()
      await new Promise((resolve) => setImmediate(resolve))
      ;(fsPromises.writeFile as jest.Mock).mockClear()

      cm.getDmxRigs()
      cm.getDmxRigs()
      cm.getActiveRigs()
      cm.getDmxRig('rig-1')

      // Saves are serialized onto a promise chain, so any write lands a macrotask later.
      await new Promise((resolve) => setImmediate(resolve))

      const rigsWrites = (fsPromises.writeFile as jest.Mock).mock.calls.filter((c) =>
        String(c[0]).includes('dmxRigs.json'),
      )
      expect(rigsWrites).toEqual([])
      expect(cm.getDmxRigs()[0]!.config.frontLights[0]!.strobeValues).toEqual({
        slow: 10,
        medium: 100,
        fast: 200,
        fastest: 250,
      })
    })

    it('syncRigsWithUserLights returns false when nothing changed', async () => {
      ;(fs.readFileSync as jest.Mock).mockImplementation((path: string) => {
        if (path.includes('lights.json')) {
          return JSON.stringify({
            version: 1,
            data: {
              lights: [
                {
                  id: 'tpl-rgb',
                  fixture: FixtureTypes.RGB,
                  name: 'PAR 1',
                  label: 'PAR 1',
                  position: 0,
                  isStrobeEnabled: false,
                  channels: { masterDimmer: 1, red: 2, green: 3, blue: 4 },
                },
              ],
            },
          })
        }
        if (path.includes('dmxRigs.json')) {
          return JSON.stringify({
            version: 1,
            data: { schemaVersion: 3, rigs: [] },
          })
        }
        if (path.includes('lightsLayout.json')) {
          return JSON.stringify({
            numLights: 0,
            lightLayout: { id: 'default-layout', label: 'Default Layout' },
            strobeType: ConfigStrobeType.None,
            frontLights: [],
            backLights: [],
            strobeLights: [],
          })
        }
        if (path.includes('prefs.json')) {
          return JSON.stringify({ effectDebounce: 0 })
        }
        return '{}'
      })
      const cm = new ConfigurationManager()
      const changed = await cm.syncRigsWithUserLights()
      expect(changed).toBe(false)
    })
  })

  describe('overlapping preference writers', () => {
    test('two audio writers both survive', async () => {
      await Promise.all([
        configManager.updateAudioConfig({ sensitivity: 3 }),
        configManager.updateAudioConfig({ noiseFloor: 40 }),
      ])

      const stored = configManager.getPreference('audioConfig')
      expect(stored?.sensitivity).toBe(3)
      expect(stored?.noiseFloor).toBe(40)
    })

    test('two game mode writers both survive', async () => {
      await Promise.all([
        configManager.updateAudioGameModeConfig({ enabled: true }),
        configManager.updateAudioGameModeConfig({ cueDurationMax: 42 }),
      ])

      const stored = configManager.getAudioGameModeConfig()
      expect(stored.enabled).toBe(true)
      expect(stored.cueDurationMax).toBe(42)
    })

    test('a hold time written beside a domain change keeps both', async () => {
      await Promise.all([
        configManager.setMotionCueMinimumHoldMs(7000),
        configManager.updateCueDomain('yargMotion', { probabilityPercent: 25 }),
      ])

      const domains = configManager.getAllPreferences().cueDomains
      expect(domains.yargMotion.minimumHoldMs).toBe(7000)
      expect(domains.yargMotion.probabilityPercent).toBe(25)
    })
  })
})
