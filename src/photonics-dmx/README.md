# Photonics DMX - Core

This comprises the core Photonics DMX Sequencer. In the future this will be broken out as its own package.


## Common Terminology

For the most part if you see the term `fixture` this is in reference to a physical DMX light.
If you see the term `light` this is the virtual representation used within the lighting system.


## Architecture Overview

1. `Listeners`: listen for game data over the network. Specific implementations for YARG and RB3E. When a lighting cue is received the matching Cue Handler is called.
2. `Cue Handlers`: receive light cue calls from the listener and generates lighting effects. These are handled somewhat differently between YARG and RB3E.
3. `Sequencer`: the central coordinator of the lighting system that manages the lifecycle of effects and transitions. It oversees the EffectManager and other components.
4. `EffectManager`: receives effect data and orchestrates the creation and management of transitions. Handles effect queueing and scheduling.
5. `LightTransitionController`: processes transitions and interpolates colour states over time, applying easing functions and handling transform timing.
6. `LayerManager`: tracks each light's state on a per-light-per-layer basis and is responsible for calculating the final results when layers are flattened.
7. `DmxLightManager`: manages the virtual representation of the physical DMX fixtures. 
8. `DmxPublisher`: maps the abstract light state to each fixture's specific DMX channels using the fixture profiles defined in the configuration.
9. `SenderManager`: manages the various output senders that transmit DMX data to physical devices or other systems.
10. `Senders`: provide the bridge to the real world. sACN for DMX over the network, EnttecPro for Enttec USB dongles, and IPC for sending DMX data to the application UI.

Configuration is handled by the `ConfigurationManager` and related services, which manage user preferences and fixture setup.


### Additional Components

The sequencing system contains several other components, though these are mainly used internally as part of the sequencer:

- `TransitionEngine`: Handles the animation and timing of transitions between light states.
- `SongEventHandler`: Processes beat, measure, and other musical events.
- `SystemEffectsController`: Manages system-level effects blackout, which don't act like normal cue/effects.
- `TimeoutManager`: Handles scheduling and management of timed events within the system.
- `EffectTransformer`: Transforms generic effect definitions into concrete transition specifications.
- `DebugMonitor`: Provides real-time monitoring and debugging capabilities (when enabled in the Cue Handler).





## Cues and Effects

Cues are called by changes in game state. Eg. when YARG transitions from gameplay to the menu, the Menu cue is called.

Each `cue` then can be considered a group of one or more `effects`. 

An `effect` is comprised by a series of `transitions`.

Each `transition` consists of a `transform` which interpolates the `light state` over time.


Consider the `stomp` cue: the lights all flash bright white and fade down. This is significantly slower than a strobe light flash:

```Typescript
protected handleCueStomp(_parameters: CueData): Promise<void> {
    const white: RGBIP = getColor('white', 'max');
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
        description: "Sets the light a color then quickly fades it out with Priority",
        transitions: [
            {
                lights: lights,
                layer: layer,
                waitFor: startTrigger,
                forTime: startWait,
                transform: {
                    color: color,
                    easing: easing,
                    duration: durationIn,
                },
                waitUntil: "delay",
                untilTime: holdTime,
            },
            {
                lights: lights,
                layer: layer,
                waitFor: endTrigger,
                forTime: endWait,
                transform: {
                    color: {
                        red: 0,
                        rp: 0,
                        green: 0,
                        gp: 0,
                        blue: 0,
                        bp: 0,
                        intensity: 0,
                        ip: 0,
                    },
                    easing: easing,
                    duration: durationOut,
                },
                waitUntil: "delay",
                untilTime: holdTime,
            },
        ],
    };

    return effect;
};
```

The stomp transitions consists of two transforms:
1. Fade in to full white over 40ms, hold for 0ms.
2. Fade out to transparent over 150ms.

`Triggers` allow you to wait for specific game events like Beat and Measure (YARG only).

Note the `color` object: RGB are, as expected, the primary colour channels. `Intensity` maps to 
the `Master Dimmer` on your DMX fixture.

`*p` channels are `priority`. These act like alpha transparency to the layer below.
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
`Priority` plays a key role in how this works:

Example 1:

Layer 10:   R:255,  G:255,  B:255,  I: 255,   P: 0
Layer 0:    R:255,  G: 0,   B: 0    I: 255,   P: 255

This would result in the lights being red only. The full white of 255, including the 
intensity (master dimmer) value of 255 don't matter, since the priority of 0 means this 
layer is transparent.


Example 2:

Layer 10:   R:255,  G:255,  B:255,  I: 255,   P: 128
Layer 0:    R:255,  G: 0,   B: 0    I: 255,   P: 255

Now that Layer 10's priority is 128, it will apply 50% of its value to the layer below.
As full on is 255, the Red channel is capped at 255. While the Green and Blue result in 127.


*NOTE:* Each colour channel & intensity (master dimmer) has a matching priority channel. I.e.:

```Typescript
export type RGBIP = {
  red: number; // 0-255
  rp: number; // 0-255

  green: number; // 0-255
  gp: number; // 0-255

  blue: number; // 0-255
  bp: number; // 0-255

  intensity: number; // 0-255
  ip: number; // 0-255

  pan?: number;
  tilt?: number;
}; 
```
The final colour calculation will take these individually channel priorities into account.



## Effects and Queuing

YARG & RB3E may continuously call a cue, even when the desired state hasn't changed. 
When turning lights on/off this isn't an issue, they can immediately reflect the desired state at any time.

When animating with fades, etc, this can create a conflict. Photonics handles this through queueing:
(These examples assume the cue's effects are targeting the same layers)

1. If the new effect is different than the previous effect, it replaces the previous effect based on the add/set rules.
2. If the new effect is the same as the previous effect, the new effect is queued to run when the current one finishes.
3. If there is already an effect of the same name in the queue, the new one replaces the one already in the queue.

Effects on different layers don't impact each other outside of how their priorities calculate the final colour values.




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


