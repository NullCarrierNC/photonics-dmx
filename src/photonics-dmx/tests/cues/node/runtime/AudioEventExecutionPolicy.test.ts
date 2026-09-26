import { afterEach, describe, expect, it, jest } from '@jest/globals'

import { NodeCueCompiler } from '../../../../cues/node/compiler/NodeCueCompiler'
import { AudioNodeCue } from '../../../../cues/node/runtime/AudioNodeCue'
import type {
  ActionNode,
  AudioEventExecutionPolicy,
  AudioEventNodeUnion,
  AudioLightingNodeCueDefinition,
  LogicNode,
  ValueSource,
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
  const definition: AudioLightingNodeCueDefinition = {
    kind: 'lighting',
    id: 'held',
    cueTypeId: 'held',
    name: 'Beat held',
    style: 'secondary',
    variables: [
      { name: 'runs', type: 'number', scope: 'cue', initialValue: 0 },
      { name: 'shade', type: 'color', scope: 'cue', initialValue: 'red' },
      { name: 'nextShade', type: 'color', scope: 'cue', initialValue: 'red' },
    ],
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

const frameData = (): AudioCueData => ({
  timestamp: 0,
  executionCount: 1,
  audioData: { timestamp: 0, overallLevel: 0.5, bpm: 120, beatDetected: false, energy: 0.5 },
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

  /**
   * Run 60 frames with no beat, let the newest fade finish, then a beat, and count the submissions of
   * each action.
   */
  async function sixtyFramesThenABeat(
    policy: AudioEventExecutionPolicy | undefined,
  ): Promise<{ holdBeforeBeat: number; afterOnBeat: number; holdOnBeat: number }> {
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    cue = beatHeldCue(policy)
    h = createSequencerHarness({ frontCount: 4, backCount: 0 })
    const harness = h
    const held = jest.spyOn(harness.sequencer, 'addEffectUnblockedNameWithCallback')
    const plain = jest.spyOn(harness.sequencer, 'addEffect')
    const count = (spy: typeof held | typeof plain, node: string): number =>
      spy.mock.calls.filter((call) => String(call[0]).endsWith(`:${node}`)).length
    for (let i = 0; i < 60; i++) {
      await cue.execute(frameData(), harness.sequencer, harness.lightManager)
      harness.advanceBy(10)
      harness.advanceBy(10)
    }
    harness.advanceBy(200)
    const holdBeforeBeat = count(held, 'hold')
    harness.sequencer.onBeat()
    harness.advanceBy(10)
    harness.advanceBy(10)
    return {
      holdBeforeBeat,
      afterOnBeat: count(plain, 'after'),
      holdOnBeat: count(held, 'hold') - holdBeforeBeat,
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
    harness.advanceBy(200)
    expect(front()).toEqual({ red: 255, green: 0 })

    await cue.execute(frameData(), harness.sequencer, harness.lightManager)
    harness.advanceBy(200)
    expect(front()).toEqual({ red: 0, green: 255 })
  })
})
