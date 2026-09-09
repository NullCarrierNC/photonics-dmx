# Node-Based Cue Editor

Visual flow editor for creating cues and reusable effects. Built on ReactFlow. Cues and effects are
stored as JSON files and executed by the node cue runtime in `src/photonics-dmx/cues/node/`.

## What the editor authors

Three things vary independently:

| Axis          | Values                 | Notes                                                            |
| ------------- | ---------------------- | ---------------------------------------------------------------- |
| Platform      | `yarg`, `rb3`, `audio` | Chosen from the toolbar segment                                  |
| Kind          | `lighting`, `motion`   | Motion programs drive pan and tilt. Hidden while editing effects |
| Document type | Cues, Effects          | Effects are reusable graphs a cue's action can reference         |

Effects exist for `yarg` and `audio` only. RB3 cues reference the YARG effect tree, so switching to
Effects from RB3 lands on YARG effects. `EditorModeKey` in `hooks/useLastCueFilePath.ts` enumerates
the eight resulting contexts, and the editor reopens the last file per context.

## Structure

```
cue-editor/
├── components/           # ReactFlow nodes, node editors, sidebars, modals
│   ├── flow/             # ReactFlow node components (EventNode, ActionNode, LogicNode, etc.)
│   ├── node-editors/     # Sidebar editors for each node type
│   │   ├── action-editors/
│   │   └── logic/
│   ├── variable-registry/
│   └── shared/
├── hooks/                # Core editor logic
├── lib/                  # Transforms, defaults, node factories, validation, layout
└── context/              # ActiveNodes, ErrorNodes and WarningNodes contexts
```

## Key Hooks

| Hook                     | Role                                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------------------------- |
| `useCueFlow`             | Orchestrates flow state (nodes, edges), integrates useFlowSync, useNodeSelection, useNodeCreation     |
| `useFlowSync`            | Syncs document to ReactFlow: load cue into canvas, build document from flow                           |
| `useCueFileIO`           | File operations: select, save, create, delete; integrates with IPC                                    |
| `useCueCrud`             | Cue CRUD within a file: add/remove/rename cues                                                        |
| `useCueMetadata`         | Group/cue metadata (name, description, variables, events)                                             |
| `useCueFiles`            | File list, grouping, platform, cue kind, effect files, registry data                                  |
| `useCueEditorNavigation` | Moves between platform, kind and document type, confirming before leaving unsaved work                |
| `useNodeSelection`       | Selection state, node creation at position                                                            |
| `useNodeCreation`        | Add event, action, logic, event raiser, effect raiser/listener and notes nodes                        |
| `useEdgeManagement`      | Edge add/remove, validation                                                                           |
| `useActiveNodes`         | Resolve active (selected) nodes for sidebar, and highlight nodes the runtime is executing             |
| `useErrorNodes`          | Flags nodes the runtime reported an error on, clearing them after a few seconds                       |
| `useLevelModeWarnings`   | Warns about nodes that need a stepped path and go inert under an audio level-mode or "during" context |
| `useCueJsonEditor`       | Raw JSON editing of the current document, applied back to the flow                                    |
| `useCueRegistryPanel`    | Variable, event and effect registry panel state                                                       |
| `useEffectDefinitions`   | Loads effect files so raiser and listener nodes can offer effect names                                |
| `useLastCueFilePath`     | Remembers the last file per editor context                                                            |

## IPC Channels

The editor communicates with the main process via:

- **NODE_CUES** - Cue files: list, read, save, delete, validate, import/export
- **EFFECTS** - Effect files: list, read, save, delete, validate, import/export
- **SHELL** - Open folder, show file in folder (for "Open File Location")

It also subscribes to main to renderer push channels for live feedback:

- **`RENDERER_RECEIVE.NODE_EXECUTION`** - Node activation/deactivation events emitted by the runtime engines; consumed by `useActiveNodes` to highlight currently-running nodes in the canvas.
- **`RENDERER_RECEIVE.NODE_CUE_RUNTIME_ERROR`** - Per-node runtime errors emitted by the runtime engines (`NodeExecutionEngine` / `EffectExecutionEngine`, both via their shared `BaseNodeExecutionEngine`, plus `BaseAudioNodeCue`) and surfaced in `DebugPanel`; consumed by `useErrorNodes` to flag failing nodes.
- **`RENDERER_RECEIVE.DEBUG_LOG`** - Values tapped by a `debugger` logic node, shown in `DebugPanel`.
- **`RENDERER_RECEIVE.NODE_CUES_CHANGED`** and **`EFFECTS_CHANGED`** - The loader's file watcher, so the file list follows edits made outside the editor.

See `src/shared/ipcChannels.ts` for channel constants and `src/shared/ipcTypes.ts` for the payload types.

Read/delete/save paths are resolved on the main process against the loader-owned cue and effect roots so arbitrary
filesystem paths from the renderer cannot escape those directories.

## Node Types

- **Event** - Cue triggers for the current platform: YARG and RB3 cue types, audio events, and audio triggers with their own spectral gates
- **EventListener** - Listens for events from Event Raiser nodes
- **Action** - Light effects (colour, target groups, timing)
- **Logic** - Around thirty types: variables, math, expressions, conditionals, loops, timing gates, and light and colour array operations. Defaults come from `lib/logicNodeFactories.ts`
- **Event Raiser** - Emits events to other cues
- **Effect Raiser** - Emits effect names for other cues to listen to
- **Effect Listener** - Listens for effect names (effect mode only)
- **Notes** - Documentation node (no runtime behavior)

## Related

- Runtime/compiler: `src/photonics-dmx/cues/node/`
- Cue Editor page: `src/renderer/src/pages/CueEditor.tsx`
- The cue editor window opens from the left navigation in Advanced Mode, or the Open Cue Editor button, both via IPC `WINDOW.OPEN_CUE_EDITOR`
