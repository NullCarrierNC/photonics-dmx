import { ConfigurationManager } from '../ConfigurationManager'
import { ConfigStrobeType, FixtureTypes } from '../../../photonics-dmx/types'

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
      })
    })

    test('should update multiple preferences', async () => {
      await configManager.updatePreferences({ effectDebounce: 50, complex: false })
      expect(fsPromises.writeFile).toHaveBeenCalled()
    })
  })

  describe('User Lights', () => {
    test('should get user lights', () => {
      const lights = configManager.getUserLights()
      expect(lights).toEqual([])
    })

    test('should update user lights', async () => {
      const mockLights = [
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
      await configManager.updateUserLights(mockLights)
      expect(fsPromises.writeFile).toHaveBeenCalled()
    })

    test('should get light library (default templates)', () => {
      const library = configManager.getLightLibrary()
      expect(library).toBeDefined()
      expect(Array.isArray(library)).toBe(true)
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
        lightLayout: { id: 'front', label: 'Front' },
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
      const writeCalls = (fsPromises.writeFile as jest.Mock).mock.calls
      expect(writeCalls.length).toBeGreaterThanOrEqual(1)
      const lastWriteCall = writeCalls[writeCalls.length - 1]
      const content = lastWriteCall[1]
      const savedData = JSON.parse(content)
      expect(savedData).toHaveProperty('version', 3)
      expect(savedData).toHaveProperty('data')
      expect(savedData.data).toHaveProperty('effectDebounce', 100)
    })
  })
})
