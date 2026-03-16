# Electron Main Process

Entry point and orchestration for the Photonics DMX desktop app. Runs in the Node.js main process.

## Entry

- `index.ts` – App entry, global error handling, lifecycle (SIGINT/SIGTERM)
- `application.ts` – `Application` class: wires WindowManager + ControllerManager, sets up IPC and menu

## Key Components


| Component           | Role                                                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `Application`       | Creates WindowManager and ControllerManager; initializes on `app.whenReady()`                                                         |
| `WindowManager`     | Main window + cue editor window; state persistence; create/destroy                                                                    |
| `ControllerManager` | Central wiring: ConfigurationManager, Sequencer, SenderManager, listeners (YARG, RB3E), NodeCueLoader, EffectLoader, TestEffectRunner |


## Controllers


| Controller            | Role                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------- |
| `ControllerManager`   | Holds Sequencer, senders, listeners, NodeCueLoader, EffectLoader; coordinates init/shutdown |
| `ListenerCoordinator` | YARG and RB3E listener enable/disable, mode switching                                       |
| `AudioController`     | Audio capture lifecycle (FFT data to renderer)                                              |
| `TestEffectRunner`    | Simulates beat/keyframe/measure events for Cue Simulation                                   |
| `senderErrorHandler`  | Unified sender error handling, debounce/dedup                                               |


## IPC Handlers

Handlers are registered in `ipc/index.ts`. Domain split:


| Handler             | Channels  | Purpose                                                           |
| ------------------- | --------- | ----------------------------------------------------------------- |
| `config-handlers`   | CONFIG    | Prefs, rigs, lights, layout, audio config                         |
| `light-handlers`    | LIGHT     | Composes sender-handlers, simulation-handlers, cue-group-handlers |
| `cue-handlers`      | CUE       | Cue style, debounce, listener toggles                             |
| `node-cue-handlers` | NODE_CUES | Node cue CRUD, import/export, validate                            |
| `effect-handlers`   | EFFECTS   | Effect CRUD, import/export, validate                              |
| `shell-handlers`    | SHELL     | Open folder, open path                                            |
| `window-handlers`   | WINDOW    | Open cue editor window                                            |


Channels are defined in `src/shared/ipcChannels.ts`.

## Utilities

- `senderErrorTracking.ts` – Debounce/dedup for sender errors; clears on sender re-enable
- `utils/windowUtils.ts` – `sendToAllWindows` for main → renderer broadcasts

## Related

- Preload: `src/preload/`
- Renderer: `src/renderer/`
- Core engine: `src/photonics-dmx/`
- Config: `src/services/configuration/`

