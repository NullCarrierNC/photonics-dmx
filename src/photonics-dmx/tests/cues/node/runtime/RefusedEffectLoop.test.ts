import { afterEach, describe, expect, it, jest } from '@jest/globals'
import { EffectExecutionEngine } from '../../../../cues/node/runtime/EffectExecutionEngine'
import { EffectCompiler } from '../../../../cues/node/compiler/EffectCompiler'
import type {
  ActionNode,
  ValueSource,
  YargEffectDefinition,
} from '../../../../cues/types/nodeCueTypes'
import { defaultCueData } from '../../../../cues/types/cueTypes'
import { createSequencerHarness, type SequencerHarness } from '../../../helpers/sequencerHarness'
import { noopRuntimeBroadcaster } from '../../../../runtime/broadcaster'

const lit = (value: string | number): ValueSource => ({ source: 'literal', value })

const action = (id: string, color: string): ActionNode => ({
  id,
  type: 'action',
  effectType: 'set-color',
  target: { groups: lit('front'), filter: lit('all') },
  color: { name: lit(color), brightness: lit('high'), blendMode: lit('replace') },
  layer: lit(1),
  timing: {
    waitForCondition: lit('none'),
    waitForTime: lit(0),
    duration: lit(50),
    waitUntilCondition: lit('delay'),
    waitUntilTime: lit(100),
  },
})

/** Two blocking actions that run each other forever, paced only by their own waits. */
const loopingEffect = {
  id: 'loop-effect',
  mode: 'yarg',
  name: 'loop',
  description: '',
  connections: [
    { from: 'listener-1', to: 'a1' },
    { from: 'a1', to: 'a2' },
    { from: 'a2', to: 'a1' },
  ],
  layout: { nodePositions: {} },
  nodes: {
    events: [],
    actions: [action('a1', 'red'), action('a2', 'blue')],
    logic: [],
    eventRaisers: [],
    eventListeners: [],
    effectListeners: [
      { id: 'listener-1', type: 'effect-listener', label: 'Entry', outputs: ['a1'] },
    ],
  },
} as unknown as YargEffectDefinition

describe('an effect action loop the sequencer refuses', () => {
  let h: SequencerHarness | null = null

  afterEach(() => {
    h?.cleanup()
    h = null
    jest.useRealTimers()
  })

  it('advances one step per timer tick through a timed blackout', () => {
    jest.useFakeTimers()
    h = createSequencerHarness({ frontCount: 2, backCount: 0 })
    let submissions = 0
    const submit = h.sequencer.addEffectUnblockedNameWithCallback.bind(h.sequencer)
    h.sequencer.addEffectUnblockedNameWithCallback = ((...args: Parameters<typeof submit>) => {
      submissions++
      return submit(...args)
    }) as typeof submit
    void h.sequencer.blackout(500)
    const engine = new EffectExecutionEngine(
      EffectCompiler.compile(loopingEffect as never),
      h.sequencer,
      h.lightManager,
      noopRuntimeBroadcaster(),
      {},
      { ...defaultCueData },
      { callerMode: 'yarg' },
    )

    try {
      engine.triggerEffect({ ...defaultCueData })
      expect(submissions).toBe(1)
      jest.advanceTimersByTime(0)
      expect(submissions).toBe(2)
    } finally {
      engine.cancelAll()
    }
  })
})
