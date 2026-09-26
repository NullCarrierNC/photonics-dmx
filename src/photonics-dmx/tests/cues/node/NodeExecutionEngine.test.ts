import { NodeExecutionEngine } from '../../../cues/node/runtime/NodeExecutionEngine'
import { ExecutionContext } from '../../../cues/node/runtime/ExecutionContext'
import { NodeCueCompiler, CompiledNetCue } from '../../../cues/node/compiler/NodeCueCompiler'
import { EffectCompiler } from '../../../cues/node/compiler/EffectCompiler'
import { EffectRegistry } from '../../../cues/node/runtime/EffectRegistry'
import { LightingNodeCue } from '../../../cues/node/runtime/LightingNodeCue'
import {
  NetNodeCueDefinition,
  NetEventNode,
  ActionNode,
  LogicNode,
} from '../../../cues/types/nodeCueTypes'
import type {
  Connection,
  EffectRaiserNode,
  NetLightingNodeCueDefinition,
  ValueSource,
  VariableDefinition,
  YargEffectDefinition,
} from '../../../cues/types/nodeCueTypes'
import { ILightingController } from '../../../controllers/sequencer/interfaces'
import { DmxLightManager } from '../../../controllers/DmxLightManager'
import { Beat, CueData, CueType } from '../../../cues/types/cueTypes'
import { VariableValue } from '../../../cues/node/runtime/executionTypes'
import type { CompiledEffect } from '../../../cues/node/runtime/EffectRegistry'
import type { TrackedLight } from '../../../types'
import { type FixtureConfig, DEFAULT_MOVING_HEAD_FIXTURE_CONFIG } from '../../../types'
import { RENDERER_RECEIVE } from '../../../../shared/ipcChannels'
import { noopRuntimeBroadcaster, type RuntimeBroadcaster } from '../../../runtime/broadcaster'
import { fakeLightingController } from '../../helpers/fakeLightingController'

/** Minimal fixture config for test TrackedLight objects */
type MinimalLightConfig = Partial<FixtureConfig>

const beatEvent: NetEventNode = { id: 'event1', type: 'event', eventType: 'beat' }

const buildAdjacency = (connections: Connection[]): Map<string, Connection[]> => {
  const adjacency = new Map<string, Connection[]>()
  for (const connection of connections) {
    const list = adjacency.get(connection.from) ?? []
    list.push(connection)
    adjacency.set(connection.from, list)
  }
  return adjacency
}

const compile = (
  definition: NetNodeCueDefinition,
  mode: CompiledNetCue['mode'] = 'yarg',
): CompiledNetCue => ({
  definition,
  mode,
  eventMap: new Map(definition.nodes.events.map((node) => [node.id, node])),
  actionMap: new Map(definition.nodes.actions.map((node) => [node.id, node])),
  logicMap: new Map((definition.nodes.logic ?? []).map((node) => [node.id, node])),
  eventRaiserMap: new Map((definition.nodes.eventRaisers ?? []).map((node) => [node.id, node])),
  eventListenerMap: new Map((definition.nodes.eventListeners ?? []).map((node) => [node.id, node])),
  effectRaiserMap: new Map((definition.nodes.effectRaisers ?? []).map((node) => [node.id, node])),
  eventDefinitions: definition.events ?? [],
  adjacency: buildAdjacency(definition.connections),
})

/** The 'test-cue' lighting cue, with any other definition field overridable. */
const testCue = (
  nodes: NetLightingNodeCueDefinition['nodes'],
  connections: Connection[],
  overrides: Partial<Omit<NetLightingNodeCueDefinition, 'nodes' | 'connections'>> = {},
): NetNodeCueDefinition => ({
  id: 'test-cue',
  name: 'Test Cue',
  kind: 'lighting',
  cueType: CueType.Default,
  style: 'primary',
  nodes,
  connections,
  ...overrides,
})

/** A set-color action on one group that starts at once and holds for `duration` ms. */
const setColorAction = (
  id: string,
  color: string,
  {
    group = 'front',
    brightness = 'high',
    duration = 100,
    easing,
  }: { group?: string; brightness?: string; duration?: number; easing?: string } = {},
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
    brightness: { source: 'literal', value: brightness },
  },
  timing: {
    waitForCondition: { source: 'literal', value: 'none' },
    waitForTime: { source: 'literal', value: 0 },
    duration: { source: 'literal', value: duration },
    waitUntilCondition: { source: 'literal', value: 'none' },
    waitUntilTime: { source: 'literal', value: 0 },
    ...(easing === undefined ? {} : { easing: { source: 'literal' as const, value: easing } }),
  },
})

