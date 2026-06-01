# Effects

Legacy programmatic effect builders. An effect is a group of one or more transitions (timed changes
to light state) applied to one or more lights; each builder returns an `Effect` object the sequencer
can run.

These builders predate the node-based cue system and are not the primary way cues are authored. The
node-graph system in [../cues/node/README.md](../cues/node/README.md) is the primary mechanism —
cues and reusable effects are defined as JSON graphs and compiled at runtime. The builders here
remain in use by a small number of non-node cues and handlers (see [Usage](#usage)); the rest are
exported from `effects/index.ts` but not currently wired into any cue.

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

| Builder                                                                                              | Used by                                                                                |
| ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `getEffectSingleColor`                                                                               | `cueHandlers/Rb3MenuCueHandler.ts`, `processors/AudioCueProcessor.ts`, `cues/menuCues.ts` |
| `getEffectFlashColor`                                                                                | `cues/menuCues.ts`                                                                     |
| `getSweepEffect`                                                                                     | `cues/menuCues.ts`, `cues/searchlightsCues.ts`                                         |
| `getEffectCrossFadeColors`                                                                           | exported, not currently used                                                           |
| `getEffectBlackout`                                                                                  | exported, not currently used                                                           |
| `getEffectFadeInColorFadeOut`                                                                        | exported, not currently used                                                           |
| `getEffectCycleLights`                                                                               | exported, not currently used                                                           |
| `getEffectClockwiseRotation` / `getEffectCounterClockwiseRotation` / `getEffectDualModeRotation` / `getEffectAlternatingPatterns` | exported, not currently used                              |

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
  /** Duration of the cross-fade transition */
  duration: number
}
```

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

### Blackout (`getEffectBlackout`)

Turns off all specified lights.

```typescript
interface BlackoutEffectParams extends IEffect {
  /** Duration of the blackout transition */
  duration: number
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

```typescript
interface SweepEffectSingleParams extends IEffect {
  /** Array of lights to sweep across */
  lights: TrackedLight[]
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

interface SweepEffectGroupedParams {
  /** Array of light groups to sweep across */
  lights: TrackedLight[][]
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
  /** The condition that triggers each step in the cycle */
  waitFor?: WaitCondition
}
```

### Rotation Patterns (`effectRotationPatterns.ts`)

Beat-driven patterns that move an active colour through a set of lights. `RotationPatternEffectParams`
(active/base colour, `beatsPerCycle`, `startOffset`, `reverse`, plus the standard wait conditions)
backs the rotation builders; `DualModeRotationEffectParams` adds a solid/rotating mode switch and
`AlternatingPatternEffectParams` alternates between two light sets.

- `getEffectClockwiseRotation` — advances the active light in index order.
- `getEffectCounterClockwiseRotation` — advances in reverse index order.
- `getEffectDualModeRotation` — switches between a solid colour and a rotating pattern.
- `getEffectAlternatingPatterns` — alternates the active colour between two light sets.

## Usage Example

```typescript
const effect = getEffectSingleColor({
  lights: ['light1', 'light2'],
  color: { red: 255, green: 0, blue: 0, intensity: 255, opacity: 1.0, blendMode: 'replace' },
  duration: 1000,
  easing: EasingType.SIN_OUT,
})
```
