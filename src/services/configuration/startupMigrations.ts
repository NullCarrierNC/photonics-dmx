/**
 * One-time migrations that run once each config file is open, before anything reads them.
 *
 * These are shape migrations that `ConfigFile.applyMigration` cannot do on its own, either because
 * they span two files or because they need data the envelope migration has no access to. Each takes
 * the files it touches rather than the whole manager.
 */
import type { ConfigFile } from './ConfigFile'
import type { PreferencesConfigFile } from './PreferencesConfigFile'
import type { AppPreferences } from './configurationDefaults'
import {
  applyLegacySenderFlatToNested,
  hasStraySenderFlatKeys,
  LEGACY_FLAT_SENDER_PREF_KEYS,
} from './preferencesMigration'
import {
  migrateLightingConfiguration,
  migrateUserLightsSchema,
} from '../../photonics-dmx/helpers/lightingConfigMigration'
import {
  ConfigStrobeType,
  type DmxFixture,
  type DmxRig,
  type DmxRigsConfig,
  type LightingConfiguration,
} from '../../photonics-dmx/types'
import { createLogger } from '../../shared/logger'

const log = createLogger('ConfigurationManager')

/** The user-defined fixture library, as persisted. */
export interface UserLightsConfig {
  lights: DmxFixture[]
}

/**
 * Migrates legacy lights format (array) to new format ({lights: [...]})
 */
export function migrateLegacyLightsFormat(userLights: ConfigFile<UserLightsConfig>): void {
  const currentData = userLights.get()

  // If already in new format, do nothing
  if (currentData && Array.isArray(currentData.lights)) {
    return
  }

  // If legacy format (just an array), migrate
  if (Array.isArray(currentData)) {
    const migratedData: UserLightsConfig = { lights: currentData }
    userLights.applyLoadMigration(migratedData)
    log.info(`[Photonics Config] Migrated legacy lights format to new format`)
  }
}

/**
 * One-time fixture-shape migrations for the user-defined fixture library (`MyLights`): the
 * strobe-channel schema (legacy `rgb/s`/`rgbw/s` onto `channels.strobeChannel` + `strobeValues`,
 * stray `channels.strobeSpeed` renamed) and the RGBW collapse (`rgbw`/`rgbw/mh` onto `rgb`/`rgb/mh`
 * with the white channel re-expressed as an extra channel).
 */
export function migrateUserLightsFixtureSchema(userLights: ConfigFile<UserLightsConfig>): void {
  const current = userLights.get()
  if (!current || !Array.isArray(current.lights)) {
    return
  }
  const { lights, changed } = migrateUserLightsSchema(current.lights)
  if (!changed) {
    return
  }
  userLights.applyLoadMigration({ ...current, lights })
  log.info('[Photonics Config] Migrated user lights to the current fixture schema')
}

/**
 * Same fixture-shape migrations for the standalone lighting layout. It is still served to the
 * renderer and seeds the default rig on first run, so it must not keep serving fixture types the
 * rest of the app no longer knows. The legacy `front-back` rename is deliberately skipped: that
 * was the rigs' v1 migration, and a layout naming `front-back` today means the current semantic.
 */
export function migrateLightingLayoutFixtureSchema(
  lightingLayout: ConfigFile<LightingConfiguration>,
): void {
  const current = lightingLayout.get()
  if (!current) {
    return
  }
  const { config, changed } = migrateLightingConfiguration(current, { skipLegacyRename: true })
  if (!changed) {
    return
  }
  lightingLayout.applyLoadMigration(config)
  log.info('[Photonics Config] Migrated lighting layout to the current fixture schema')
}

/**
 * v4+ prefs already nest USB sender config. If `enttecProPort` / `openDmxPort` / `openDmxSpeed`
 * appear (e.g. manual file edit or pre-v4 stragglers), fold them into `enttecProConfig` and
 * `openDmxConfig` and persist. Normal migration runs in PreferencesConfigFile v3→v4.
 */
export function normalizeStraySenderFlatKeys(preferences: PreferencesConfigFile): void {
  const full = { ...preferences.get() } as unknown as Record<string, unknown>
  if (!hasStraySenderFlatKeys(full)) {
    return
  }

  const base = { ...preferences.get() } as AppPreferences
  for (const k of LEGACY_FLAT_SENDER_PREF_KEYS) {
    delete (base as unknown as Record<string, unknown>)[k]
  }
  const next = applyLegacySenderFlatToNested(full, base)
  preferences.applyLoadMigration(next)
}

/**
 * Migrates existing lighting layout to a default DMX rig
 */
export function migrateToDmxRigs(
  lightingLayout: ConfigFile<LightingConfiguration>,
  dmxRigs: ConfigFile<DmxRigsConfig>,
): void {
  const currentRigs = dmxRigs.get()
  const rigs = Array.isArray(currentRigs?.rigs) ? currentRigs.rigs : []

  // If rigs already exist, no migration needed
  if (rigs.length > 0) {
    return
  }

  // Check if we have an existing layout to migrate
  const existingLayout = lightingLayout.get() ?? ({} as LightingConfiguration)
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

    dmxRigs.applyLoadMigration({ ...currentRigs, rigs: [defaultRig] })
    log.info('[Photonics Config] Migrated existing layout to default DMX rig')
  }
}

/** Every config file the startup migrations touch. */
export interface MigratableConfigFiles {
  preferences: PreferencesConfigFile
  userLights: ConfigFile<UserLightsConfig>
  lightingLayout: ConfigFile<LightingConfiguration>
  dmxRigs: ConfigFile<DmxRigsConfig>
}

/**
 * Runs every startup migration in order. The legacy lights format has to be resolved before the
 * fixture-schema pass reads `lights`, and the rig migration reads the layout after its own
 * fixture-schema pass has run.
 */
export function runStartupMigrations(files: MigratableConfigFiles): void {
  migrateLegacyLightsFormat(files.userLights)
  migrateUserLightsFixtureSchema(files.userLights)
  migrateLightingLayoutFixtureSchema(files.lightingLayout)
  normalizeStraySenderFlatKeys(files.preferences)
  migrateToDmxRigs(files.lightingLayout, files.dmxRigs)
}
