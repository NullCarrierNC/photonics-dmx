# Photonics DMX - Core

This comprises the core Photonics DMX Sequencer. In the future this will be broken out as its own package.


## Common Terminology

For the most part if you see the term `fixture` this is in reference to a physical DMX light.
If you see the term `light` this is the virtual representation used within the lighting system.


## Architecture Overview

1. `Listeners`: listen for game data over the network. Specific implementations for YARG and RB3E. When a lighting cue is received the matching processor is called.
2. `Processors`: handle game events and convert them to lighting effects. YARG uses cue-based processing while RB3E uses a Processor Manager to select between direct DMX control and cue-based processing. Currently only direct is active.
3. `Sequencer`: the central coordinator of the lighting system that manages the lifecycle of effects and transitions. It oversees the EffectManager and other components.
4. `EffectManager`: receives effect data and orchestrates the creation and management of transitions. Handles effect queueing and scheduling.
5. `LightTransitionController`: processes transitions and interpolates colour states over time, applying easing functions and handling transform timing.
6. `LayerManager`: tracks each light's state on a per-light-per-layer basis and is responsible for calculating the final results when layers are flattened.
7. `DmxLightManager`: manages the virtual representation of the physical DMX fixtures. 
8. `DmxPublisher`: maps the abstract light state to each fixture's specific DMX channels using the fixture profiles defined in the configuration.
9. `SenderManager`: manages the various output senders that transmit DMX data to physical devices or other systems.
10. `Senders`: provide the bridge to the real world. sACN/ArtNet for DMX over the network, EnttecPro for Enttec USB dongles, and IPC for sending DMX data to the application UI.

Configuration is handled by the `ConfigurationManager` and related services, which manage user preferences and fixture setup.

## Processing Architecture

Photonics uses different processing approaches for YARG and RB3E:

### YARG Processing
YARG uses **cue-based processing** where network cue events are directly converted to lighting cues through the `YargNetworkListener`. 


### RB3E Processing
RB3E uses a **Processor Manager** that can switch between two processing modes:

#### Direct Mode (Default)
The `StageKitDirectProcessor` provides direct DMX control by:
- Receiving StageKit light data (4 color banks: Blue, Green, Yellow, Red with 8 positions each)
- Mapping StageKit positions directly to DMX lights
- Supporting color blending and accumulation
- Handling strobe effects


#### Cue-Based Mode
The `CueBasedProcessor` provides cue-based lighting by converting RB3E events to lighting cues.
This is NOT current accessible. RB3E currently only implements the StageKit direct processing.


### Processor Selection
The system automatically selects the appropriate processor:
- **YARG**: Always uses cue-based processing
- **RB3E**: Defaults to direct mode


### Additional Components

The sequencing system contains several other components, though these are mainly used internally as part of the sequencer:

- `TransitionEngine`: Handles the animation and timing of transitions between light states.
- `SongEventHandler`: Processes beat, measure, and other musical events.
- `SystemEffectsController`: Manages system-level effects blackout, which don't act like normal cue/effects.
- `EventScheduler`: Handles scheduling and management of timed events within the system using the centralized clock.
- `Clock`: Provides centralized timing control with 1ms precision for all system components.
- `EffectTransformer`: Transforms generic effect definitions into concrete transition specifications.
- `DebugMonitor`: Provides real-time monitoring and debugging capabilities (when enabled in the Cue Handler).

### Processing Components

- `ProcessorManager`: Manages switching between direct DMX control and cue-based processing for RB3E.
- `StageKitDirectProcessor`: Provides direct StageKit-to-DMX mapping for real-time lighting control.
- `StageKitLightMapper`: Maps StageKit light positions to DMX light configurations.
- `CueBasedProcessor`: Handles cue-based lighting for RB3E.






## Cues and Effects

Cues are called by changes in game state. Eg. when YARG transitions from gameplay to the menu, the Menu cue is called.

Each `cue` then can be considered a group of one or more `effects`. 

An `effect` is comprised by a series of `transitions`.

Each `transition` consists of a `transform` which interpolates the `light state` over time.


Consider the `stomp` cue: the lights all flash bright white and fade down. This is significantly slower than a strobe light flash:

```Typescript
protected handleCueStomp(_parameters: CueData): Promise<void> {
    const white: RGBIO = getColor('white', 'max');
    const lights = this.getLights(['front'], 'all');
    const flash = getEffectFlashColor({
      color: white,
      startTrigger: 'none',
      durationIn: 40,
      holdTime: 0,
      durationOut: 150,
      lights: lights,
      easing: EasingType.SIN_OUT,
      layer: 101,
    });
    this._effects.addEffect('stomp', flash);
  }

export const getEffectFlashColor = ({
    color,
    startTrigger,
    startWait = 0,
    endTrigger = 'none',
    endWait = 0,
    durationIn,
    holdTime,
    durationOut,
    lights,
    layer = 0,
    easing =  EasingType.SIN_OUT
}: GetSingleColorEffectParams): Effect => {
    const effect: Effect = {
        id: "flash-color",
        description: "Sets the light a color then quickly fades it out",
        transitions: [
            {
                lights: lights,
                layer: layer,
                waitForCondition: startTrigger,
                waitForTime: startWait,
                transform: {
                    color: color,
                    easing: easing,
                    duration: durationIn,
                },
                waitUntilCondition: "delay",
                waitUntilTime: holdTime,
            },
            {
                lights: lights,
                layer: layer,
                waitForCondition: endTrigger,
                waitForTime: endWait,
                transform: {
                    color: {
                        red: 0,
                        green: 0,
                        blue: 0,
                        intensity: 0,
                        opacity: 0.0,
                        blendMode: 'replace',
                    },
                    easing: easing,
                    duration: durationOut,
                },
                waitUntilCondition: "delay",
                waitUntilTime: holdTime,
            },
        ],
    };

    return effect;
};
```

