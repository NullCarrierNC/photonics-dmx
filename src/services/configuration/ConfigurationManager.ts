import { ConfigFile } from './ConfigFile'
import { PreferencesConfigFile } from './PreferencesConfigFile'
import {
  DmxFixture,
  LightingConfiguration,
  ConfigStrobeType,
  LightTypes,
  DmxRig,
  DmxRigsConfig,
} from '../../photonics-dmx/types'
import { migrateDmxRigsConfig } from '../../photonics-dmx/helpers/lightingConfigMigration'

import {
  type AudioConfig,
  type AudioGameModeConfig,
  DEFAULT_AUDIO_GAME_MODE,
} from '../../photonics-dmx/listeners/Audio/AudioTypes'
import { AudioCueType } from '../../photonics-dmx/cues/types/audioCueTypes'
import { DEFAULT_AUDIO_CONFIG } from '../../photonics-dmx/listeners/Audio'
import { DEFAULT_PREFERENCES, type AppPreferences } from './configurationDefaults'
import { type CueDomain, type CueDomainPrefs, mergePartialCueDomains } from './cueDomainTypes'
import {
  applyLegacySenderFlatToNested,
  hasStraySenderFlatKeys,
  LEGACY_FLAT_SENDER_PREF_KEYS,
} from './preferencesMigration'

export type { AppPreferences } from './configurationDefaults'
export type { CueDomain, CueDomainPrefs } from './cueDomainTypes'

/**
 * User's lights configuration interface
 */
export interface UserLightsConfig {
  lights: DmxFixture[]
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
  private preferences: PreferencesConfigFile
  private userLights: ConfigFile<UserLightsConfig>
  private lightingLayout: ConfigFile<LightingConfiguration>
  private dmxRigs: ConfigFile<DmxRigsConfig>

  constructor() {
    this.preferences = new PreferencesConfigFile()
    this.userLights = new ConfigFile('lights.json', DEFAULT_USER_LIGHTS, 1)
    this.lightingLayout = new ConfigFile('lightsLayout.json', DEFAULT_LIGHTING_LAYOUT, 1)
    this.dmxRigs = new ConfigFile('dmxRigs.json', DEFAULT_DMX_RIGS, 1)

    // Handle legacy lights format migration
    this.migrateLegacyLightsFormat()
    this.normalizeStraySenderFlatKeys()
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
   * v4+ prefs already nest USB sender config; if `enttecProPort` / `openDmxPort` / `openDmxSpeed`
   * appear (e.g. manual file edit or pre-v4 stragglers), fold them into `enttecProConfig` and
   * `openDmxConfig` and persist. Normal migration runs in PreferencesConfigFile v3→v4.
   */
  private normalizeStraySenderFlatKeys(): void {
    const full = { ...this.preferences.get() } as unknown as Record<string, unknown>
    if (!hasStraySenderFlatKeys(full)) {
      return
    }

    const base = { ...this.preferences.get() } as AppPreferences
    for (const k of LEGACY_FLAT_SENDER_PREF_KEYS) {
      delete (base as unknown as Record<string, unknown>)[k]
    }
    const next = applyLegacySenderFlatToNested(full, base)
    this.preferences
      .update(next)
      .catch((err) =>
        console.error('[Photonics Config] Failed to persist sender key cleanup:', err),
      )
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
        id: crypto.randomUUID(),
        name: 'Default Rig',
        active: true,
        config: safeLayout,
      }

      this.dmxRigs
        .update({ ...currentRigs, rigs: [defaultRig] })
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
    let newPrefs: AppPreferences = { ...currentPrefs, ...updates }
    if (updates.cueDomains) {
      newPrefs = {
        ...newPrefs,
        cueDomains: mergePartialCueDomains(
          currentPrefs.cueDomains,
          updates.cueDomains as Partial<Record<CueDomain, Partial<CueDomainPrefs>>>,
        ),
      }
    }
    await this.preferences.update(newPrefs)
  }

  private async patchCueDomain(domain: CueDomain, patch: Partial<CueDomainPrefs>): Promise<void> {
    const current = this.preferences.get()
    const base = current.cueDomains[domain]
    const next: CueDomainPrefs = { ...base, ...patch }
    if (Object.prototype.hasOwnProperty.call(patch, 'disabledCues') && patch.disabledCues) {
      next.disabledCues = { ...patch.disabledCues }
    }
    await this.setPreference('cueDomains', { ...current.cueDomains, [domain]: next })
  }

  /**
   * Resets preferences to default values
   */
  async resetPreferencesToDefaults(): Promise<void> {
    await this.preferences.update(DEFAULT_PREFERENCES)
  }

  // Cue Group Preferences (stored in cueDomains)

  getEnabledCueGroups(): string[] | undefined {
    return this.preferences.get().cueDomains.yarg.enabledGroups
  }

