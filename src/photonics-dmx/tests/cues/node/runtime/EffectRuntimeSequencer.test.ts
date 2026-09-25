import { EffectExecutionEngine } from '../../../../cues/node/runtime/EffectExecutionEngine'
import { EffectCompiler } from '../../../../cues/node/compiler/EffectCompiler'
import type {
  ActionNode,
  ActionTimingConfig,
  NodeColorSetting,
  ValueSource,
  VariableDefinition,
  YargEffectDefinition,
} from '../../../../cues/types/nodeCueTypes'
import { defaultCueData, type CueData } from '../../../../cues/types/cueTypes'
import { getColor } from '../../../../helpers/dmxHelpers'
import { createSequencerHarness } from '../../../helpers/sequencerHarness'
import { noopRuntimeBroadcaster } from '../../../../runtime/broadcaster'
import type { VariableValue } from '../../../../cues/node/runtime/executionTypes'

const createCueData = (overrides: Partial<CueData> = {}): CueData => ({
  ...defaultCueData,
  beatsPerMinute: 120,
  ...overrides,
})

const literal = (value: string | number): ValueSource => ({ source: 'literal', value })
const variable = (name: string): ValueSource => ({ source: 'variable', name })

const parameter = (
  name: string,
  type: VariableDefinition['type'],
  initialValue: VariableDefinition['initialValue'],
): VariableDefinition => ({ name, type, scope: 'cue', initialValue, isParameter: true })

// A set-color of high red on every front light, starting at once and holding no duration.
const setColorAction = (
  overrides: {
    groups?: ValueSource
    color?: Partial<NodeColorSetting>
    timing?: Partial<ActionTimingConfig>
  } = {},
): ActionNode => ({
  id: 'action-1',
  type: 'action',
  effectType: 'set-color',
  target: { groups: overrides.groups ?? literal('front'), filter: literal('all') },
  color: {
    name: literal('red'),
    brightness: literal('high'),
    blendMode: literal('replace'),
    ...overrides.color,
  },
  timing: {
    waitForCondition: literal('none'),
    waitForTime: literal(0),
    duration: literal(0),
    waitUntilCondition: literal('none'),
    waitUntilTime: literal(0),
    ...overrides.timing,
  },
})

// One action behind an Entry listener, which feeds `entry` (the action itself by default).
const buildEffect = (
  id: string,
  action: ActionNode,
  {
    nodes,
    entry = action.id,
    ...rest
  }: Partial<Omit<YargEffectDefinition, 'nodes'>> & {
    nodes?: Partial<YargEffectDefinition['nodes']>
    entry?: string
  } = {},
): YargEffectDefinition => ({
  id,
  mode: 'yarg',
  name: id,
  description: '',
  connections: [{ from: 'listener-1', to: entry }],
  layout: { nodePositions: {} },
  ...rest,
  nodes: {
    events: [],
    actions: [action],
    logic: [],
    eventRaisers: [],
    eventListeners: [],
    effectListeners: [
      { id: 'listener-1', type: 'effect-listener', label: 'Entry', outputs: [entry] },
    ],
    ...nodes,
  },
})

