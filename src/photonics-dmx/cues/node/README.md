# Node-Based Cue System

JSON-defined node graphs for YARG, RB3 and audio cues (lighting and motion programs) and reusable effects. The
visual cue editor (renderer) produces these JSON files; this subsystem loads, validates, compiles, and executes
them.

Cue files use `mode: 'yarg' | 'rb3' | 'audio'`, under `node-data/cues/<mode>/`. The directory pins the mode: the
loader validates a file against the mode it was found in, so a file declaring a different one is rejected.

`yarg` and `rb3` form the **net** family, where a cue type arrives from outside on a `CueData` frame. `audio`
derives its cue from signal analysis. Runtime behaviour is per family, while the vocabulary each mode may author
and the registry it loads into are per mode. Both live in the domain descriptors under `cues/domains/`.

Each cue definition includes a required `kind: 'lighting' | 'motion'`. Lighting cues drive colour/effect layers.
Motion programs share the same node graph model but are keyed by `id` and registered separately for random or
locked selection alongside the active lighting cue for that platform.

## Data Flow

```
JSON file (.json)
    v
NodeCueLoader / EffectLoader   (load, validate, watch)
    v
NodeCueCompiler / EffectCompiler   (compile graph to CompiledNetCue / CompiledAudioCue)
    v
CueRegistry (per net mode) / AudioCueRegistry / EffectRegistry   (register for dispatch)
    v
LightingNodeCue / MotionNodeCue -> GraphExecutionEngine (policy + IGraphExecutionSession) -> NodeExecutionEngine
AudioNodeCue / AudioMotionNodeCue -> NodeExecutionEngine (directly, via BaseAudioNodeCue)
EffectExecutionEngine                                          (when an Action references a reusable effect)
    v
Sequencer   (effects)
```

## Structure

```
node/
  compiler/    # Compilation from JSON to executable form
  loader/      # File loading, validation, file watching
  runtime/     # Execution engine, cue instances
  schema/      # AJV validation
  utils/       # Shared utilities
```

Per-mode behaviour lives one level up in `cues/domains/`, not here. Each mode has a descriptor carrying its
family, its authorable event types and cue-data properties, its effect tree, and the two runtime hooks (the
per-frame event gate and the cue-data extractor). Engine code resolves behaviour through `getCueDomain(mode)`
rather than branching on the mode itself.

### compiler/

| File                         | Role                                                                                                                                           |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `NodeCueCompiler`            | `compileCue(definition, mode)` builds `CompiledNetCue` / `CompiledAudioCue`. `mode` is required: a definition carries none, only its file does |
| `EffectCompiler`             | Compiles `YargEffectDefinition` / `AudioEffectDefinition` to executable effect                                                                 |
| `AbstractGraphBuilder`       | Shared compile core both compilers extend: map build, endpoint/reachability/unreachable-action checks via per-compiler hooks                   |
| `CompilationError`           | Unified base error; `NodeCueCompilationError` / `EffectCompilationError` are thin back-compat subclasses                                       |
| `sharedActionNodeValidation` | Shared structural checks for action targets, set-position, set-color, and motion-pattern payloads used by both compilers                       |
| `ActionEffectFactory`        | Builds concrete Effect objects from ActionNode config (color, timing, targets)                                                                 |

### loader/

