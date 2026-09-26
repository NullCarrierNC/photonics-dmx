import { afterEach, describe, expect, it, jest } from '@jest/globals'

import { NodeCueCompiler } from '../../../../cues/node/compiler/NodeCueCompiler'
import { EffectCompiler } from '../../../../cues/node/compiler/EffectCompiler'
import { LightingNodeCue } from '../../../../cues/node/runtime/LightingNodeCue'
import { EffectRegistry } from '../../../../cues/node/runtime/EffectRegistry'
import { LIFECYCLE_RUN_EXPIRY_MS } from '../../../../cues/node/runtime/GraphExecutionEngine'
import { CueType, type CueData } from '../../../../cues/types/cueTypes'
import type {
  ActionNode,
  LogicNode,
  NetNodeCueDefinition,
  ValueSource,
  YargEffectDefinition,
} from '../../../../cues/types/nodeCueTypes'
import { createSequencerHarness, type SequencerHarness } from '../../../helpers/sequencerHarness'

/** A set-color that fades over 100 ms and then holds until `waitUntil`, or not at all. */
function paint(
  id: string,
  group: 'front' | 'back',
  color: ValueSource,
  waitUntil: 'keyframe' | 'none',
  layer = 1,
): ActionNode {
  return {
    id,
    type: 'action',
    effectType: 'set-color',
    target: {
      groups: { source: 'literal', value: group },
      filter: { source: 'literal', value: 'all' },
    },
    color: { name: color, brightness: { source: 'literal', value: 'high' } },
    timing: {
      waitForCondition: { source: 'literal', value: 'none' },
      waitForTime: { source: 'literal', value: 0 },
      duration: { source: 'literal', value: 100 },
      waitUntilCondition: { source: 'literal', value: waitUntil },
      waitUntilTime: { source: 'literal', value: 0 },
    },
    layer: { source: 'literal', value: layer },
  }
}

/** Sets `shade` from `nextShade` and `nextShade` to blue, so the first run reads red. */
const pickShade: LogicNode = {
  id: 'pick',
  type: 'logic',
  logicType: 'variable',
  mode: 'set',
  varName: 'shade',
  valueType: 'color',
  assignments: [
    { varName: 'shade', valueType: 'color', value: { source: 'variable', name: 'nextShade' } },
    { varName: 'nextShade', valueType: 'color', value: { source: 'literal', value: 'blue' } },
  ],
}

const shade: ValueSource = { source: 'variable', name: 'shade' }

function cueDefinition(
  nodes: NetNodeCueDefinition['nodes'],
  connections: NetNodeCueDefinition['connections'],
): NetNodeCueDefinition {
  return {
    id: 'waits',
    name: 'Waits for a keyframe',
    kind: 'lighting',
    cueType: CueType.Default,
    style: 'secondary',
    variables: [
      { name: 'shade', type: 'color', scope: 'cue', initialValue: 'red' },
      { name: 'nextShade', type: 'color', scope: 'cue', initialValue: 'red' },
      { name: 'venue', type: 'string', scope: 'cue', initialValue: '' },
    ],
    nodes,
    connections,
  }
}

/**
 * A cue-called graph that paints on `layer` and then waits for a keyframe the frames never carry.
 * The first run paints red and every later run paints blue.
 */
function waitsForKeyframe(layer = 0): NetNodeCueDefinition {
  return cueDefinition(
    {
      events: [{ id: 'called', type: 'event', eventType: 'cue-called' }],
      actions: [paint('paint', 'front', shade, 'keyframe', layer)],
      logic: [pickShade],
    },
    [
      { from: 'called', to: 'pick' },
      { from: 'pick', to: 'paint' },
    ],
  )
}

/** An effect that paints the front lights its `shade` parameter and waits for a keyframe. */
const paintEffect: YargEffectDefinition = {
  id: 'paint-effect',
  mode: 'yarg',
  name: 'Paint and wait',
  variables: [
    { name: 'shade', type: 'color', scope: 'cue', initialValue: 'red', isParameter: true },
  ],
  nodes: {
    events: [],
    actions: [paint('effect-paint', 'front', shade, 'keyframe')],
    effectListeners: [{ id: 'effect-start', type: 'effect-listener' }],
  },
  connections: [{ from: 'effect-start', to: 'effect-paint' }],
}

/**
 * A cue-called graph whose raiser holds the run on {@link paintEffect}, since a node follows it.
 * The first run raises red and every later run raises blue.
 */
const raisesAndWaits: NetNodeCueDefinition = cueDefinition(
  {
    events: [{ id: 'called', type: 'event', eventType: 'cue-called' }],
    actions: [paint('after', 'back', { source: 'literal', value: 'green' }, 'none')],
    logic: [pickShade],
    effectRaisers: [
      {
        id: 'raise',
        type: 'effect-raiser',
        effectId: paintEffect.id,
        parameterValues: { shade },
      },
    ],
  },
  [
    { from: 'called', to: 'pick' },
    { from: 'pick', to: 'raise' },
    { from: 'raise', to: 'after' },
  ],
)

/**
 * One keyframe-held red on the front lights, reached from cue-called and from beat. A run that
 * gets past it on a frame from a large venue paints the back lights green.
 */
