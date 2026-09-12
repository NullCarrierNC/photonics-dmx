# Effects

Legacy programmatic effect builders, left over from the cue handling that predates the node engine.
An effect is a group of one or more transitions (timed changes to light state) applied to one or
more lights. A builder returns an `Effect` object the sequencer can run.

Cues are authored as node graphs, not here. See [../cues/node/README.md](../cues/node/README.md) for
the system that compiles and runs them.

`getEffectSingleColor` is the only builder still called, from
[`cueHandlers/Rb3MenuCueHandler.ts`](../cueHandlers/Rb3MenuCueHandler.ts) and
[`processors/AudioCueProcessor.ts`](../processors/AudioCueProcessor.ts). The other exports in
`index.ts` reach no cue and are on their way out, so they are not documented here.

## Base Interface

Effect params extend `IEffect`:

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

A builder returns an `Effect` with an `id`, a `description`, and a `transitions` array that defines
how the effect behaves over time.

## Single Color (`getEffectSingleColor`)

Sets all specified lights to a single colour.

```typescript
interface SingleColorEffectParams extends IEffect {
  /** The colour to set the lights to */
  color: RGBIO
  /** Duration of the effect */
  duration: number
}
```

```typescript
const effect = getEffectSingleColor({
  lights: ['light1', 'light2'],
  color: { red: 255, green: 0, blue: 0, intensity: 255, opacity: 1.0, blendMode: 'replace' },
  duration: 1000,
  easing: EasingType.SIN_OUT,
})
```
