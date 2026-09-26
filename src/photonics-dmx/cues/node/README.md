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
  cueValueRules.ts    # Value rules the editor fields, the compilers and the migrations share
  compiler/           # Compilation from JSON to executable form
  loader/             # File loading, validation, file watching
  runtime/            # Execution engine, cue instances
    logicHandlers/    # One handler per logic node type
  schema/             # AJV validation
    logicNodes/       # Logic node schemas, grouped by theme
  utils/              # Shared utilities
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
| `ActionEffectFactory`        | Builds concrete Effect objects from ActionNode config (color, timing, targets), over the two modules below                                     |
| `resolvedAction`             | The action shape once its ValueSources are resolved, with the comparisons and pan/tilt conversions over it                                     |
| `effectBuilders`             | Turns a resolved action into an `Effect`, with the colour and numeric helpers that needs                                                       |

### loader/

| File                    | Role                                                                                                                                                                                                      |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BaseNodeFileLoader`    | Shared base for both loaders: directory layout, chokidar watching, per-mode summary bookkeeping, and path sandboxing                                                                                      |
| `NodeCueLoader`         | Extends `BaseNodeFileLoader`: loads cue JSON per mode directory, validates, and registers into the registry for that mode. A build with its own cue kind registers a strategy rather than adding a branch |
| `EffectLoader`          | Extends `BaseNodeFileLoader`: loads effect JSON; validates; registers with EffectRegistry                                                                                                                 |
| `migrateLegacyBearings` | Rewrites legacy bearing tokens in literal ValueSources and action payloads as a file loads                                                                                                                |

### runtime/

| File                             | Role                                                                                                                                                                                                                           |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `BaseNodeExecutionEngine`        | Shared node dispatcher both engines extend (action/logic/for-each/delay/cancel); cue-vs-effect differences via template-method hooks                                                                                           |
| `NodeExecutionEngine`            | Cue execution (extends `BaseNodeExecutionEngine`): strict revisit policy, cue/group variable stores, effect-raiser dispatch. A raiser with downstream nodes keeps its cue context open until the effect goes idle              |
| `EffectExecutionEngine`          | Effect execution (extends `BaseNodeExecutionEngine`): relaxed revisit policy, effect-local parameter store, idle tracking. The idle callback runs from the microtask queue, so it lands after the submission that triggered it |
| `GraphExecutionEngine`           | Unified engine for cue/effect graphs; wraps NodeExecutionEngine/EffectExecutionEngine, queuing, state machine                                                                                                                  |
| `GraphExecutionPolicy`           | Policy for GraphExecutionEngine (cue vs effect entry events, queuing, revisit)                                                                                                                                                 |
| `graphActionHelpers`             | Small shared pieces for homogeneous set-color chains (visit marking, step collection, effect-factory argument mapping)                                                                                                         |
| `CueSession`                     | Per-cue session state: variable stores, first-submission policy, cue-started flag                                                                                                                                              |
| `ExecutionStateMachine`          | Lifecycle phases (IDLE, RUNNING, BLOCKED, COMPLETED, CANCELLED) per context                                                                                                                                                    |
| `BaseNodeCue`                    | Shared session and engine lifecycle for net cues, keyed per sequencer so parallel rigs stay isolated                                                                                                                           |
| `LightingNodeCue`                | Net lighting runtime (extends `BaseNodeCue`): group-level variable sharing, `cueType` identity, style from the definition                                                                                                      |
| `MotionNodeCue`                  | Net motion runtime (extends `BaseNodeCue`): fresh session per cue, `id` identity, always Primary, clears its effects on stop                                                                                                   |
| `BaseAudioNodeCue`               | Shared audio graph execution (events, triggers, variables, `NodeExecutionEngine`) for lighting and motion                                                                                                                      |
| `AudioNodeCue`                   | Audio lighting runtime (`kind: 'lighting'`); primary/secondary/strobe slot semantics via `style`                                                                                                                               |
| `AudioMotionNodeCue`             | Audio motion runtime (`kind: 'motion'`); no lighting `style`; clamps detected BPM for fixture safety; receives `AudioCueData`                                                                                                  |
| `ExecutionContext`               | Per-execution state: variables, light arrays, beat/measure, etc.                                                                                                                                                               |
| `EffectRegistry`                 | Maps effect IDs to compiled effect definitions                                                                                                                                                                                 |
| `valueResolver`                  | Resolves ValueSource (literal/variable) to concrete values, and infers a value's type                                                                                                                                          |
| `actionResolver`                 | Resolves ActionNode to Effect; handles effect references                                                                                                                                                                       |
| `logicNodeEvaluator`             | Builds the per-evaluation context and dispatches through the handler table in `logicHandlers/`                                                                                                                                 |
| `logicHandlers/`                 | One handler per logic type, grouped into variable, numeric, flow, data, light-array and colour-array modules. The table is total, so a new logic type fails the build until it has a handler                                   |
| `expressionEvaluator`            | Arithmetic compiler behind the `expression` logic node: operators, parentheses, and a small maths function set                                                                                                                 |
| `fanOut`                         | Engine-agnostic driver for the iterating logic nodes (`for-each-light`, `led-changed`), including the LED bank diff                                                                                                            |
| `audioEventEvaluator`            | Turns an `AudioCueData` frame into triggered/intensity results against caller-owned edge state                                                                                                                                 |
| `executionStateMachineLifecycle` | Owns the state machine per context and the transitions between phases, for both the graph engine and the audio runtime                                                                                                         |
| `engineUtils`                    | `collectReachableNodes`, the body set both engines walk for a for-each loop                                                                                                                                                    |
| `executionTypes`                 | Shared execution type aliases (variable values, completion callbacks, phases)                                                                                                                                                  |
| `nodeDebugPreview`               | Log-safe truncating view of a value, for node debug output                                                                                                                                                                     |
| `dataExtractors`                 | Extract game/audio data for node execution                                                                                                                                                                                     |

### schema/

| File                   | Role                                                                                                                          |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `cueSchemaBuilder.ts`  | Builds a cue definition schema from what varies by kind and family (the key field, style values, event item shape)            |
| `cueSchemaRegistry.ts` | Holds each kind's schema per family and compiles one file validator per mode on first use. Registering after that throws      |
| `cueFiles.ts`          | Registers the `lighting` and `motion` kinds and exposes the per-mode validators                                               |
| `validation.ts`        | Semantic checks over one shared body: `validateNodeCueFile`, `validateCueFileForMode`, the mode-pinned validators, effects    |
| `helpers.ts`           | The shared AJV instance, error formatting, the event and operator vocabularies, `detectCycles`, `checkConditionalValidValues` |
| `primitives.ts`        | Leaf schemas: ValueSource, action timing and config, effect references, position and motion-pattern settings                  |
| `nodes.ts`             | Per-node-kind schemas for action, event, audio trigger, event listener, effect raiser and effect event listener               |
| `logic.ts`             | The logic node union, composed from `logicNodes/`                                                                             |
| `logicNodes/`          | Logic schemas by theme: `valueSchemas`, `collectionSchemas`, `dataSchemas`, `timingSchemas`                                   |
| `effectFiles.ts`       | The effect file schemas and their group metadata                                                                              |
| `migrations.ts`        | Backward-compatible rewrites applied as a file loads                                                                          |

### utils/

| File              | Role                         |
| ----------------- | ---------------------------- |
| `eventUtils`      | Event name/id helpers        |
| `patternUtils`    | Light pattern utilities      |
| `configDataUtils` | Config data property helpers |

## Types

Core types are imported from `../types/nodeCueTypes.ts`, a barrel over `../types/node/`
(`cueDefinitions`, `effectDefinitions`, `eventNodes`, `actionNodes`, `logicNodes`, `variables`,
`graph`):

- `NodeCueFile`, `NetNodeCueFile`, `AudioNodeCueFile`: file structure. `NetNodeCueFile` covers both net modes, discriminated by `mode`
- `NetNodeCueDefinition`, `AudioNodeCueDefinition`: cue definition, discriminated by `kind` (lighting vs motion)
- `YargEffectDefinition`, `AudioEffectDefinition`: effect definition. The effect trees on disk really are `yarg` and `audio`, so these keep their names
- `NetEventNode`, `AudioEventNode`, `AudioTriggerNode`: event entry points. Audio triggers carry their own spectral gates and instrument presets
- `ActionNode`, `LogicNode`, `EventRaiserNode`, `EventListenerNode`, `EffectRaiserNode`, `EffectEventListenerNode`, `NotesNode`: the remaining node types
- `ValueSource`, `VariableDefinition`, `Connection`: supporting types

`LogicNode` is a union of around thirty members. Beyond variables, math and conditionals, it covers
`expression`, `frame-gate`, `tempo`, `pulse`, `clamp`, `select-from-list`, `delay`, `debugger`,
`indexed-variable`, `led-changed`, `for-each-light`, `build-ring`, and the light and colour array
operations (index, reverse, concat, shuffle, pair, length). `LogicNodeMeta` alongside it carries the
label, category and port shape the editor draws each one with.

## Validation

JSON files are validated against AJV schemas before load. Invalid files are reported (e.g. in the loader summary)
and not registered. The cue editor validates on save and displays errors.

Compilers additionally enforce graph shape: cues require actions reachable from system events and event listeners;
effects require effect-listener entry points. Shared physical action rules (targets, set-position, set-color,
motion-pattern) live in `sharedActionNodeValidation.ts` so cues and effects stay aligned. Cues still differ from
effects in revisit/reachability rules and entry wiring (see `GraphExecutionPolicy` and compiler reachability starts).

Effect files run the same graph-level semantic checks as cue files, logic-only cycle detection (`detectCycles`)
and conditional literal-vs-variable `validValues` checks (`checkConditionalValidValues`), through `checkEffectSemantics`
in `validation.ts`. Those two checks live in `schema/helpers.ts` with the rest of the shared validation pieces.
An invalid effect graph is rejected at validation time just like an invalid cue graph.

A cue file's envelope accepts the whole net event superset rather than only its own mode's vocabulary, so a file
that already reads outside its list keeps loading. What that would otherwise hide, an event a mode can never
receive, is reported as a **warning**: the file still loads and runs, and the message reaches the loader summary,
the log, and the JSON editor's notice line. Warnings come from the same registered checks as errors, which take
`(file, errors, warnings)` and choose which list to push to.

## Extension points

Several seams here exist so a build can add a cue kind, a mode, or a second consumer of a cue stream without
editing the shared code. Most have no in-tree consumer yet; they are listed so their contract is not guessed at.

| Seam                                     | Where                           | What it takes                                                                                                                                                                                                                                                                                                                             |
| ---------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `registerNodeCueKindStrategy`            | `loader/NodeCueLoader.ts`       | A handler for cue files of a kind the loader does not build itself. Claims a file from the cues it declares, then owns its registration, teardown, cue-type list and summary count. Register from an import-time module, before any file loads.                                                                                           |
| `registerKindSchema`                     | `schema/cueSchemaRegistry.ts`   | That kind's definition schema, one variant per family. A mode's file validator compiles on first use, so registration must happen before the first validation; it throws rather than silently no-op afterwards. `schema/cueFiles.ts` exports accessors rather than bound validators precisely so importing it does not close that window. |
| `registerCueSemanticCheck`               | `schema/validation.ts`          | A check over a validated file. Pushing to `errors` fails the file, pushing to `warnings` reports it while the file still loads. The built-in event-vocabulary warning is registered through this hook.                                                                                                                                    |
| `CueDomainDescriptor`                    | `../domains/index.ts`           | One descriptor per mode: family, authorable event types and cue-data properties, effect tree, and the two runtime hooks. Adding a mode is a descriptor plus a registry, not a branch in the engine.                                                                                                                                       |
| `LogicNodeEvaluatorContext.lightManager` | `runtime/logicNodeEvaluator.ts` | Optional, so a graph that drives no DMX lights can run the same evaluator. The light-dependent logic types throw a clear error rather than reading undefined.                                                                                                                                                                             |

Two more sit outside this directory, for a build teeing one cue stream to a second consumer:

| Seam                                          | Where                                     | What it takes                                                                                                                                                                                                                                          |
| --------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `CompositeCueRuntime` / `SecondaryCueRuntime` | `cueHandlers/CompositeCueRuntime.ts`      | Wraps a `CueRuntime` so a listener still sees one runtime while a second consumer reads the same cues. The secondary decides whether its look plays; hooks decide whether the primary is suppressed, and whether an occluding overlay is held over it. |
| `AudioSecondaryRuntime`                       | `processors/AudioSecondaryRuntime.ts`     | The audio-side equivalent, attached with `AudioCueProcessor.setSecondaryRuntime`. Fed the same frame as the DMX fan-out, following the same primary and strobe cue types.                                                                              |
| `ListenerCoordinator.decorateCueRuntime`      | `main/controllers/ListenerCoordinator.ts` | Where a build wraps a domain's runtime before the listener or processor consumes it.                                                                                                                                                                   |
| `ChainFanout.muteLighting`                    | `controllers/ChainFanout.ts`              | Holds or releases an occluding overlay across every rig, so a solo secondary plays over dark lights without stopping the running cue. Owned by each sequencer's system-effects controller, above every cue layer.                                      |

## Related

- Visual editor: `src/renderer/src/components/cue-editor/`
- IPC handlers: `src/main/ipc/node-cue-handlers.ts`, `effect-handlers.ts`
