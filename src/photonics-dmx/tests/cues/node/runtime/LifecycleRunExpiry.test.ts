import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'

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
      { name: 'until', type: 'string', scope: 'cue', initialValue: 'keyframe' },
      { name: 'nextUntil', type: 'string', scope: 'cue', initialValue: 'keyframe' },
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

const wait = (id: string, ms: number): LogicNode => ({
  id,
  type: 'logic',
  logicType: 'delay',
  delayTime: { source: 'literal', value: ms },
})

/** Reads the venue size into `venue` and takes the true port for a large venue. */
const venueLogic: LogicNode[] = [
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
]

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
    logic: venueLogic,
  },
  [
    { from: 'called', to: 'hold' },
    { from: 'beat', to: 'hold' },
    { from: 'hold', to: 'venue' },
    { from: 'venue', to: 'large' },
    { from: 'large', to: 'mark', fromPort: 'true' },
  ],
)

/**
 * {@link waitsForKeyframe} on layer 1 with a 50 ms delay before the paint. With `untilVariable`
 * the first run's paint waits for a keyframe and every later run's paint does not wait at all.
 */
function delaysThenWaits(untilVariable = false): NetNodeCueDefinition {
  const held = paint('paint', 'front', shade, 'keyframe')
  const pickUntil: LogicNode = {
    id: 'pick-until',
    type: 'logic',
    logicType: 'variable',
    mode: 'set',
    varName: 'until',
    valueType: 'string',
    assignments: [
      { varName: 'until', valueType: 'string', value: { source: 'variable', name: 'nextUntil' } },
      { varName: 'nextUntil', valueType: 'string', value: { source: 'literal', value: 'none' } },
    ],
  }
  return cueDefinition(
    {
      events: [{ id: 'called', type: 'event', eventType: 'cue-called' }],
      actions: [
        untilVariable
          ? {
              ...held,
              timing: { ...held.timing, waitUntilCondition: { source: 'variable', name: 'until' } },
            }
          : held,
      ],
      logic: [pickShade, pickUntil, wait('wait', 50)],
    },
    [
      { from: 'called', to: 'pick' },
      { from: 'pick', to: 'pick-until' },
      { from: 'pick-until', to: 'wait' },
      { from: 'wait', to: 'paint' },
    ],
  )
}

/** Paints red and waits for a keyframe on a frame from a large venue, otherwise waits 100 ms. */
const paintsForLargeVenues: NetNodeCueDefinition = cueDefinition(
  {
    events: [{ id: 'called', type: 'event', eventType: 'cue-called' }],
    actions: [paint('paint', 'front', { source: 'literal', value: 'red' }, 'keyframe')],
    logic: [...venueLogic, wait('wait', 100)],
  },
  [
    { from: 'called', to: 'venue' },
    { from: 'venue', to: 'large' },
    { from: 'large', to: 'paint', fromPort: 'true' },
    { from: 'large', to: 'wait', fromPort: 'false' },
  ],
)

const frame = { beat: 'Off', strobeState: 'Strobe_Off' } as CueData

describe('a lifecycle run that never completes', () => {
  let h: SequencerHarness | null = null
  let cue: LightingNodeCue | null = null

  beforeEach(() => {
    jest.useFakeTimers({
      doNotFake: ['queueMicrotask', 'Date', 'performance', 'nextTick', 'setImmediate'],
    })
  })

  afterEach(() => {
    cue?.onStop()
    h?.cleanup()
    cue = null
    h = null
    jest.restoreAllMocks()
    jest.useRealTimers()
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
      jest.advanceTimersByTime(10)
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

  it.each([
    ['a paint that waits', false],
    ['a paint that does not wait', true],
  ])(
    'keeps the look the expired run left through the delay before %s takes it over',
    (_, untilVariable) => {
      const harness = start(delaysThenWaits(untilVariable))

      send()
      expect(frontShown(harness, 20).at(-1)).toBe(255)
      harness.advanceBy(LIFECYCLE_RUN_EXPIRY_MS)
      send()
      expect(Math.min(...frontShown(harness, 15))).toBeGreaterThanOrEqual(250)
      expect(harness.getLightState(harness.frontLightIds[0])?.blue).toBe(255)
    },
  )

  it('keeps the look the expired run left until the newest run ends without it', () => {
    const harness = start(paintsForLargeVenues)

    send({ ...frame, venueSize: 'Large' } as CueData)
    harness.advanceBy(200)
    harness.advanceBy(LIFECYCLE_RUN_EXPIRY_MS)
    send({ ...frame, venueSize: 'Small' } as CueData)
    expect(Math.min(...frontShown(harness, 9))).toBe(255)
    expect(frontShown(harness, 5).at(-1)).toBe(0)
  })
})
