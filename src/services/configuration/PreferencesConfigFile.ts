import { ConfigFile, type ConfigFileHooks } from './ConfigFile'
import type { AppPreferences } from './configurationDefaults'
import { DEFAULT_PREFERENCES } from './configurationDefaults'
import {
  healStoredSenderConfigs,
  migratePrefsV3ToV4,
  migratePrefsV4ToV5,
  migratePrefsV5ToV6,
  repairCueDomains,
  seedMissingRequiredPrefs,
} from './preferencesMigration'
import { validateAppPreferencesData } from './configDataValidators'

/**
 * App preferences (prefs.json) with v3 → v4 migration into `cueDomains`, a one-time v4 → v5
 * refresh of the settings whose shipped defaults changed, and a v5 → v6 seeding of the `rb3` /
 * `rb3Motion` cue domains for files that predate them. On every load, top-level keys the schema
 * requires are seeded from the defaults and every cue domain is completed, so a file short of one
 * of them keeps the rest of its settings instead of being moved aside. Stored sender settings a
 * driver cannot use are brought back into range in the same pass.
 */
export class PreferencesConfigFile extends ConfigFile<AppPreferences> {
  constructor(hooks: ConfigFileHooks<AppPreferences> = {}) {
    super('prefs.json', DEFAULT_PREFERENCES, 6, {
      validate: validateAppPreferencesData,
      normalizeLoaded: (data) =>
        healStoredSenderConfigs(repairCueDomains(seedMissingRequiredPrefs(data))),
      ...hooks,
    })
  }

  protected override applyMigration(
    data: AppPreferences,
    fromVersion: number,
    toVersion: number,
  ): AppPreferences {
    if (fromVersion === 3 && toVersion === 4) {
      return migratePrefsV3ToV4(data as unknown, DEFAULT_PREFERENCES)
    }
    if (fromVersion === 4 && toVersion === 5) {
      return migratePrefsV4ToV5(data as unknown, DEFAULT_PREFERENCES)
    }
    if (fromVersion === 5 && toVersion === 6) {
      return migratePrefsV5ToV6(data as unknown, DEFAULT_PREFERENCES)
    }
    return data
  }
}
