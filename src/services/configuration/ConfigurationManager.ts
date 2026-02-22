import { v4 as uuidv4 } from 'uuid'
import { ConfigFile } from './ConfigFile'
import {
  DmxFixture,
  LightingConfiguration,
  ConfigStrobeType,
  LightTypes,
  DmxRig,
  DmxRigsConfig,
} from '../../photonics-dmx/types'

import type { AudioConfig } from '../../photonics-dmx/listeners/Audio/AudioTypes'
import { AudioCueType, BuiltInAudioCues } from '../../photonics-dmx/cues/types/audioCueTypes'
import { DEFAULT_AUDIO_CONFIG } from '../../photonics-dmx/listeners/Audio'

/**
 * Application preferences interface
 */
export interface AppPreferences {
  effectDebounce: number
  complex: boolean
  enttecProConfig?: {
    port: string
  }
  openDmxConfig?: {
    port: string
    dmxSpeed: number
  }
  artNetConfig?: {
    host: string
    universe: number
    net: number
    subnet: number
    subuni: number
    port: number
  }
  sacnConfig?: {
    universe: number
    networkInterface?: string
    unicastDestination?: string
    useUnicast: boolean
  }
  brightness?: {
    low: number
    medium: number
    high: number
    max: number
  }
  enabledCueGroups: string[]
  enabledAudioCueGroups?: string[]
  cueConsistencyWindow: number
  clockRate: number

  // Frontend-specific preferences
  dmxOutputConfig?: {
    sacnEnabled: boolean
    artNetEnabled: boolean
    enttecProEnabled: boolean
    openDmxEnabled: boolean
  }
  stageKitPrefs?: {
    yargPriority: 'prefer-for-tracked' | 'random' | 'never'
  }
  dmxSettingsPrefs?: {
    artNetExpanded: boolean
    enttecProExpanded: boolean
    sacnExpanded: boolean
    openDmxExpanded: boolean
  }
  allowMultipleActiveRigs?: boolean
  audioConfig?: AudioConfig
  activeAudioCueType?: AudioCueType
  simulationSettings?: {
    registryType: 'YARG' | 'RB3E'
    groupId: string
    effectId: string | null
    venueSize: 'NoVenue' | 'Small' | 'Large'
    bpm: number
    instrument: 'guitar' | 'bass' | 'keys' | 'drums'
  }
  leftMenuCollapsed?: boolean
  windowState?: {
    width: number
    height: number
    x?: number
    y?: number
  }
  cueEditorWindowState?: {
    width: number
    height: number
    x?: number
    y?: number
  }
}

/**
 * User's lights configuration interface
 */
export interface UserLightsConfig {
  lights: DmxFixture[]
}

/**
 * Default configurations
 */
const DEFAULT_PREFERENCES: AppPreferences = {
  effectDebounce: 0,
  complex: true,
  enabledCueGroups: ['stagekit'],
  enabledAudioCueGroups: ['audio-spectrum'],
  cueConsistencyWindow: 60000,
  clockRate: 5, // 5ms interval for smooth animations
  activeAudioCueType: BuiltInAudioCues.BasicLayered,

  // Brightness configuration defaults
  brightness: {
    low: 40,
    medium: 100,
    high: 180,
    max: 255,
  },

  // Frontend-specific preferences defaults
  dmxOutputConfig: {
    sacnEnabled: true,
    artNetEnabled: false,
    enttecProEnabled: false,
    openDmxEnabled: false,
  },
  enttecProConfig: {
    port: '',
  },
  openDmxConfig: {
    port: '',
    dmxSpeed: 40,
  },
  sacnConfig: {
    universe: 1,
    useUnicast: false,
    unicastDestination: '',
  },
  stageKitPrefs: {
    yargPriority: 'prefer-for-tracked',
  },
  dmxSettingsPrefs: {
    artNetExpanded: false,
    enttecProExpanded: false,
    sacnExpanded: false,
    openDmxExpanded: false,
  },
  allowMultipleActiveRigs: false,
  audioConfig: DEFAULT_AUDIO_CONFIG,
  cueEditorWindowState: {
    width: 1200,
    height: 900,
  },
}

const DEFAULT_USER_LIGHTS: UserLightsConfig = {
  lights: [],
}

