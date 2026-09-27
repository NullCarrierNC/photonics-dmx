import { ConfigFile } from './ConfigFile'
import { PreferencesConfigFile } from './PreferencesConfigFile'
import type { ConfigCorruptInfo } from './configCorruptTypes'
import {
  validateDmxRigsData,
  validateLightingLayoutData,
  validateUserLightsData,
} from './configDataValidators'
import {
  DmxFixture,
  LightingConfiguration,
  ConfigStrobeType,
  LightTypes,
  DmxRig,
  DmxRigsConfig,
} from '../../photonics-dmx/types'
import {
  loadDmxRigsFixtures,
  loadLightingLayoutFixtures,
  loadUserLightsFixtures,
} from './fixtureLoading'
import { migrateDmxRigsConfig } from '../../photonics-dmx/helpers/lightingConfigMigration'
import { syncRigsConfigWithUserLights } from '../../photonics-dmx/helpers/rigTemplateSync'

import {
  type AudioConfig,
  type AudioGameModeConfig,
  DEFAULT_AUDIO_GAME_MODE,
} from '../../photonics-dmx/listeners/Audio/AudioTypes'
import { DEFAULT_AUDIO_CONFIG } from '../../photonics-dmx/listeners/Audio'
import { type AppPreferences } from './configurationDefaults'
import { type CueDomain, type CueDomainPrefs, mergePartialCueDomains } from './cueDomainTypes'
import { runStartupMigrations, type UserLightsConfig } from './startupMigrations'
import { isPlainObject } from '../../shared/plainObject'
import { createLogger } from '../../shared/logger'

const log = createLogger('ConfigurationManager')

