# Services

Shared services used across main and (where applicable) renderer. Currently focused on configuration.

## configuration/

| File | Role |
|------|------|
| `ConfigurationManager` | Manages `AppPreferences`, user lights, lighting layout, DMX rigs, audio config. Loads/saves via ConfigFile. Migration support for config schema changes. |
| `ConfigFile` | Async atomic JSON file I/O (write-temp-then-rename). Versioned persistence with migration. |

### Config Files

Stored in `{appData}/Photonics.rocks/`:

| File | Content |
|------|---------|
| `prefs.json` | AppPreferences (effect debounce, cue groups, sender config, brightness, etc.) |
| `lights.json` | User light definitions (fixtures, groups) |
| `lightsLayout.json` | Physical layout order of lights |
| `dmxRigs.json` | DMX rig definitions (universes, fixtures) |

## Related

- Main process uses ConfigurationManager via ControllerManager
- IPC config handlers: `src/main/ipc/config-handlers.ts`
