import fs from 'fs';
import path from 'path';
import { DmxFixture, LightingConfiguration, ConfigStrobeType, LightTypes } from '../types';
import { app } from 'electron';

/**
 * Manages application configuration, light fixture data, and light layouts.
 * Handles loading and saving of configurations to disk.
 */
export class ConfigurationManager {
  /**
   * Array of available light types.
   * @type {DmxFixture[]}
   */
  public lightingConfig: DmxFixture[] = [];

  public layoutConfig?: LightingConfiguration;

  /**
   * Path to user's saved lights configuration.
   * @private
   */
  private lightsFilePath: string;

  /**
   * Base path for light layout configuration files.
   * @private
   */
  private layoutFilePath: string;

  /**
   * Path to the preferences JSON file.
   * @private
   */
  private prefsFilePath: string;

  /**
   * In-memory store for preferences loaded from prefs.json.
   * @private
   */
  private prefsConfig: Record<string, any> = {};

  constructor() {
    // Define the base folder for the application configuration.
    const appDataFolder = path.join(app.getPath('appData'), 'Photonics.rocks');

    // Check if the photonics folder exists; if not, create it.
    if (!fs.existsSync(appDataFolder)) {
      try {
        fs.mkdirSync(appDataFolder, { recursive: true });
        console.log(`Created folder: ${appDataFolder}`);
      } catch (error) {
        console.error(`Error creating folder ${appDataFolder}:`, error);
      }
    }

    // Set paths to configuration files
    this.lightsFilePath = path.join(appDataFolder, 'lights.json');
    this.layoutFilePath = path.join(appDataFolder, 'lightsLayout.json');
    this.prefsFilePath = path.join(appDataFolder, 'prefs.json');

    // Initialize lighting configuration with default light types
    this.lightingConfig = LightTypes;

    console.log("\n***\nConfig Path: ", this.lightsFilePath, "\n***\n");

    // Load or create prefs.json
    if (fs.existsSync(this.prefsFilePath)) {
      try {
        const prefsContent = fs.readFileSync(this.prefsFilePath, 'utf-8');
        this.prefsConfig = JSON.parse(prefsContent);
      } catch (error) {
        console.error('Error loading prefs.json:', error);
        // Initialize with default preferences if parsing fails
        this.prefsConfig = { 
          effectDebounce: 0,
          complex: true, 
        };
        this.savePrefsToFile();
      }
    } else {
      // File does not exist, create with default prefs
      this.prefsConfig = { 
        effectDebounce: 0, 
        complex: true, 
      };
      this.savePrefsToFile();
    }
    
    // Load the lighting layout configuration
    this.loadLightLayout();
  }

  /**
   * Returns the array of available lights.
   */
  getLights(): DmxFixture[] {
    return this.lightingConfig;
  }

  /**
   * Returns the light layout configuration.
   */
  getLayout(): LightingConfiguration | undefined {
    return this.layoutConfig;
  }

  /**
   * Saves the given light library data to disk.
   */
  saveMyLights(data: DmxFixture[]): void {
    try {
      fs.writeFileSync(this.lightsFilePath, JSON.stringify(data, null, 2));
      this.lightingConfig = data;
      console.log('Data saved to disk:', data);
    } catch (error) {
      if (error instanceof Error) {
        console.error('Error saving data to disk:', error.message);
      } else {
        console.error('Unknown error occurred while saving data to disk.');
      }
    }
  }

  /**
   * Loads the light library data from disk.
   * Returns an array of lights or an empty array if the file doesn't exist.
   */
  loadMyLights(): DmxFixture[] {
    if (fs.existsSync(this.lightsFilePath)) {
      const fileContent = fs.readFileSync(this.lightsFilePath, 'utf-8');
      return JSON.parse(fileContent) as DmxFixture[];
    }
    console.log('File not found, returning empty:', this.lightsFilePath);
    return [];
  }

  /**
   * Saves the light layout configuration to disk.
   * @param {LightingConfiguration} data - The lighting configuration to save.
   */
  saveLightLayout(data: LightingConfiguration): void {
    try {
      fs.writeFileSync(this.layoutFilePath, JSON.stringify(data, null, 2));
      this.layoutConfig = data;
      console.log(`Light layout saved to ${this.layoutFilePath}:`);
    } catch (error) {
      if (error instanceof Error) {
        console.error('Error saving light layout to disk:', error.message);
      } else {
        console.error('Unknown error occurred while saving light layout to disk.');
      }
    }
  }

  /**
   * Loads the light layout configuration from disk.
   * @returns {LightingConfiguration | null} The loaded lighting configuration or null if the file doesn't exist.
   */
  loadLightLayout(): LightingConfiguration | null {
    if (fs.existsSync(this.layoutFilePath)) {
      try {
        const fileContent = fs.readFileSync(this.layoutFilePath, 'utf-8');
        this.layoutConfig = JSON.parse(fileContent) as LightingConfiguration;
        return this.layoutConfig;
      } catch (error) {
        console.error(`Error loading light layout: ${error}`);
        // Fall through to create default
      }
    }
    
    console.log(`Light layout file not found: ${this.layoutFilePath}, creating default`);
    
    // Create a minimal default layout configuration
    const defaultLayout: LightingConfiguration = {
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
    
    // Save the default layout
    this.saveLightLayout(defaultLayout);
    this.layoutConfig = defaultLayout;
    return defaultLayout;
  }

  /**
   * Retrieves the value of a specific preference.
   * @param {string} prefName - The key of the preference to retrieve.
   * @returns The value of the preference, or undefined if it does not exist.
   */
  getPref(prefName: string): any {
    return this.prefsConfig[prefName];
  }

  getPrefs():any {
    return this.prefsConfig;
  }

  /**
   * Updates a specific preference and saves the updated preferences to disk.
   * This method does not overwrite other existing preferences.
   * @param {string} prefName - The key of the preference to update.
   * @param value - The new value for the preference.
   */
  savePref(prefName: string, value: any): void {
    this.prefsConfig[prefName] = value;
    this.savePrefsToFile();
  }

  /**
   * Helper method to save the current preferences to prefs.json on disk.
   * @private
   */
  private savePrefsToFile(): void {
    try {
      fs.writeFileSync(this.prefsFilePath, JSON.stringify(this.prefsConfig, null, 2));
      console.log(`Preferences saved to ${this.prefsFilePath}:`, this.prefsConfig);
    } catch (error) {
      if (error instanceof Error) {
        console.error('Error saving preferences to disk:', error.message);
      } else {
        console.error('Unknown error occurred while saving preferences to disk.');
      }
    }
  }
}