import { ConfigFile } from './ConfigFile'
import type { AppPreferences } from './configurationDefaults'
import { DEFAULT_PREFERENCES } from './configurationDefaults'
import { migratePrefsV3ToV4 } from './preferencesMigration'

/**
 * App preferences (prefs.json) with v3 → v4 migration into `cueDomains`.
 */
export class PreferencesConfigFile extends ConfigFile<AppPreferences> {
  constructor() {
    super('prefs.json', DEFAULT_PREFERENCES, 4)
  }

  protected override applyMigration(
    data: AppPreferences,
    fromVersion: number,
    toVersion: number,
  ): AppPreferences {
    if (fromVersion === 3 && toVersion === 4) {
      return migratePrefsV3ToV4(data as unknown, DEFAULT_PREFERENCES)
    }
    return data
  }
}
