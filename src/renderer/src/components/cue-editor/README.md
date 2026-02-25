# Node-Based Cue Editor

Visual flow editor for creating YARG cues and reusable effects. Built on ReactFlow. Cues and effects are stored as JSON
files and executed by the node cue runtime in `src/photonics-dmx/cues/node/`.

## Modes

| Mode | Purpose |
|------|---------|
| `yarg` | YARG game cues – event-driven, triggered by in-game state changes |
| `audio` | Audio-reactive cues (early development; excluded from most documentation) |
| `cue` | Edit a cue within a cue file (one cue per file, or multiple cues per group) |
| `effect` | Edit a reusable effect definition (shared across cues) |

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
├── lib/                  # Transforms, defaults, utilities
└── context/              # ActiveNodesContext
```

## Key Hooks

| Hook | Role |
|------|------|
| `useCueFlow` | Orchestrates flow state (nodes, edges), integrates useFlowSync, useNodeSelection, useNodeCreation |
| `useFlowSync` | Syncs document ↔ ReactFlow: load cue into canvas, build document from flow |
| `useCueFileIO` | File operations: select, save, create, delete; integrates with IPC |
| `useCueCrud` | Cue CRUD within a file: add/remove/rename cues |
| `useCueMetadata` | Group/cue metadata (name, description, variables, events) |
| `useCueFiles` | File list, grouping, mode (yarg/audio), registry data |
| `useNodeSelection` | Selection state, node creation at position |
| `useNodeCreation` | Add event, action, logic, event raiser, effect raiser/listener nodes |
| `useActiveNodes` | Resolve active (selected) nodes for sidebar |
| `useEdgeManagement` | Edge add/remove, validation |

## IPC Channels

The editor communicates with the main process via:

- **NODE_CUES** – Cue files: list, read, save, delete, validate, import/export
- **EFFECTS** – Effect files: list, read, save, delete, validate, import/export
- **SHELL** – Open folder, show file in folder (for "Open File Location")

See `src/shared/ipcChannels.ts` for channel constants.

## Node Types

- **Event** – YARG cue triggers (e.g. menu, gameplay, cool_automatic)
- **EventListener** – Listens for events from Event Raiser nodes
- **Action** – Light effects (colour, target groups, timing)
- **Logic** – Variables, math, conditionals, loops, light selectors (even, odd, shuffle, etc.)
- **Event Raiser** – Emits events to other cues
- **Effect Raiser** – Emits effect names for other cues to listen to
- **Effect Listener** – Listens for effect names (effect mode only)
- **Notes** – Documentation node (no runtime behavior)

## Related

- Runtime/compiler: `src/photonics-dmx/cues/node/`
- Cue Editor page: `src/renderer/src/pages/CueEditor.tsx`
- Cue editor window is opened from the main app (Window → Cue Editor) or via IPC `WINDOW.OPEN_CUE_EDITOR`