const sharedHold: NetNodeCueDefinition = cueDefinition(
  {
    events: [
      { id: 'called', type: 'event', eventType: 'cue-called' },
      { id: 'beat', type: 'event', eventType: 'beat' },
    ],
    actions: [
      paint('hold', 'front', { source: 'literal', value: 'red' }, 'keyframe'),
      paint('mark', 'back', { source: 'literal', value: 'green' }, 'none'),
    ],
    logic: [
      {
        id: 'venue',
        type: 'logic',
        logicType: 'cue-data',
        dataProperty: 'venue-size',
        assignTo: 'venue',
      },
      {
        id: 'large',
        type: 'logic',
        logicType: 'conditional',
        comparator: '==',
        left: { source: 'variable', name: 'venue' },
        right: { source: 'literal', value: 'Large' },
      },
    ],
  },
  [
    { from: 'called', to: 'hold' },
    { from: 'beat', to: 'hold' },
    { from: 'hold', to: 'venue' },
    { from: 'venue', to: 'large' },
    { from: 'large', to: 'mark', fromPort: 'true' },
  ],
)

const frame = { beat: 'Off', strobeState: 'Strobe_Off' } as CueData

describe('a lifecycle run that never completes', () => {
  let h: SequencerHarness | null = null
  let cue: LightingNodeCue | null = null

  afterEach(() => {
    cue?.onStop()
    h?.cleanup()
    cue = null
    h = null
    jest.restoreAllMocks()
  })

  function start(
    definition: NetNodeCueDefinition,
    effects = new EffectRegistry(),
  ): SequencerHarness {
    h = createSequencerHarness({ frontCount: 4, backCount: 4 })
    cue = new LightingNodeCue('g', NodeCueCompiler.compileCue(definition, 'yarg'), effects, {
      emit: () => {},
    })
    return h
  }

  function send(data: CueData = frame): void {
    if (!cue || !h) throw new Error('no cue running')
    cue.execute(data, h.sequencer, h.lightManager)
  }

  /** Red plus blue on the first front light after each 10 ms, for `ticks` ticks. */
  function frontShown(harness: SequencerHarness, ticks: number): number[] {
    const shown: number[] = []
    for (let tick = 0; tick < ticks; tick++) {
      harness.advanceBy(10)
      const state = harness.getLightState(harness.frontLightIds[0])
      shown.push((state?.red ?? 0) + (state?.blue ?? 0))
    }
    return shown
  }

  it('holds later frames back until it expires, then paints the newest frame', () => {
    const harness = start(waitsForKeyframe())
    const front = (): { red: number; blue: number } => {
      const state = harness.getLightState(harness.frontLightIds[0])
      return { red: state?.red ?? 0, blue: state?.blue ?? 0 }
    }

    send()
    for (let elapsed = 0; elapsed < LIFECYCLE_RUN_EXPIRY_MS - 1000; elapsed += 1000) {
      harness.advanceBy(1000)
      send()
    }
    harness.advanceBy(200)
    expect(front()).toEqual({ red: 255, blue: 0 })

    harness.advanceBy(1800)
    send()
    harness.advanceBy(200)
    expect(front()).toEqual({ red: 0, blue: 255 })
  })

  it('fades the newest frame in from the look the expired run left showing', () => {
    const harness = start(waitsForKeyframe(1))

    send()
    harness.advanceBy(200)
    harness.advanceBy(LIFECYCLE_RUN_EXPIRY_MS)
    expect(frontShown(harness, 1)[0]).toBe(255)

    send()
    expect(Math.min(...frontShown(harness, 12))).toBeGreaterThanOrEqual(250)
    expect(harness.getLightState(harness.frontLightIds[0])?.blue).toBe(255)
  })

  it('raises the effect it was held on afresh for the newest frame', () => {
    const effects = new EffectRegistry()
    effects.registerEffect(paintEffect.id, EffectCompiler.compile(paintEffect))
    const harness = start(raisesAndWaits, effects)

    send()
    harness.advanceBy(200)
    harness.advanceBy(LIFECYCLE_RUN_EXPIRY_MS)
    expect(harness.getLightState(harness.frontLightIds[0])?.red).toBe(255)

    send()
    expect(Math.min(...frontShown(harness, 12))).toBeGreaterThanOrEqual(250)
    expect(harness.getLightState(harness.frontLightIds[0])?.blue).toBe(255)
  })

  it.each([
    ['the run it parked on', [{ beat: 'Strong', venueSize: 'Large' }]],
    [
      'a run parked on its effect',
      [{ venueSize: 'Small' }, { beat: 'Strong', venueSize: 'Large' }],
    ],
  ])('leaves a shared effect to %s, which goes on at the keyframe', (_, early) => {
    const harness = start(sharedHold)

    for (const data of early) send({ ...frame, ...data } as CueData)
    harness.advanceBy(200)
    harness.advanceBy(LIFECYCLE_RUN_EXPIRY_MS)
    send({ ...frame, venueSize: 'Small' } as CueData)
    harness.advanceBy(200)
    expect(harness.getLightState(harness.backLightIds[0])?.green ?? 0).toBe(0)

    harness.sequencer.onKeyframe()
    harness.advanceBy(200)
    expect(harness.getLightState(harness.backLightIds[0])?.green).toBe(255)
  })
})