  async setEnabledCueGroups(groupIds: string[]): Promise<void> {
    await this.patchCueDomain('yarg', { enabledGroups: groupIds })
  }

  getKnownYargCueGroups(): string[] | undefined {
    return this.preferences.get().cueDomains.yarg.knownGroups
  }

  async setKnownYargCueGroups(groupIds: string[]): Promise<void> {
    await this.patchCueDomain('yarg', { knownGroups: groupIds })
  }

  getKnownAudioCueGroups(): string[] | undefined {
    return this.preferences.get().cueDomains.audio.knownGroups
  }

  async setKnownAudioCueGroups(groupIds: string[]): Promise<void> {
    await this.patchCueDomain('audio', { knownGroups: groupIds })
  }

  getEnabledAudioCueGroups(): string[] | undefined {
    return this.preferences.get().cueDomains.audio.enabledGroups
  }

  async setEnabledAudioCueGroups(groupIds: string[]): Promise<void> {
    await this.patchCueDomain('audio', { enabledGroups: groupIds })
  }

  getDisabledYargCues(): Record<string, string[]> | undefined {
    return this.preferences.get().cueDomains.yarg.disabledCues
  }

  async setDisabledYargCues(disabled: Record<string, string[]>): Promise<void> {
    await this.patchCueDomain('yarg', { disabledCues: { ...disabled } })
  }

  getDisabledAudioCues(): Record<string, string[]> | undefined {
    return this.preferences.get().cueDomains.audio.disabledCues
  }

  async setDisabledAudioCues(disabled: Record<string, string[]>): Promise<void> {
    await this.patchCueDomain('audio', { disabledCues: { ...disabled } })
  }

  getEnabledMotionCueGroups(): string[] | undefined {
    return this.preferences.get().cueDomains.yargMotion.enabledGroups
  }

  async setEnabledMotionCueGroups(groupIds: string[]): Promise<void> {
    await this.patchCueDomain('yargMotion', { enabledGroups: groupIds })
  }

  getKnownMotionCueGroups(): string[] | undefined {
    return this.preferences.get().cueDomains.yargMotion.knownGroups
  }

  async setKnownMotionCueGroups(groupIds: string[]): Promise<void> {
    await this.patchCueDomain('yargMotion', { knownGroups: groupIds })
  }

  getDisabledMotionCues(): Record<string, string[]> | undefined {
    return this.preferences.get().cueDomains.yargMotion.disabledCues
  }

  async setDisabledMotionCues(disabled: Record<string, string[]>): Promise<void> {
    await this.patchCueDomain('yargMotion', { disabledCues: { ...disabled } })
  }

  getEnabledAudioMotionCueGroups(): string[] | undefined {
    return this.preferences.get().cueDomains.audioMotion.enabledGroups
  }

  async setEnabledAudioMotionCueGroups(groupIds: string[]): Promise<void> {
    await this.patchCueDomain('audioMotion', { enabledGroups: groupIds })
  }

  getKnownAudioMotionCueGroups(): string[] | undefined {
    return this.preferences.get().cueDomains.audioMotion.knownGroups
  }

  async setKnownAudioMotionCueGroups(groupIds: string[]): Promise<void> {
    await this.patchCueDomain('audioMotion', { knownGroups: groupIds })
  }

  getDisabledAudioMotionCues(): Record<string, string[]> | undefined {
    return this.preferences.get().cueDomains.audioMotion.disabledCues
  }

  async setDisabledAudioMotionCues(disabled: Record<string, string[]>): Promise<void> {
    await this.patchCueDomain('audioMotion', { disabledCues: { ...disabled } })
  }

  getAudioMotionGroupSelectionMode(): 'oncePerSong' | 'perCueChange' | 'none' {
    const m = this.preferences.get().cueDomains.audioMotion.selectionMode
    if (m === 'oncePerSong' || m === 'perCueChange' || m === 'none') {
      return m
    }
    return 'perCueChange'
  }