const DEFAULT_LIGHTING_LAYOUT: LightingConfiguration = {
  numLights: 0,
  lightLayout: {
    id: 'default-layout',
    label: 'Default Layout',
  },
  strobeType: ConfigStrobeType.None,
  frontLights: [],
  backLights: [],
  strobeLights: [],
}

const DEFAULT_DMX_RIGS: DmxRigsConfig = {
  rigs: [],
}

/**
 * Simplified configuration manager using file-based organization
 */
export class ConfigurationManager {
  private preferences: ConfigFile<AppPreferences>
  private userLights: ConfigFile<UserLightsConfig>
  private lightingLayout: ConfigFile<LightingConfiguration>
  private dmxRigs: ConfigFile<DmxRigsConfig>

  constructor() {
    // Initialize config files with version numbers
    this.preferences = new ConfigFile('prefs.json', DEFAULT_PREFERENCES, 3)
    this.userLights = new ConfigFile('lights.json', DEFAULT_USER_LIGHTS, 1)
    this.lightingLayout = new ConfigFile('lightsLayout.json', DEFAULT_LIGHTING_LAYOUT, 1)
    this.dmxRigs = new ConfigFile('dmxRigs.json', DEFAULT_DMX_RIGS, 1)

    // Handle legacy lights format migration
    this.migrateLegacyLightsFormat()
    this.migrateLegacyPreferences()
    this.migrateToDmxRigs()
  }

  /**
   * Migrates legacy lights format (array) to new format ({lights: [...]})
   */
  private migrateLegacyLightsFormat(): void {
    const currentData = this.userLights.get()

    // If already in new format, do nothing
    if (currentData && Array.isArray(currentData.lights)) {
      return
    }

    // If legacy format (just an array), migrate
    if (Array.isArray(currentData)) {
      const migratedData: UserLightsConfig = { lights: currentData }
      this.userLights
        .update(migratedData)
        .catch((err) => console.error('[Photonics Config] Failed to persist migrated lights:', err))
      console.log(`[Photonics Config] Migrated legacy lights format to new format`)
    }
  }

  /**
   * Migrates legacy preference structures to the latest schema.
   * Currently handles the v2 -> v3 transition, where USB sender settings
   * move from flat fields (enttecProPort/openDmxPort/openDmxSpeed) into
   * dedicated top-level config objects (enttecProConfig/openDmxConfig).
   */
  private migrateLegacyPreferences(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- prefs shape for partial merge
    const currentPrefs = { ...this.preferences.get() } as any
    let updated = false

    const defaultEnttecConfig = { port: '' }

    // v2 -> v3: migrate legacy enttecProPort into enttecProConfig
    if (!currentPrefs.enttecProConfig) {
      const legacyPort =
        typeof currentPrefs.enttecProPort === 'string' ? currentPrefs.enttecProPort : ''
      currentPrefs.enttecProConfig = { ...defaultEnttecConfig, port: legacyPort }
      updated = true
    } else if (typeof currentPrefs.enttecProConfig.port !== 'string') {
      currentPrefs.enttecProConfig = {
        ...defaultEnttecConfig,
        ...currentPrefs.enttecProConfig,
        port:
          typeof currentPrefs.enttecProConfig.port === 'string'
            ? currentPrefs.enttecProConfig.port
            : '',
      }
      updated = true
    }

    if (currentPrefs.enttecProPort !== undefined) {
      delete currentPrefs.enttecProPort
      updated = true
    }

    if (updated) {
      this.preferences
        .update(currentPrefs)
        .catch((err) =>
          console.error('[Photonics Config] Failed to persist migrated preferences:', err),
        )
    }
  }

