# Electron Main Process

Entry point and orchestration for the Photonics DMX desktop app. Runs in the Node.js main process.

## Entry

- `index.ts` – App entry, global error handling, lifecycle (SIGINT/SIGTERM)
- `application.ts` – `Application` class: wires WindowManager + ControllerManager, sets up IPC and menu

## Key Components

| Component           | Role                                                                                                                                      |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `Application`       | Creates WindowManager and ControllerManager; initializes on `app.whenReady()`                                                             |
| `WindowManager`     | Main window, cue editor window, and audio preview window; state persistence; create/destroy                                               |
| `ControllerManager` | Central wiring: ConfigurationManager, per-rig `RigChain`s + `ChainFanout`, SenderManager, listener/sender lifecycles, NodeCueLoader, EffectLoader, TestEffectRunner |

## Controllers

| Controller                    | Role                                                                                                                                   |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `ControllerManager`           | Holds per-rig `RigChain[]` and a `ChainFanout` that dispatches events to every chain (each chain owns its own Sequencer/LightTransitionController/LightStateManager; `rigChains[0]` is the primary chain, exposed via shorthand accessors), plus senders, listeners, NodeCueLoader, EffectLoader; coordinates init/shutdown, restart (serialized), and lifecycle phase |
| `ListenerLifecycleController` | YARG/RB3E/audio listener enable/disable and sub-lifecycle (including audio capture and mirror to renderer)                             |
| `SenderLifecycleController`   | SenderManager wiring, persisted output restore after restarts, sender errors                                                           |
| `RegistryInitializer`         | Cue/effect loader startup, registry hydration, validation error fan-out                                                                |
| `ConsoleModeController`       | Exclusive DMX console buffer mode and console channel updates                                                                          |
| `AudioController`             | Audio capture lifecycle (FFT data to renderer); validates renderer audio mirror payloads before processing                             |
| `TestEffectRunner`            | Simulates beat/keyframe/measure events for Cue Simulation                                                                              |
| `senderErrorHandler`          | Unified sender error handling, debounce/dedup                                                                                          |

## IPC Handlers

Handlers are registered in `ipc/index.ts`. Domain split:

| Handler              | Channels        | Purpose                                                                                                                        |
| -------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `config-handlers`    | CONFIG          | Prefs, rigs, lights, layout, audio config                                                                                      |
| `light-handlers`     | LIGHT           | Composes the smaller sender, simulation, cue-group, cue-selection, and motion-group surfaces (not one monolithic LIGHT module) |
| `console-handlers`   | LIGHT (console) | Console-mode toggles and channel updates; registered separately in `ipc/index.ts`                                              |
| `cue-handlers`       | CUE             | Cue style, debounce, listener toggles                                                                                          |
| `node-cue-handlers`  | NODE_CUES       | Node cue CRUD, import/export, validate                                                                                         |
| `effect-handlers`    | EFFECTS         | Effect CRUD, import/export, validate                                                                                           |
| `shell-handlers`     | SHELL           | Open folder, open path                                                                                                         |
| `window-handlers`    | WINDOW          | Open cue editor and audio preview windows                                                                                      |
| `lifecycle-handlers` | LIFECYCLE       | Expose `ControllerManager` lifecycle phase to the renderer (get + push)                                                        |

Channels are defined in `src/shared/ipcChannels.ts`.

## Utilities

- `senderErrorTracking.ts` – Debounce/dedup for sender errors; clears on sender re-enable
- `utils/windowUtils.ts` – `sendToAllWindows` for main → renderer broadcasts

## Related

- Preload: `src/preload/`
- Renderer: `src/renderer/`
- Core engine: `src/photonics-dmx/`
- Config: `src/services/configuration/`
