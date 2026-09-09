# Photonics DMX - Core

This comprises the core Photonics DMX Sequencer. In the future this will be broken out as its own package.

## Common Terminology

For the most part if you see the term `fixture` this is in reference to a physical DMX light.
If you see the term `light` this is the virtual representation used within the lighting system.

## Architecture Overview

1. `Listeners`: listen for game data over the network. Specific implementations for YARG and RB3E, alongside the audio listener that derives its data from signal analysis. When a lighting cue is received the matching runtime or processor is called.
2. `Processors`: handle game events and convert them to lighting effects. YARG and audio use node cue processing. RB3E uses either direct StageKit-to-DMX processing or node cues, depending on the RB3 processing mode preference.
3. `Sequencer`: the central coordinator of the lighting system that manages the lifecycle of effects and transitions. It oversees the EffectManager and other components.
4. `EffectManager`: receives effect data and orchestrates the creation and management of transitions. Handles effect queueing and scheduling, assigns persistent runs, and restarts them only after every light in the run completes.
5. `LightTransitionController`: runs the per-frame transition loop and handles transform timing. Sampling one transition at one instant lives in `transitionStep.ts`, the easing and layer blending maths in `lightBlending.ts`, and range clamping and orphan reaping in `transitionHealth.ts`.
6. `LayerManager`: tracks each light's state on a per-light-per-layer basis and is responsible for calculating the final results when layers are flattened.
7. `DmxLightManager`: manages the virtual representation of the physical DMX fixtures.
8. `DmxPublisher`: maps the abstract light state to each fixture's specific DMX channels using the fixture profiles defined in the configuration.
9. `SenderManager`: manages the various output senders that transmit DMX data to physical devices or other systems.
10. `Senders`: provide the bridge to the real world. sACN/ArtNet for DMX over the network, EnttecPro and OpenDMX for USB dongles, and IPC for sending DMX data to the application UI.

Configuration is handled by the `ConfigurationManager` and related services, which manage user preferences and fixture setup.

## Node-Based Cue System

Photonics uses node-based cues for YARG, RB3 and audio lighting. Cues and reusable effects are defined as JSON files with a graph of nodes (event listeners, logic, actions, event raisers) and executed at runtime.

**Flow:** JSON file → Loader (validation) → Compiler → Registry → ExecutionEngine → Sequencer

