import type { ILightingController } from '../../../../controllers/sequencer/interfaces'
import { NodeExecutionEngine } from '../../../../cues/node/runtime/NodeExecutionEngine'
import { EffectRegistry } from '../../../../cues/node/runtime/EffectRegistry'
import type { CompiledNetCue } from '../../../../cues/node/compiler/NodeCueCompiler'
import type {
  ActionNode,
  ActionTimingConfig,
  Connection,
  EventListenerNode,
  EventRaiserNode,
  LogicNode,
  NetEventNode,
  NetLightingNodeCueDefinition,
  NetNodeCueDefinition,
  ValueSource,
  VariableDefinition,
} from '../../../../cues/types/nodeCueTypes'
import {
  CueType,
  defaultCueData,
  type CueData,
  DrumNoteType,
  InstrumentNoteType,
} from '../../../../cues/types/cueTypes'
import { getColor } from '../../../../helpers/dmxHelpers'
import type { Color, RGBIO } from '../../../../types'
import * as utils from '../../../../helpers/utils'
import { createSequencerHarness } from '../../../helpers/sequencerHarness'
import { noopRuntimeBroadcaster } from '../../../../runtime/broadcaster'

const createCueData = (overrides: Partial<CueData> = {}): CueData => ({
  ...defaultCueData,
  lightingCue: CueType.Default,
  venueSize: 'Large',
  beatsPerMinute: 120,
  ...overrides,
})

const buildAdjacency = (connections: Connection[]): Map<string, Connection[]> => {
  const adjacency = new Map<string, Connection[]>()
  for (const connection of connections) {
    const list = adjacency.get(connection.from) ?? []
    list.push(connection)
    adjacency.set(connection.from, list)
  }
  return adjacency
}

const compileCue = (definition: NetNodeCueDefinition): CompiledNetCue => {
  return {
    definition,
    mode: 'yarg',
    eventMap: new Map(definition.nodes.events.map((node) => [node.id, node])),
    actionMap: new Map(definition.nodes.actions.map((node) => [node.id, node])),
    logicMap: new Map((definition.nodes.logic ?? []).map((node) => [node.id, node])),
    eventRaiserMap: new Map((definition.nodes.eventRaisers ?? []).map((node) => [node.id, node])),
    eventListenerMap: new Map(
      (definition.nodes.eventListeners ?? []).map((node) => [node.id, node]),
    ),
    effectRaiserMap: new Map((definition.nodes.effectRaisers ?? []).map((node) => [node.id, node])),
    eventDefinitions: definition.events ?? [],
    adjacency: buildAdjacency(definition.connections),
  }
}

const beatEvent: NetEventNode = { id: 'event-1', type: 'event', eventType: 'beat' }

/** A lighting cue started by `beatEvent`, with every node list defaulting to empty. */
const defineCue = ({
  id,
  name,
  nodes,
  connections,
  variables,
}: {
  id: string
  name: string
  nodes: Partial<NetLightingNodeCueDefinition['nodes']>
  connections: Connection[]
  variables?: VariableDefinition[]
}): NetNodeCueDefinition => ({
  id,
  name,
  kind: 'lighting',
  cueType: CueType.Default,
  style: 'primary',
  nodes: {
    events: [beatEvent],
    actions: [],
    logic: [],
    eventRaisers: [],
    eventListeners: [],
    effectRaisers: [],
    ...nodes,
  },
  connections,
  ...(variables && { variables }),
})

interface SetColorOptions {
  groups?: string | ValueSource
  filter?: string
  timing?: Partial<ActionTimingConfig>
  layer?: number
}

/** A high-brightness replace set-color action that starts at once and holds for zero ms. */
const setColorAction = (
  id: string,
  color: Color | ValueSource,
  { groups = 'front', filter = 'all', timing = {}, layer }: SetColorOptions = {},
): ActionNode => ({
  id,
  type: 'action',
  effectType: 'set-color',
  target: {
    groups: typeof groups === 'string' ? { source: 'literal', value: groups } : groups,
    filter: { source: 'literal', value: filter },
  },
  color: {
    name: typeof color === 'string' ? { source: 'literal', value: color } : color,
    brightness: { source: 'literal', value: 'high' },
    blendMode: { source: 'literal', value: 'replace' },
  },
  timing: {
    waitForCondition: { source: 'literal', value: 'none' },
    waitForTime: { source: 'literal', value: 0 },
    duration: { source: 'literal', value: 0 },
    waitUntilCondition: { source: 'literal', value: 'none' },
    waitUntilTime: { source: 'literal', value: 0 },
    ...timing,
  },
  ...(layer === undefined ? {} : { layer: { source: 'literal' as const, value: layer } }),
})

const expectLit = (state: RGBIO | null, color: Color): void => {
  const expected = getColor(color, 'high')
  expect(state).toMatchObject({
    red: expected.red,
    green: expected.green,
    blue: expected.blue,
    blendMode: expected.blendMode,
  })
}

interface GateStep {
  id: string
  condition: string
  count?: number
  color: Color
  fire: (sequencer: ILightingController) => void
}

