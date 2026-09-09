# Electron Main Process

Entry point and orchestration for the Photonics DMX desktop app. Runs in the Node.js main process.

## Entry

- `index.ts` - App entry, global error handling, lifecycle (SIGINT/SIGTERM)
- `application.ts` - `Application` class: wires WindowManager + ControllerManager, sets up IPC and menu
- `menu.ts` - `setupMenu()` builds the application menu
- `rendererSessionSecurity.ts` - Content security policy and navigation deny for renderer sessions
- `logging/fileLogSink.ts` - Daily log files under `{appData}/Photonics.rocks/logs`, with pruning

## Key Components

| Component           | Role                                                                                                        |
| ------------------- | ----------------------------------------------------------------------------------------------------------- |
| `Application`       | Creates WindowManager and ControllerManager; initializes on `app.whenReady()`                               |
| `WindowManager`     | Main window, cue editor window, and audio preview window; state persistence; create/destroy                 |
| `ControllerManager` | Facade over the controller object graph and its lifecycle; the surface IPC handlers and the Application use |

## Controllers

`ControllerManager` is the entry point. The object graph, the lifecycle phases, and the build,
restart and teardown routines each live in their own module.

| Controller                    | Role                                                                                                                                              |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ControllerManager`           | Facade: exposes the graph's objects, serializes lifecycle operations, and holds the restart listeners                                             |
| `ControllerGraph`             | Owns the built objects: per-rig `RigChain[]`, `ChainFanout`, shared `Clock`, `DmxPublisher`, per-domain cue handlers, NodeCueLoader, EffectLoader |
| `ControllerLifecycle`         | Lifecycle phase state machine and the operation queue; raises `LifecycleAbortedError`                                                             |
| `controllerWiring.ts`         | `buildControllerCollaborators` constructs the collaborators the graph and controllers share                                                       |
| `controllerRestart.ts`        | `runControllerRestart` rebuilds the graph and restores listeners and senders                                                                      |
| `controllerShutdown.ts`       | `runControllerShutdown` tears the graph down on app exit                                                                                          |
| `ListenerCoordinator`         | YARG and RB3 listener, cue handler and processor coordination; `decorateCueRuntime` wraps a domain's runtime                                      |
| `ListenerLifecycleController` | Composes `ListenerCoordinator` and `AudioController`                                                                                              |
| `SenderLifecycleController`   | SenderManager wiring, persisted output restore after restarts, sender errors                                                                      |
| `RegistryInitializer`         | Cue/effect loader startup, registry hydration, validation error fan-out                                                                           |
| `ConsoleModeController`       | Exclusive DMX console buffer mode and console channel updates                                                                                     |
| `AudioController`             | Receives renderer audio frames on `RENDERER_SEND.AUDIO_DATA` and validates them; pushes audio enable/disable, config and strobe state out         |
| `MotionCueSimulator`          | Motion cue state for Cue Simulation, reset when the graph rebuilds                                                                                |
| `TestEffectRunner`            | Interval-driven cue firing for Cue Simulation, one per net domain via `getTestEffectRunner(domain)`                                               |
| `cueRuntimeDomains.ts`        | Per-domain wiring rows: which registry, handler and motion preferences each net cue mode uses                                                     |
| `cueDomainBindings.ts`        | Applies cue-domain preferences to the registries: enabled groups, disabled cues, consistency window                                               |
| `cueGroupReconcile.ts`        | Reconciles persisted group ids against the groups a registry actually holds                                                                       |
| `senderErrorHandler`          | Logs a sender error, auto-disables the sender, and notifies the renderer                                                                          |

Audio capture itself runs in the renderer. `AudioController` consumes the frames it sends and
mirrors them to the audio preview window through `WindowManager.broadcastAudioMirror`.

`RigChain.ts` and `ChainFanout.ts` here re-export the classes from
`src/photonics-dmx/controllers/`.

## IPC Handlers

Handlers are registered in `ipc/index.ts`. Domain split:

| Handler              | Channels        | Purpose                                                                                                                              |
| -------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `config-handlers`    | CONFIG, RIGS    | Composes `ipc/config/*`: lights and rigs (including rig import/export), preferences and diagnostics, cue selection, audio and motion |
| `light-handlers`     | LIGHT           | Composes `sender-handlers`, `simulation-handlers`, `cue-group-handlers`, `cue-selection-prefs-handlers`, `motion-group-handlers`     |
| `console-handlers`   | LIGHT (console) | Console-mode toggles and channel updates; registered separately in `ipc/index.ts`                                                    |
| `cue-handlers`       | CUE             | Per-domain listener toggles, RB3E mode and stats, cue style, listen-cue-data                                                         |
| `node-cue-handlers`  | NODE_CUES       | Node cue CRUD, import/export, validate, list, reload, cue types, debug toggle                                                        |
| `effect-handlers`    | EFFECTS         | Effect CRUD, import/export, validate                                                                                                 |
| `shell-handlers`     | SHELL           | Open folder, open path                                                                                                               |
| `window-handlers`    | WINDOW          | Open cue editor and audio preview windows                                                                                            |
| `lifecycle-handlers` | LIFECYCLE       | Lifecycle phase (get + push) and retrying initialization after a failed startup                                                      |

Simulation handlers cover the beat, keyframe, measure, instrument note and post-processing events
Cue Simulation drives, alongside the test effect runners.

Channels are defined in `src/shared/ipcChannels.ts`. Payload types come from the
`src/shared/ipcTypes.ts` barrel over `src/shared/ipc/*.ts`.

Renderer input is validated before use: `inputValidation.ts` is a barrel over `ipc/validation/*`
(primitives, preferences, cues, audio, fixtures, paths, senders). `ipcResult.ts` holds the
success/error result shape, `mockCueData.ts` builds the cue data Cue Simulation sends.

## Utilities

- `senderErrorTracking.ts` - Debounce/dedup for sender errors; clears on sender re-enable
- `utils/windowUtils.ts` - `sendToAllWindows` for main to renderer broadcasts, plus
  `mainRuntimeBroadcaster` and `hasBrowserWindows`
- `utils/copyDefaultData.ts` - Copies the bundled default cues and effects into the app data folder

## Tests

`tests/` covers the controllers, the IPC handlers, and the tooling (including the size budget the
`metrics/` files record).

## Related

- Preload: `src/preload/`
- Renderer: `src/renderer/`
- Core engine: `src/photonics-dmx/`
- Config: `src/services/configuration/`