| Component                                       | Role                                                                                                                                               |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NodeCueLoader` / `EffectLoader`                | Loads JSON cue/effect files from disk, validates with AJV schema, watches for changes (chokidar); paths are confined to app-owned cue/effect roots |
| `NodeCueCompiler` / `EffectCompiler`            | Compiles JSON node graph to `CompiledNetCue` / `CompiledAudioCue` / compiled effects                                                               |
| `CueRegistry` / `AudioCueRegistry`              | Registers lighting cues plus motion programs for random/locked selection. One `CueRegistry` per net mode, via `getCueRegistry('yarg' \| 'rb3')`    |
| `GraphExecutionEngine`                          | Unified graph runner with cue/effect policy, sessions, and queuing                                                                                 |
| `NodeExecutionEngine` / `EffectExecutionEngine` | Executes node graph at runtime: evaluates logic, resolves values, dispatches actions                                                               |
| `LightingNodeCue` / `AudioNodeCue`              | Runtime cue instance that receives events and drives effects via the sequencer                                                                     |

`sACN`, `Art-Net`, `EnttecPro`, `OpenDMX`, and `IPC` senders are available for DMX output; preferences and console
flows pick active rigs and enabled senders through `ConfigurationManager` and `SenderManager`.

Node types include: event listeners (YARG cues, effect triggers), logic (variables, math, conditionals, loops), actions
(light effects with timing), event raisers, effect raisers/listeners. The visual cue editor (in the renderer) provides a
ReactFlow-based UI for authoring these JSON files. See [cues/node/README.md](cues/node/README.md) for details.

## Processing Architecture

Photonics uses different processing approaches for YARG and RB3E:

### YARG Processing

YARG uses **node cue processing** where network cue events are routed through the `YargNetworkListener`, selected from the YARG `CueRegistry`, and executed by the node runtime.

### RB3E Processing

RB3E runs in one of two modes, set by the `processingMode` value in the RB3 preferences. The
default is `direct`.

**Direct mode** maps the Stage Kit state straight onto the rig. The `Rb3StageKitDirectProcessor`:

- Receives StageKit light data (4 color banks: Blue, Green, Yellow, Red with 8 positions each)
- Maps StageKit positions directly to DMX lights, one `Rb3StageKitRigProcessor` per rig
- Supports color blending and accumulation
- Handles strobe effects

**Cue mode** feeds the same data through the node cue system. The `Rb3StageKitCueProcessor` builds
cue data from the Stage Kit state and dispatches it through a `ChainCueRuntime` bound to the `rb3`
domain, so RB3 selects from the `rb3` `CueRegistry` the same way YARG selects from its own.
`Rb3GameModeManager` rotates the primary cue group as play continues.

### Processor Selection

`ProcessorManager.startProcessors` reads the mode and starts the matching processor:

- **YARG**: Uses node cue processing
- **RB3E**: Uses direct StageKit processing or node cue processing, per the preference
- **Audio**: Uses node cue processing, driven by `AudioCueProcessor`

### Additional Components

The sequencing system contains several other components, though these are mainly used internally as part of the sequencer:

- `TransitionEngine`: Handles the animation and timing of transitions between light states using the shared frame context captured by the Sequencer.
- `SongEventHandler`: Processes beat, measure, and other musical events.
- `SystemEffectsController`: Manages system-level effects that don't act like normal cue/effects: blackout, and the occluding overlay that darkens the rig while a cue keeps running underneath.
- `Clock`: Provides centralized timing control with configurable precision (default 10 ms) for all system components. Each tick yields a `FrameContext` that is passed to TransitionEngine and LightTransitionController.
- `EffectTransformer`: Transforms generic effect definitions into concrete transition specifications.
- `LightStateManager`: Manages the final merged RGBIO state for each light and publishes the output of each atomic frame calculation to external listeners.
- `EffectScheduler`: Owns the effect queues and decides when a queued effect starts.
- `EffectCallbackRegistry`: Holds effect completion callbacks. A cancelled effect still fires its callback.
- `PersistentRunRegistry`: Tracks the lights in each persistent run so the run restarts only once they have all completed.
- `effectSubmission.ts`: The `SubmissionPolicy` (add, set, replace) shared by every `EffectManager` submission method.
- `MotionPatternEngine` and `motionGeometry.ts`: Pan and tilt motion patterns for moving head fixtures.
- `lightBlending.ts`: Easing, interpolation, and the layer blend maths.
- `transitionStep.ts`: Samples a single transition at a single instant.
- `transitionHealth.ts`: Clamps light state into range and reaps orphaned transitions.
- `DebugMonitor`: Provides real-time monitoring and debugging capabilities (when enabled).

#### Centralized Timing

The `Clock` provides a single source of truth for all timing operations in the sequencer. On each tick the Sequencer captures a `FrameContext` containing the shared timestamp, delta, and frame index. TransitionEngine advances every effect state machine using that context, LightTransitionController interpolates/blends all lights using the same timestamp, and LightStateManager publishes the merged results immediately. The default interval is 10 ms, providing smooth interpolation while keeping every light in phase.

### Processing Components

- `ProcessorManager`: Selects and runs the RB3E processor for the configured mode, and the audio processor.
- `Rb3StageKitDirectProcessor`: Provides direct StageKit-to-DMX mapping for real-time lighting control.
- `Rb3StageKitRigProcessor`: Holds the direct-mode render state for one rig.
- `Rb3StageKitCueProcessor`: Drives the `rb3` node cue domain from StageKit data.
- `rb3StageKitCueData.ts`: Builds the cue data both RB3 processors dispatch.
- `Rb3GameModeManager`: Rotates the primary RB3 cue group during play.
- `StageKitLightMapper`: Maps StageKit light positions to DMX light configurations.
- `AudioCueProcessor`: Drives the audio cue domain from the analysed audio frame.

## Multi-Rig Output

Photonics drives multiple independent rigs at once. A single `ChainFanout` dispatches every listener and cue event to each active rig's `RigChain`, and each `RigChain` owns its own `Sequencer`, `LightTransitionController`, and `LightStateManager`, so rigs render the same cues independently. The shared `Clock` ticks all chains in lockstep to keep them phase-aligned.

This results in each rig running the same cue, but interpreted to the limitations of that specific rig. E.g. if you have two rigs, one with 8 light and one with 4 lights, then when light 5-8 are active on the 8 light rig the colours of rig's 2 lights 1-4 will be a blend of 1-4's regular colours + 5-8's intended colours.

This design is intentional differs from traditional multi-universe designs that expect you to run different effects per universe.

**Flow:** listener → `ChainFanout` → per-rig `RigChain` (`Sequencer` → `LightTransitionController` → `LightStateManager`) → `DmxPublisher` (per-rig buffers) → `SenderManager` → rig-routed senders

`DmxPublisher` builds a separate DMX buffer per rig and routes it to that rig's configured senders/universes. Between the light state and the wire sit two stages: `VenueFrameProcessor` applies the venue post-processing effects through `PublisherFrameProcessor`, and `StrobeStateManager` supplies the hardware strobe channel value each publish tick reads.

An output-rate governor sits ahead of the wire senders, enabled by the global DMX rate preference. Each sender slot keeps the buffer it last sent and skips a frame identical to it. A frame that does differ goes out immediately once the slot's interval has elapsed, and one arriving inside the interval is held and flushed by a trailing timer, so the wire never sits on a stale value. Each slot rate limits independently. The IPC preview path has its own simpler rate limit and no skip.

Each net cue domain reaches the chains through `ChainFanout.cueRuntime('yarg' | 'rb3')`, so YARG and RB3 dispatch into the same fan-out without knowing about each other.

Rig mirroring (`helpers/mirrorRig.ts`, applied per `RigChain`) flips a rig's layout: horizontal mirroring reverses light order within each row and mirrors moving-head pan around home; vertical mirroring swaps the front and back rows. One physical layout can mirror another without re-authoring cues.

## Cues and Effects

Cues are called by changes in game state. Eg. when YARG transitions from gameplay to the menu, the Menu cue is called.

Each `cue` then can be considered a group of one or more `effects`.

An `effect` is comprised by a series of `transitions`.

Each `transition` consists of a `transform` which interpolates the `light state` over time.

Consider the `stomp` cue: the lights all flash bright white and fade down. This is significantly slower than a strobe light flash. In the node cue graph, the stomp effect consists of two transforms:

1. Fade in to full white over 40ms, hold for 0ms.
2. Fade out to transparent over 150ms.

**Wait Conditions** allow you to wait for specific game events before starting or ending transitions.

Available wait conditions include:

- `none`: No waiting, transition starts immediately
- `delay`: Wait for a fixed time period
- `beat`, `half-beat`, `measure`: Wait for a point on the tempo grid
- `keyframe`, `keyframe-first`, `keyframe-next`, `keyframe-previous`: Wait for a keyframe advance. The specific event and the generic `keyframe` both fire, so a cue can wait on a direction or on any advance.
- Instrument-specific events: `guitar-open`, `guitar-green`, `guitar-red`, etc, with the same set for `bass-` and `keys-`
- Drum events: `drum-kick`, `drum-red`, `drum-yellow`, `drum-blue`, `drum-green`, and cymbal events
- Vocal events: `vocal-note`, `vocal-note-off`
- RB3 Stage Kit events: `led-1` to `led-8`, their `-off` counterparts, `fog-on` and `fog-off`

The YARG and RB3 events are exclusive to their own mode. `types/songEvents.ts` holds the full lists.

### Event Count Properties

The system supports count-based waiting using `waitForConditionCount` and `waitUntilConditionCount` properties. These allow you to wait for a specific number of events to occur before proceeding.

- **`waitForConditionCount`**: Number of events to wait for before starting the transition
- **`waitUntilConditionCount`**: Number of events to wait for before ending the transition

For example, to wait for 3 keyframes before starting:

```typescript
{
    lights: [light],
    layer: 0,
    waitForCondition: 'keyframe',
    waitForTime: 0,
    waitForConditionCount: 3,  // Wait for 3 keyframes
    transform: { color: blue, easing: 'linear', duration: 100 },
    waitUntilCondition: 'none',
    waitUntilTime: 0
}
```

**Count Values:**

- **`0`**: Don't wait (start/end immediately)
- **`1`**: Wait for 1 event
- **`2`**: Wait for 2 events
- etc.

Note the `color` object: RGB are, as expected, the primary colour channels. `Intensity` maps to
the `Master Dimmer` on your DMX fixture.

`opacity` and `blendMode` control how colors blend with layers below. `opacity` ranges from 0.0 to 1.0,
where 0.0 is completely transparent and 1.0 is fully opaque. `blendMode` determines the blending algorithm.
See examples below.

### Layers and Light State

Cue effects are applied to the lights using a series of layers managed by the `LayerManager`. Higher numbered layers take
precedence over lower layers.

### Layer Conventions

- **Layer 0**: Base layer (preserved by design)
- **Layers 1-99**: Standard effect layers
- **Layers 100+**: High priority "flash" layers
- **Layer 200**: Strobe effects
- **Layers 201-254**: Reserved for future use
- **Layer 255**: Blackout layer

`Layer 0` is a special layer: this is the main layer and all primary effects should use at least layer 0.
When an effect on Layer 0 ends, _its final state is not cleared_ (unlike higher layers which are cleaned up).
This allows effects to transition smoothly into another and prevents the lights turning off unexpectedly
if there is a gap between effects. Layers above 0 are cleaned up when their effects complete with no
queued effects to maintain a clean state.

`EffectManager.setEffect`: Clears all running effects on every layer (via `removeAllEffects`) before
adding the new effect, so it becomes the only thing playing.
`EffectManager.addEffect`: Adds the effect without clearing other layers. This lets us add effects on
top of running ones without clearing them inadvertently.
`EffectManager.addEffectUnblockedName`: Adds an effect only if no effect with the same name is already running. Prevents queue breaking timing issues.
`EffectManager.setEffectUnblockedName`: Sets an effect only if no effect with the same name is already running. Otherwise discards the new effect.
`EffectManager.replaceEffect`: Replaces the effect on the layers it targets, leaving the rest alone.
Each of these has a `WithCallback` variant that reports completion. `EffectCallbackRegistry` holds
the callbacks, and a cancelled effect still fires its own so a waiting caller is never stranded.
Persistent effects register a run in `PersistentRunRegistry` that tracks every light in the effect. The run only restarts when all lights report completion, keeping effects like sweeps synchronized even when the cue fires continuously.
`EffectManager.getActiveEffectsForLight(lightId)`: Returns all active effects for a specific light across all layers
`EffectManager.isLayerFreeForLight(layer, lightId)`: Checks if a specific layer is free for a specific light

There are other methods for effect handling; look into `EffectManager` for more details.

In order to output the final light state the layers are collapsed and the final values calculated.
The `LightStateManager` stores the final merged state for each light after all layer blending is complete.
`Opacity` and `blendMode` play a key role in how this works:

## Blend Mode Examples

### Example 1: Replace Mode (Default)

```
Layer 10: R:255, G:255, B:255, I:255, Opacity: 0.0, BlendMode: 'replace'
Layer 0:  R:255, G:0,   B:0,   I:255, Opacity: 1.0, BlendMode: 'replace'
Result: R:255, G:0, B:0 (Red only)
```

Layer 10 has 0.0 opacity (completely transparent), so it contributes nothing. Only Layer 0's red color is visible.

### Example 2: Add Mode with Opacity

```
Layer 10: R:255, G:255, B:255, I:255, Opacity: 0.5, BlendMode: 'add'
Layer 0:  R:255, G:0,   B:0,   I:255, Opacity: 1.0, BlendMode: 'add'
Result: R:255, G:128, B:128 (Red + 50% White)
```

With `'add'` blend mode and 0.5 opacity the scaled colour is rounded, then added:

- Red: `255 + round(255 * 0.5) = 255 + 128 = 383` → capped at 255
- Green: `0 + round(255 * 0.5) = 0 + 128 = 128`
- Blue: `0 + round(255 * 0.5) = 0 + 128 = 128`

### Example 3: Replace Mode with Opacity

```
Layer 10: R:255, G:255, B:255, I:255, Opacity: 0.5, BlendMode: 'replace'
Layer 0:  R:255, G:0,   B:0,   I:255, Opacity: 1.0, BlendMode: 'replace'
Result: R:128, G:128, B:128 (white scaled to 50% intensity, Layer 0 is replaced)
```

With `'replace'` blend mode and 0.5 opacity every channel of the replacing layer is scaled by opacity. The underlying layer is discarded, not blended, so Layer 0's red does not show through:

- Red: `round(255 * 0.5) = 128`
- Green: `round(255 * 0.5) = 128`
- Blue: `round(255 * 0.5) = 128`
- Intensity: `round(255 * 0.5) = 128`

### Example 4: Mixed Blend Modes

```
Layer 10: R:255, G:255, B:255, I:255, Opacity: 0.5, BlendMode: 'add'
Layer 0:  R:255, G:0,   B:0,   I:255, Opacity: 1.0, BlendMode: 'replace'
Result: R:255, G:128, B:128 (Red + 50% White)
```

When mixing blend modes, each layer is blended in turn using its own mode and opacity:

- Red: `255` (Layer 0 is fully opaque with 'replace')
- Green: `0 + round(255 * 0.5) = 128` (Layer 10 adds 50% white)
- Blue: `0 + round(255 * 0.5) = 128` (Layer 10 adds 50% white)

### Example 5: Mix Mode (Alpha Crossfade)

```
Layer 10: R:255, G:255, B:0,   I:255, Opacity: 0.5, BlendMode: 'mix'
Layer 0:  R:0,   G:0,   B:255, I:255, Opacity: 1.0, BlendMode: 'replace'
Result: R:128, G:128, B:128 (50% crossfade from blue toward yellow)
```

With `'mix'` blend mode each channel is interpolated between the lower layers and this layer by opacity (`lower * (1 - opacity) + layer * opacity`):

- Red: `round(0 * 0.5 + 255 * 0.5) = 128`
- Green: `round(0 * 0.5 + 255 * 0.5) = 128`
- Blue: `round(255 * 0.5 + 0 * 0.5) = 128`

Unlike `replace`, the lower layer is blended in rather than discarded, so the colour crossfades between the two rather than fading up from black.

## Available Blend Modes

- **`replace`**: Overwrites lower layer colors (default behavior)
- **`add`**: Adds to lower layer colors (good for additive blending)
- **`mix`**: Alpha-crossfades between the lower layers and this layer by `opacity` (0.0 = lower layers, 1.0 = this layer). Unlike `replace`, partial opacity blends the two colours rather than scaling this layer down from black, so a colour can be flashed over another without fading through black.

The system uses `opacity` and `blendMode` for color blending:

```Typescript
export type RGBIO = {
  red: number; // 0-255
  green: number; // 0-255
  blue: number; // 0-255
  intensity: number; // 0-255
  opacity: number; // 0.0-1.0, required
  blendMode: BlendMode; // required, enum: 'replace', 'add', 'mix'

  pan?: number;
  tilt?: number;
};
```

The final colour calculation takes these opacity and blend mode values into account to determine how colors interact between layers. `pan` and `tilt` are not blended: a layer that sets them wins, and a layer that omits them carries forward whatever the layers below aimed at.

## Effects and Queuing

YARG & RB3E may continuously call a cue, even when the desired state hasn't changed.
When turning lights on/off this isn't an issue, they can immediately reflect the desired state at any time.

When animating with fades, etc, this can create a conflict. Photonics handles this through queueing:
(These examples assume the cue's effects are targeting the same layers)

1. If the new effect is different than the previous effect, it replaces the previous effect based on the add/set rules.
2. If the new effect is the same as the previous effect, the new effect is queued to run when the current one finishes.
3. If there is already an effect of the same name in the queue, the new one replaces the one already in the queue.

Effects on different layers don't impact each other outside of how their opacity and blend modes calculate the final colour values.

### Cue Groups

Cue groups are comprised of differing implementations for the same cue call. E.g. different ways of rendering cool_automatic.
Having multiple groups enabled allows for a wider range of visual effects during gameplay.

Which groups are active can be toggled in the Preferences area.

If a particular cue group only contains a subset of the in-game cues, and the game triggers a cue not found in that group,
the system will fall-back to the default group which is guaranteed to contain the cue implementation.

### Cue Consistency Throttling

The sequencer includes a consistency throttling mechanism to prevent rapid randomization changes when the same cue is called repeatedly within a short time window. This prevents visual inconsistencies when network data rapidly flips between different cues.

E.g. The network tells us to show cool_automatic -> frenzy -> cool_automatic. If the second cool_automatic was triggered less than 2 seconds (default)
after the previous use of cool_automatic we will use the same implementation as the previous call. This helps maintain consistency if the game
switches back and forth between cues rapidly.

## Light Groups and Targets

Each light is assigned to a `group`, these currently consist of `front`, `back`, or `strobe`.

When creating effects the lights can be further divided by criteria like `even`, `odd`, `half-1`, `half-2`, etc.

This allows the effects to be agnostic to the user's specific configuration. E.g. it doesn't matter if they
have 6 front lights and 3 back lights while someone else has 4 front and no back lights. The effects never try
to target any one specific light, so they run smoothly on all configurations.

## Debug Tools

Photonics includes debugging tools to visualize the effects active on each layer.

### Using the Debug Monitor

The `DebugMonitor` provides real-time debugging capabilities via the Sequencer:

```typescript
// Enable real-time debug monitoring with default 1000ms refresh rate
sequencer.enableDebug(true)

// Enable with custom refresh rate in milliseconds
sequencer.enableDebug(true, 2000)

// Print detailed layer state information
sequencer.debugLightLayers()

// Disable when finished
sequencer.enableDebug(false)
```

### Debug Output

When real-time monitoring is enabled, you'll see a formatted table in the console showing:

- Each light as a column
- Each active layer as a row
- Current RGB and intensity values for each light/layer combination
- Effect names associated with each layer
- The final merged state of all layers