The stomp transitions consists of two transforms:
1. Fade in to full white over 40ms, hold for 0ms.
2. Fade out to transparent over 150ms.

**Wait Conditions** allow you to wait for specific game events like Beat, Measure, or Keyframe before starting or ending transitions.

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

`Layer 0` is a special layer: this is the main layer and all primary effects should use at least layer 0.
This is important as when an effect ends, _its final state is not cleared_. This allows effects to 
transition into another and prevents the lights turning off unexpectedly if there is a gap. 



`EffectManager.setEffect`: Set effect will clear all states above layer 0 before adding the effect.
Layer 0 will transition into the new effect. 
`EffectManager.addEffect`: Adds the effect without clearing other layers. This lets us add effects on 
top of running ones without clearing them inadvertently. 
`EffectManager.getActiveEffectsForLight(lightId)`: Returns all active effects for a specific light across all layers
`EffectManager.isLayerFreeForLight(layer, lightId)`: Checks if a specific layer is free for a specific light

There are other methods for effect handling; look into `EffectManager` for more details.


In order to output the final light state the layers are collapsed and the final values calculated. 
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
Result: R:255, G:127, B:127 (Red + 50% White)
```
With `'add'` blend mode and 0.5 opacity:
- Red: `255 + (255 * 0.5) = 255 + 127.5 = 382` → capped at 255
- Green: `0 + (255 * 0.5) = 0 + 127.5 = 127.5` → 127
- Blue: `0 + (255 * 0.5) = 0 + 127.5 = 127.5` → 127

### Example 3: Replace Mode with Opacity
```
Layer 10: R:255, G:255, B:255, I:255, Opacity: 0.5, BlendMode: 'replace'
Layer 0:  R:255, G:0,   B:0,   I:255, Opacity: 1.0, BlendMode: 'replace'
Result: R:255, G:127, B:127 (50% White over Red)
```
With `'replace'` blend mode and 0.5 opacity:
- Red: `255` (unchanged, fully opaque)
- Green: `255 * 0.5 = 127.5` → 127
- Blue: `255 * 0.5 = 127.5` → 127

### Example 4: Mixed Blend Modes
```
Layer 10: R:255, G:255, B:255, I:255, Opacity: 0.5, BlendMode: 'add'
Layer 0:  R:255, G:0,   B:0,   I:255, Opacity: 1.0, BlendMode: 'replace'
Result: R:255, G:127, B:127 (Red + 50% White)
```
When mixing blend modes, the system applies the blend mode first, then the opacity:
- Red: `255` (Layer 0 is fully opaque with 'replace')
- Green: `0 + (255 * 0.5) = 127.5` → 127 (Layer 10 adds 50% white)
- Blue: `0 + (255 * 0.5) = 127.5` → 127 (Layer 10 adds 50% white)

## Available Blend Modes

- **`replace`**: Overwrites lower layer colors (default behavior)
- **`add`**: Adds to lower layer colors (good for additive blending)
- **`multiply`**: Multiplies with lower layer colors (good for darkening)
- **`overlay`**: Combines multiply and screen blending (good for contrast)


The system uses `opacity` and `blendMode` for color blending:

```Typescript
export type RGBIO = {
  red: number; // 0-255
  green: number; // 0-255
  blue: number; // 0-255
  intensity: number; // 0-255
  opacity: number; // 0.0-1.0, required
  blendMode: BlendMode; // required, enum: 'replace', 'add', 'multiply', 'overlay'
  
  pan?: number;
  tilt?: number;
}; 
```

The final colour calculation takes these opacity and blend mode values into account to determine how colors interact between layers.


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
switches back and forth between cues rapdily.



## Light Groups and Targets

Each light is assigned to a `group`, these currently consist of `front`, `back`, or `strobe`. 

When creating effects the lights can be further divided by criteria like `even`, `odd`, `half-1`, `half-2`, etc. 

This allows the effects to be agnostic to the user's specific configuration. E.g. it doesn't matter if they 
have 6 front lights and 3 back lights while someone else has 4 front and no back lights. The effects never try 
to target any one specific light, so they run smoothly on all configurations.




## Debug Tools

Photonics includes debugging tools to visualize the effects active on each layer. Currently enabling 
them required uncommenting the appropriate line in the Cue Handler's constructor. Enabling this will console.log 
the layering systems state when run using `npm run dev`.


### Using the Debug Helper

The `DebugMonitor` provides a simple interface for debugging light states in real-time:

```typescript
import { debugHelper } from './helpers/DebugHelper';

// Register your cue handler or effects controller
debugHelper.registerCueHandler(yargCueHandler);
// or
debugHelper.registerEffectsController(effectManager);

// Enable real-time monitoring
debugHelper.enableRealTimeMonitoring(true); 

// Optionally specify refresh rate in milliseconds
debugHelper.enableRealTimeMonitoring(true, 1000);

// Take a single snapshot of current state
debugHelper.captureSnapshot();

// Disable when finished
debugHelper.enableRealTimeMonitoring(false);
```


### Debug Output

When real-time monitoring is enabled, you'll see a formatted table in the console showing:

- Each light as a column
- Each active layer as a row
- Current RGB and intensity values for each light/layer combination
- Effect names associated with each layer
- The final merged state of all layers


