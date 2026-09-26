import { afterEach, describe, expect, it, jest } from '@jest/globals'

import { NodeCueCompiler } from '../../../../cues/node/compiler/NodeCueCompiler'
import { EffectCompiler } from '../../../../cues/node/compiler/EffectCompiler'
import { AudioNodeCue } from '../../../../cues/node/runtime/AudioNodeCue'
import { EffectRegistry } from '../../../../cues/node/runtime/EffectRegistry'
import type {
  ActionNode,
  AudioEffectDefinition,
  AudioEventExecutionPolicy,
  AudioEventNode,
  AudioEventNodeUnion,
  AudioLightingNodeCueDefinition,
  LogicNode,
  ValueSource,
  VariableDefinition,
} from '../../../../cues/types/nodeCueTypes'
import type { AudioCueData } from '../../../../cues/types/audioCueTypes'
import { DEFAULT_AUDIO_CONFIG } from '../../../../listeners/Audio/AudioConfig'
import { createSequencerHarness, type SequencerHarness } from '../../../helpers/sequencerHarness'

function setColor(id: string, color: ValueSource, waitUntil: 'beat' | 'none'): ActionNode {
  return {
    id,
    type: 'action',
    effectType: 'set-color',
    target: {
      groups: { source: 'literal', value: 'front' },
      filter: { source: 'literal', value: 'all' },
    },
    color: {
      name: color,
      brightness: { source: 'literal', value: 'high' },
    },
    timing: {
      waitForCondition: { source: 'literal', value: 'none' },
      waitForTime: { source: 'literal', value: 0 },
      duration: { source: 'literal', value: 100 },
      waitUntilCondition: { source: 'literal', value: waitUntil },
      waitUntilTime: { source: 'literal', value: 0 },
    },
    layer: { source: 'literal', value: 1 },
  }
}

/** Sets `shade` from `nextShade` and `nextShade` to green, so the first run reads red. */
const pick: LogicNode = {
  id: 'pick',
  type: 'logic',
  logicType: 'variable',
  mode: 'set',
  varName: 'shade',
  valueType: 'color',
  assignments: [
    { varName: 'shade', valueType: 'color', value: { source: 'variable', name: 'nextShade' } },
    { varName: 'nextShade', valueType: 'color', value: { source: 'literal', value: 'green' } },
  ],
}

const shadeVariables: VariableDefinition[] = [
  { name: 'shade', type: 'color', scope: 'cue', initialValue: 'red' },
  { name: 'nextShade', type: 'color', scope: 'cue', initialValue: 'red' },
]

const calledWith = (policy: AudioEventExecutionPolicy): AudioEventNode => ({
  id: 'called',
  type: 'event',
  eventType: 'cue-called',
  triggerMode: 'edge',
  executionPolicy: policy,
})

/**
 * A cue-called graph that holds on a beat-gated set-color, then counts through a logic node into a
 * set-color that submits without waiting, so each run that gets past the beat submits `after` once.
 * The first run holds on red and every later run holds on green.
 */
function beatHeldCue(policy: AudioEventExecutionPolicy | undefined): AudioNodeCue {
  const counter: LogicNode = {
    id: 'count',
    type: 'logic',
    logicType: 'variable',
    mode: 'set',
    varName: 'runs',
    valueType: 'number',
    value: { source: 'literal', value: 1 },
  }
  const definition: AudioLightingNodeCueDefinition = {
    kind: 'lighting',
    id: 'held',
    cueTypeId: 'held',
    name: 'Beat held',
    style: 'secondary',
    variables: [{ name: 'runs', type: 'number', scope: 'cue', initialValue: 0 }, ...shadeVariables],
    nodes: {
      events: [
        {
          id: 'called',
          type: 'event',
          eventType: 'cue-called',
          triggerMode: 'edge',
          threshold: 0.5,
          ...(policy && { executionPolicy: policy }),
        },
      ],
      actions: [
        setColor('hold', { source: 'variable', name: 'shade' }, 'beat'),
        setColor('after', { source: 'literal', value: 'blue' }, 'none'),
      ],
      logic: [pick, counter],
    },
    connections: [
      { from: 'called', to: 'pick' },
      { from: 'pick', to: 'hold' },
      { from: 'hold', to: 'count' },
      { from: 'count', to: 'after' },
    ],
    layout: { nodePositions: {} },
  }
  return new AudioNodeCue('g', NodeCueCompiler.compileCue<AudioEventNodeUnion>(definition, 'audio'))
}