  /**
   * Migrates existing lighting layout to a default DMX rig
   */
  private migrateToDmxRigs(): void {
    const currentRigs = this.dmxRigs.get()
    const rigs = Array.isArray(currentRigs?.rigs) ? currentRigs.rigs : []

    // If rigs already exist, no migration needed
    if (rigs.length > 0) {
      return
    }

    // Check if we have an existing layout to migrate
    const existingLayout = this.lightingLayout.get() ?? ({} as LightingConfiguration)
    const safeLayout: LightingConfiguration = {
      numLights: existingLayout.numLights ?? 0,
      lightLayout: existingLayout.lightLayout ?? { id: 'default-layout', label: 'Default Layout' },
      strobeType: existingLayout.strobeType ?? ConfigStrobeType.None,
      frontLights: Array.isArray(existingLayout.frontLights) ? existingLayout.frontLights : [],
      backLights: Array.isArray(existingLayout.backLights) ? existingLayout.backLights : [],
      strobeLights: Array.isArray(existingLayout.strobeLights) ? existingLayout.strobeLights : [],
    }

    // Only migrate if layout has actual lights configured
    if (
      safeLayout.numLights > 0 ||
      safeLayout.frontLights.length > 0 ||
      safeLayout.backLights.length > 0 ||
      safeLayout.strobeLights.length > 0
    ) {
      const defaultRig: DmxRig = {
        id: uuidv4(),
        name: 'Default Rig',
        active: true,
        config: safeLayout,
      }

      this.dmxRigs
        .update({ rigs: [defaultRig] })
        .catch((err) =>
          console.error('[Photonics Config] Failed to persist migrated DMX rigs:', err),
        )
      console.log('[Photonics Config] Migrated existing layout to default DMX rig')
    }
  }

  // Preferences Methods

  /**
   * Gets a specific preference value
   */
  getPreference<K extends keyof AppPreferences>(key: K): AppPreferences[K] {
    return this.preferences.get()[key]
  }

  /**
   * Sets a specific preference value
   */
  async setPreference<K extends keyof AppPreferences>(
    key: K,
    value: AppPreferences[K],
  ): Promise<void> {
    const current = this.preferences.get()
    await this.preferences.update({ ...current, [key]: value })
  }

  /**
   * Gets all preferences
   */
  getAllPreferences(): AppPreferences {
    return this.preferences.get()
  }

  /**
   * Updates multiple preferences at once
   */
  async updatePreferences(updates: Partial<AppPreferences>): Promise<void> {
    const currentPrefs = this.preferences.get()
    const newPrefs = { ...currentPrefs, ...updates }
    await this.preferences.update(newPrefs)
  }

  /**
   * Resets preferences to default values
   */
  async resetPreferencesToDefaults(): Promise<void> {
    await this.preferences.update(DEFAULT_PREFERENCES)
  }

  // Cue Group Preferences

  /**
   * Gets the enabled cue groups preference.
   * Returns undefined if it has never been set.
   */
  getEnabledCueGroups(): string[] | undefined {
    return this.preferences.get().enabledCueGroups
  }

  /**
   * Sets the enabled cue groups by their IDs
   */
  async setEnabledCueGroups(groupIds: string[]): Promise<void> {
    await this.setPreference('enabledCueGroups', groupIds)
  }

  /**
   * Gets the enabled audio cue groups preference
   */
  getEnabledAudioCueGroups(): string[] | undefined {
    return this.preferences.get().enabledAudioCueGroups
  }

  /**
   * Sets the enabled audio cue groups by their IDs
   */
  async setEnabledAudioCueGroups(groupIds: string[]): Promise<void> {
    await this.setPreference('enabledAudioCueGroups', groupIds)
  }

  /**
   * Gets the preferred audio cue type
   */
  getActiveAudioCueType(): AudioCueType | undefined {
    return this.preferences.get().activeAudioCueType
  }

  /**
   * Persists the preferred audio cue type
   */
  async setActiveAudioCueType(cueType: AudioCueType): Promise<void> {
    await this.setPreference('activeAudioCueType', cueType)
  }

  /**
   * Gets the cue consistency window preference
   */
  getCueConsistencyWindow(): number {
    return this.preferences.get().cueConsistencyWindow
  }

  /**
   * Sets the cue consistency window preference
   */
  async setCueConsistencyWindow(windowMs: number): Promise<void> {
    await this.setPreference('cueConsistencyWindow', windowMs)
  }

  /**
   * Gets the clock rate preference (in milliseconds)
   */
  getClockRate(): number {
    return this.preferences.get().clockRate
  }

  /**
   * Sets the clock rate preference (in milliseconds)
   * @param rate The clock rate in milliseconds (1-100ms)
   */
  async setClockRate(rate: number): Promise<void> {
    const clampedRate = Math.max(1, Math.min(100, rate))
    await this.setPreference('clockRate', clampedRate)
  }