  async setAudioMotionGroupSelectionMode(
    mode: 'oncePerSong' | 'perCueChange' | 'none',
  ): Promise<void> {
    await this.patchCueDomain('audioMotion', { selectionMode: mode })
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

  getMotionCueMinimumHoldMs(): number {
    return this.preferences.get().cueDomains.yargMotion.minimumHoldMs ?? 5000
  }

  async setMotionCueMinimumHoldMs(ms: number): Promise<void> {
    const clamped = Math.max(0, Math.min(600000, Math.round(ms)))
    const c = this.preferences.get()
    await this.setPreference('cueDomains', {
      ...c.cueDomains,
      yargMotion: { ...c.cueDomains.yargMotion, minimumHoldMs: clamped },
      audioMotion: { ...c.cueDomains.audioMotion, minimumHoldMs: clamped },
    })
  }

  getMotionCueProbabilityPercent(): number {
    return this.preferences.get().cueDomains.yargMotion.probabilityPercent ?? 100
  }

  async setMotionCueProbabilityPercent(percent: number): Promise<void> {
    const clamped = Math.max(0, Math.min(100, Math.round(percent)))
    await this.patchCueDomain('yargMotion', { probabilityPercent: clamped })
  }

  getAudioMotionCueProbabilityPercent(): number {
    return this.preferences.get().cueDomains.audioMotion.probabilityPercent ?? 100
  }

  async setAudioMotionCueProbabilityPercent(percent: number): Promise<void> {
    const clamped = Math.max(0, Math.min(100, Math.round(percent)))
    await this.patchCueDomain('audioMotion', { probabilityPercent: clamped })
  }

  /**
   * YARG *lighting* cue group changes: within song vs once per song.
   */
  getCueGroupSelectionMode(): 'oncePerSong' | 'withinSong' {
    const m = this.preferences.get().cueDomains.yarg.selectionMode
    if (m === 'oncePerSong' || m === 'withinSong') {
      return m
    }
    return 'withinSong'
  }

  async setCueGroupSelectionMode(mode: 'oncePerSong' | 'withinSong'): Promise<void> {
    await this.patchCueDomain('yarg', { selectionMode: mode })
  }

  getMotionGroupSelectionMode(): 'oncePerSong' | 'perCueChange' | 'none' {
    const m = this.preferences.get().cueDomains.yargMotion.selectionMode
    if (m === 'oncePerSong' || m === 'perCueChange' || m === 'none') {
      return m
    }
    return 'perCueChange'
  }

  async setMotionGroupSelectionMode(mode: 'oncePerSong' | 'perCueChange' | 'none'): Promise<void> {
    await this.patchCueDomain('yargMotion', { selectionMode: mode })
  }

  getMotionEnabled(): boolean {
    return this.preferences.get().motionEnabled ?? true
  }

  async setMotionEnabled(enabled: boolean): Promise<void> {
    await this.setPreference('motionEnabled', enabled)
  }

  getActiveAudioMotionCueRef(): { groupId: string; cueId: string } | null {
    return this.preferences.get().cueDomains.audioMotion.activeCueRef ?? null
  }

  async setActiveAudioMotionCueRef(ref: { groupId: string; cueId: string } | null): Promise<void> {
    await this.patchCueDomain('audioMotion', { activeCueRef: ref })
  }

  getActiveYargMotionCueRef(): { groupId: string; cueId: string } | null {
    return this.preferences.get().cueDomains.yargMotion.activeCueRef ?? null
  }

  async setActiveYargMotionCueRef(ref: { groupId: string; cueId: string } | null): Promise<void> {
    await this.patchCueDomain('yargMotion', { activeCueRef: ref })
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
    const savedConfig = this.getPreference('audioConfig') as Partial<AudioConfig> | undefined
    const merged = { ...DEFAULT_AUDIO_CONFIG, ...savedConfig }
    const idleDetection = {
      ...DEFAULT_AUDIO_CONFIG.idleDetection,
      ...(savedConfig?.idleDetection ?? {}),
    }
    return { ...merged, idleDetection, enabled: false }
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

  /**
   * Game Mode settings for audio-reactive automatic cue cycling
   */
  getAudioGameModeConfig(): AudioGameModeConfig {
    const saved = this.preferences.get().audioGameMode
    return saved ? { ...DEFAULT_AUDIO_GAME_MODE, ...saved } : DEFAULT_AUDIO_GAME_MODE
  }

  async setAudioGameModeConfig(config: AudioGameModeConfig): Promise<void> {
    await this.setPreference('audioGameMode', config)
  }

  async updateAudioGameModeConfig(updates: Partial<AudioGameModeConfig>): Promise<void> {
    const merged = { ...this.getAudioGameModeConfig(), ...updates }
    await this.setPreference('audioGameMode', merged)
  }

  // DMX Rigs Methods

  /**
   * Gets all DMX rigs (layout/mount migration applied on read; persisted when changed).
   */
  getDmxRigs(): DmxRig[] {
    const current = this.dmxRigs.get()
    const { config: migrated, changed } = migrateDmxRigsConfig(current)
    if (changed) {
      void this.dmxRigs
        .update(migrated)
        .catch((err) =>
          console.error('[Photonics Config] Failed to persist migrated DMX rigs:', err),
        )
    }
    return migrated.rigs
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

    await this.dmxRigs.update({ ...current, rigs })
  }

  /**
   * Deletes a DMX rig by ID
   */
  async deleteDmxRig(id: string): Promise<void> {
    const current = this.dmxRigs.get()
    const rigs = current.rigs.filter((rig) => rig.id !== id)
    await this.dmxRigs.update({ ...current, rigs })
  }

  /**
   * Gets only active DMX rigs (where active === true)
   */
  getActiveRigs(): DmxRig[] {
    return this.getDmxRigs().filter((rig) => rig.active === true)
  }
}