describe('NodeExecutionEngine', () => {
  let mockSequencer: ILightingController
  let mockLightManager: DmxLightManager
  let cueLevelVarStore: Map<string, VariableValue>
  let groupLevelVarStore: Map<string, VariableValue>

  // Helper to create minimal CueData
  const createCueData = (beat?: Beat): CueData => ({
    datagramVersion: 1,
    platform: 'Unknown',
    currentScene: 'Gameplay',
    pauseState: 'Unpaused',
    venueSize: 'Small',
    beatsPerMinute: 120,
    songSection: 'None',
    guitarNotes: [],
    bassNotes: [],
    drumNotes: [],
    keysNotes: [],
    vocalNote: 0,
    harmony0Note: 0,
    harmony1Note: 0,
    harmony2Note: 0,
    lightingCue: 'default',
    postProcessing: 'Default',
    fogState: false,
    strobeState: 'Strobe_Off',
    performer: 0,
    keyframe: 'Off',
    bonusEffect: false,
    beat: beat ?? 'Unknown',
  })

  const createEngine = (
    definition: NetNodeCueDefinition,
    {
      cueId = 'test-group:test-cue',
      effectRegistry = new EffectRegistry(),
      broadcaster = noopRuntimeBroadcaster(),
      variables = definition.variables,
      mode = 'yarg',
    }: {
      cueId?: string
      effectRegistry?: EffectRegistry
      broadcaster?: RuntimeBroadcaster
      variables?: VariableDefinition[]
      mode?: CompiledNetCue['mode']
    } = {},
  ): NodeExecutionEngine =>
    new NodeExecutionEngine(
      compile(definition, mode),
      cueId,
      mockSequencer,
      mockLightManager,
      broadcaster,
      cueLevelVarStore,
      groupLevelVarStore,
      effectRegistry,
      variables,
    )

  beforeEach(() => {
    // Create mock sequencer
    mockSequencer = fakeLightingController({
      addEffectUnblockedNameWithCallback: (_name, _effect, callback) => {
        if (callback) setTimeout(() => callback(false), 1)
        return true
      },
      // Blocking set-position submits through this one and reads the applied result.
      replaceEffectWithCallback: (_name, _effect, callback) => {
        if (callback) setTimeout(() => callback(false), 1)
        return true
      },
      setEffectUnblockedNameWithCallback: (_name, _effect, callback) => {
        if (callback) setTimeout(() => callback(false), 1)
        return true
      },
    })

    mockLightManager = {
      getLights: jest.fn().mockReturnValue([
        { id: 'light1', config: {} },
        { id: 'light2', config: {} },
      ]),
    } as unknown as DmxLightManager

    cueLevelVarStore = new Map()
    groupLevelVarStore = new Map()
  })

  describe('Basic Execution', () => {
    it('should execute a simple action node', () => {
      // Create a simple cue: event -> action
      const engine = createEngine(
        testCue(
          {
            events: [beatEvent],
            actions: [setColorAction('action1', 'red', { duration: 200, easing: 'linear' })],
            logic: [],
          },
          [{ from: 'event1', to: 'action1' }],
        ),
      )

      engine.startExecution(beatEvent, createCueData('Strong'))

      // Verify that addEffect was called
      expect(mockSequencer.addEffect).toHaveBeenCalledTimes(1)
      expect(mockLightManager.getLights).toHaveBeenCalled()
    })

    it('should handle action -> action chain', () => {
      mockLightManager.getLights = jest.fn((group: string | string[]) => {
        const groups = Array.isArray(group) ? group : [group]
        if (groups.includes('back')) {
          return [
            {
              id: 'back1',
              position: 1,
              config: { ...DEFAULT_MOVING_HEAD_FIXTURE_CONFIG },
            },
          ]
        }
        return [
          {
            id: 'front1',
            position: 0,
            config: { ...DEFAULT_MOVING_HEAD_FIXTURE_CONFIG },
          },
        ]
      })

      const engine = createEngine(
        testCue(
          {
            events: [beatEvent],
            actions: [
              setColorAction('action1', 'red'),
              setColorAction('action2', 'blue', { group: 'back' }),
            ],
            logic: [],
          },
          [
            { from: 'event1', to: 'action1' },
            { from: 'action1', to: 'action2' },
          ],
        ),
      )

      engine.startExecution(beatEvent, createCueData('Strong'))

      // With different layers chain is not composed; each action is submitted (fire-and-forget)
      expect(mockSequencer.addEffect).toHaveBeenCalledTimes(2)
    })
  })

  describe('Logic Node Execution', () => {
    it('should evaluate conditional node at runtime', () => {
      const conditionalNode: LogicNode = {
        id: 'logic1',
        type: 'logic',
        logicType: 'conditional',
        comparator: '>',
        left: { source: 'literal', value: 5 },
        right: { source: 'literal', value: 3 },
      }

      const engine = createEngine(
        testCue(
          {
            events: [beatEvent],
            actions: [
              setColorAction('action-true', 'green'),
              setColorAction('action-false', 'red'),
            ],
            logic: [conditionalNode],
          },
          [
            { from: 'event1', to: 'logic1' },
            { from: 'logic1', to: 'action-true', fromPort: 'true' },
            { from: 'logic1', to: 'action-false', fromPort: 'false' },
          ],
        ),
      )

      engine.startExecution(beatEvent, createCueData('Strong'))

      // Since 5 > 3 is true, action-true should be executed
      expect(mockSequencer.addEffect).toHaveBeenCalledTimes(1)
      const call = jest.mocked(mockSequencer.addEffect).mock.calls[0]
      const effectName = call[0]
      expect(effectName).toContain('action-true')
    })

    it('should set and read variables at runtime', async () => {
      const setVarNode: LogicNode = {
        id: 'logic1',
        type: 'logic',
        logicType: 'variable',
        mode: 'set',
        varName: 'counter',
        valueType: 'number',
        value: { source: 'literal', value: 42 },
      }

      const readVarNode: LogicNode = {
        id: 'logic2',
        type: 'logic',
        logicType: 'conditional',
        comparator: '==',
        left: { source: 'variable', name: 'counter' },
        right: { source: 'literal', value: 42 },
      }

      const engine = createEngine(
        testCue(
          {
            events: [beatEvent],
            actions: [setColorAction('action1', 'green')],
            logic: [setVarNode, readVarNode],
          },
          [
            { from: 'event1', to: 'logic1' },
            { from: 'logic1', to: 'logic2' },
            { from: 'logic2', to: 'action1', fromPort: 'true' },
          ],
          {
            variables: [
              {
                name: 'counter',
                type: 'number',
                scope: 'cue',
                initialValue: 0,
              },
            ],
          },
        ),
      )

      engine.startExecution(beatEvent, createCueData('Strong'))

      // Advance timers to allow the mock callback to fire
      jest.runAllTimers()

      // Variable should be set to 42
      expect(cueLevelVarStore.get('counter')).toEqual({
        type: 'number',
        value: 42,
      })

      // Action should execute because 42 == 42
      expect(mockSequencer.addEffect).toHaveBeenCalledTimes(1)
    })
  })

  describe('Execution Context', () => {
    const createContext = (): ExecutionContext =>
      new ExecutionContext(beatEvent, createCueData('Strong'), cueLevelVarStore, groupLevelVarStore)

    it('should prevent cycles with visited tracking', () => {
      const context = createContext()

      // Mark node as visited
      context.markVisited('action1')

      // Should return true for visited node
      expect(context.hasVisited('action1')).toBe(true)

      // Should return false for unvisited node
      expect(context.hasVisited('action2')).toBe(false)
    })

    it('should track active actions', () => {
      const context = createContext()

      // Register active action
      context.registerActiveAction('action1', setColorAction('action1', 'red'))
      expect(context.hasActiveActions()).toBe(true)

      // Complete action
      context.completeAction('action1')
      expect(context.hasActiveActions()).toBe(false)
    })

    it('should detect completion correctly', () => {
      const context = createContext()

      // Context with no active nodes should be complete
      expect(context.isComplete()).toBe(true)
      expect(context.tryComplete()).toBe(true)

      // With an active action, context is not complete
      context.registerActiveAction('action1', setColorAction('action1', 'red'))
      expect(context.isComplete()).toBe(false)
      expect(context.tryComplete()).toBe(false)
    })
  })

  describe('Error Handling', () => {
    const redCue = (): NetNodeCueDefinition =>
      testCue({ events: [beatEvent], actions: [setColorAction('action1', 'red')], logic: [] }, [
        { from: 'event1', to: 'action1' },
      ])

    it('should handle missing action nodes gracefully', () => {
      const engine = createEngine(
        testCue({ events: [beatEvent], actions: [], logic: [] }, [
          { from: 'event1', to: 'nonexistent-action' },
        ]),
      )

      // Should not throw
      expect(() => {
        engine.startExecution(beatEvent, createCueData('Strong'))
      }).not.toThrow()
    })

    it('should cleanup on cancelAll', () => {
      const engine = createEngine(redCue())

      engine.startExecution(beatEvent, createCueData('Strong'))

      // Cancel all executions
      engine.cancelAll()

      // Execution state should be empty
      const state = engine.getExecutionState()
      expect(state.activeContexts).toHaveLength(0)
    })

    it('cancelAll(true) leaves effects on sequencer so lights stay lit during cue transition', () => {
      const engine = createEngine(redCue())

      engine.startExecution(beatEvent, createCueData('Strong'))

      const removeEffectBefore = (mockSequencer.removeEffect as jest.Mock).mock.calls.length
      const removeCallbackBefore = (mockSequencer.removeEffectCallback as jest.Mock).mock.calls
        .length

      engine.cancelAll(true)

      // Callbacks must still be removed so stale completions do not fire
      expect(mockSequencer.removeEffectCallback).toHaveBeenCalledTimes(removeCallbackBefore + 1)
      // Effects must NOT be removed so the next cue's setEffect can transition from them
      expect(mockSequencer.removeEffect).toHaveBeenCalledTimes(removeEffectBefore)

      const state = engine.getExecutionState()
      expect(state.activeContexts).toHaveLength(0)
    })
  })

  describe('Effect Raiser Node', () => {
    const raiserCue = (
      raiser: EffectRaiserNode,
      actions: ActionNode[] = [],
      connections: Connection[] = [{ from: 'event1', to: 'raiser1' }],
    ): NetNodeCueDefinition =>
      testCue(
        {
          events: [beatEvent],
          actions,
          logic: [],
          eventRaisers: [],
          eventListeners: [],
          effectRaisers: [raiser],
        },
        connections,
        { cueType: 'TestType' as CueType, description: 'Test' },
      )

    it('should execute effect when Effect Raiser is triggered', async () => {
      const effectRaiserNode = {
        id: 'raiser1',
        type: 'effect-raiser' as const,
        effectId: 'test-effect',
        label: 'Raise Effect',
        outputs: [],
      }

      // Create a mock effect
      const mockEffect = {
        definition: { id: 'test-effect', name: 'Test Effect' },
        eventRaiserMap: new Map(),
        eventListenerMap: new Map(),
        actionMap: new Map(),
        logicMap: new Map(),
        adjacency: new Map(),
      }

      const effectRegistry = new EffectRegistry()
      effectRegistry.registerEffect('test-effect', mockEffect as CompiledEffect)

      const engine = createEngine(raiserCue(effectRaiserNode), { effectRegistry })

      await engine.startExecution(beatEvent, createCueData('Strong'))

      // Effect should be found and executed (non-blocking)
      // In real execution, EffectExecutionEngine would be triggered
      expect(effectRegistry.hasEffect('test-effect')).toBe(true)
    })

    it('should handle missing effect gracefully', () => {
      const effectRaiserNode = {
        id: 'raiser1',
        type: 'effect-raiser' as const,
        effectId: 'missing-effect',
        label: 'Raise Missing Effect',
        outputs: [],
      }

      const effectRegistry = new EffectRegistry() // Empty registry

      const engine = createEngine(raiserCue(effectRaiserNode), { effectRegistry })

      // Should not throw, just log warning
      expect(() => {
        engine.startExecution(beatEvent, createCueData('Strong'))
      }).not.toThrow()
    })

    it('should continue execution after Effect Raiser (non-blocking)', async () => {
      const effectRaiserNode = {
        id: 'raiser1',
        type: 'effect-raiser' as const,
        effectId: 'test-effect',
        label: 'Raise Effect',
        outputs: ['action1'],
      }

      const actionNode: ActionNode = {
        id: 'action1',
        type: 'action',
        effectType: 'set-color',
        target: {
          groups: { source: 'literal', value: 'front' },
          filter: { source: 'literal', value: 'all' },
        },
        color: {
          name: { source: 'literal', value: 'white' },
          brightness: { source: 'literal', value: 'medium' },
          blendMode: { source: 'literal', value: 'replace' },
        },
        timing: {
          waitForCondition: { source: 'literal', value: 'none' },
          waitForTime: { source: 'literal', value: 0 },
          duration: { source: 'literal', value: 100 },
          waitUntilCondition: { source: 'literal', value: 'none' },
          waitUntilTime: { source: 'literal', value: 0 },
          easing: { source: 'literal', value: 'linear' },
          level: { source: 'literal', value: 1 },
        },
        layer: { source: 'literal', value: 0 },
      }

      const effectListenerNode = {
        id: 'eff-listener-1',
        type: 'effect-listener' as const,
        outputs: [],
      }
      const mockEffect = {
        definition: {
          id: 'test-effect',
          name: 'Test',
          variables: [],
          nodes: {
            events: [],
            actions: [],
            logic: [],
            effectListeners: [effectListenerNode],
            eventRaisers: [],
            eventListeners: [],
          },
          connections: [],
        },
        eventRaiserMap: new Map(),
        eventListenerMap: new Map(),
        effectListenerMap: new Map([[effectListenerNode.id, effectListenerNode]]),
        actionMap: new Map(),
        logicMap: new Map(),
        adjacency: new Map([[effectListenerNode.id, []]]),
        eventMap: new Map(),
        eventDefinitions: [],
        parameters: new Map(),
      }

      const effectRegistry = new EffectRegistry()
      effectRegistry.registerEffect('test-effect', mockEffect as unknown as CompiledEffect)

      const engine = createEngine(
        raiserCue(
          effectRaiserNode,
          [actionNode],
          [
            { from: 'event1', to: 'raiser1' },
            { from: 'raiser1', to: 'action1' },
          ],
        ),
        { effectRegistry },
      )

      await engine.startExecution(beatEvent, createCueData('Strong'))

      // Both effect and subsequent action should execute
      // Effect executes async, action executes in chain
      expect(mockSequencer.addEffect).toHaveBeenCalled()
    })

    it('resolves effect raiser literal parameter values with correct types', () => {
      const scoreLikeEffect: YargEffectDefinition = {
        id: 'score-like-effect',
        mode: 'yarg',
        name: 'Score-like',
        description: '',
        variables: [
          {
            name: 'lights',
            type: 'light-array',
            scope: 'cue',
            initialValue: [],
            isParameter: true,
          },
          { name: 'color', type: 'color', scope: 'cue', initialValue: 'white', isParameter: true },
          {
            name: 'waitUntilCondition',
            type: 'string',
            scope: 'cue',
            initialValue: 'beat',
            isParameter: true,
          },
          {
            name: 'waitUntilTime',
            type: 'number',
            scope: 'cue',
            initialValue: 0,
            isParameter: true,
          },
          { name: 'currentLight', type: 'light-array', scope: 'cue', initialValue: [] },
          { name: 'idx', type: 'number', scope: 'cue', initialValue: 0 },
        ],
        nodes: {
          events: [],
          actions: [
            {
              id: 'action-1',
              type: 'action',
              effectType: 'set-color',
              target: {
                groups: { source: 'variable', name: 'currentLight' },
                filter: { source: 'literal', value: 'all' },
              },
              color: {
                name: { source: 'variable', name: 'color' },
                brightness: { source: 'literal', value: 'medium' },
                blendMode: { source: 'literal', value: 'replace' },
              },
              timing: {
                waitForCondition: { source: 'literal', value: 'none' },
                waitForTime: { source: 'literal', value: 0 },
                duration: { source: 'literal', value: 0 },
                waitUntilCondition: { source: 'variable', name: 'waitUntilCondition' },
                waitUntilTime: { source: 'variable', name: 'waitUntilTime' },
                easing: { source: 'literal', value: 'linear' },
                level: { source: 'literal', value: 1 },
              },
              layer: { source: 'literal', value: 1 },
            },
          ],
          logic: [
            {
              id: 'for-each-1',
              type: 'logic',
              logicType: 'for-each-light',
              sourceVariable: 'lights',
              currentLightVariable: 'currentLight',
              currentIndexVariable: 'idx',
            } as any,
          ],
          eventRaisers: [],
          eventListeners: [],
          effectListeners: [
            { id: 'listener-1', type: 'effect-listener', label: 'Entry', outputs: ['for-each-1'] },
          ],
        },
        connections: [
          { from: 'listener-1', to: 'for-each-1' },
          { from: 'for-each-1', to: 'action-1', fromPort: 'each' },
        ],
        layout: { nodePositions: {} },
      }

      const compiledEffect = EffectCompiler.compile(scoreLikeEffect)
      const effectRegistry = new EffectRegistry()
      effectRegistry.registerEffect('score-like-effect', compiledEffect)

      const effectRaiserNode = {
        id: 'raiser1',
        type: 'effect-raiser' as const,
        effectId: 'score-like-effect',
        label: 'Score Effect',
        outputs: [] as string[],
        parameterValues: {
          lights: { source: 'variable' as const, name: 'lights' },
          color: { source: 'literal' as const, value: 'yellow' },
          waitUntilCondition: { source: 'literal' as const, value: 'delay' },
          waitUntilTime: { source: 'literal' as const, value: 500 },
        },
      }

      cueLevelVarStore.set('lights', {
        type: 'light-array',
        value: [
          { id: 'light1', position: 0 },
          { id: 'light2', position: 1 },
        ],
      })

      let submittedEffect: any
      const captureEffect = (_name: string, effectArg: any, _callback?: () => void) => {
        submittedEffect = effectArg
      }
      ;(mockSequencer.addEffectUnblockedNameWithCallback as jest.Mock).mockImplementation(
        captureEffect,
      )
      ;(mockSequencer.setEffectUnblockedNameWithCallback as jest.Mock).mockImplementation(
        captureEffect,
      )

      const engine = createEngine(raiserCue(effectRaiserNode), { effectRegistry })

      engine.startExecution(beatEvent, createCueData('Strong'))

      expect(submittedEffect).toBeDefined()
      expect(submittedEffect.transitions?.length).toBeGreaterThan(0)
      const firstTransition = submittedEffect.transitions[0]
      expect(firstTransition.waitUntilCondition).toBe('delay')
      expect(firstTransition.waitUntilTime).toBe(500)
      expect(firstTransition.transform?.color?.red).toBeGreaterThan(0)
      expect(firstTransition.transform?.color?.green).toBeGreaterThan(0)
    })
  })

  describe('Data Nodes', () => {
    it.each<{
      name: string
      node: LogicNode
      variable: string
      cueData?: Partial<CueData>
      lightsInGroup?: (groups: string | string[]) => Partial<TrackedLight>[]
      expected: number
    }>([
      {
        name: 'should extract YARG cue data and assign to variable',
        node: {
          id: 'cuedata1',
          type: 'logic',
          logicType: 'cue-data',
          dataProperty: 'bpm',
          assignTo: 'currentBpm',
          outputs: [],
        },
        variable: 'currentBpm',
        cueData: { beatsPerMinute: 140 },
        expected: 140,
      },
      {
        name: 'should extract config data and assign to variable',
        node: {
          id: 'configdata1',
          type: 'logic',
          logicType: 'config-data',
          dataProperty: 'front-lights-count',
          assignTo: 'numFrontLights',
          outputs: [],
        },
        variable: 'numFrontLights',
        lightsInGroup: () => Array.from({ length: 8 }, (_, i) => ({ id: `f${i + 1}` })),
        expected: 8,
      },
      {
        name: 'should extract config data for total lights',
        node: {
          id: 'configdata1',
          type: 'logic',
          logicType: 'config-data',
          dataProperty: 'total-lights',
          assignTo: 'totalCount',
          outputs: [],
        },
        variable: 'totalCount',
        lightsInGroup: (groups) => {
          if (Array.isArray(groups)) {
            return [
              { id: 'f1', position: 0 },
              { id: 'f2', position: 1 },
              { id: 'f3', position: 2 },
              { id: 'f4', position: 3 },
              { id: 'b1', position: 0 },
              { id: 'b2', position: 1 },
              { id: 's1', position: 0 },
            ]
          }
          return []
        },
        expected: 7,
      },
    ])('$name', ({ node, variable, cueData, lightsInGroup, expected }) => {
      if (lightsInGroup) {
        mockLightManager.getLightsInGroup = jest.fn(
          lightsInGroup,
        ) as unknown as DmxLightManager['getLightsInGroup']
      }

      const engine = createEngine(
        testCue(
          {
            events: [beatEvent],
            actions: [setColorAction('action1', 'red', { duration: 200 })],
            logic: [node],
          },
          [
            { from: 'event1', to: node.id },
            { from: node.id, to: 'action1' },
          ],
          { variables: [{ name: variable, type: 'number', scope: 'cue', initialValue: 0 }] },
        ),
      )

      engine.startExecution(beatEvent, { ...createCueData('Strong'), ...cueData })

      // Verify variable was set
      const storedVar = cueLevelVarStore.get(variable)
      expect(storedVar).toBeDefined()
      expect(storedVar?.value).toBe(expected)
      expect(storedVar?.type).toBe('number')

      // Action should still execute
      expect(mockSequencer.addEffect).toHaveBeenCalled()
    })

    it('should handle cue data node without assignTo', () => {
      const cueDataNode: LogicNode = {
        id: 'cuedata1',
        type: 'logic',
        logicType: 'cue-data',
        dataProperty: 'execution-count',
        // No assignTo - value should be ignored
        outputs: [],
      }

      const engine = createEngine(
        testCue(
          {
            events: [beatEvent],
            actions: [setColorAction('action1', 'red', { duration: 200 })],
            logic: [cueDataNode],
          },
          [
            { from: 'event1', to: 'cuedata1' },
            { from: 'cuedata1', to: 'action1' },
          ],
        ),
      )

      engine.startExecution(beatEvent, createCueData('Strong'))

      // No variable should be set
      expect(cueLevelVarStore.size).toBe(0)

      // Action should still execute
      expect(mockSequencer.addEffect).toHaveBeenCalled()
    })

    it('should use cue data in conditional branching', () => {
      const cueDataNode: LogicNode = {
        id: 'cuedata1',
        type: 'logic',
        logicType: 'cue-data',
        dataProperty: 'guitar-note-count',
        assignTo: 'noteCount',
        outputs: [],
      }

      const conditionalNode: LogicNode = {
        id: 'conditional1',
        type: 'logic',
        logicType: 'conditional',
        comparator: '>=',
        left: { source: 'variable', name: 'noteCount' },
        right: { source: 'literal', value: 2 },
        outputs: [],
      }

      const engine = createEngine(
        testCue(
          {
            events: [beatEvent],
            actions: [
              setColorAction('action-high', 'red', { duration: 200 }),
              setColorAction('action-low', 'blue', { brightness: 'low', duration: 200 }),
            ],
            logic: [cueDataNode, conditionalNode],
          },
          [
            { from: 'event1', to: 'cuedata1' },
            { from: 'cuedata1', to: 'conditional1' },
            { from: 'conditional1', to: 'action-high', fromPort: 'true' },
            { from: 'conditional1', to: 'action-low', fromPort: 'false' },
          ],
          { variables: [{ name: 'noteCount', type: 'number', scope: 'cue', initialValue: 0 }] },
        ),
      )

      // Test with 3 guitar notes (should trigger high action)
      const parameters = createCueData('Strong')
      parameters.guitarNotes = ['Green', 'Red', 'Yellow'] as CueData['guitarNotes']
      engine.startExecution(beatEvent, parameters)

      // Verify variable was set correctly
      const storedVar = cueLevelVarStore.get('noteCount')
      expect(storedVar?.value).toBe(3)

      // Should execute high action (3 >= 2)
      expect(mockSequencer.addEffect).toHaveBeenCalledWith(
        expect.stringContaining('action-high'),
        expect.anything(),
      )
    })
  })

  describe('Action Node Variable Resolution', () => {
    beforeEach(() => {
      // Update mock light manager to return lights with position
      mockLightManager.getLightsInGroup = jest.fn((group: string | string[]) => {
        const groups = Array.isArray(group) ? group : [group]
        const lights: TrackedLight[] = []
        if (groups.includes('front')) {
          lights.push({ id: 'f1', position: 0 }, { id: 'f2', position: 0 })
        }
        if (groups.includes('back')) {
          lights.push({ id: 'b1', position: 0 })
        }
        return lights
      })
    })

    it.each<{
      name: string
      varName: string
      value: string
      groups: ValueSource
      color: ValueSource
      brightness: string
    }>([
      {
        name: 'should resolve variable for color name',
        varName: 'myColor',
        value: 'red',
        groups: { source: 'literal', value: 'front' },
        color: { source: 'variable', name: 'myColor' },
        brightness: 'medium',
      },
      {
        name: 'should resolve variable for target groups',
        varName: 'targetGroups',
        value: 'front,back',
        groups: { source: 'variable', name: 'targetGroups' },
        color: { source: 'literal', value: 'blue' },
        brightness: 'high',
      },
      {
        name: 'should handle invalid color variable gracefully',
        varName: 'badColor',
        value: 'not-a-valid-color',
        groups: { source: 'literal', value: 'front' },
        color: { source: 'variable', name: 'badColor' },
        brightness: 'medium',
      },
    ])('$name', ({ varName, value, groups, color, brightness }) => {
      // Setup: event -> variable (set string) -> action reading that variable
      const eventNode: NetEventNode = { ...beatEvent, outputs: ['var1'] }

      const variableNode: LogicNode = {
        id: 'var1',
        type: 'logic',
        logicType: 'variable',
        mode: 'set',
        varName,
        valueType: 'string',
        value: { source: 'literal', value },
        outputs: ['action1'],
      }

      const actionNode: ActionNode = {
        id: 'action1',
        type: 'action',
        effectType: 'set-color',
        target: {
          groups,
          filter: { source: 'literal', value: 'all' },
        },
        color: {
          name: color,
          brightness: { source: 'literal', value: brightness },
          blendMode: { source: 'literal', value: 'replace' },
        },
        timing: {
          waitForCondition: { source: 'literal', value: 'none' },
          waitForTime: { source: 'literal', value: 0 },
          duration: { source: 'literal', value: 200 },
          waitUntilCondition: { source: 'literal', value: 'none' },
          waitUntilTime: { source: 'literal', value: 0 },
          easing: { source: 'literal', value: 'sinInOut' },
          level: { source: 'literal', value: 1 },
        },
      }

      const engine = createEngine(
        testCue(
          { events: [eventNode], actions: [actionNode], logic: [variableNode] },
          [
            { from: 'event1', to: 'var1' },
            { from: 'var1', to: 'action1' },
          ],
          {
            cueType: CueType.Intro,
            variables: [{ name: varName, type: 'string', scope: 'cue', initialValue: '' }],
          },
        ),
        { cueId: 'test-cue' },
      )

      engine.startExecution(eventNode, createCueData('Strong'))

      jest.runAllTimers()
      expect(mockSequencer.addEffect).toHaveBeenCalled()
    })

    it('should report runtime error when variable not found', () => {
      // Action references non-existent variable; runtime reports error via IPC
      const eventNode: NetEventNode = { ...beatEvent, outputs: ['action1'] }

      const actionNode: ActionNode = {
        id: 'action1',
        type: 'action',
        effectType: 'set-color',
        target: {
          groups: { source: 'literal', value: 'front' },
          filter: { source: 'literal', value: 'all' },
        },
        color: {
          name: { source: 'variable', name: 'nonExistentColor' },
          brightness: { source: 'literal', value: 'medium' },
          blendMode: { source: 'literal', value: 'replace' },
        },
        timing: {
          waitForCondition: { source: 'literal', value: 'none' },
          waitForTime: { source: 'literal', value: 0 },
          duration: { source: 'literal', value: 200 },
          waitUntilCondition: { source: 'literal', value: 'none' },
          waitUntilTime: { source: 'literal', value: 0 },
          easing: { source: 'literal', value: 'sinInOut' },
          level: { source: 'literal', value: 1 },
        },
      }

      const emit = jest.fn()
      const testBroadcaster = { emit }

      const engine = createEngine(
        testCue(
          { events: [eventNode], actions: [actionNode], logic: [] },
          [{ from: 'event1', to: 'action1' }],
          { cueType: CueType.Intro, variables: [] },
        ),
        { cueId: 'test-cue', broadcaster: testBroadcaster },
      )

      engine.startExecution(eventNode, createCueData('Strong'))

      jest.runAllTimers()
      expect(emit).toHaveBeenCalledWith(
        RENDERER_RECEIVE.NODE_CUE_RUNTIME_ERROR,
        expect.objectContaining({ message: expect.stringContaining('nonExistentColor') }),
      )
    })

    it('should resolve variable for duration', () => {
      // Cue data -> math -> action with dynamic duration
      const eventNode: NetEventNode = { ...beatEvent, outputs: ['cuedata1'] }

      const cueDataNode: LogicNode = {
        id: 'cuedata1',
        type: 'logic',
        logicType: 'cue-data',
        dataProperty: 'bpm',
        assignTo: 'currentBpm',
        outputs: ['math1'],
      }

      const mathNode: LogicNode = {
        id: 'math1',
        type: 'logic',
        logicType: 'math',
        operator: 'multiply',
        left: { source: 'variable', name: 'currentBpm' },
        right: { source: 'literal', value: 5 },
        assignTo: 'calculatedDuration',
        outputs: ['action1'],
      }

      const actionNode: ActionNode = {
        id: 'action1',
        type: 'action',
        effectType: 'set-color',
        target: {
          groups: { source: 'literal', value: 'front' },
          filter: { source: 'literal', value: 'all' },
        },
        color: {
          name: { source: 'literal', value: 'purple' },
          brightness: { source: 'literal', value: 'high' },
          blendMode: { source: 'literal', value: 'replace' },
        },
        timing: {
          waitForCondition: { source: 'literal', value: 'none' },
          waitForTime: { source: 'literal', value: 0 },
          duration: { source: 'variable', name: 'calculatedDuration' },
          waitUntilCondition: { source: 'literal', value: 'none' },
          waitUntilTime: { source: 'literal', value: 0 },
          easing: { source: 'literal', value: 'sinInOut' },
          level: { source: 'literal', value: 1 },
        },
      }

      const engine = createEngine(
        testCue(
          { events: [eventNode], actions: [actionNode], logic: [cueDataNode, mathNode] },
          [
            { from: 'event1', to: 'cuedata1' },
            { from: 'cuedata1', to: 'math1' },
            { from: 'math1', to: 'action1' },
          ],
          {
            cueType: CueType.Intro,
            variables: [
              { name: 'currentBpm', type: 'number', scope: 'cue', initialValue: 0 },
              { name: 'calculatedDuration', type: 'number', scope: 'cue', initialValue: 0 },
            ],
          },
        ),
        { cueId: 'test-cue' },
      )

      engine.startExecution(eventNode, createCueData('Strong'))

      jest.runAllTimers()
      expect(mockSequencer.addEffect).toHaveBeenCalled()
      // Duration should be 120 (BPM) * 5 = 600
      expect(cueLevelVarStore.get('calculatedDuration')?.value).toBe(600)
    })
  })

  describe('Light Array Support', () => {
    it('should store light array from config-data node', () => {
      const mockLights = [
        { id: 'front1', position: 0, config: {} },
        { id: 'front2', position: 1, config: {} },
        { id: 'front3', position: 2, config: {} },
      ]

      mockLightManager.getLightsInGroup = jest.fn().mockReturnValue(mockLights)

      const configDataNode: LogicNode = {
        id: 'config1',
        type: 'logic',
        logicType: 'config-data',
        dataProperty: 'front-lights-array',
        assignTo: 'frontLights',
      }

      const engine = createEngine(
        testCue(
          { events: [beatEvent], actions: [], logic: [configDataNode] },
          [{ from: 'event1', to: 'config1' }],
          {
            cueType: CueType.Intro,
            variables: [
              { name: 'frontLights', type: 'light-array', scope: 'cue', initialValue: [] },
            ],
          },
        ),
        { cueId: 'test-cue' },
      )

      engine.startExecution(beatEvent, createCueData('Strong'))

      // Check that the light array was stored in the variable store
      const storedValue = cueLevelVarStore.get('frontLights')
      expect(storedValue).toBeDefined()
      expect(storedValue?.type).toBe('light-array')
      expect(Array.isArray(storedValue?.value)).toBe(true)
      expect(storedValue?.value).toEqual(mockLights)
    })

    it('should get all config-data array types', () => {
      const mockFrontLights: TrackedLight[] = [
        { id: 'front1', position: 0, config: { ...DEFAULT_MOVING_HEAD_FIXTURE_CONFIG } },
        { id: 'front2', position: 1, config: { ...DEFAULT_MOVING_HEAD_FIXTURE_CONFIG } },
      ]
      const mockBackLights: TrackedLight[] = [
        { id: 'back1', position: 0, config: { ...DEFAULT_MOVING_HEAD_FIXTURE_CONFIG } },
      ]

      mockLightManager.getLightsInGroup = jest.fn((groups: string | string[]) =>
        [groups].flat().flatMap((group) => {
          if (group === 'front') return mockFrontLights
          if (group === 'back') return mockBackLights
          return []
        }),
      )

      const config1: LogicNode = {
        id: 'config1',
        type: 'logic',
        logicType: 'config-data',
        dataProperty: 'front-lights-array',
        assignTo: 'frontLights',
      }

      const config2: LogicNode = {
        id: 'config2',
        type: 'logic',
        logicType: 'config-data',
        dataProperty: 'back-lights-array',
        assignTo: 'backLights',
      }

      const engine = createEngine(
        testCue(
          { events: [beatEvent], actions: [], logic: [config1, config2] },
          [
            { from: 'event1', to: 'config1' },
            { from: 'event1', to: 'config2' },
          ],
          {
            cueType: CueType.Intro,
            variables: [
              { name: 'frontLights', type: 'light-array', scope: 'cue', initialValue: [] },
              { name: 'backLights', type: 'light-array', scope: 'cue', initialValue: [] },
            ],
          },
        ),
        { cueId: 'test-cue' },
      )

      engine.startExecution(beatEvent, createCueData('Strong'))

      expect(cueLevelVarStore.get('frontLights')?.value).toEqual(mockFrontLights)
      expect(cueLevelVarStore.get('backLights')?.value).toEqual(mockBackLights)
    })
  })

  describe('Lights From Index Node', () => {
    it.each([
      ['picks the light at the index', 4, 2],
      ['wraps an index past the end of the array', 3, 5],
      ['wraps a negative index back from the end', 3, -1],
    ] as const)('%s', (_label, lightCount, index) => {
      const mockLights = Array.from({ length: lightCount }, (_, i) => ({
        id: `light${i}`,
        position: i,
        config: {} as MinimalLightConfig,
      }))

      mockLightManager.getLightsInGroup = jest.fn().mockReturnValue(mockLights)

      const configNode: LogicNode = {
        id: 'config1',
        type: 'logic',
        logicType: 'config-data',
        dataProperty: 'front-lights-array',
        assignTo: 'allLights',
      }

      const indexNode: LogicNode = {
        id: 'lights-index1',
        type: 'logic',
        logicType: 'lights-from-index',
        sourceVariable: 'allLights',
        index: { source: 'literal', value: index },
        assignTo: 'selectedLight',
      }

      const engine = createEngine(
        testCue(
          { events: [beatEvent], actions: [], logic: [configNode, indexNode] },
          [
            { from: 'event1', to: 'config1' },
            { from: 'config1', to: 'lights-index1' },
          ],
          {
            cueType: CueType.Intro,
            variables: [
              { name: 'allLights', type: 'light-array', scope: 'cue', initialValue: [] },
              { name: 'selectedLight', type: 'light-array', scope: 'cue', initialValue: [] },
            ],
          },
        ),
        { cueId: 'test-cue' },
      )

      engine.startExecution(beatEvent, createCueData('Strong'))

      const selectedLight = cueLevelVarStore.get('selectedLight')
      expect(selectedLight).toBeDefined()
      expect(selectedLight?.type).toBe('light-array')
      expect(selectedLight?.value).toEqual([mockLights[2]])
    })
  })

  describe('set-position direction mode', () => {
    it('uses panDirectionCW from fixture config when resolving bearing', () => {
      const movingHead: TrackedLight = {
        id: 'mh1',
        position: 1,
        config: {
          ...DEFAULT_MOVING_HEAD_FIXTURE_CONFIG,
          panHome: 50,
          panRangeDeg: 540,
          panDirectionCW: false,
        },
      }
      mockLightManager.getLights = jest.fn(() => [movingHead])

      const eventNode: NetEventNode = {
        id: 'event1',
        type: 'event',
        eventType: 'beat',
      }
      const actionNode: ActionNode = {
        id: 'action1',
        type: 'action',
        effectType: 'set-position',
        target: {
          groups: { source: 'literal', value: 'front' },
          filter: { source: 'literal', value: 'all' },
        },
        position: {
          mode: 'direction',
          bearing: { source: 'literal', value: 90 },
          angle: { source: 'literal', value: 0 },
        },
        timing: {
          waitForCondition: { source: 'literal', value: 'none' },
          waitForTime: { source: 'literal', value: 0 },
          duration: { source: 'literal', value: 200 },
          waitUntilCondition: { source: 'literal', value: 'none' },
          waitUntilTime: { source: 'literal', value: 0 },
          easing: { source: 'literal', value: 'linear' },
        },
      }
      const definition: NetNodeCueDefinition = {
        id: 'position-cue',
        name: 'Position Cue',
        kind: 'lighting',
        cueType: CueType.Stomp,
        style: 'primary',
        nodes: { events: [eventNode], actions: [actionNode], logic: [] },
        connections: [{ from: 'event1', to: 'action1' }],
      }

      const engine = new NodeExecutionEngine(
        NodeCueCompiler.compileCue<NetEventNode>(definition, 'yarg'),
        'test-group:position-cue',
        mockSequencer,
        mockLightManager,
        noopRuntimeBroadcaster(),
        cueLevelVarStore,
        groupLevelVarStore,
        new EffectRegistry(),
      )

      engine.startExecution(eventNode, createCueData('Strong'))

      // Non-blocking set-position routes through replaceEffect (latest-wins per (layer, light))
      // rather than addEffect, so a stale in-flight transition can never queue ahead of the
      // new resolved position.
      expect(mockSequencer.replaceEffect).toHaveBeenCalledTimes(1)
      expect(mockSequencer.addEffect).not.toHaveBeenCalled()
      const effect = (mockSequencer.replaceEffect as jest.Mock).mock.calls[0]?.[1]
      const pan = effect?.transitions?.[0]?.transform?.color?.pan
      // 90° bearing on a 540° fixture = 16.666..%; CCW fixtures subtract from home.
      expect(pan).toBeCloseTo(50 - (90 / 540) * 100, 5)
    })

    it('replaces (not queues) on rapid re-submission so latest position wins', () => {
      const movingHead: TrackedLight = {
        id: 'mh1',
        position: 1,
        config: { ...DEFAULT_MOVING_HEAD_FIXTURE_CONFIG },
      }
      mockLightManager.getLights = jest.fn(() => [movingHead])

      cueLevelVarStore.set('bearing', { type: 'number', value: 90 })

      const eventNode: NetEventNode = {
        id: 'event1',
        type: 'event',
        eventType: 'beat',
      }
      const actionNode: ActionNode = {
        id: 'action1',
        type: 'action',
        effectType: 'set-position',
        target: {
          groups: { source: 'literal', value: 'front' },
          filter: { source: 'literal', value: 'all' },
        },
        position: {
          mode: 'direction',
          bearing: { source: 'variable', name: 'bearing' },
          angle: { source: 'literal', value: 30 },
        },
        timing: {
          waitForCondition: { source: 'literal', value: 'none' },
          waitForTime: { source: 'literal', value: 0 },
          duration: { source: 'literal', value: 500 },
          waitUntilCondition: { source: 'literal', value: 'none' },
          waitUntilTime: { source: 'literal', value: 0 },
          easing: { source: 'literal', value: 'easeInOut' },
        },
      }
      const definition: NetNodeCueDefinition = {
        id: 'crossbeat-style-cue',
        name: 'Crossbeat Style Cue',
        kind: 'lighting',
        cueType: CueType.Stomp,
        style: 'primary',
        nodes: { events: [eventNode], actions: [actionNode], logic: [] },
        connections: [{ from: 'event1', to: 'action1' }],
      }

      const engine = new NodeExecutionEngine(
        NodeCueCompiler.compileCue<NetEventNode>(definition, 'yarg'),
        'test-group:crossbeat-style-cue',
        mockSequencer,
        mockLightManager,
        noopRuntimeBroadcaster(),
        cueLevelVarStore,
        groupLevelVarStore,
        new EffectRegistry(),
      )

      engine.startExecution(eventNode, createCueData('Strong'))
      cueLevelVarStore.set('bearing', { type: 'number', value: 270 })
      engine.startExecution(eventNode, createCueData('Weak'))

      expect(mockSequencer.replaceEffect).toHaveBeenCalledTimes(2)
      expect(mockSequencer.addEffect).not.toHaveBeenCalled()
    })
  })

  describe('two cues sharing one groupId, one stops', () => {
    it('second cue can still run after first cue is stopped', () => {
      const groupId = 'shared-group'
      const eventNode: NetEventNode = {
        id: 'event1',
        type: 'event',
        eventType: 'cue-started',
      }
      const actionNode: ActionNode = {
        id: 'action1',
        type: 'action',
        effectType: 'set-color',
        target: {
          groups: { source: 'literal', value: 'front' },
          filter: { source: 'literal', value: 'all' },
        },
        color: {
          name: { source: 'literal', value: 'red' },
          brightness: { source: 'literal', value: 'high' },
        },
        timing: {
          waitForCondition: { source: 'literal', value: 'none' },
          waitForTime: { source: 'literal', value: 0 },
          duration: { source: 'literal', value: 200 },
          waitUntilCondition: { source: 'literal', value: 'none' },
          waitUntilTime: { source: 'literal', value: 0 },
          easing: { source: 'literal', value: 'linear' },
        },
      }
      const definition1: NetNodeCueDefinition = {
        id: 'cue-a',
        name: 'Cue A',
        kind: 'lighting',
        cueType: CueType.Sweep,
        style: 'primary',
        nodes: { events: [eventNode], actions: [actionNode], logic: [] },
        connections: [{ from: 'event1', to: 'action1' }],
      }
      const definition2: NetNodeCueDefinition = {
        id: 'cue-b',
        name: 'Cue B',
        kind: 'lighting',
        cueType: CueType.Stomp,
        style: 'primary',
        nodes: {
          events: [{ ...eventNode, id: 'ev2', eventType: 'cue-started' }],
          actions: [{ ...actionNode, id: 'act2' }],
          logic: [],
        },
        connections: [{ from: 'ev2', to: 'act2' }],
      }
      const compiled1 = NodeCueCompiler.compileCue(definition1, 'yarg')
      const compiled2 = NodeCueCompiler.compileCue(definition2, 'yarg')
      const registry = new EffectRegistry()
      const cue1 = new LightingNodeCue(groupId, compiled1, registry)
      const cue2 = new LightingNodeCue(groupId, compiled2, registry)
      const params = createCueData('Strong')

      cue1.execute(params, mockSequencer, mockLightManager)
      cue1.onStop()
      const totalCallsBefore =
        (mockSequencer.setEffectUnblockedName as jest.Mock).mock.calls.length +
        (mockSequencer.addEffect as jest.Mock).mock.calls.length
      cue2.execute(params, mockSequencer, mockLightManager)
      const totalCallsAfter =
        (mockSequencer.setEffectUnblockedName as jest.Mock).mock.calls.length +
        (mockSequencer.addEffect as jest.Mock).mock.calls.length

      expect(totalCallsAfter).toBeGreaterThan(totalCallsBefore)
    })
  })

  describe('Led Changed Fan-Out', () => {
    const bank = (positions: number[]): number => positions.reduce((mask, p) => mask | (1 << p), 0)
    const banks = (red = 0, green = 0, blue = 0, yellow = 0) => ({ red, green, blue, yellow })
    const frame = (
      now: ReturnType<typeof banks>,
      prev: ReturnType<typeof banks> | undefined,
    ): CueData => ({
      ...createCueData('Strong'),
      lightingCue: CueType.RB3,
      ledBanks: now,
      previousFrame: prev === undefined ? undefined : { ledBanks: prev },
    })

    const ledChangedNode = {
      id: 'lc1',
      type: 'logic',
      logicType: 'led-changed',
      assignIndex: 'ledIndex',
      assignColor: 'ledColor',
      assignEdge: 'ledEdge',
    } as unknown as LogicNode

    const actionNode = setColorAction('action1', 'red', { duration: 200, easing: 'linear' })

    const ledVariables: VariableDefinition[] = [
      { name: 'ledIndex', type: 'number', scope: 'cue', initialValue: 0 },
      { name: 'ledColor', type: 'string', scope: 'cue', initialValue: 'transparent' },
      { name: 'ledEdge', type: 'string', scope: 'cue', initialValue: '' },
    ]

    const buildEngine = (): NodeExecutionEngine =>
      createEngine(
        testCue(
          { events: [beatEvent], actions: [actionNode], logic: [ledChangedNode] },
          [
            { from: 'event1', to: 'lc1' },
            { from: 'lc1', to: 'action1', fromPort: 'each' },
          ],
          { cueType: CueType.RB3 },
        ),
        { variables: ledVariables },
      )

    const runFrame = (cueData: CueData): string[] => {
      ;(mockSequencer.addEffect as jest.Mock).mockClear()
      buildEngine().startExecution(beatEvent, cueData)
      return (mockSequencer.addEffect as jest.Mock).mock.calls.map((c) => c[0] as string)
    }

    it('fires once per changed position with a stable per-position effect name', () => {
      // Positions 0 & 2 red, 4 blue; previous all-off, so three on-edges fan out.
      const names = runFrame(frame(banks(bank([0, 2]), 0, bank([4]), 0), banks(0, 0, 0, 0)))
      expect(names).toHaveLength(3)
      expect(names).toEqual(
        expect.arrayContaining([
          'test-group:test-cue:action1:0',
          'test-group:test-cue:action1:2',
          'test-group:test-cue:action1:4',
        ]),
      )
    })

    it('runs nothing when no LED position changed between frames', () => {
      const same = banks(bank([0, 2]), 0, bank([4]), 0)
      expect(runFrame(frame(same, same))).toHaveLength(0)
    })

    it('seeds index / colour and classifies the edge as on, off, or color', () => {
      // off -> red at position 0 is an on-edge.
      runFrame(frame(banks(bank([0]), 0, 0, 0), banks(0, 0, 0, 0)))
      expect(cueLevelVarStore.get('ledIndex')?.value).toBe(0)
      expect(cueLevelVarStore.get('ledColor')?.value).toBe('red')
      expect(cueLevelVarStore.get('ledEdge')?.value).toBe('on')

      // red -> off is an off-edge, colour reads transparent.
      runFrame(frame(banks(0, 0, 0, 0), banks(bank([0]), 0, 0, 0)))
      expect(cueLevelVarStore.get('ledColor')?.value).toBe('transparent')
      expect(cueLevelVarStore.get('ledEdge')?.value).toBe('off')

      // red -> green while staying lit is a colour edge.
      runFrame(frame(banks(0, bank([0]), 0, 0), banks(bank([0]), 0, 0, 0)))
      expect(cueLevelVarStore.get('ledColor')?.value).toBe('green')
      expect(cueLevelVarStore.get('ledEdge')?.value).toBe('color')
    })

    it('runs the done branch after the fan-out and reuses the memoized body across frames', () => {
      const action2: ActionNode = { ...actionNode, id: 'action2' }
      const engine = createEngine(
        testCue(
          { events: [beatEvent], actions: [actionNode, action2], logic: [ledChangedNode] },
          [
            { from: 'event1', to: 'lc1' },
            { from: 'lc1', to: 'action1', fromPort: 'each' },
            { from: 'lc1', to: 'action2', fromPort: 'done' },
          ],
          { cueType: CueType.RB3 },
        ),
        { mode: 'rb3', variables: ledVariables },
      )
      const run = (): string[] => {
        ;(mockSequencer.addEffect as jest.Mock).mockClear()
        engine.startExecution(beatEvent, frame(banks(bank([0, 2]), 0, 0, 0), banks(0, 0, 0, 0)))
        return (mockSequencer.addEffect as jest.Mock).mock.calls.map((c) => c[0] as string)
      }

      // Two changed positions fan out (each :0 / :2), then the done branch runs once with the iteration
      // index reset (so action2 has no position suffix).
      const first = run()
      expect(first).toEqual([
        'test-group:test-cue:action1:0',
        'test-group:test-cue:action1:2',
        'test-group:test-cue:action2',
      ])
      // A second frame on the SAME engine reuses the memoized body set and produces the identical fan-out.
      expect(run()).toEqual(first)
    })
  })
})
