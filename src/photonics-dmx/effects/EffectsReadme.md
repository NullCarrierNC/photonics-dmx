# Effects

Effects represent a group of one or more transitions (changes to light states) that are applied to 
one or more lights. These are the building blocks of cues.


## Base Interface

All effects extend the base `IEffect` interface which provides common properties:

```typescript
interface IEffect {
    /** The lights to apply the effect to */
    lights: string[];
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
}
```

## Available Effects

### Single Color Effect
Sets all specified lights to a single colour.

```typescript
interface SingleColorEffectParams extends IEffect {
    /** The colour to set the lights to */
    color: RGBIP;
    /** Duration of the effect */
    duration: number;
}
```

### Cross Fade Colors Effect
Transitions lights from one colour to another.

```typescript
interface CrossFadeColorsEffectParams extends IEffect {
    /** The starting colour for the cross-fade */
    startColor: RGBIP;
    /** The ending colour for the cross-fade */
    endColor: RGBIP;
    /** Time to wait after the start colour is applied */
    afterStartWait: number;
    /** Time to wait after the end colour is applied */
    afterEndColorWait: number;
    /** The condition that triggers the cross-fade */
    crossFadeTrigger?: WaitCondition;
}
```

### Flash Color Effect
Flashes lights with a specified colour.

```typescript
interface FlashColorEffectParams extends IEffect {
    /** The colour to flash with */
    color: RGBIP;
    /** Duration of the flash */
    duration: number;
    /** Time between flashes */
    interval: number;
    /** Number of flashes */
    count: number;
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
    color: RGBIP;
    /** Duration of the fade in */
    fadeInDuration: number;
    /** Duration of the fade out */
    fadeOutDuration: number;
    /** Time to wait before fading out */
    waitBeforeFadeOut: number;
}
```

### Sweep Effect
Creates a sweeping motion across the lights.

```typescript
interface SweepEffectParams extends IEffect {
    /** The colour to sweep with */
    color: RGBIP;
    /** Duration of the sweep */
    duration: number;
    /** Direction of the sweep */
    direction: 'left' | 'right';
    /** Width of the sweep */
    width: number;
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


