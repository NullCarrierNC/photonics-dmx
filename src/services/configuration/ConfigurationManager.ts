import { ConfigFile } from './ConfigFile';
import { DmxFixture, LightingConfiguration, ConfigStrobeType, LightTypes } from '../../photonics-dmx/types';

/**
 * Application preferences interface
 */
export interface AppPreferences {
  effectDebounce: number;
  complex: boolean;
  enttecProPort?: string;
  artNetConfig?: {
    host: string;
    universe: number;
    net: number;
    subnet: number;
    subuni: number;
    port: number;
  };
  sacnConfig?: {
    universe: number;
    networkInterface?: string;
    unicastDestination?: string;
    useUnicast: boolean;
  };
  brightness?: {
    low: number;
    medium: number;
    high: number;
    max: number;
  };
  enabledCueGroups: string[];
  cueConsistencyWindow: number;
  
  // Frontend-specific preferences
  dmxOutputConfig?: {
    sacnEnabled: boolean;
    artNetEnabled: boolean;
    enttecProEnabled: boolean;
  };
  stageKitPrefs?: {
    yargPriority: 'prefer-for-tracked' | 'random' | 'never';
  };
  dmxSettingsPrefs?: {
    artNetExpanded: boolean;
    enttecProExpanded: boolean;
    sacnExpanded: boolean;
  };
}

/**
 * User's lights configuration interface
 */
export interface UserLightsConfig {
  lights: DmxFixture[];
}

/**
 * Default configurations
 */
const DEFAULT_PREFERENCES: AppPreferences = {
  effectDebounce: 0,
  complex: true,
  enabledCueGroups: ['stagekit'],
  cueConsistencyWindow: 60000,
  
  // Brightness configuration defaults
  brightness: {
    low: 40,
    medium: 100,
    high: 180,
    max: 255
  },
  
  // Frontend-specific preferences defaults
  dmxOutputConfig: {
    sacnEnabled: true,
    artNetEnabled: false,
    enttecProEnabled: false
  },
  sacnConfig: {
    universe: 1,
    useUnicast: false,
    unicastDestination: ''
  },
  stageKitPrefs: {
    yargPriority: 'prefer-for-tracked'
  },
  dmxSettingsPrefs: {
    artNetExpanded: false,
    enttecProExpanded: false,
    sacnExpanded: false
  }
};

const DEFAULT_USER_LIGHTS: UserLightsConfig = {
  lights: [],
};

const DEFAULT_LIGHTING_LAYOUT: LightingConfiguration = {
  numLights: 0,
  lightLayout: {
    id: "default-layout",
    label: "Default Layout"
  },
  strobeType: ConfigStrobeType.None,
  frontLights: [],
  backLights: [],
  strobeLights: []
};

/**
 * Simplified configuration manager using file-based organization
 */
export class ConfigurationManager {
  private preferences: ConfigFile<AppPreferences>;
  private userLights: ConfigFile<UserLightsConfig>;
  private lightingLayout: ConfigFile<LightingConfiguration>;

  constructor() {
    // Initialize config files with version numbers
    this.preferences = new ConfigFile('prefs.json', DEFAULT_PREFERENCES, 1);
    this.userLights = new ConfigFile('lights.json', DEFAULT_USER_LIGHTS, 1);
    this.lightingLayout = new ConfigFile('lightsLayout.json', DEFAULT_LIGHTING_LAYOUT, 1);
    
    // Handle legacy lights format migration
    this.migrateLegacyLightsFormat();
  }

  /**
   * Migrates legacy lights format (array) to new format ({lights: [...]})
   */
  private migrateLegacyLightsFormat(): void {
    const currentData = this.userLights.get();

    // If already in new format, do nothing
    if (currentData && Array.isArray(currentData.lights)) {
      return;
    }

    // If legacy format (just an array), migrate
    if (Array.isArray(currentData)) {
      const migratedData: UserLightsConfig = { lights: currentData };
      this.userLights.update(migratedData);
      console.log(`[Photonics Config] Migrated legacy lights format to new format`);
    }
  }

  // Preferences Methods

  /**
   * Gets a specific preference value
   */
  getPreference<K extends keyof AppPreferences>(key: K): AppPreferences[K] {
    return this.preferences.get()[key];
  }

  /**
   * Sets a specific preference value
   */
  setPreference<K extends keyof AppPreferences>(key: K, value: AppPreferences[K]): void {
    const current = this.preferences.get();
    this.preferences.update({ ...current, [key]: value });
  }

  /**
   * Gets all preferences
   */
  getAllPreferences(): AppPreferences {
    return this.preferences.get();
  }

  /**
   * Updates multiple preferences at once
   */
  updatePreferences(updates: Partial<AppPreferences>): void {
    const currentPrefs = this.preferences.get();
    const newPrefs = { ...currentPrefs, ...updates };
    this.preferences.update(newPrefs);
  }

  /**
   * Resets preferences to default values
   */
  resetPreferencesToDefaults(): void {
    this.preferences.update(DEFAULT_PREFERENCES);
  }

  // Cue Group Preferences

  /**
   * Gets the enabled cue groups preference.
   * Returns undefined if it has never been set.
   */
  getEnabledCueGroups(): string[] | undefined {
    return this.preferences.get().enabledCueGroups;
  }

  /**
   * Sets the enabled cue groups by their IDs
   */
  setEnabledCueGroups(groupIds: string[]): void {
    this.setPreference('enabledCueGroups', groupIds);
  }

  /**
   * Gets the cue consistency window preference
   */
  getCueConsistencyWindow(): number {
    return this.preferences.get().cueConsistencyWindow;
  }

  /**
   * Sets the cue consistency window preference
   */
  setCueConsistencyWindow(windowMs: number): void {
    this.setPreference('cueConsistencyWindow', windowMs);
  }

  // User Lights Methods

  /**
   * Gets the user's saved lights
   */
  getUserLights(): DmxFixture[] {
    return this.userLights.get().lights;
  }

  /**
   * Updates the user's lights
   */
  updateUserLights(lights: DmxFixture[]): void {
    this.userLights.update({ lights });
  }

  /**
   * Resets user's lights to default values (empty)
   */
  resetUserLightsToDefaults(): void {
    this.userLights.update(DEFAULT_USER_LIGHTS);
  }

  // Light Library Methods (Default Templates)

  /**
   * Gets the default light types (templates)
   */
  getLightLibrary(): DmxFixture[] {
    return LightTypes;
  }

  // Layout Methods

  /**
   * Gets the lighting layout configuration
   */
  getLightingLayout(): LightingConfiguration {
    return this.lightingLayout.get();
  }

  /**
   * Updates the lighting layout configuration
   */
  updateLightingLayout(layout: LightingConfiguration): void {
    this.lightingLayout.update(layout);
  }

  /**
   * Gets a specific property from the lighting layout
   */
  getLayoutProperty<K extends keyof LightingConfiguration>(key: K): LightingConfiguration[K] {
    return this.lightingLayout.get()[key];
  }

  /**
   * Updates a specific property in the lighting layout
   */
  updateLayoutProperty<K extends keyof LightingConfiguration>(key: K, value: LightingConfiguration[K]): void {
    const current = this.lightingLayout.get();
    this.lightingLayout.update({ ...current, [key]: value });
  }

  /**
   * Resets the lighting layout to default values
   */
  resetLayoutToDefaults(): void {
    this.lightingLayout.update(DEFAULT_LIGHTING_LAYOUT);
  }
} 