export type { AppPreferences } from './configurationDefaults'
export type { CueDomain, CueDomainPrefs } from './cueDomainTypes'
export type { UserLightsConfig } from './startupMigrations'

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
  private configCorruptRecovery: ConfigCorruptInfo[] = []
  private onRecoveryQueued: (() => void) | undefined

  /** Clears and returns batched config recovery events (for one main → renderer send). */
  public drainConfigCorruptRecovery(): ConfigCorruptInfo[] {
    const out = this.configCorruptRecovery
    this.configCorruptRecovery = []
    return out
  }

  /**
   * Called each time a recovery event is queued after startup, so a running window can collect it.
   * Startup's own events wait for the window's first collection.
   */
  public setRecoveryQueuedListener(listener: () => void): void {
    this.onRecoveryQueued = listener
  }

  constructor() {
    const onCorrupt = (info: ConfigCorruptInfo): void => {
      this.configCorruptRecovery.push(info)
      this.onRecoveryQueued?.()
    }

    this.preferences = new PreferencesConfigFile({ onCorruptRecovery: onCorrupt })
    this.userLights = new ConfigFile('lights.json', DEFAULT_USER_LIGHTS, 1, {
      onCorruptRecovery: onCorrupt,
      validate: validateUserLightsData,
      normalizeLoaded: loadUserLightsFixtures,
    })
    this.lightingLayout = new ConfigFile('lightsLayout.json', DEFAULT_LIGHTING_LAYOUT, 1, {
      onCorruptRecovery: onCorrupt,
      validate: validateLightingLayoutData,
      normalizeLoaded: loadLightingLayoutFixtures,
    })
    // The ConfigFile envelope version stays at 1, and rig migrations run at load through a separate
    // internal schemaVersion (migrateDmxRigsConfig) because they need the userLights library to
    // realign each rig against its template, which ConfigFile.applyMigration has no access to.
    this.dmxRigs = new ConfigFile('dmxRigs.json', DEFAULT_DMX_RIGS, 1, {
      onCorruptRecovery: onCorrupt,
      validate: validateDmxRigsData,
      normalizeLoaded: (data, reportRepair) =>
        loadDmxRigsFixtures(data, this.getUserLights(), reportRepair),
    })

    runStartupMigrations({
      preferences: this.preferences,
      lightingLayout: this.lightingLayout,
      dmxRigs: this.dmxRigs,
    })
    this.reconcileDmxRigsAtLoad()
  }

  /**
   * Brings rigs up to the current rig schema ({@link migrateDmxRigsConfig}) and aligns their light
   * snapshots to the MyLights templates ({@link syncRigsConfigWithUserLights}). Runs at load and on
   * every rig or template write, so reads return the stored rigs as they are.
   */
  private reconcileRigs(config: DmxRigsConfig): { config: DmxRigsConfig; changed: boolean } {
    const migrated = migrateDmxRigsConfig(config)
    const synced = syncRigsConfigWithUserLights(migrated.config, this.getUserLights())
    return { config: synced.config, changed: migrated.changed || synced.changed }
  }

  private reconcileDmxRigsAtLoad(): void {
    const { config, changed } = this.reconcileRigs(this.dmxRigs.get())
    if (changed) {
      this.dmxRigs.applyLoadMigration(config)
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
    await this.preferences.mutate((current) => ({ ...current, [key]: value }))
  }

  /**
   * Gets all preferences
   */
  getAllPreferences(): AppPreferences {
    return this.preferences.get()
  }

  /**
   * Updates multiple preferences at once. A nested settings object merges into the stored one, so
   * the fields a partial object leaves out keep their stored values.
   */
  async updatePreferences(updates: Partial<AppPreferences>): Promise<void> {
    await this.preferences.mutate((currentPrefs) => {
      const merged: Record<string, unknown> = { ...currentPrefs }
      for (const [key, value] of Object.entries(updates)) {
        const stored = merged[key]
        merged[key] =
          isPlainObject(value) && isPlainObject(stored) ? { ...stored, ...value } : value
      }
      if (updates.audioConfig && isPlainObject(merged.audioConfig)) {
        // Whether audio runs is session state and is never stored.
        const { enabled: _enabled, ...audioConfig } = merged.audioConfig
        merged.audioConfig = audioConfig
      }
      let newPrefs = merged as unknown as AppPreferences
      if (updates.cueDomains) {
        newPrefs = {
          ...newPrefs,
          cueDomains: mergePartialCueDomains(
            currentPrefs.cueDomains,
            updates.cueDomains as Partial<Record<CueDomain, Partial<CueDomainPrefs>>>,
          ),
        }
      }
      return newPrefs
    })
  }

  /**
   * Patch a single `cueDomains` entry. Not a simple `updatePreferences` partial merge: when
   * `disabledCues` is present, it replaces the stored per-group map for that domain (important for IPC).
   */
  async updateCueDomain(domain: CueDomain, patch: Partial<CueDomainPrefs>): Promise<void> {
    await this.preferences.mutate((current) => {
      const base = current.cueDomains[domain]
      const next: CueDomainPrefs = { ...base, ...patch }
      if (Object.prototype.hasOwnProperty.call(patch, 'disabledCues') && patch.disabledCues) {
        next.disabledCues = { ...patch.disabledCues }
      }
      return { ...current, cueDomains: { ...current.cueDomains, [domain]: next } }
    })
  }

  /**
   * YARG *lighting* mode: coerces invalid stored values; use instead of reading `cueDomains` raw.
   */
  getCueGroupSelectionMode(): 'oncePerSong' | 'withinSong' {
    const m = this.preferences.get().cueDomains.yarg.selectionMode
    if (m === 'oncePerSong' || m === 'withinSong') {
      return m
    }
    return 'withinSong'
  }

  /**
   * RB3 *lighting* mode: coerces invalid stored values the same way the YARG getter does. RB3 has
   * no `none` option, so anything unrecognised runs `withinSong`.
   */
  getRb3CueGroupSelectionMode(): 'oncePerSong' | 'withinSong' {
    return this.preferences.get().cueDomains.rb3.selectionMode === 'oncePerSong'
      ? 'oncePerSong'
      : 'withinSong'
  }

  /**
   * The motion selection mode stored for one domain, held to the three a motion domain can take.
   *
   * The schema allows a fourth mode that only means something for lighting, so a stored value has
   * to be narrowed here rather than read straight through, or it reaches the renderer outside the
   * union its channel declares.
   */
  private motionSelectionModeFor(
    domain: 'yargMotion' | 'audioMotion' | 'rb3Motion',
  ): 'oncePerSong' | 'perCueChange' | 'none' {
    const m = this.preferences.get().cueDomains?.[domain]?.selectionMode
    if (m === 'oncePerSong' || m === 'perCueChange' || m === 'none') {
      return m
    }
    return 'perCueChange'
  }

  getMotionGroupSelectionMode(): 'oncePerSong' | 'perCueChange' | 'none' {
    return this.motionSelectionModeFor('yargMotion')
  }

  getRb3MotionGroupSelectionMode(): 'oncePerSong' | 'perCueChange' | 'none' {
    return this.motionSelectionModeFor('rb3Motion')
  }

  getAudioMotionGroupSelectionMode(): 'oncePerSong' | 'perCueChange' | 'none' {
    return this.motionSelectionModeFor('audioMotion')
  }

  /**
   * Shared min-hold (ms) for YARG and audio motion; updates both motion domains in one write.
   */
  async setMotionCueMinimumHoldMs(ms: number): Promise<void> {
    const clamped = Math.max(0, Math.min(600000, Math.round(ms)))
    // Read and write in the one turn, so a write that lands in between is not overwritten with the
    // whole cueDomains object as it was before that write.
    await this.preferences.mutate((current) => ({
      ...current,
      cueDomains: {
        ...current.cueDomains,
        yargMotion: { ...current.cueDomains.yargMotion, minimumHoldMs: clamped },
        audioMotion: { ...current.cueDomains.audioMotion, minimumHoldMs: clamped },
      },
    }))
  }

  /**
   * Fallback cue time (ms): how long with no new YARG lighting cue before the auto Fallback cue
   * fires while a song plays. Clamps to 0–600000; 0 disables the feature.
   */
  async setYargFallbackCueTimeMs(ms: number): Promise<void> {
    const clamped = Math.max(0, Math.min(600000, Math.round(ms)))
    await this.setPreference('yargFallbackCueTimeMs', clamped)
  }

  async setMotionCueProbabilityPercent(percent: number): Promise<void> {
    const clamped = Math.max(0, Math.min(100, Math.round(percent)))
    await this.updateCueDomain('yargMotion', { probabilityPercent: clamped })
  }

  async setAudioMotionCueProbabilityPercent(percent: number): Promise<void> {
    const clamped = Math.max(0, Math.min(100, Math.round(percent)))
    await this.updateCueDomain('audioMotion', { probabilityPercent: clamped })
  }

  /** Clamps to 1–100 ms. */
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
   * Saves the fixture templates and realigns every rig to them. A rig write that fails puts the
   * previous templates back, so a failed save leaves both files as they were. Returns true when at
   * least one rig changed.
   */
  async saveUserLights(lights: DmxFixture[]): Promise<boolean> {
    const previous = this.userLights.get()
    await this.userLights.update({ lights })
    try {
      return await this.syncRigsWithUserLights()
    } catch (error) {
      await this.userLights
        .update(previous)
        .catch((restoreError) =>
          log.error(
            '[Photonics Config] Could not put the previous fixture templates back:',
            restoreError,
          ),
        )
      throw error
    }
  }

  /**
   * Changes one fixture template, starting from the stored one, and realigns the rigs to it. Writes
   * no template when it is gone by the time the change runs.
   */
  async updateUserLight(
    fixtureId: string,
    change: (fixture: DmxFixture) => DmxFixture,
  ): Promise<void> {
    await this.userLights.mutate((current) => {
      const index = current.lights.findIndex((f) => f.id === fixtureId)
      if (index < 0) {
        return current
      }
      const lights = [...current.lights]
      lights[index] = change(lights[index])
      return { ...current, lights }
    })
    await this.syncRigsWithUserLights()
  }

  /**
   * Resets user's lights to default values (empty)
   */
  async resetUserLightsToDefaults(): Promise<void> {
    await this.saveUserLights(DEFAULT_USER_LIGHTS.lights)
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
    await this.lightingLayout.mutate((current) => ({ ...current, [key]: value }))
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
    const merged = { ...DEFAULT_AUDIO_CONFIG, ...savedConfig }
    const idleDetection = {
      ...DEFAULT_AUDIO_CONFIG.idleDetection,
      ...(savedConfig?.idleDetection ?? {}),
    }
    return { ...merged, idleDetection, enabled: false }
  }

  /**
   * Updates audio configuration (partial update)
   * Note: The 'enabled' field is never persisted (runtime-only state)
   */
  async updateAudioConfig(updates: Partial<AudioConfig>): Promise<void> {
    await this.preferences.mutate((current) => {
      const { enabled: _enabled, ...configToSave } = { ...current.audioConfig, ...updates }
      return { ...current, audioConfig: configToSave }
    })
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
    await this.preferences.mutate((current) => {
      const stored = current.audioGameMode
      const base = stored ? { ...DEFAULT_AUDIO_GAME_MODE, ...stored } : DEFAULT_AUDIO_GAME_MODE
      return { ...current, audioGameMode: { ...base, ...updates } }
    })
  }

  // DMX Rigs Methods

  /** Gets all DMX rigs, migrated and aligned to their templates at load and on every write. */
  getDmxRigs(): DmxRig[] {
    return this.dmxRigs.get().rigs
  }

  /**
   * Realigns all rigs to the current MyLights library and persists if anything changed. Returns
   * true when at least one rig was updated. {@link saveUserLights} runs it after the templates are
   * written, so template edits reach rig snapshots without waiting for the next process restart.
   */
  async syncRigsWithUserLights(): Promise<boolean> {
    const { changed } = syncRigsConfigWithUserLights(this.dmxRigs.get(), this.getUserLights())
    if (!changed) {
      return false
    }
    await this.dmxRigs.mutate(
      (latest) => syncRigsConfigWithUserLights(latest, this.getUserLights()).config,
    )
    return true
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
  /**
   * @param opts.deactivateOthers Clear `active` on every other rig when the saved one is active,
   *   enforcing the single-active-rig invariant in the same write. Callers that are editing an
   *   already-selected rig (console-mode channel and fixture edits) leave this off, so a routine
   *   edit never changes which rigs are active as a side effect.
   */
  async saveDmxRig(rig: DmxRig, opts: { deactivateOthers?: boolean } = {}): Promise<void> {
    const exclusive = opts.deactivateOthers === true && rig.active === true
    await this.dmxRigs.mutate((current) => {
      const rigs = current.rigs.map((r) =>
        exclusive && r.id !== rig.id && r.active ? { ...r, active: false } : r,
      )
      const existingIndex = rigs.findIndex((r) => r.id === rig.id)

      if (existingIndex >= 0) {
        rigs[existingIndex] = rig
      } else {
        rigs.push(rig)
      }

      return this.reconcileRigs({ ...current, rigs }).config
    })
  }

  /**
   * Deletes a DMX rig by ID
   */
  async deleteDmxRig(id: string): Promise<void> {
    await this.dmxRigs.mutate((current) => ({
      ...current,
      rigs: current.rigs.filter((rig) => rig.id !== id),
    }))
  }

  /**
   * Gets only active DMX rigs (where active === true)
   */
  getActiveRigs(): DmxRig[] {
    return this.getDmxRigs().filter((rig) => rig.active === true)
  }
}
