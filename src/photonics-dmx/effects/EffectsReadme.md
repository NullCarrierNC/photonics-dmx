# Effects

Effects represent a group of one or more transitions (changes to light states) that are applied to 
one or more lights. These are the building blocks of cues.


## Base Interface

All effects extend the base `IEffect` interface which provides common properties:

```typescript
interface IEffect {
    /** The lights to apply the effect to */
    lights: TrackedLight[];
    /** The layer to apply the effect on */
    layer?: number;
    /** When to start the effect */
    waitFor?: WaitCondition;
    /** How long to wait before starting */
    forTime?: number;
    /** When to end the effect */
    waitUntil?: WaitCondition;
    /** How long to wait before ending */
    untilTime?: number;
    /** The easing function to use for transitions */
    easing?: EasingType | string;
    /** The colour configuration for the effect (optional) */
    color?: RGBIO;
    /** Duration of the effect (optional) */
    duration?: number;
}
```


## Available Effects

### Single Color Effect
Sets all specified lights to a single colour.

```typescript
interface SingleColorEffectParams extends IEffect {
    /** The colour to set the lights to */
    color: RGBIO;
    /** Duration of the effect */
    duration: number;
}
```


### Cross Fade Colors Effect
Transitions lights from one colour to another.

```typescript
interface CrossFadeColorsEffectParams extends IEffect {
    /** The starting colour for the cross-fade */
    startColor: RGBIO;
    /** The ending colour for the cross-fade */
    endColor: RGBIO;
    /** Time to wait after the start colour is applied */
    afterStartWait: number;
    /** Time to wait after the end colour is applied */
    afterEndColorWait: number;
    /** The condition that triggers the cross-fade */
    crossFadeTrigger?: WaitCondition;
    /** Duration of the cross-fade transition */
    duration: number;
}
```


### Flash Color Effect
Flashes lights with a specified colour.

```typescript
interface FlashColorEffectParams extends IEffect {
    /** The colour to flash with */
    color: RGBIO;
    /** The condition that triggers the start of the flash */
    startTrigger: WaitCondition;
    /** Time to wait before starting the flash */
    startWait?: number;
    /** The condition that triggers the end of the flash */
    endTrigger?: WaitCondition;
    /** Time to wait before ending the flash */
    endWait?: number;
    /** Time to hold the flash colour */
    holdTime: number;
    /** Duration of the fade in */
    durationIn: number;
    /** Duration of the fade out */
    durationOut: number;
}
```


### Blackout Effect
Turns off all specified lights.

```typescript
interface BlackoutEffectParams extends IEffect {
    /** Duration of the blackout transition */
    duration: number;
}
```


### Fade In Color Fade Out Effect
Fades in to a colour and then fades out.

```typescript
interface FadeInColorFadeOutEffectParams extends IEffect {
    /** The colour to fade in to */
    color: RGBIO;
    /** Duration of the fade in */
    fadeInDuration: number;
    /** Duration of the fade out */
    fadeOutDuration: number;
    /** Time to wait before fading out */
    waitBeforeFadeOut: number;
}
```


### Sweep Effect
Creates a sweeping motion across the lights or light groups.

```typescript
interface SweepEffectSingleParams extends IEffect {
    /** Array of lights to sweep across */
    lights: TrackedLight[];
    /** On state colour */
    high: RGBIO;
    /** Off state colour */
    low: RGBIO;
    /** Total time (ms) for one complete sweep across all groups */
    sweepTime: number;
    /** Desired fade‐in duration (ms) */
    fadeInDuration: number;
    /** Desired fade‐out duration (ms) */
    fadeOutDuration: number;
    /** Percentage (0 to 100) by which subsequent lights overlap. 0 means no overlap */
    lightOverlap?: number;
    /** How long to wait until the next sweep can run */
    betweenSweepDelay?: number;
}

interface SweepEffectGroupedParams {
    /** Array of light groups to sweep across */
    lights: TrackedLight[][];
    /** On state colour */
    high: RGBIO;
    /** Off state colour */
    low: RGBIO;
    /** Total time (ms) for one complete sweep across all groups */
    sweepTime: number;
    /** Desired fade‐in duration (ms) */
    fadeInDuration: number;
    /** Desired fade‐out duration (ms) */
    fadeOutDuration: number;
    /** Percentage (0 to 100) by which subsequent lights overlap. 0 means no overlap */
    lightOverlap?: number;
    /** How long to wait until the next sweep can run */
    betweenSweepDelay?: number;
    /** The layer to apply the effect on */
    layer?: number;
    /** The easing function to use for the effect */
    easing?: EasingType;
    /** The condition that triggers the start of the effect */
    waitFor?: WaitCondition;
}
```

**Note:** The `getSweepEffect` function accepts either `SweepEffectSingleParams` or `SweepEffectGroupedParams` as a union type.


### Cycle Lights Effect
Sequentially activates one light at a time through the provided array.

```typescript
interface CycleLightsEffectParams extends IEffect {
    /** Array of lights to cycle through */
    lights: TrackedLight[];
    /** Base colour for lights not currently active */
    baseColor: RGBIO;
    /** Colour for the active light */
    activeColor: RGBIO;
    /** Duration in ms for colour transitions */
    transitionDuration?: number;
    /** The condition that triggers each step in the cycle */
    waitFor?: WaitCondition;
}
```


## Usage Example

```typescript
const effect = getEffectSingleColor({
    lights: ['light1', 'light2'],
    color: { red: 255, green: 0, blue: 0, intensity: 255, opacity: 1.0, blendMode: 'replace' },
    duration: 1000,
    easing: EasingType.SIN_OUT
});
```


Each effect function returns an `Effect` object that can be applied to the lighting system. The effect object contains:
- `id`: A unique identifier for the effect
- `description`: A description of what the effect does
- `transitions`: An array of transitions that define how the effect behaves over time