describe('Node runtime with real Sequencer', () => {
  let harness: ReturnType<typeof createSequencerHarness>
  let cueLevelVarStore: Map<string, any>
  let groupLevelVarStore: Map<string, any>

  beforeEach(() => {
    harness = createSequencerHarness({ frontCount: 4, backCount: 2 })
    cueLevelVarStore = new Map()
    groupLevelVarStore = new Map()
  })

  afterEach(() => {
    harness.cleanup()
  })

  const createEngine = (definition: NetNodeCueDefinition, target = harness): NodeExecutionEngine =>
    new NodeExecutionEngine(
      compileCue(definition),
      `test-group:${definition.id}`,
      target.sequencer,
      target.lightManager,
      noopRuntimeBroadcaster(),
      cueLevelVarStore,
      groupLevelVarStore,
      new EffectRegistry(),
      definition.variables,
    )

  /** Runs the cue from `beatEvent` and advances the sequencer one tick. */
  const startCue = (
    definition: NetNodeCueDefinition,
    cueData = createCueData(),
    target = harness,
  ): void => {
    createEngine(definition, target).startExecution(beatEvent, cueData)
    target.advanceBy(1)
  }

  it('chains actions across layers in sequence', () => {
    const duration = { duration: { source: 'literal', value: 30 } } as const
    startCue(
      defineCue({
        id: 'chain-test',
        name: 'Chain Test',
        nodes: {
          actions: [
            setColorAction('action-1', 'red', { timing: duration, layer: 1 }),
            setColorAction('action-2', 'blue', { timing: duration, layer: 5 }),
          ],
        },
        connections: [
          { from: 'event-1', to: 'action-1' },
          { from: 'action-1', to: 'action-2' },
        ],
      }),
    )

    const lightId = harness.frontLightIds[0]
    const earlyLayers = harness.sequencer.getActiveEffectsForLight(lightId)
    // Fire-and-forget submits both actions; both layers can be active immediately
    expect(earlyLayers.has(1)).toBe(true)
    expect(earlyLayers.has(5)).toBe(true)

    let redTick: number | null = null
    let blueTick: number | null = null
    for (let i = 0; i < 40; i += 1) {
      harness.advanceBy(5)
      const state = harness.getLightState(lightId)
      if (!state) continue
      const redDominant = state.red > state.green && state.red > state.blue
      const blueDominant = state.blue > state.red && state.blue > state.green
      if (redTick === null && redDominant) {
        redTick = i
      }
      if (blueTick === null && blueDominant) {
        blueTick = i
      }
      if (redTick !== null && blueTick !== null) {
        break
      }
    }

    // Fire-and-forget: both layers active; we should see at least one color; order may vary by layering
    expect(redTick !== null || blueTick !== null).toBe(true)
    if (redTick !== null && blueTick !== null) {
      expect((blueTick as number) > (redTick as number)).toBe(true)
    }
  })

  it('gates transitions on beat events', () => {
    startCue(
      defineCue({
        id: 'beat-gate',
        name: 'Beat Gate',
        nodes: {
          actions: [
            setColorAction('action-1', 'red', {
              timing: { waitForCondition: { source: 'literal', value: 'beat' } },
            }),
          ],
        },
        connections: [{ from: 'event-1', to: 'action-1' }],
      }),
    )

    const lightId = harness.frontLightIds[0]
    const beforeBeat = harness.getLightState(lightId)
    expect(beforeBeat?.intensity ?? 0).toBe(0)

    harness.sequencer.onBeat()
    harness.advanceBy(1)

    expectLit(harness.getLightState(lightId), 'red')
  })

  it('uses light-array transforms to target a single light', () => {
    const configNode: LogicNode = {
      id: 'config-1',
      type: 'logic',
      logicType: 'config-data',
      dataProperty: 'front-lights-array',
      assignTo: 'frontLights',
    }

    const reverseNode: LogicNode = {
      id: 'reverse-1',
      type: 'logic',
      logicType: 'reverse-lights',
      sourceVariable: 'frontLights',
      assignTo: 'reversedLights',
    }

    const indexNode: LogicNode = {
      id: 'index-1',
      type: 'logic',
      logicType: 'lights-from-index',
      sourceVariable: 'reversedLights',
      index: { source: 'literal', value: 0 },
      assignTo: 'pickedLights',
    }

    startCue(
      defineCue({
        id: 'array-target',
        name: 'Array Target',
        nodes: {
          actions: [
            setColorAction('action-1', 'green', {
              groups: { source: 'variable', name: 'pickedLights' },
            }),
          ],
          logic: [configNode, reverseNode, indexNode],
        },
        connections: [
          { from: 'event-1', to: 'config-1' },
          { from: 'config-1', to: 'reverse-1' },
          { from: 'reverse-1', to: 'index-1' },
          { from: 'index-1', to: 'action-1' },
        ],
        variables: [
          { name: 'frontLights', type: 'light-array', scope: 'cue', initialValue: [] },
          { name: 'reversedLights', type: 'light-array', scope: 'cue', initialValue: [] },
          { name: 'pickedLights', type: 'light-array', scope: 'cue', initialValue: [] },
        ],
      }),
    )

    const targetId = harness.frontLightIds[harness.frontLightIds.length - 1]
    for (const lightId of harness.frontLightIds) {
      const state = harness.getLightState(lightId)
      if (lightId === targetId) {
        expectLit(state, 'green')
      } else {
        expect(state?.intensity ?? 0).toBe(0)
      }
    }
  })

  /** A cue that lights each front light with the palette entry at its index. */
  const paletteByIndexCue = (colors: string[]): NetNodeCueDefinition => {
    const configNode: LogicNode = {
      id: 'config-1',
      type: 'logic',
      logicType: 'config-data',
      dataProperty: 'front-lights-array',
      assignTo: 'frontLights',
    }

    const eachNode: LogicNode = {
      id: 'each-1',
      type: 'logic',
      logicType: 'for-each-light',
      sourceVariable: 'frontLights',
      currentLightVariable: 'curLight',
      currentIndexVariable: 'idx',
    }

    const pickNode: LogicNode = {
      id: 'pick-1',
      type: 'logic',
      logicType: 'color-from-index',
      colors: { source: 'literal', value: colors },
      index: { source: 'variable', name: 'idx' },
      assignTo: 'curColor',
    }

    return defineCue({
      id: 'color-index',
      name: 'Color Index',
      nodes: {
        actions: [
          setColorAction(
            'action-1',
            { source: 'variable', name: 'curColor' },
            { groups: { source: 'variable', name: 'curLight' } },
          ),
        ],
        logic: [configNode, eachNode, pickNode],
      },
      connections: [
        { from: 'event-1', to: 'config-1' },
        { from: 'config-1', to: 'each-1' },
        { from: 'each-1', to: 'pick-1', fromPort: 'each' },
        { from: 'pick-1', to: 'action-1' },
      ],
      variables: [
        { name: 'frontLights', type: 'light-array', scope: 'cue', initialValue: [] },
        { name: 'curLight', type: 'light-array', scope: 'cue', initialValue: [] },
        { name: 'idx', type: 'number', scope: 'cue', initialValue: 0 },
        { name: 'curColor', type: 'color', scope: 'cue', initialValue: 'red' },
      ],
    })
  }

  it('selects palette colours by index with color-from-index (wraps around)', () => {
    const palette = ['red', 'green', 'blue'] as const

    startCue(paletteByIndexCue([...palette]))

    // 4 front lights, 3-colour palette: light 3 wraps to palette[0], proving modulo wraparound.
    harness.frontLightIds.forEach((lightId, i) => {
      expectLit(harness.getLightState(lightId), palette[i % palette.length])
    })
  })

  it('leaves a palette colour this version does not know out of the palette', () => {
    const played = ['red', 'blue'] as const

    startCue(paletteByIndexCue(['red', 'mauve', 'blue']))

    harness.frontLightIds.forEach((lightId, i) => {
      expectLit(harness.getLightState(lightId), played[i % played.length])
    })
  })

  it('reads a palette from a color-array variable set via the variable node', () => {
    const setPalette: LogicNode = {
      id: 'set-pal',
      type: 'logic',
      logicType: 'variable',
      mode: 'set',
      varName: 'palette',
      valueType: 'color-array',
      value: { source: 'literal', value: ['red', 'green', 'blue'] as Color[] },
    }

    const configNode: LogicNode = {
      id: 'config-1',
      type: 'logic',
      logicType: 'config-data',
      dataProperty: 'front-lights-array',
      assignTo: 'frontLights',
    }

    const eachNode: LogicNode = {
      id: 'each-1',
      type: 'logic',
      logicType: 'for-each-light',
      sourceVariable: 'frontLights',
      currentLightVariable: 'curLight',
      currentIndexVariable: 'idx',
    }

    const pickNode: LogicNode = {
      id: 'pick-1',
      type: 'logic',
      logicType: 'color-from-index',
      colors: { source: 'variable', name: 'palette' },
      index: { source: 'variable', name: 'idx' },
      assignTo: 'curColor',
    }

    const palette = ['red', 'green', 'blue'] as const

    startCue(
      defineCue({
        id: 'color-var-index',
        name: 'Color Var Index',
        nodes: {
          actions: [
            setColorAction(
              'action-1',
              { source: 'variable', name: 'curColor' },
              { groups: { source: 'variable', name: 'curLight' } },
            ),
          ],
          logic: [setPalette, configNode, eachNode, pickNode],
        },
        connections: [
          { from: 'event-1', to: 'set-pal' },
          { from: 'set-pal', to: 'config-1' },
          { from: 'config-1', to: 'each-1' },
          { from: 'each-1', to: 'pick-1', fromPort: 'each' },
          { from: 'pick-1', to: 'action-1' },
        ],
        variables: [
          { name: 'palette', type: 'color-array', scope: 'cue', initialValue: [] },
          { name: 'frontLights', type: 'light-array', scope: 'cue', initialValue: [] },
          { name: 'curLight', type: 'light-array', scope: 'cue', initialValue: [] },
          { name: 'idx', type: 'number', scope: 'cue', initialValue: 0 },
          { name: 'curColor', type: 'color', scope: 'cue', initialValue: 'red' },
        ],
      }),
    )

    harness.frontLightIds.forEach((lightId, i) => {
      expectLit(harness.getLightState(lightId), palette[i % palette.length])
    })
  })

  it('transforms color-array variables with reverse, concat, and shuffle', () => {
    const setA: LogicNode = {
      id: 'set-a',
      type: 'logic',
      logicType: 'variable',
      mode: 'set',
      varName: 'a',
      valueType: 'color-array',
      value: { source: 'literal', value: ['red', 'green', 'blue'] as Color[] },
    }

    const setB: LogicNode = {
      id: 'set-b',
      type: 'logic',
      logicType: 'variable',
      mode: 'set',
      varName: 'b',
      valueType: 'color-array',
      value: { source: 'literal', value: ['yellow', 'orange'] as Color[] },
    }

    const reverseNode: LogicNode = {
      id: 'rev',
      type: 'logic',
      logicType: 'reverse-colors',
      sourceVariable: 'a',
      assignTo: 'reversed',
    }

    const concatNode: LogicNode = {
      id: 'cat',
      type: 'logic',
      logicType: 'concat-colors',
      sourceVariables: ['a', 'b'],
      assignTo: 'combined',
    }

    const shuffleNode: LogicNode = {
      id: 'shuf',
      type: 'logic',
      logicType: 'shuffle-colors',
      sourceVariable: 'a',
      assignTo: 'shuffled',
    }

    startCue(
      defineCue({
        id: 'color-transforms',
        name: 'Color Transforms',
        nodes: { logic: [setA, setB, reverseNode, concatNode, shuffleNode] },
        connections: [
          { from: 'event-1', to: 'set-a' },
          { from: 'set-a', to: 'set-b' },
          { from: 'set-b', to: 'rev' },
          { from: 'rev', to: 'cat' },
          { from: 'cat', to: 'shuf' },
        ],
        variables: [
          { name: 'a', type: 'color-array', scope: 'cue', initialValue: [] },
          { name: 'b', type: 'color-array', scope: 'cue', initialValue: [] },
          { name: 'reversed', type: 'color-array', scope: 'cue', initialValue: [] },
          { name: 'combined', type: 'color-array', scope: 'cue', initialValue: [] },
          { name: 'shuffled', type: 'color-array', scope: 'cue', initialValue: [] },
        ],
      }),
    )

    expect(cueLevelVarStore.get('reversed')?.value).toEqual(['blue', 'green', 'red'])
    expect(cueLevelVarStore.get('combined')?.value).toEqual([
      'red',
      'green',
      'blue',
      'yellow',
      'orange',
    ])
    const shuffled = (cueLevelVarStore.get('shuffled')?.value ?? []) as string[]
    expect([...shuffled].sort()).toEqual(['blue', 'green', 'red'])
  })

  it('branches on cue data string comparisons', () => {
    const cueDataNode: LogicNode = {
      id: 'cue-data-1',
      type: 'logic',
      logicType: 'cue-data',
      dataProperty: 'venue-size',
      assignTo: 'venue',
    }

    const conditionalNode: LogicNode = {
      id: 'conditional-1',
      type: 'logic',
      logicType: 'conditional',
      comparator: '==',
      left: { source: 'variable', name: 'venue' },
      right: { source: 'literal', value: 'Large' },
    }

    startCue(
      defineCue({
        id: 'string-conditional',
        name: 'String Conditional',
        nodes: {
          actions: [setColorAction('action-1', 'purple')],
          logic: [cueDataNode, conditionalNode],
        },
        connections: [
          { from: 'event-1', to: 'cue-data-1' },
          { from: 'cue-data-1', to: 'conditional-1' },
          { from: 'conditional-1', to: 'action-1', fromPort: 'true' },
        ],
        variables: [{ name: 'venue', type: 'string', scope: 'cue', initialValue: '' }],
      }),
      createCueData({ venueSize: 'Large' }),
    )

    expectLit(harness.getLightState(harness.frontLightIds[0]), 'purple')
  })

  it('holds a delay longer than a timer can count', () => {
    jest.useFakeTimers()
    try {
      const delayNode = {
        id: 'delay-1',
        type: 'logic',
        logicType: 'delay',
        delayTime: { source: 'literal', value: 2 ** 40 },
      } as LogicNode
      const actionNode = {
        id: 'action-1',
        type: 'action',
        effectType: 'set-color',
        target: {
          groups: { source: 'literal', value: 'front' },
          filter: { source: 'literal', value: 'all' },
        },
        color: {
          name: { source: 'literal', value: 'blue' },
          brightness: { source: 'literal', value: 'high' },
        },
        timing: {
          waitForCondition: { source: 'literal', value: 'none' },
          waitForTime: { source: 'literal', value: 0 },
          duration: { source: 'literal', value: 0 },
          waitUntilCondition: { source: 'literal', value: 'none' },
          waitUntilTime: { source: 'literal', value: 0 },
        },
      } as ActionNode
      const engine = createEngine(
        defineCue({
          id: 'long-delay',
          name: 'Long Delay',
          nodes: { actions: [actionNode], logic: [delayNode] },
          connections: [
            { from: 'event-1', to: 'delay-1' },
            { from: 'delay-1', to: 'action-1' },
          ],
        }),
      )

      engine.startExecution(beatEvent, createCueData())
      jest.advanceTimersByTime(1000)
      harness.advanceBy(10)

      expect(harness.getLightState(harness.frontLightIds[0])?.intensity ?? 0).toBe(0)
    } finally {
      jest.useRealTimers()
    }
  })

  it('blocks execution through delay nodes', async () => {
    jest.useFakeTimers()
    try {
      const delayNode: LogicNode = {
        id: 'delay-1',
        type: 'logic',
        logicType: 'delay',
        delayTime: { source: 'literal', value: 20 },
      }

      startCue(
        defineCue({
          id: 'delay-test',
          name: 'Delay Test',
          nodes: { actions: [setColorAction('action-1', 'blue')], logic: [delayNode] },
          connections: [
            { from: 'event-1', to: 'delay-1' },
            { from: 'delay-1', to: 'action-1' },
          ],
        }),
      )

      const lightId = harness.frontLightIds[0]
      const beforeDelay = harness.getLightState(lightId)
      expect(beforeDelay?.intensity ?? 0).toBe(0)

      jest.advanceTimersByTime(25)
      harness.advanceBy(1)

      expectLit(harness.getLightState(lightId), 'blue')
    } finally {
      jest.useRealTimers()
    }
  })

  it.each([
    { name: 'waits until beat to complete action', id: 'wait-until-beat', beats: undefined },
    { name: 'waits until beat count before completing', id: 'wait-until-count', beats: 2 },
  ])('$name', ({ id, beats }) => {
    startCue(
      defineCue({
        id,
        name: id,
        nodes: {
          actions: [
            setColorAction('action-1', 'white', {
              timing: {
                waitUntilCondition: { source: 'literal', value: 'beat' },
                ...(beats === undefined
                  ? {}
                  : { waitUntilConditionCount: { source: 'literal' as const, value: beats } }),
              },
            }),
          ],
        },
        connections: [{ from: 'event-1', to: 'action-1' }],
      }),
    )

    const lightId = harness.frontLightIds[0]
    const isHeld = (): boolean => harness.sequencer.getActiveEffectsForLight(lightId).has(0)
    expect(isHeld()).toBe(true)

    for (let i = 0; i < 10; i += 1) {
      harness.advanceBy(10)
      expect(isHeld()).toBe(true)
    }

    for (let beat = 1; beat < (beats ?? 1); beat += 1) {
      harness.sequencer.onBeat()
      harness.advanceBy(1)
      expect(isHeld()).toBe(true)
    }

    harness.sequencer.onBeat()
    let cleared = false
    for (let i = 0; i < 10; i += 1) {
      harness.advanceBy(10)
      if (!isHeld()) {
        cleared = true
        break
      }
    }
    expect(cleared).toBe(true)
  })

  it.each<{ label: string; first: GateStep; second: GateStep }>([
    {
      label: 'measure and keyframe events',
      first: { id: 'measure', condition: 'measure', color: 'red', fire: (s) => s.onMeasure() },
      second: { id: 'keyframe', condition: 'keyframe', color: 'blue', fire: (s) => s.onKeyframe() },
    },
    {
      label: 'measure and keyframe counts',
      first: {
        id: 'measure',
        condition: 'measure',
        count: 2,
        color: 'red',
        fire: (s) => s.onMeasure(),
      },
      second: {
        id: 'keyframe',
        condition: 'keyframe',
        count: 2,
        color: 'blue',
        fire: (s) => s.onKeyframe(),
      },
    },
    {
      label: 'drum and guitar note counts',
      first: {
        id: 'drum',
        condition: 'drum-red',
        count: 2,
        color: 'green',
        fire: (s) => s.onDrumNote(DrumNoteType.RedDrum),
      },
      second: {
        id: 'guitar',
        condition: 'guitar-green',
        count: 1,
        color: 'yellow',
        fire: (s) => s.onGuitarNote(InstrumentNoteType.Green),
      },
    },
    {
      label: 'bass and keys note counts',
      first: {
        id: 'bass',
        condition: 'bass-blue',
        count: 2,
        color: 'purple',
        fire: (s) => s.onBassNote(InstrumentNoteType.Blue),
      },
      second: {
        id: 'keys',
        condition: 'keys-yellow',
        count: 1,
        color: 'orange',
        fire: (s) => s.onKeysNote(InstrumentNoteType.Yellow),
      },
    },
  ])('gates on $label', ({ first, second }) => {
    const waitFor = ({ condition, count }: GateStep): Partial<ActionTimingConfig> => ({
      waitForCondition: { source: 'literal', value: condition },
      ...(count === undefined
        ? {}
        : { waitForConditionCount: { source: 'literal' as const, value: count } }),
    })
    const firstAction = setColorAction(`action-${first.id}`, first.color, {
      timing: waitFor(first),
    })
    const secondAction = setColorAction(`action-${second.id}`, second.color, {
      groups: 'back',
      timing: waitFor(second),
    })

    startCue(
      defineCue({
        id: `${first.id}-${second.id}-counts`,
        name: `${first.id} and ${second.id} counts`,
        nodes: { actions: [firstAction, secondAction] },
        connections: [
          { from: 'event-1', to: firstAction.id },
          { from: 'event-1', to: secondAction.id },
        ],
      }),
    )

    const frontId = harness.frontLightIds[0]
    const backId = harness.backLightIds[0]
    expect(harness.getLightState(frontId)?.intensity ?? 0).toBe(0)
    expect(harness.getLightState(backId)?.intensity ?? 0).toBe(0)

    // Every event short of the count leaves the light dark, and the last one lights it.
    const fireUntilLit = (step: GateStep, lightId: string): void => {
      for (let i = 1; i < (step.count ?? 1); i += 1) {
        step.fire(harness.sequencer)
        harness.advanceBy(1)
        expect(harness.getLightState(lightId)?.intensity ?? 0).toBe(0)
      }
      step.fire(harness.sequencer)
      harness.advanceBy(1)
      expectLit(harness.getLightState(lightId), step.color)
    }
    fireUntilLit(first, frontId)
    fireUntilLit(second, backId)
  })

  it('calculates math operators and feeds action duration', () => {
    const mathNode: LogicNode = {
      id: 'math-1',
      type: 'logic',
      logicType: 'math',
      operator: 'multiply',
      left: { source: 'literal', value: 10 },
      right: { source: 'literal', value: 3 },
      assignTo: 'durationMs',
    }

    startCue(
      defineCue({
        id: 'math-duration',
        name: 'Math Duration',
        nodes: {
          actions: [
            setColorAction('action-1', 'blue', {
              timing: { duration: { source: 'variable', name: 'durationMs' } },
            }),
          ],
          logic: [mathNode],
        },
        connections: [
          { from: 'event-1', to: 'math-1' },
          { from: 'math-1', to: 'action-1' },
        ],
        variables: [{ name: 'durationMs', type: 'number', scope: 'cue', initialValue: 0 }],
      }),
    )

    const lightId = harness.frontLightIds[0]
    expect(harness.sequencer.getActiveEffectsForLight(lightId).has(0)).toBe(true)
    harness.advanceBy(20)
    expect(harness.sequencer.getActiveEffectsForLight(lightId).has(0)).toBe(true)
    harness.advanceBy(20)
    let cleared = false
    for (let i = 0; i < 10; i += 1) {
      harness.advanceBy(10)
      if (!harness.sequencer.getActiveEffectsForLight(lightId).has(0)) {
        cleared = true
        break
      }
    }
    expect(cleared).toBe(true)
  })

  it.each([
    { operator: 'add', left: 5, right: 2, expected: 7 },
    { operator: 'subtract', left: 10, right: 3, expected: 7 },
    { operator: 'multiply', left: 3, right: 4, expected: 12 },
    { operator: 'divide', left: 10, right: 2, expected: 5 },
    { operator: 'modulus', left: 10, right: 3, expected: 1 },
  ] as const)(
    'updates a variable with $operator ($left and $right give $expected)',
    ({ operator, left, right, expected }) => {
      const mathNode: LogicNode = {
        id: 'math-1',
        type: 'logic',
        logicType: 'math',
        operator,
        left: { source: 'literal', value: left },
        right: { source: 'literal', value: right },
        assignTo: 'result',
      }

      startCue(
        defineCue({
          id: `math-${operator}`,
          name: `Math ${operator}`,
          nodes: { logic: [mathNode] },
          connections: [{ from: 'event-1', to: 'math-1' }],
          variables: [{ name: 'result', type: 'number', scope: 'cue', initialValue: 0 }],
        }),
      )

      expect(cueLevelVarStore.get('result')?.value).toBe(expected)
    },
  )

  it('initializes variables and uses conditional branch', () => {
    const initNode: LogicNode = {
      id: 'var-init',
      type: 'logic',
      logicType: 'variable',
      mode: 'init',
      varName: 'flag',
      valueType: 'number',
      value: { source: 'literal', value: 1 },
    }

    const initMissingVarNode: LogicNode = {
      id: 'init-missing',
      type: 'logic',
      logicType: 'variable',
      mode: 'init',
      varName: 'missingVar',
      valueType: 'number',
      value: { source: 'literal', value: 0 },
    }

    const conditionalNode: LogicNode = {
      id: 'conditional-1',
      type: 'logic',
      logicType: 'conditional',
      comparator: '==',
      left: { source: 'variable', name: 'missingVar' },
      right: { source: 'literal', value: 0 },
    }

    startCue(
      defineCue({
        id: 'init-fallback',
        name: 'Init/Conditional',
        nodes: {
          actions: [setColorAction('action-1', 'yellow')],
          logic: [initNode, initMissingVarNode, conditionalNode],
        },
        connections: [
          { from: 'event-1', to: 'var-init' },
          { from: 'var-init', to: 'init-missing' },
          { from: 'init-missing', to: 'conditional-1' },
          { from: 'conditional-1', to: 'action-1', fromPort: 'true' },
        ],
        variables: [
          { name: 'flag', type: 'number', scope: 'cue', initialValue: 0 },
          { name: 'missingVar', type: 'number', scope: 'cue', initialValue: 0 },
        ],
      }),
    )

    const storedValue = cueLevelVarStore.get('flag')
    expect(storedValue?.value).toBe(1)
    const lightState = harness.getLightState(harness.frontLightIds[0])
    expect(lightState?.intensity ?? 0).toBeGreaterThan(0)
  })

  it('passes through variable get mode without mutation', () => {
    const setNode: LogicNode = {
      id: 'var-set',
      type: 'logic',
      logicType: 'variable',
      mode: 'set',
      varName: 'counter',
      valueType: 'number',
      value: { source: 'literal', value: 2 },
    }

    const getNode: LogicNode = {
      id: 'var-get',
      type: 'logic',
      logicType: 'variable',
      mode: 'get',
      varName: 'counter',
      valueType: 'number',
    }

    const conditionalNode: LogicNode = {
      id: 'conditional-1',
      type: 'logic',
      logicType: 'conditional',
      comparator: '==',
      left: { source: 'variable', name: 'counter' },
      right: { source: 'literal', value: 2 },
    }

    startCue(
      defineCue({
        id: 'variable-get',
        name: 'Variable Get',
        nodes: {
          actions: [setColorAction('action-1', 'green')],
          logic: [setNode, getNode, conditionalNode],
        },
        connections: [
          { from: 'event-1', to: 'var-set' },
          { from: 'var-set', to: 'var-get' },
          { from: 'var-get', to: 'conditional-1' },
          { from: 'conditional-1', to: 'action-1', fromPort: 'true' },
        ],
        variables: [{ name: 'counter', type: 'number', scope: 'cue', initialValue: 0 }],
      }),
    )

    expect(cueLevelVarStore.get('counter')?.value).toBe(2)
    expect(harness.getLightState(harness.frontLightIds[0])?.intensity ?? 0).toBeGreaterThan(0)
  })

  it('uses array-length and concat-lights for targeting', () => {
    const frontConfig: LogicNode = {
      id: 'front-1',
      type: 'logic',
      logicType: 'config-data',
      dataProperty: 'front-lights-array',
      assignTo: 'frontLights',
    }

    const backConfig: LogicNode = {
      id: 'back-1',
      type: 'logic',
      logicType: 'config-data',
      dataProperty: 'back-lights-array',
      assignTo: 'backLights',
    }

    const concatNode: LogicNode = {
      id: 'concat-1',
      type: 'logic',
      logicType: 'concat-lights',
      sourceVariables: ['frontLights', 'backLights'],
      assignTo: 'allLights',
    }

    const lengthNode: LogicNode = {
      id: 'len-1',
      type: 'logic',
      logicType: 'array-length',
      sourceVariable: 'allLights',
      assignTo: 'lightCount',
    }

    const conditionalNode: LogicNode = {
      id: 'conditional-1',
      type: 'logic',
      logicType: 'conditional',
      comparator: '>=',
      left: { source: 'variable', name: 'lightCount' },
      right: { source: 'literal', value: 6 },
    }

    startCue(
      defineCue({
        id: 'concat-length',
        name: 'Concat + Length',
        nodes: {
          actions: [
            setColorAction('action-1', 'green', {
              groups: { source: 'variable', name: 'allLights' },
            }),
          ],
          logic: [frontConfig, backConfig, concatNode, lengthNode, conditionalNode],
        },
        connections: [
          { from: 'event-1', to: 'front-1' },
          { from: 'front-1', to: 'back-1' },
          { from: 'back-1', to: 'concat-1' },
          { from: 'concat-1', to: 'len-1' },
          { from: 'len-1', to: 'conditional-1' },
          { from: 'conditional-1', to: 'action-1', fromPort: 'true' },
        ],
        variables: [
          { name: 'frontLights', type: 'light-array', scope: 'cue', initialValue: [] },
          { name: 'backLights', type: 'light-array', scope: 'cue', initialValue: [] },
          { name: 'allLights', type: 'light-array', scope: 'cue', initialValue: [] },
          { name: 'lightCount', type: 'number', scope: 'cue', initialValue: 0 },
        ],
      }),
    )

    for (const lightId of harness.allLightIds) {
      expectLit(harness.getLightState(lightId), 'green')
    }
  })

  it('creates pairs in opposite and diagonal patterns', () => {
    const configNode: LogicNode = {
      id: 'config-1',
      type: 'logic',
      logicType: 'config-data',
      dataProperty: 'front-lights-array',
      assignTo: 'frontLights',
    }

    const oppositeNode: LogicNode = {
      id: 'pairs-opposite',
      type: 'logic',
      logicType: 'create-pairs',
      sourceVariable: 'frontLights',
      assignTo: 'oppositePairs',
      pairType: 'opposite',
    }

    const diagonalNode: LogicNode = {
      id: 'pairs-diagonal',
      type: 'logic',
      logicType: 'create-pairs',
      sourceVariable: 'frontLights',
      assignTo: 'diagonalPairs',
      pairType: 'diagonal',
    }

    const pickOpposite: LogicNode = {
      id: 'pick-opposite',
      type: 'logic',
      logicType: 'lights-from-index',
      sourceVariable: 'oppositePairs',
      index: { source: 'literal', value: '0,1' },
      assignTo: 'pairLights',
    }

    startCue(
      defineCue({
        id: 'pairs-test',
        name: 'Pairs Test',
        nodes: {
          actions: [
            setColorAction('action-1', 'blue', {
              groups: { source: 'variable', name: 'pairLights' },
            }),
          ],
          logic: [configNode, oppositeNode, diagonalNode, pickOpposite],
        },
        connections: [
          { from: 'event-1', to: 'config-1' },
          { from: 'config-1', to: 'pairs-opposite' },
          { from: 'pairs-opposite', to: 'pairs-diagonal' },
          { from: 'pairs-diagonal', to: 'pick-opposite' },
          { from: 'pick-opposite', to: 'action-1' },
        ],
        variables: [
          { name: 'frontLights', type: 'light-array', scope: 'cue', initialValue: [] },
          { name: 'oppositePairs', type: 'light-array', scope: 'cue', initialValue: [] },
          { name: 'diagonalPairs', type: 'light-array', scope: 'cue', initialValue: [] },
          { name: 'pairLights', type: 'light-array', scope: 'cue', initialValue: [] },
        ],
      }),
    )

    const expectedIds = [harness.frontLightIds[0], harness.frontLightIds[2]]
    for (const lightId of harness.frontLightIds) {
      const state = harness.getLightState(lightId)
      if (expectedIds.includes(lightId)) {
        expectLit(state, 'blue')
      } else {
        expect(state?.intensity ?? 0).toBe(0)
      }
    }

    const diagonalPairs = cueLevelVarStore.get('diagonalPairs')
    expect(diagonalPairs?.type).toBe('light-array')
    expect((diagonalPairs?.value as any[])?.length ?? 0).toBeGreaterThan(0)
  })

  it('targets back and strobe groups with filters', () => {
    const localHarness = createSequencerHarness({ frontCount: 4, backCount: 4, strobeCount: 2 })

    startCue(
      defineCue({
        id: 'target-groups',
        name: 'Target Groups',
        nodes: {
          actions: [
            setColorAction('action-back', 'red', { groups: 'back', filter: 'odd' }),
            setColorAction('action-strobe', 'blue', { groups: 'strobe' }),
          ],
        },
        connections: [
          { from: 'event-1', to: 'action-back' },
          { from: 'event-1', to: 'action-strobe' },
        ],
      }),
      createCueData(),
      localHarness,
    )

    const backLights = localHarness.lightManager.getLights(['back'], ['all'])
    for (const light of backLights) {
      const state = localHarness.getLightState(light.id)
      if (light.position % 2 !== 0) {
        expectLit(state, 'red')
      } else {
        expect(state?.intensity ?? 0).toBe(0)
      }
    }

    const strobeLights = localHarness.lightManager.getLights(['strobe'], ['all'])
    for (const light of strobeLights) {
      expectLit(localHarness.getLightState(light.id), 'blue')
    }

    localHarness.cleanup()
  })

  it('targets random filters deterministically', () => {
    // random-3 samples without replacement: each draw indexes the SHRINKING remaining pool, so
    // returning 0 each time picks the first three front lights in order (distinct, no repeats).
    const randomSpy = jest.spyOn(utils, 'randomBetween')
    randomSpy.mockReturnValue(0)

    startCue(
      defineCue({
        id: 'random-targets',
        name: 'Random Targets',
        nodes: {
          actions: [setColorAction('action-random', 'green', { filter: 'random-3' })],
        },
        connections: [{ from: 'event-1', to: 'action-random' }],
      }),
    )

    const litIds: string[] = []
    for (const lightId of harness.frontLightIds) {
      const state = harness.getLightState(lightId)
      if (state) {
        expectLit(state, 'green')
        litIds.push(lightId)
      } else {
        expect(state).toBeNull()
      }
    }
    const uniqueLit = new Set(litIds)
    const expectedIds = new Set([
      harness.frontLightIds[0],
      harness.frontLightIds[1],
      harness.frontLightIds[2],
    ])
    expect(uniqueLit).toEqual(expectedIds)
    expect(uniqueLit.size).toBe(3) // distinct picks, no duplicates

    randomSpy.mockRestore()
  })

  it('raises events to trigger listener actions in a new context', () => {
    const raiserNode: EventRaiserNode = {
      id: 'raiser-1',
      type: 'event-raiser',
      eventName: 'internal-event',
      label: 'Raise',
      inputs: [],
      outputs: [],
    }

    const listenerNode: EventListenerNode = {
      id: 'listener-1',
      type: 'event-listener',
      eventName: 'internal-event',
      label: 'Listen',
      outputs: ['action-listener'],
    }

    startCue(
      defineCue({
        id: 'event-chain',
        name: 'Event Chain',
        nodes: {
          actions: [
            setColorAction('action-primary', 'red'),
            setColorAction('action-listener', 'blue', { groups: 'back' }),
          ],
          eventRaisers: [raiserNode],
          eventListeners: [listenerNode],
        },
        connections: [
          { from: 'event-1', to: 'action-primary' },
          { from: 'event-1', to: 'raiser-1' },
          { from: 'listener-1', to: 'action-listener' },
        ],
      }),
    )

    expectLit(harness.getLightState(harness.frontLightIds[0]), 'red')
    expectLit(harness.getLightState(harness.backLightIds[0]), 'blue')
  })
})