describe('Effect runtime with real Sequencer', () => {
  let harness: ReturnType<typeof createSequencerHarness>

  beforeEach(() => {
    harness = createSequencerHarness({ frontCount: 4, backCount: 0 })
  })

  afterEach(() => {
    harness.cleanup()
  })

  const runEffect = (
    effect: YargEffectDefinition,
    parameters: Record<string, VariableValue['value']> = {},
  ) => {
    const engine = new EffectExecutionEngine(
      EffectCompiler.compile(effect),
      harness.sequencer,
      harness.lightManager,
      noopRuntimeBroadcaster(),
      parameters,
      createCueData(),
      { callerMode: 'yarg' },
    )
    engine.triggerEffect(createCueData())
    harness.advanceBy(1)
  }

  const expectColor = (lightId: string, ...color: Parameters<typeof getColor>) => {
    const expected = getColor(...color)
    expect(harness.getLightState(lightId)).toMatchObject({
      red: expected.red,
      green: expected.green,
      blue: expected.blue,
      blendMode: expected.blendMode,
    })
  }

  const expectDark = (lightId: string) => {
    expect(harness.getLightState(lightId)?.intensity ?? 0).toBe(0)
  }

  it.each<{
    name: string
    variables?: VariableDefinition[]
    color?: Partial<NodeColorSetting>
    parameters?: Record<string, VariableValue['value']>
    expected: Parameters<typeof getColor>
  }>([
    {
      name: 'maps effect parameters into action values',
      variables: [parameter('colorParam', 'string', 'red')],
      color: { name: variable('colorParam') },
      parameters: { colorParam: 'green' },
      expected: ['green', 'high'],
    },
    {
      name: 'uses color, brightness, and blend parameters',
      variables: [
        parameter('colorName', 'string', 'red'),
        parameter('brightness', 'string', 'high'),
        parameter('blendMode', 'string', 'replace'),
      ],
      color: {
        name: variable('colorName'),
        brightness: variable('brightness'),
        blendMode: variable('blendMode'),
      },
      parameters: { colorName: 'red', brightness: 'max', blendMode: 'add' },
      expected: ['red', 'max', 'add'],
    },
    {
      name: 'applies a literal colour to the targeted lights',
      expected: ['red', 'high'],
    },
  ])('$name', ({ variables, color, parameters, expected }) => {
    runEffect(buildEffect('color-effect', setColorAction({ color }), { variables }), parameters)

    expectColor(harness.frontLightIds[0], ...expected)
  })

  it('uses parameterized start delay for actions', () => {
    const action = setColorAction({
      color: { name: literal('yellow') },
      timing: { waitForTime: variable('startDelay') },
    })
    runEffect(
      buildEffect('delay-param-effect', action, {
        variables: [parameter('startDelay', 'number', 0)],
      }),
      { startDelay: 30 },
    )

    const lightId = harness.frontLightIds[0]
    expectDark(lightId)

    harness.advanceBy(35)
    expectColor(lightId, 'yellow', 'high')
  })

  it('uses parameterized duration to keep effect active', () => {
    const action = setColorAction({
      color: { name: literal('purple') },
      timing: { duration: variable('fadeDuration') },
    })
    runEffect(
      buildEffect('duration-param-effect', action, {
        variables: [parameter('fadeDuration', 'number', 0)],
      }),
      { fadeDuration: 40 },
    )

    const lightId = harness.frontLightIds[0]
    const isActive = () => harness.sequencer.getActiveEffectsForLight(lightId).has(0)
    expect(isActive()).toBe(true)

    harness.advanceBy(20)
    expect(isActive()).toBe(true)

    let cleared = false
    for (let i = 0; i < 10; i += 1) {
      harness.advanceBy(10)
      if (!isActive()) {
        cleared = true
        break
      }
    }
    expect(cleared).toBe(true)
  })

  it('blocks execution through effect delay nodes', async () => {
    jest.useFakeTimers()
    try {
      runEffect(
        buildEffect('delay-effect', setColorAction(), {
          entry: 'delay-1',
          nodes: {
            logic: [{ id: 'delay-1', type: 'logic', logicType: 'delay', delayTime: literal(20) }],
          },
          connections: [
            { from: 'listener-1', to: 'delay-1' },
            { from: 'delay-1', to: 'action-1' },
          ],
        }),
      )

      const lightId = harness.frontLightIds[0]
      expectDark(lightId)

      jest.advanceTimersByTime(25)
      harness.advanceBy(1)

      expectColor(lightId, 'red', 'high')
    } finally {
      jest.useRealTimers()
    }
  })

  it('raises internal events to drive effect actions', () => {
    runEffect(
      buildEffect('event-effect', setColorAction({ color: { name: literal('blue') } }), {
        events: [{ name: 'internal', description: '' }],
        entry: 'raiser-1',
        nodes: {
          eventRaisers: [
            {
              id: 'raiser-1',
              type: 'event-raiser',
              eventName: 'internal',
              label: 'Raise',
              inputs: [],
              outputs: [],
            },
          ],
          eventListeners: [
            {
              id: 'listener-event-1',
              type: 'event-listener',
              eventName: 'internal',
              label: 'Listen',
              outputs: ['action-1'],
            },
          ],
        },
        connections: [
          { from: 'listener-1', to: 'raiser-1' },
          { from: 'listener-event-1', to: 'action-1' },
        ],
      }),
    )

    expectColor(harness.frontLightIds[0], 'blue', 'high')
  })

  it('targets lights from light-array parameters', () => {
    const selectedLights = harness.lightManager.getLights(['front'], ['all']).slice(0, 2)
    const selectedIds = new Set(selectedLights.map((light) => light.id))

    const action = setColorAction({
      groups: variable('targetLights'),
      color: { name: literal('green') },
    })
    runEffect(
      buildEffect('light-array-param', action, {
        variables: [parameter('targetLights', 'light-array', [])],
      }),
      { targetLights: selectedLights },
    )

    for (const lightId of harness.frontLightIds) {
      if (selectedIds.has(lightId)) {
        expectColor(lightId, 'green', 'high')
      } else {
        expectDark(lightId)
      }
    }
  })
})