/** A graph that fades the front lights to red on layer 1 and holds until a beat. */
function heldRedCue(event: AudioEventNode): AudioNodeCue {
  const definition: AudioLightingNodeCueDefinition = {
    kind: 'lighting',
    id: 'held-red',
    cueTypeId: 'held-red',
    name: 'Held red',
    style: 'secondary',
    nodes: {
      events: [event],
      actions: [setColor('hold', { source: 'literal', value: 'red' }, 'beat')],
      logic: [],
    },
    connections: [{ from: event.id, to: 'hold' }],
    layout: { nodePositions: {} },
  }
  return new AudioNodeCue('g', NodeCueCompiler.compileCue<AudioEventNodeUnion>(definition, 'audio'))
}

/** An effect that fades the front lights to its `shade` parameter and holds until a beat. */
const heldEffect: AudioEffectDefinition = {
  id: 'held-effect',
  mode: 'audio',
  name: 'Held effect',
  variables: [
    { name: 'shade', type: 'color', scope: 'cue', initialValue: 'red', isParameter: true },
  ],
  nodes: {
    events: [],
    actions: [setColor('effect-hold', { source: 'variable', name: 'shade' }, 'beat')],
    effectListeners: [{ id: 'effect-start', type: 'effect-listener' }],
  },
  connections: [{ from: 'effect-start', to: 'effect-hold' }],
}

/**
 * A graph whose raiser holds each run on {@link heldEffect}, since a node follows it. The first
 * run raises red and every later run raises green.
 */
function raiserHeldCue(event: AudioEventNode): AudioNodeCue {
  const definition: AudioLightingNodeCueDefinition = {
    kind: 'lighting',
    id: 'raiser-held',
    cueTypeId: 'raiser-held',
    name: 'Raiser held',
    style: 'secondary',
    variables: [
      { name: 'raised', type: 'number', scope: 'cue', initialValue: 0 },
      ...shadeVariables,
    ],
    nodes: {
      events: [event],
      actions: [],
      logic: [
        pick,
        {
          id: 'after',
          type: 'logic',
          logicType: 'variable',
          mode: 'set',
          varName: 'raised',
          valueType: 'number',
          value: { source: 'literal', value: 1 },
        },
      ],
      effectRaisers: [
        {
          id: 'raise',
          type: 'effect-raiser',
          effectId: heldEffect.id,
          parameterValues: { shade: { source: 'variable', name: 'shade' } },
        },
      ],
    },
    connections: [
      { from: event.id, to: 'pick' },
      { from: 'pick', to: 'raise' },
      { from: 'raise', to: 'after' },
    ],
    layout: { nodePositions: {} },
  }
  const effects = new EffectRegistry()
  effects.registerEffect(heldEffect.id, EffectCompiler.compile(heldEffect))
  return new AudioNodeCue(
    'g',
    NodeCueCompiler.compileCue<AudioEventNodeUnion>(definition, 'audio'),
    effects,
  )
}

const frameData = (energy = 0.5): AudioCueData => ({
  timestamp: 0,
  executionCount: 1,
  audioData: { timestamp: 0, overallLevel: 0.5, bpm: 120, beatDetected: false, energy },
  config: DEFAULT_AUDIO_CONFIG,
  enabledBandCount: 8,
})

