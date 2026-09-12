# Photonics DMX Tests

This directory contains the core photonics-dmx test suite. Tests also live alongside the code they
cover elsewhere in the tree: `src/main/tests/` (controllers, IPC handlers, tooling),
`src/services/configuration/tests/` (ConfigurationManager, ConfigFile, migrations),
`src/photonics-dmx/helpers/` (colocated helper tests), `src/preload/`, and throughout
`src/renderer/`.

`jest.config.js` takes `src` as its root and picks up any `.test.ts`/`.tsx` or `.spec` file under
it, so a new test needs no registration. `jest.setup.ts` in this directory runs before each suite.
Coverage is collected over all of `src/**`, tested or not, so the headline percentage reflects the
whole source rather than only the files a test happens to import.

## Test Layout

| Location       | Scope                                                                                                                                                |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `controllers/` | Sequencer, EffectManager, LayerManager, LightTransitionController, TransitionEngine, Clock, DmxPublisher, ChainFanout, RigChain, blending and motion |
| `cues/`        | Cue registries and selection, cue lifecycle, and the node system under `node/` (compiler, loader, runtime, utils)                                    |
| `cueHandlers/` | CueHandler, CompositeCueRuntime, Rb3MenuCueHandler                                                                                                   |
| `effects/`     | The programmatic effect builders in `effects/`                                                                                                       |
| `audio/`       | Beat detection, chroma and mel band analysis, key detection, spectral features                                                                       |
| `senders/`     | IpcSender, ArtNetSender, SacnSender, EnttecProSender, OpenDmxSender, usleep                                                                          |
| `listeners/`   | YARG and RB3E network listeners, and both packet parsers                                                                                             |
| `processors/`  | ProcessorManager, the RB3 direct, cue and game modes, and the audio processor                                                                        |
| `constants/`   | Cue data property metadata                                                                                                                           |
| `integration/` | End-to-end sequencer behaviour, RB3 lighting, venue post-processing, motion                                                                          |
| `sim/`         | The headless cue simulator and its golden comparisons                                                                                                |
| `goldens/`     | Golden cue cases and their fixture JSON                                                                                                              |
| `helpers/`     | Shared harnesses and fixtures                                                                                                                        |

`helpers/sequencerHarness.ts` provides an integration test harness for spinning up a Sequencer with
mock components (`createSequencerHarness`, `ManualTestClock`). Use it when testing cue dispatch,
effect lifecycle, or layer behaviour. Alongside it, `testFixtures.ts` and `multiRigFixtures.ts` build
light rigs, `effectRegistry.ts` seeds a registry, and `rb3CueFile.ts` and `yargPacket.ts` build
inputs for the two net domains.

## Running Tests

```bash
# Run all tests
npm test

# Watch mode (re-run on file changes)
npm run test:watch

# With coverage
npm run test:coverage

# Headless cue simulation
npm run sim
```

## Colour Blending

Layer blending is covered at two levels.

`controllers/lightBlending.test.ts` drives the maths directly: `blendWithOpacity` for each blend
mode, `interpolate` and `interpolateFloat`, and the easing curves. Anything about how two layers
combine is provable here without running a sequencer.

`controllers/ColorBlendingAnalysis.ts`, with its accompanying test, walks a blend step by step and
prints the calculation. Reach for it when a result is surprising and the question is which layer or
which opacity produced it.

Worked examples of each blend mode, with the arithmetic, are in the
[core README](../README.md#blend-mode-examples).

### Blend Modes

- **replace**: Overwrites lower layer colours (default). Opacity scales the replacing colour
- **add**: Adds to lower layer colours (good for additive blending)
- **mix**: Alpha-crossfades between the lower layers and this layer by opacity

An unrecognised mode falls through to `replace`.

### Key Behaviours to Validate

1. **Opacity values**: 0.0 is transparent, 1.0 is fully opaque
2. **Layer order**: Higher layers blend on top of lower layers
3. **Blend modes**: Each mode has distinct blending behaviour

For additive blending, blue (R:0, G:0, B:100) plus green (R:0, G:100, B:0) with `blendMode: 'add'`
and full opacity on both gives cyan (R:0, G:100, B:100).
