import { jest } from '@jest/globals'
import { NodeExecutionEngine } from '../../../../cues/node/runtime/NodeExecutionEngine'
import { EffectExecutionEngine } from '../../../../cues/node/runtime/EffectExecutionEngine'
import { NodeCueCompiler } from '../../../../cues/node/compiler/NodeCueCompiler'
import { EffectCompiler } from '../../../../cues/node/compiler/EffectCompiler'
import { EffectRegistry } from '../../../../cues/node/runtime/EffectRegistry'
import type {
  ActionNode,
  YargEventNode,
  YargNodeCueDefinition,
  YargEffectDefinition,
} from '../../../../cues/types/nodeCueTypes'
import { CueType, defaultCueData, type CueData } from '../../../../cues'
import type { ILightingController } from '../../../../controllers/sequencer/interfaces'
import type { DmxLightManager } from '../../../../controllers/DmxLightManager'
import { noopRuntimeBroadcaster } from '../../../../runtime/broadcaster'

const makeAction = (id: string, colorName: string, durationMs: number, layer: number): ActionNode =>
  ({
    id,
    type: 'action',
    effectType: 'set-color',
    target: {
      groups: { source: 'literal', value: 'front' },
      filter: { source: 'literal', value: 'all' },
    },
    color: {
      name: { source: 'literal', value: colorName },
      brightness: { source: 'literal', value: 'high' },
      blendMode: { source: 'literal', value: 'replace' },
    },
    timing: {
      waitForCondition: { source: 'literal', value: 'none' },
      waitForTime: { source: 'literal', value: 0 },
      duration: { source: 'literal', value: durationMs },
      waitUntilCondition: { source: 'literal', value: 'none' },
      waitUntilTime: { source: 'literal', value: 0 },
      easing: { source: 'literal', value: 'linear' },
      level: { source: 'literal', value: 1 },
    },
    layer: { source: 'literal', value: layer },
  }) as unknown as ActionNode

const makeMockSequencer = (): jest.Mocked<ILightingController> =>
  ({
    addEffect: jest.fn(),
    replaceEffect: jest.fn(),
    setEffect: jest.fn(),
    addEffectWithCallback: jest.fn(),
    setEffectWithCallback: jest.fn(),
    addEffectUnblockedName: jest.fn().mockReturnValue(true),
    setEffectUnblockedName: jest.fn().mockReturnValue(true),
    addEffectUnblockedNameWithCallback: jest.fn(),
    setEffectUnblockedNameWithCallback: jest.fn(),
    removeEffectCallback: jest.fn(),
    removeEffect: jest.fn(),
    cancelPanTiltClear: jest.fn(),
    schedulePanTiltClear: jest.fn(),
    addMotionPattern: jest.fn(),
    getMotionPattern: jest.fn().mockReturnValue(undefined),
    removeMotionPattern: jest.fn(),
    updateMotionPatternConfig: jest.fn(),
  }) as unknown as jest.Mocked<ILightingController>

const makeMockLightManager = (): jest.Mocked<DmxLightManager> =>
  ({
    getLights: jest.fn(() => [
      { id: 'light1', group: 'front', location: 'left' },
      { id: 'light2', group: 'front', location: 'right' },
    ]),
  }) as unknown as jest.Mocked<DmxLightManager>

const cueData = (): CueData => ({
  ...defaultCueData,
  lightingCue: CueType.Default,
  venueSize: 'Large',
  beatsPerMinute: 120,
})

