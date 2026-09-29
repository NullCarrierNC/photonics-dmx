import { ConfigFile, type ConfigFileHooks } from './ConfigFile'
import type { AppPreferences } from './configurationDefaults'
import { DEFAULT_PREFERENCES } from './configurationDefaults'
import {
  migratePrefsV3ToV4,
  migratePrefsV4ToV5,
  migratePrefsV5ToV6,
  migratePrefsV6ToV7,
} from './preferencesMigration'
import {
  healStoredAudioIdleLook,
  healStoredClockRate,
  healStoredSenderConfigs,
  repairCueDomains,
  seedMissingRequiredPrefs,
} from './preferencesLoadRepair'
import { validateAppPreferencesData } from './configDataValidators'
import { repairInvalidPreferenceFields } from './preferencesFieldRepair'

/**
 * App preferences (prefs.json) with v3 → v4 migration into `cueDomains`, a one-time v4 → v5 refresh
 * of the settings whose shipped defaults changed, a v5 → v6 seeding of the `rb3` / `rb3Motion` cue
 * domains for files that predate them, and a one-time v6 → v7 move onto RB3 cue mode. On every
 * load, top-level keys the schema requires are seeded from the defaults and every cue domain is
 * completed, so a file short of one of them keeps the rest of its settings instead of being moved
 * aside. Stored values a driver or the engine cannot use, a sender configuration, the clock rate
 * or an audio idle look, come back into range in the same pass. Last, any value the schema still
 * rejects goes back to its default, and the file is moved aside only when that is not enough.
 */
export class PreferencesConfigFile extends ConfigFile<AppPreferences> {
  constructor(hooks: ConfigFileHooks<AppPreferences> = {}) {
    super('prefs.json', DEFAULT_PREFERENCES, 7, {
      validate: validateAppPreferencesData,
      normalizeLoaded: (data, reportRepair) =>
        repairInvalidPreferenceFields(
          healStoredAudioIdleLook(
            healStoredClockRate(
              healStoredSenderConfigs(repairCueDomains(seedMissingRequiredPrefs(data))),
            ),
            reportRepair,
          ),
          reportRepair,
        ),
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
    if (fromVersion === 6 && toVersion === 7) {
      return migratePrefsV6ToV7(data)
    }
    return data
  }
}
