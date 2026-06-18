import { ConfigFile, type ConfigFileHooks } from './ConfigFile'
import type { AppPreferences } from './configurationDefaults'
import { DEFAULT_PREFERENCES } from './configurationDefaults'
import { migratePrefsV3ToV4, migratePrefsV4ToV5 } from './preferencesMigration'
import { validateAppPreferencesData } from './configDataValidators'

/**
 * App preferences (prefs.json) with v3 → v4 migration into `cueDomains` and a one-time
 * v4 → v5 refresh of the settings whose shipped defaults changed.
 */
export class PreferencesConfigFile extends ConfigFile<AppPreferences> {
  constructor(hooks: ConfigFileHooks<AppPreferences> = {}) {
    super('prefs.json', DEFAULT_PREFERENCES, 5, { validate: validateAppPreferencesData, ...hooks })
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
    return data
  }
}
