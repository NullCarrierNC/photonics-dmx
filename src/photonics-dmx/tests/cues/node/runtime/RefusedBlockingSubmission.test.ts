import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { NodeExecutionEngine } from '../../../../cues/node/runtime/NodeExecutionEngine'
import {
  NodeCueCompiler,
  type CompiledNetCue,
} from '../../../../cues/node/compiler/NodeCueCompiler'
import { EffectRegistry } from '../../../../cues/node/runtime/EffectRegistry'
import type {
  ActionNode,
  NetEventNode,
  NetNodeCueDefinition,
} from '../../../../cues/types/nodeCueTypes'
import { CueType, defaultCueData, type CueData } from '../../../../cues/types/cueTypes'
import { createSequencerHarness, type SequencerHarness } from '../../../helpers/sequencerHarness'
import { noopRuntimeBroadcaster } from '../../../../runtime/broadcaster'

const setColor = (
  id: string,
  group: string,
  color: string,
  waitUntil: { condition: string; ms: number },
): ActionNode => ({
  id,
  type: 'action',
  effectType: 'set-color',
  target: {
    groups: { source: 'literal', value: group },
    filter: { source: 'literal', value: 'all' },
  },
  color: {
    name: { source: 'literal', value: color },
    brightness: { source: 'literal', value: 'high' },
    blendMode: { source: 'literal', value: 'replace' },
  },
  layer: { source: 'literal', value: 101 },
  timing: {
    waitForCondition: { source: 'literal', value: 'none' },
    waitForTime: { source: 'literal', value: 0 },
    duration: { source: 'literal', value: 0 },
    waitUntilCondition: { source: 'literal', value: waitUntil.condition },
    waitUntilTime: { source: 'literal', value: waitUntil.ms },
  },
})

const beat: NetEventNode = { id: 'ev', type: 'event', eventType: 'beat' }
const frame = (): CueData => ({ ...defaultCueData, beat: 'Strong' })

describe('a blocking action triggered again while its run holds the name', () => {
  let h: SequencerHarness
  let engine: NodeExecutionEngine

  beforeEach(() => {
    h = createSequencerHarness({ frontCount: 2, backCount: 2 })
    const definition = {
      id: 'drum-flash',
      name: 'Drum Flash',
      kind: 'lighting',
      cueType: CueType.Dischord,
      style: 'primary',
      nodes: {
        events: [beat],
        actions: [
          setColor('flash', 'front', 'red', { condition: 'delay', ms: 120 }),
          setColor('after', 'back', 'blue', { condition: 'none', ms: 0 }),
        ],
        logic: [],
      },
      connections: [
        { from: 'ev', to: 'flash' },
        { from: 'flash', to: 'after' },
      ],
    } as unknown as NetNodeCueDefinition
    engine = new NodeExecutionEngine(
      NodeCueCompiler.compileCue(definition, 'yarg') as CompiledNetCue,
      'test-group:drum-flash',
      h.sequencer,
      h.lightManager,
      noopRuntimeBroadcaster(),
      new Map(),
      new Map(),
      new EffectRegistry(),
    )
  })

  afterEach(() => h.cleanup())

  /** Advance in frame-sized ticks, so an effect submitted during one tick is drawn by the next. */
  const advance = (ms: number): void => {
    for (let elapsed = 0; elapsed < ms; elapsed += 10) h.advanceBy(10)
  }
  const frontLit = (): boolean =>
    h.frontLightIds.some((id) => (h.getLightState(id)?.intensity ?? 0) > 0)

  it('runs the nodes after it once the running flash ends', () => {
    const addEffect = jest.spyOn(h.sequencer, 'addEffect')
    const afterSubmissions = (): number =>
      addEffect.mock.calls.filter(([name]) => name.endsWith(':after')).length

    engine.startExecution(beat, frame())
    advance(20)
    engine.startExecution(beat, frame())
    advance(20)
    expect(afterSubmissions()).toBe(0)

    advance(200)
    expect(afterSubmissions()).toBe(2)
  })

  it('still takes the running flash off when the cue is cancelled', () => {
    engine.startExecution(beat, frame())
    advance(20)
    engine.startExecution(beat, frame())
    advance(10)
    expect(frontLit()).toBe(true)

    engine.cancelAll(false)
    advance(10)
    expect(frontLit()).toBe(false)
  })
})
