import { ConfigurationManager } from '../ConfigurationManager';
import { ConfigStrobeType, FixtureTypes } from '../../../photonics-dmx/types';

// Mock electron app
jest.mock('electron', () => ({
  app: {
    getPath: jest.fn(() => '/mock/app/data/path')
  }
}));

jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  mkdirSync: jest.fn()
}));

import * as fs from 'fs';

describe('ConfigurationManager', () => {
  let configManager: ConfigurationManager;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Mock file system responses
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as jest.Mock).mockImplementation((path: string) => {
      if (path.includes('prefs.json')) {
        return JSON.stringify({ effectDebounce: 0, complex: true });
      } else if (path.includes('lights.json')) {
        return JSON.stringify({ lights: [] });
      } else if (path.includes('lightsLayout.json')) {
        return JSON.stringify({
          numLights: 0,
          lightLayout: { id: 'default-layout', label: 'Default Layout' },
          strobeType: ConfigStrobeType.None,
          frontLights: [],
          backLights: [],
          strobeLights: []
        });
      }
      return '{}';
    });
    
    configManager = new ConfigurationManager();
  });

  describe('Preferences', () => {
    test('should get preference value', () => {
      const value = configManager.getPreference('effectDebounce');
      expect(value).toBe(0);
    });

    test('should set preference value', () => {
      configManager.setPreference('effectDebounce', 100);
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    test('should get all preferences', () => {
      const prefs = configManager.getAllPreferences();
      expect(prefs).toEqual({ effectDebounce: 0, complex: true });
    });

    test('should update multiple preferences', () => {
      configManager.updatePreferences({ effectDebounce: 50, complex: false });
      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });

  describe('User Lights', () => {
    test('should get user lights', () => {
      const lights = configManager.getUserLights();
      expect(lights).toEqual([]);
    });

    test('should update user lights', () => {
      const mockLights = [
        { id: '1', fixture: FixtureTypes.RGB, name: 'Test Light', position: -1, label: 'Test', isStrobeEnabled: false, channels: { red: 1, green: 2, blue: 3, masterDimmer: 4 } }
      ];
      configManager.updateUserLights(mockLights);
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    test('should get light library (default templates)', () => {
      const library = configManager.getLightLibrary();
      expect(library).toBeDefined();
      expect(Array.isArray(library)).toBe(true);
    });
  });

  describe('Lighting Layout', () => {
    test('should get lighting layout', () => {
      const layout = configManager.getLightingLayout();
      expect(layout).toEqual({
        numLights: 0,
        lightLayout: { id: 'default-layout', label: 'Default Layout' },
        strobeType: ConfigStrobeType.None,
        frontLights: [],
        backLights: [],
        strobeLights: []
      });
    });

    test('should update lighting layout', () => {
      const newLayout = {
        numLights: 4,
        lightLayout: { id: 'front', label: 'Front' },
        strobeType: ConfigStrobeType.None,
        frontLights: [],
        backLights: [],
        strobeLights: []
      };
      configManager.updateLightingLayout(newLayout);
      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });

  describe('Schema Versioning', () => {
    test('should handle legacy non-versioned format', () => {
      // Mock legacy format (no version info)
      (fs.readFileSync as jest.Mock).mockImplementation((path: string) => {
        if (path.includes('prefs.json')) {
          return JSON.stringify({ effectDebounce: 50, complex: false });
        }
        return '{}';
      });

      const configManager = new ConfigurationManager();
      const value = configManager.getPreference('effectDebounce');
      expect(value).toBe(50);
    });

    test('should handle versioned format', () => {
      // Mock versioned format
      (fs.readFileSync as jest.Mock).mockImplementation((path: string) => {
        if (path.includes('prefs.json')) {
          return JSON.stringify({
            version: 1,
            data: { effectDebounce: 75, complex: true }
          });
        }
        return '{}';
      });

      const configManager = new ConfigurationManager();
      const value = configManager.getPreference('effectDebounce');
      expect(value).toBe(75);
    });

    test('should save in versioned format', () => {
      // Reset mocks for this specific test
      jest.clearAllMocks();
      
      // Mock default format for this test
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockImplementation((path: string) => {
        if (path.includes('prefs.json')) {
          return JSON.stringify({ effectDebounce: 0, complex: true });
        } else if (path.includes('lights.json')) {
          return JSON.stringify({ lights: [] });
        } else if (path.includes('lightsLayout.json')) {
          return JSON.stringify({
            numLights: 0,
            lightLayout: { id: 'default-layout', label: 'Default Layout' },
            strobeType: ConfigStrobeType.None,
            frontLights: [],
            backLights: [],
            strobeLights: []
          });
        }
        return '{}';
      });

      const testConfigManager = new ConfigurationManager();
      testConfigManager.setPreference('effectDebounce', 100);
      
      // Verify the saved data includes version information
      const calls = (fs.writeFileSync as jest.Mock).mock.calls;
      const writeCall = calls[calls.length - 1];
      const savedData = JSON.parse(writeCall[1]);
      
      expect(savedData).toHaveProperty('version', 2);
      expect(savedData).toHaveProperty('data');
      expect(savedData.data).toHaveProperty('effectDebounce', 100);
    });
  });
}); 