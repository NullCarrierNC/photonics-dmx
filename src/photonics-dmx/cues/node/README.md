# Node-Based Cue System

JSON-defined node graphs for YARG cues and reusable effects. The visual cue editor (renderer) produces these JSON
files; this subsystem loads, validates, compiles, and executes them.

## Data Flow

```
JSON file (.json)
    ↓
NodeCueLoader / EffectLoader   (load, validate, watch)
    ↓
NodeCueCompiler / EffectCompiler   (compile graph → CompiledYargCue / CompiledAudioCue)
    ↓
YargCueRegistry / EffectRegistry   (register for dispatch)
    ↓
NodeExecutionEngine / EffectExecutionEngine   (execute at runtime)
    ↓
Sequencer   (effects)
```

## Structure

```
node/
├── compiler/       # Compilation from JSON to executable form
├── loader/          # File loading, validation, file watching
├── runtime/         # Execution engine, cue instances
├── schema/          # AJV validation
└── utils/           # Shared utilities
```

### compiler/

| File | Role |
|------|------|
| `NodeCueCompiler` | Compiles `YargNodeCueDefinition` / `AudioNodeCueDefinition` to `CompiledYargCue` / `CompiledAudioCue` |
| `EffectCompiler` | Compiles `YargEffectDefinition` / `AudioEffectDefinition` to executable effect |
| `ActionEffectFactory` | Builds concrete Effect objects from ActionNode config (colour, timing, targets) |

### loader/

| File | Role |
|------|------|
| `NodeCueLoader` | Loads cue JSON from `yarg/` and `audio/` dirs; validates with AJV; watches via chokidar; registers with YargCueRegistry / AudioCueRegistry |
| `EffectLoader` | Loads effect JSON; validates; watches; registers with EffectRegistry |

### runtime/

| File | Role |
|------|------|
| `NodeExecutionEngine` | Central execution: evaluates logic nodes, resolves values, dispatches actions to sequencer |
| `EffectExecutionEngine` | Executes effect definitions (used when an Action references a reusable effect) |
| `YargNodeCue` | Runtime cue instance for YARG; receives game events, drives NodeExecutionEngine |
| `AudioNodeCue` | Runtime cue instance for audio (early development) |
| `ExecutionContext` | Per-execution state: variables, light arrays, beat/measure, etc. |
| `EffectRegistry` | Maps effect IDs to compiled effect definitions |
| `valueResolver` | Resolves ValueSource (literal/variable) to concrete values |
| `actionResolver` | Resolves ActionNode → Effect; handles effect references |
| `logicNodeEvaluator` | Evaluates logic nodes (variable, math, conditional, loops, light selectors) |
| `dataExtractors` | Extract game/audio data for node execution |

### schema/

| File | Role |
|------|------|
| `validation.ts` | AJV schemas; `validateNodeCueFile`, `validateYargNodeCueFile`, `validateAudioNodeCueFile`, `validateEffectFile` |

### utils/

| File | Role |
|------|------|
| `eventUtils` | Event name/id helpers |
| `patternUtils` | Light pattern utilities |
| `configDataUtils` | Config data property helpers |

## Types

Core types live in `../types/nodeCueTypes.ts`:

- `NodeCueFile`, `YargNodeCueFile`, `AudioNodeCueFile` – File structure
- `YargNodeCueDefinition`, `AudioNodeCueDefinition` – Cue definition
- `YargEffectDefinition`, `AudioEffectDefinition` – Effect definition
- `EventNode`, `ActionNode`, `LogicNode`, `EventRaiserNode`, `EffectRaiserNode`, `EffectListenerNode` – Node types
- `ValueSource`, `VariableDefinition`, `Connection` – Supporting types

## Validation

JSON files are validated against AJV schemas before load. Invalid files are reported (e.g. in the loader summary)
and not registered. The cue editor validates on save and displays errors.

## Related

- Visual editor: `src/renderer/src/components/cue-editor/`
- IPC handlers: `src/main/ipc/node-cue-handlers.ts`, `effect-handlers.ts`
