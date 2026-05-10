# Services

Shared services used across main and (where applicable) renderer. Currently focused on configuration.

## configuration/

| File                    | Role                                                                                                                                                                                                                                          |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ConfigurationManager`  | Manages `AppPreferences` (including per-domain cue preferences), user lights, lighting layout, DMX rigs, audio config. Loads/saves via `ConfigFile` / preferences helpers. Migration support for config schema changes and DMX rig evolution. |
| `ConfigFile`            | Async atomic JSON file I/O (write-temp-then-rename). Versioned persistence with migration; surfaces corrupt-file recovery events for the renderer.                                                                                            |
| `PreferencesConfigFile` | Typed preferences persistence layered on `ConfigFile` where the app splits prefs from other JSON documents.                                                                                                                                   |

### Config Files

Stored in `{appData}/Photonics.rocks/`:

| File                | Content                                   |
| ------------------- | ----------------------------------------- |
| `prefs.json`        | AppPreferences                            |
| `lights.json`       | User light definitions (fixtures, groups) |
| `lightsLayout.json` | Physical layout order of lights           |
| `dmxRigs.json`      | DMX rig definitions (universes, fixtures) |

## Related

- Main process uses ConfigurationManager via ControllerManager
- IPC config handlers: `src/main/ipc/config-handlers.ts` and `src/main/ipc/config/*`
- Cue-domain preferences (`cueDomains` in prefs) drive enabled groups, disabled cues, selection modes, and motion/audio cross-cutting state documented in `cueDomainTypes.ts`