describe('Chain extraction parity between cue and effect engines', () => {
  it('cue and effect engines submit equivalent composed transitions for the same action chain graph', async () => {
    const action1 = makeAction('action-1', 'red', 30, 2)
    const action2 = makeAction('action-2', 'blue', 30, 2)
    const action3 = makeAction('action-3', 'green', 30, 2)

    const cueDefinition: YargNodeCueDefinition = {
      id: 'parity-cue',
      name: 'Parity Cue',
      kind: 'lighting',
      cueType: CueType.Default,
      style: 'primary',
      nodes: {
        events: [
          {
            id: 'event-1',
            type: 'event',
            eventType: 'beat',
          } as YargEventNode,
        ],
        actions: [action1, action2, action3],
        logic: [],
        eventRaisers: [],
        eventListeners: [],
        effectRaisers: [],
      },
      connections: [
        { from: 'event-1', to: 'action-1' },
        { from: 'action-1', to: 'action-2' },
        { from: 'action-2', to: 'action-3' },
      ],
    }

    const effectDefinition: YargEffectDefinition = {
      id: 'parity-effect',
      mode: 'yarg',
      name: 'Parity Effect',
      description: '',
      variables: [],
      nodes: {
        events: [],
        actions: [action1, action2, action3],
        logic: [],
        eventRaisers: [],
        eventListeners: [],
        effectListeners: [
          {
            id: 'listener-1',
            type: 'effect-listener',
            label: 'Entry',
            outputs: ['action-1'],
          } as never,
        ],
      },
      connections: [
        { from: 'listener-1', to: 'action-1' },
        { from: 'action-1', to: 'action-2' },
        { from: 'action-2', to: 'action-3' },
      ],
      layout: { nodePositions: {} },
    } as unknown as YargEffectDefinition

    const cueSequencer = makeMockSequencer()
    const cueLightManager = makeMockLightManager()
    const cueSubmissions: Array<{ name: string; effect: unknown }> = []
    cueSequencer.addEffectUnblockedName.mockImplementation((name, effect) => {
      cueSubmissions.push({ name, effect })
      return true
    })
    cueSequencer.setEffectUnblockedName.mockImplementation((name, effect) => {
      cueSubmissions.push({ name, effect })
      return true
    })

    const compiledCue = NodeCueCompiler.compileYargCue(cueDefinition)
    const cueEngine = new NodeExecutionEngine(
      compiledCue,
      'group:parity-cue',
      cueSequencer,
      cueLightManager,
      noopRuntimeBroadcaster(),
      new Map(),
      new Map(),
      new EffectRegistry(),
    )

    cueEngine.startExecution(cueDefinition.nodes.events[0], cueData())

    const effectSequencer = makeMockSequencer()
    const effectLightManager = makeMockLightManager()
    const effectSubmissions: Array<{ name: string; effect: unknown }> = []
    effectSequencer.addEffectUnblockedName.mockImplementation((name, effect) => {
      effectSubmissions.push({ name, effect })
      return true
    })
    effectSequencer.setEffectUnblockedName.mockImplementation((name, effect) => {
      effectSubmissions.push({ name, effect })
      return true
    })

    const compiledEffect = EffectCompiler.compile(effectDefinition)
    const effectEngine = new EffectExecutionEngine(
      compiledEffect,
      effectSequencer,
      effectLightManager,
      noopRuntimeBroadcaster(),
      {},
      cueData(),
    )

    await effectEngine.triggerEffect(cueData())

    expect(cueSubmissions).toHaveLength(1)
    expect(effectSubmissions).toHaveLength(1)

    const cueComposed = cueSubmissions[0].effect as { transitions: unknown[] }
    const effectComposed = effectSubmissions[0].effect as { transitions: unknown[] }

    expect(cueComposed.transitions).toHaveLength(3)
    expect(effectComposed.transitions).toHaveLength(3)

    type TransitionLike = {
      waitForCondition: string
      waitForTime: number
      waitUntilCondition: string
      waitUntilTime: number
      transform: { duration: number; color?: { red: number; green: number; blue: number } }
    }

    const projectShared = (t: TransitionLike): Record<string, unknown> => ({
      waitForCondition: t.waitForCondition,
      waitForTime: t.waitForTime,
      waitUntilCondition: t.waitUntilCondition,
      waitUntilTime: t.waitUntilTime,
      duration: t.transform.duration,
      colorRed: t.transform.color?.red,
      colorGreen: t.transform.color?.green,
      colorBlue: t.transform.color?.blue,
    })

    const cueShared = (cueComposed.transitions as TransitionLike[]).map(projectShared)
    const effectShared = (effectComposed.transitions as TransitionLike[]).map(projectShared)
    expect(cueShared).toEqual(effectShared)
  })
})