  // User Lights Methods

  /**
   * Gets the user's saved lights
   */
  getUserLights(): DmxFixture[] {
    return this.userLights.get().lights
  }

  /**
   * Updates the user's lights
   */
  async updateUserLights(lights: DmxFixture[]): Promise<void> {
    await this.userLights.update({ lights })
  }

  /**
   * Resets user's lights to default values (empty)
   */
  async resetUserLightsToDefaults(): Promise<void> {
    await this.userLights.update(DEFAULT_USER_LIGHTS)
  }

  // Light Library Methods (Default Templates)

  /**
   * Gets the default light types (templates)
   */
  getLightLibrary(): DmxFixture[] {
    return LightTypes
  }

  // Layout Methods

  /**
   * Gets the lighting layout configuration
   */
  getLightingLayout(): LightingConfiguration {
    return this.lightingLayout.get()
  }

  /**
   * Updates the lighting layout configuration
   */
  async updateLightingLayout(layout: LightingConfiguration): Promise<void> {
    await this.lightingLayout.update(layout)
  }

  /**
   * Gets a specific property from the lighting layout
   */
  getLayoutProperty<K extends keyof LightingConfiguration>(key: K): LightingConfiguration[K] {
    return this.lightingLayout.get()[key]
  }

  /**
   * Updates a specific property in the lighting layout
   */
  async updateLayoutProperty<K extends keyof LightingConfiguration>(
    key: K,
    value: LightingConfiguration[K],
  ): Promise<void> {
    const current = this.lightingLayout.get()
    await this.lightingLayout.update({ ...current, [key]: value })
  }

  /**
   * Resets the lighting layout to default values
   */
  async resetLayoutToDefaults(): Promise<void> {
    await this.lightingLayout.update(DEFAULT_LIGHTING_LAYOUT)
  }

  // Audio Configuration Methods

  /**
   * Gets audio configuration
   */
  getAudioConfig(): AudioConfig {
    const savedConfig = this.getPreference('audioConfig')

    const config = savedConfig ? { ...DEFAULT_AUDIO_CONFIG, ...savedConfig } : DEFAULT_AUDIO_CONFIG

    return { ...config, enabled: false }
  }

  /**
   * Sets audio configuration
   */
  async setAudioConfig(config: AppPreferences['audioConfig']): Promise<void> {
    await this.setPreference('audioConfig', config)
  }

  /**
   * Updates audio configuration (partial update)
   * Note: The 'enabled' field is never persisted (runtime-only state)
   */
  async updateAudioConfig(updates: Partial<AppPreferences['audioConfig']>): Promise<void> {
    const current = this.getPreference('audioConfig') || {}
    const updated = { ...current, ...updates }

    const { enabled: _enabled, ...configToSave } = updated

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- stripped audio config shape
    await this.setPreference('audioConfig', configToSave as any)
  }

  // DMX Rigs Methods

  /**
   * Gets all DMX rigs
   */
  getDmxRigs(): DmxRig[] {
    return this.dmxRigs.get().rigs
  }

  /**
   * Gets a specific DMX rig by ID
   */
  getDmxRig(id: string): DmxRig | null {
    const rigs = this.getDmxRigs()
    return rigs.find((rig) => rig.id === id) || null
  }

  /**
   * Saves or updates a DMX rig
   */
  async saveDmxRig(rig: DmxRig): Promise<void> {
    const current = this.dmxRigs.get()
    const rigs = [...current.rigs]
    const existingIndex = rigs.findIndex((r) => r.id === rig.id)

    if (existingIndex >= 0) {
      rigs[existingIndex] = rig
    } else {
      rigs.push(rig)
    }

    await this.dmxRigs.update({ rigs })
  }

  /**
   * Deletes a DMX rig by ID
   */
  async deleteDmxRig(id: string): Promise<void> {
    const current = this.dmxRigs.get()
    const rigs = current.rigs.filter((rig) => rig.id !== id)
    await this.dmxRigs.update({ rigs })
  }

  /**
   * Gets only active DMX rigs (where active === true)
   */
  getActiveRigs(): DmxRig[] {
    return this.getDmxRigs().filter((rig) => rig.active === true)
  }
}