| File                 | Role                                                                                                                                                                                                      |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BaseNodeFileLoader` | Shared base for both loaders: directory layout, chokidar watching, per-mode summary bookkeeping, and path sandboxing                                                                                      |
| `NodeCueLoader`      | Extends `BaseNodeFileLoader`: loads cue JSON per mode directory, validates, and registers into the registry for that mode. A build with its own cue kind registers a strategy rather than adding a branch |
| `EffectLoader`       | Extends `BaseNodeFileLoader`: loads effect JSON; validates; registers with EffectRegistry                                                                                                                 |

### runtime/

| File                      | Role                                                                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `BaseNodeExecutionEngine` | Shared node dispatcher both engines extend (action/logic/for-each/delay/cancel); cue-vs-effect differences via template-method hooks |
| `NodeExecutionEngine`     | Cue execution (extends `BaseNodeExecutionEngine`): strict revisit policy, cue/group variable stores, effect-raiser dispatch          |
| `EffectExecutionEngine`   | Effect execution (extends `BaseNodeExecutionEngine`): relaxed revisit policy, effect-local parameter store, idle tracking            |
| `GraphExecutionEngine`    | Unified engine for cue/effect graphs; wraps NodeExecutionEngine/EffectExecutionEngine, queuing, state machine                        |
| `GraphExecutionPolicy`    | Policy for GraphExecutionEngine (cue vs effect entry events, queuing, revisit)                                                       |
| `graphActionHelpers`      | Small shared pieces for homogeneous set-color chains (visit marking, step collection, effect-factory argument mapping)               |
| `CueSession`              | Per-cue session state: variable stores, first-submission policy, cue-started flag                                                    |
| `ExecutionStateMachine`   | Lifecycle phases (IDLE, RUNNING, BLOCKED, COMPLETED, CANCELLED) per context                                                          |
| `BaseNodeCue`             | Shared session and engine lifecycle for net cues, keyed per sequencer so parallel rigs stay isolated                                 |
| `LightingNodeCue`         | Net lighting runtime (extends `BaseNodeCue`): group-level variable sharing, `cueType` identity, style from the definition            |
| `MotionNodeCue`           | Net motion runtime (extends `BaseNodeCue`): fresh session per cue, `id` identity, always Primary, clears its effects on stop         |
| `BaseAudioNodeCue`        | Shared audio graph execution (events, triggers, variables, `NodeExecutionEngine`) for lighting and motion                            |
| `AudioNodeCue`            | Audio lighting runtime (`kind: 'lighting'`); primary/secondary/strobe slot semantics via `style`                                     |
| `AudioMotionNodeCue`      | Audio motion runtime (`kind: 'motion'`); no lighting `style`; clamps detected BPM for fixture safety; receives `AudioCueData`        |
| `ExecutionContext`        | Per-execution state: variables, light arrays, beat/measure, etc.                                                                     |
| `EffectRegistry`          | Maps effect IDs to compiled effect definitions                                                                                       |
| `valueResolver`           | Resolves ValueSource (literal/variable) to concrete values                                                                           |
| `actionResolver`          | Resolves ActionNode to Effect; handles effect references                                                                             |
| `logicNodeEvaluator`      | Evaluates logic nodes (variable, math, conditional, loops, light selectors)                                                          |
| `dataExtractors`          | Extract game/audio data for node execution                                                                                           |

### schema/

| File                   | Role                                                                                                                       |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `cueSchemaBuilder.ts`  | Builds a cue definition schema from what varies by kind and family (the key field, style values, event item shape)         |
| `cueSchemaRegistry.ts` | Holds each kind's schema per family and compiles one file validator per mode on first use. Registering after that throws   |
| `cueFiles.ts`          | Registers the `lighting` and `motion` kinds and exposes the per-mode validators                                            |
| `validation.ts`        | Semantic checks over one shared body: `validateNodeCueFile`, `validateCueFileForMode`, the mode-pinned validators, effects |

### utils/

| File              | Role                         |
| ----------------- | ---------------------------- |
| `eventUtils`      | Event name/id helpers        |
| `patternUtils`    | Light pattern utilities      |
| `configDataUtils` | Config data property helpers |

## Types

Core types live in `../types/nodeCueTypes.ts`:

- `NodeCueFile`, `NetNodeCueFile`, `AudioNodeCueFile`: file structure. `NetNodeCueFile` covers both net modes, discriminated by `mode`
- `NetNodeCueDefinition`, `AudioNodeCueDefinition`: cue definition, discriminated by `kind` (lighting vs motion)
- `YargEffectDefinition`, `AudioEffectDefinition`: effect definition. The effect trees on disk really are `yarg` and `audio`, so these keep their names
- `NetEventNode`, `ActionNode`, `LogicNode`, `EventRaiserNode`, `EffectRaiserNode`, `EffectListenerNode`: node types
- `ValueSource`, `VariableDefinition`, `Connection`: supporting types

## Validation

JSON files are validated against AJV schemas before load. Invalid files are reported (e.g. in the loader summary)
and not registered. The cue editor validates on save and displays errors.

Compilers additionally enforce graph shape: cues require actions reachable from system events and event listeners;
effects require effect-listener entry points. Shared physical action rules (targets, set-position, set-color,
motion-pattern) live in `sharedActionNodeValidation.ts` so cues and effects stay aligned. Cues still differ from
effects in revisit/reachability rules and entry wiring (see `GraphExecutionPolicy` and compiler reachability starts).

Effect files run the same graph-level semantic checks as cue files, logic-only cycle detection (`detectCycles`)
and conditional literal-vs-variable `validValues` checks (`checkConditionalValidValues`), via `checkEffectSemantics`
in `validation.ts`. An invalid effect graph is rejected at validation time just like an invalid cue graph.

## Related

- Visual editor: `src/renderer/src/components/cue-editor/`
- IPC handlers: `src/main/ipc/node-cue-handlers.ts`, `effect-handlers.ts`