describe('audio cue-called execution policy', () => {
  let h: SequencerHarness | null = null
  let cue: AudioNodeCue | null = null

  afterEach(() => {
    cue?.onStop()
    h?.cleanup()
    cue = null
    h = null
    jest.restoreAllMocks()
  })

  /** Run 60 frames with no beat, then a beat, and count the submissions of each action. */
  async function sixtyFramesThenABeat(
    policy: AudioEventExecutionPolicy | undefined,
  ): Promise<{ holdBeforeBeat: number; afterOnBeat: number; holdOnBeat: number }> {
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    cue = beatHeldCue(policy)
    h = createSequencerHarness({ frontCount: 4, backCount: 0 })
    const harness = h
    const held = jest.spyOn(harness.sequencer, 'addEffectUnblockedNameWithCallback')
    const takenOver = jest.spyOn(harness.sequencer, 'updateEffectWithCallback')
    const plain = jest.spyOn(harness.sequencer, 'addEffect')
    const count = (spy: typeof held | typeof takenOver | typeof plain, node: string): number =>
      spy.mock.calls.filter((call) => String(call[0]).endsWith(`:${node}`)).length
    const holds = (): number => count(held, 'hold') + count(takenOver, 'hold')
    for (let i = 0; i < 60; i++) {
      await cue.execute(frameData(), harness.sequencer, harness.lightManager)
      harness.advanceBy(10)
      harness.advanceBy(10)
    }
    const holdBeforeBeat = holds()
    harness.sequencer.onBeat()
    harness.advanceBy(10)
    harness.advanceBy(10)
    return {
      holdBeforeBeat,
      afterOnBeat: count(plain, 'after'),
      holdOnBeat: holds() - holdBeforeBeat,
    }
  }

  it('continuous parks a run per frame and releases them all on the beat', async () => {
    const result = await sixtyFramesThenABeat(undefined)
    expect(result.holdBeforeBeat).toBe(60)
    expect(result.afterOnBeat).toBeGreaterThan(1)
  })

  it('ignore-while-running holds one run until the beat and drops the frames in between', async () => {
    const result = await sixtyFramesThenABeat('ignore-while-running')
    expect(result.holdBeforeBeat).toBe(1)
    expect(result.afterOnBeat).toBe(1)
    expect(result.holdOnBeat).toBe(0)
  })

  it('latest-pending starts one waiting run as soon as the held run finishes', async () => {
    const result = await sixtyFramesThenABeat('latest-pending')
    expect(result.holdBeforeBeat).toBe(1)
    expect(result.afterOnBeat).toBe(1)
    expect(result.holdOnBeat).toBe(1)
  })

  it('restart cancels the run in flight on every frame, so only the newest reaches the beat', async () => {
    const result = await sixtyFramesThenABeat('restart')
    expect(result.holdBeforeBeat).toBe(60)
    expect(result.afterOnBeat).toBe(1)
  })

  it('restart replaces the held effect with the one the newest run submits', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    cue = beatHeldCue('restart')
    h = createSequencerHarness({ frontCount: 4, backCount: 0 })
    const harness = h
    const front = (): { red: number; green: number } => {
      const state = harness.getLightState(harness.frontLightIds[0])
      return { red: state?.red ?? 0, green: state?.green ?? 0 }
    }

    await cue.execute(frameData(), harness.sequencer, harness.lightManager)
    harness.advanceBy(120)
    expect(front()).toEqual({ red: 255, green: 0 })

    await cue.execute(frameData(), harness.sequencer, harness.lightManager)
    const crossfade: number[] = []
    for (let tick = 0; tick < 12; tick++) {
      harness.advanceBy(10)
      crossfade.push(front().red + front().green)
    }
    expect(Math.min(...crossfade)).toBeGreaterThanOrEqual(250)
    expect(front()).toEqual({ red: 0, green: 255 })
  })

  it('restart raises the effect the run was held on afresh', async () => {
    cue = raiserHeldCue(calledWith('restart'))
    h = createSequencerHarness({ frontCount: 4, backCount: 0 })
    const harness = h
    const front = (): { red: number; green: number } => {
      const state = harness.getLightState(harness.frontLightIds[0])
      return { red: state?.red ?? 0, green: state?.green ?? 0 }
    }

    await cue.execute(frameData(), harness.sequencer, harness.lightManager)
    harness.advanceBy(120)
    expect(front()).toEqual({ red: 255, green: 0 })

    await cue.execute(frameData(), harness.sequencer, harness.lightManager)
    const crossfade: number[] = []
    for (let tick = 0; tick < 12; tick++) {
      harness.advanceBy(10)
      crossfade.push(front().red + front().green)
    }
    expect(Math.min(...crossfade)).toBeGreaterThanOrEqual(250)
    expect(front()).toEqual({ red: 0, green: 255 })
  })

  /** The front light's red after each 20 ms audio frame, one frame per entry of `energies`. */
  async function redPerFrame(held: AudioNodeCue, energies: number[]): Promise<number[]> {
    cue = held
    h = createSequencerHarness({ frontCount: 4, backCount: 0 })
    const reds: number[] = []
    for (const energy of energies) {
      await held.execute(frameData(energy), h.sequencer, h.lightManager)
      h.advanceBy(10)
      h.advanceBy(10)
      reds.push(h.getLightState(h.frontLightIds[0])?.red ?? 0)
    }
    return reds
  }

  const risesWithoutFalling = (reds: number[]): boolean =>
    reds.every((red, index) => index === 0 || red >= reds[index - 1])

  it('restart on every frame carries the fade in flight up to full', async () => {
    const reds = await redPerFrame(
      heldRedCue(calledWith('restart')),
      Array.from({ length: 20 }, () => 0.5),
    )

    expect(reds[6]).toBe(255)
    expect(risesWithoutFalling(reds)).toBe(true)
  })

  it('restart on an edge every third frame never drops the look it is showing', async () => {
    const reds = await redPerFrame(
      heldRedCue({
        id: 'loud',
        type: 'event',
        eventType: 'audio-energy',
        triggerMode: 'edge',
        threshold: 0.5,
        executionPolicy: 'restart',
      }),
      Array.from({ length: 20 }, (_, frame) => (frame % 3 === 0 ? 0.8 : 0)),
    )

    expect(reds[6]).toBe(255)
    expect(risesWithoutFalling(reds)).toBe(true)
  })
})
