# Effects

Legacy programmatic effect builders. An effect is a group of one or more transitions (timed changes
to light state) applied to one or more lights. Each builder returns an `Effect` object the sequencer
can run.

These builders predate the node-based cue system and are not the primary way cues are authored. The
node-graph system in [../cues/node/README.md](../cues/node/README.md) is the primary mechanism:
cues and reusable effects are defined as JSON graphs and compiled at runtime. Only
`getEffectSingleColor` is reached from runtime code (see [Usage](#usage)). The others are exported
from `effects/index.ts` and covered by `tests/effects/effectPrimitives.test.ts`, but no cue calls
them.

## Base Interface

All effect params extend `IEffect`:

```typescript
interface IEffect {
  lights: TrackedLight[] // lights to apply the effect to
  layer?: number // layer to apply the effect on
  waitFor?: WaitCondition // when to start the effect
  forTime?: number // delay before starting (ms)
  waitUntil?: WaitCondition // when to end the effect
  untilTime?: number // delay before ending (ms)
  easing?: EasingType | string // easing function for transitions
  color?: RGBIO // colour configuration (optional)
  duration?: number // effect duration (optional)
}
```

Each builder returns an `Effect` with an `id`, a `description`, and a `transitions` array that
defines how the effect behaves over time.

## Usage

| Builder                       | Used by                                                               |
| ----------------------------- | --------------------------------------------------------------------- |
| `getEffectSingleColor`        | `cueHandlers/Rb3MenuCueHandler.ts`, `processors/AudioCueProcessor.ts` |
| `getEffectFlashColor`         | exported and unit tested, no cue                                      |
| `getSweepEffect`              | exported and unit tested, no cue                                      |
| `getEffectFadeInColorFadeOut` | exported and unit tested, no cue                                      |
| `getEffectCrossFadeColors`    | exported, no cue                                                      |
| `getEffectCycleLights`        | exported, no cue                                                      |

## Available Effects

### Single Color (`getEffectSingleColor`)

Sets all specified lights to a single colour.

```typescript
interface SingleColorEffectParams extends IEffect {
  /** The colour to set the lights to */
  color: RGBIO
  /** Duration of the effect */
  duration: number
}
```

### Cross Fade Colors (`getEffectCrossFadeColors`)

Transitions lights from one colour to another.

```typescript
interface CrossFadeColorsEffectParams extends IEffect {
  /** The starting colour for the cross-fade */
  startColor: RGBIO
  /** The ending colour for the cross-fade */
  endColor: RGBIO
  /** Time to wait after the start colour is applied */
  afterStartWait: number
  /** Time to wait after the end colour is applied */
  afterEndColorWait: number
  /** The condition that triggers the cross-fade */
  crossFadeTrigger?: WaitCondition
}
```

`duration` is the optional one inherited from `IEffect`, and defaults to 1000 ms.

### Flash Color (`getEffectFlashColor`)

Flashes lights with a specified colour.

```typescript
interface FlashColorEffectParams extends IEffect {
  /** The colour to flash with */
  color: RGBIO
  /** The condition that triggers the start of the flash */
  startTrigger: WaitCondition
  /** Time to wait before starting the flash */
  startWait?: number
  /** The condition that triggers the end of the flash */
  endTrigger?: WaitCondition
  /** Time to wait before ending the flash */
  endWait?: number
  /** Time to hold the flash colour */
  holdTime: number
  /** Duration of the fade in */
  durationIn: number
  /** Duration of the fade out */
  durationOut: number
}
```

### Fade In Color Fade Out (`getEffectFadeInColorFadeOut`)

Fades in to a colour and then fades out.

```typescript
interface FadeInColorFadeOutEffectParams extends IEffect {
  /** The colour to fade in to */
  color: RGBIO
  /** Duration of the fade in */
  fadeInDuration: number
  /** Duration of the fade out */
  fadeOutDuration: number
  /** Time to wait before fading out */
  waitBeforeFadeOut: number
}
```

### Sweep (`getSweepEffect`)

Creates a sweeping motion across the lights or light groups. Accepts either
`SweepEffectSingleParams` or `SweepEffectGroupedParams` as a union.

Both members share a base interface:

```typescript
interface SweepEffectBaseParams {
  /** On state colour */
  high: RGBIO
  /** Off state colour */
  low: RGBIO
  /** Total time (ms) for one complete sweep across all groups */
  sweepTime: number
  /** Desired fade-in duration (ms) */
  fadeInDuration: number
  /** Desired fade-out duration (ms) */
  fadeOutDuration: number
  /** Percentage (0 to 100) by which subsequent lights overlap. 0 means no overlap */
  lightOverlap?: number
  /** How long to wait until the next sweep can run */
  betweenSweepDelay?: number
}

interface SweepEffectSingleParams extends IEffect, SweepEffectBaseParams {
  /** Array of lights to sweep across */
  lights: TrackedLight[]
}

interface SweepEffectGroupedParams extends SweepEffectBaseParams {
  /** Array of light groups to sweep across */
  lights: TrackedLight[][]
  /** The layer to apply the effect on */
  layer?: number
  /** The easing function to use for the effect */
  easing?: EasingType
  /** The condition that triggers the start of the effect */
  waitFor?: WaitCondition
}
```

### Cycle Lights (`getEffectCycleLights`)

Sequentially activates one light at a time through the provided array.

```typescript
interface CycleLightsEffectParams extends IEffect {
  /** Array of lights to cycle through */
  lights: TrackedLight[]
  /** Base colour for lights not currently active */
  baseColor: RGBIO
  /** Colour for the active light */
  activeColor: RGBIO
  /** Duration in ms for colour transitions */
  transitionDuration?: number
  /** The layer to apply the effect on */
  layer?: number
  /** The condition that triggers each step in the cycle */
  waitFor?: WaitCondition
}
```

## Usage Example

```typescript
const effect = getEffectSingleColor({
  lights: ['light1', 'light2'],
  color: { red: 255, green: 0, blue: 0, intensity: 255, opacity: 1.0, blendMode: 'replace' },
  duration: 1000,
  easing: EasingType.SIN_OUT,
})
```
