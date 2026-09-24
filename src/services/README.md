# Services

Shared services used across main and (where applicable) renderer. Currently focused on configuration.

## configuration/

| File                    | Role                                                                                                                                                                             |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ConfigurationManager`  | Manages `AppPreferences` (including per-domain cue preferences), user lights, lighting layout, DMX rigs, audio config. Runs the startup migrations on construction               |
| `ConfigFile`            | Async atomic JSON file I/O (write-temp-then-rename). Versioned persistence with migration, plus `validate`, `coerceUnversioned`, `normalizeLoaded` and `onCorruptRecovery` hooks |
| `configFileEnvelope`    | The `{ version, data }` wrapper a file is saved in, how a stored one is read, and the stepwise migration walk                                                                    |
| `configFileRename`      | The renames `ConfigFile` saves and moves files aside with, retried through transient file locks                                                                                  |
| `PreferencesConfigFile` | Typed preferences persistence layered on `ConfigFile`. Carries the prefs version and its migration chain, and seeds cue domains missing from an older file                       |
| `configurationDefaults` | The `AppPreferences` shape, `DEFAULT_PREFERENCES`, and the value normalizers preferences are read through                                                                        |
| `startupMigrations`     | One-time migrations that span several config files: legacy lights format, fixture schema, stray sender keys, and the move to DMX rigs                                            |
| `preferencesMigration`  | The versioned `prefs.json` migrations and the cue-domain seeding `PreferencesConfigFile` calls                                                                                   |
| `configDataValidators`  | Schema validation for each document, run after every load and before every write                                                                                                 |
| `configCorruptTypes`    | Corrupt-file reasons, the report the renderer receives, and the backup file name                                                                                                 |
| `cueDomainTypes`        | The six cue domains (`yarg`, `audio`, `rb3` and a motion counterpart for each), their preference shape, and the defaults                                                         |

### Config Files

Stored in `{appData}/Photonics.rocks/`:

| File                | Content                                                                         |
| ------------------- | ------------------------------------------------------------------------------- |
| `prefs.json`        | AppPreferences, including audio configuration under `audioConfig`               |
| `lights.json`       | User light definitions (fixtures, groups)                                       |
| `lightsLayout.json` | Physical layout order of lights                                                 |
| `dmxRigs.json`      | DMX rig definitions (per-rig light layout, sender-output routing, mirror flags) |

A file that fails to read, parse or validate is preserved alongside the original as
`<name>.corrupt-<timestamp>.json` and the event is surfaced to the renderer. The same folder also
holds the `logs/` directory and the `node-data/` cue and effect trees seeded from the bundled
defaults.

## Related

- Main process uses ConfigurationManager via ControllerManager
- IPC config handlers: `src/main/ipc/config-handlers.ts` and `src/main/ipc/config/*`
- Cue-domain preferences (`cueDomains` in prefs) drive enabled groups, disabled cues, selection modes, and motion/audio cross-cutting state documented in `cueDomainTypes.ts`
