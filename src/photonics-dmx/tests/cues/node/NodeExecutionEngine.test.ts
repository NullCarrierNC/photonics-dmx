import { NodeExecutionEngine } from '../../../cues/node/runtime/NodeExecutionEngine'
import { ExecutionContext } from '../../../cues/node/runtime/ExecutionContext'
import { NodeCueCompiler, CompiledYargCue } from '../../../cues/node/compiler/NodeCueCompiler'
import { EffectCompiler } from '../../../cues/node/compiler/EffectCompiler'
import { EffectRegistry } from '../../../cues/node/runtime/EffectRegistry'
import { YargNodeCue } from '../../../cues/node/runtime/YargNodeCue'
import {
  YargNodeCueDefinition,
  YargEventNode,
  ActionNode,
  LogicNode,
} from '../../../cues/types/nodeCueTypes'
import type { YargEffectDefinition } from '../../../cues/types/nodeCueTypes'
import { ILightingController } from '../../../controllers/sequencer/interfaces'
import { DmxLightManager } from '../../../controllers/DmxLightManager'
import { Beat, CueData, CueType } from '../../../cues/types/cueTypes'
import { VariableValue } from '../../../cues/node/runtime/executionTypes'
import type { CompiledEffect } from '../../../cues/node/runtime/EffectRegistry'
import type { TrackedLight } from '../../../types'
import type { FixtureConfig } from '../../../types'
import { RENDERER_RECEIVE } from '../../../../shared/ipcChannels'
import { sendToAllWindows } from '../../../../main/utils/windowUtils'

/** Minimal fixture config for test TrackedLight objects */
type MinimalLightConfig = Partial<FixtureConfig>

jest.mock('../../../../main/utils/windowUtils', () => ({ sendToAllWindows: jest.fn() }))

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

  beforeEach(() => {
    // Create mock sequencer
    mockSequencer = {
      addEffect: jest.fn(),
      addEffectWithCallback: jest.fn((_name, _effect, callback) => {
        if (callback) setTimeout(() => callback(), 1)
      }),
      setEffectWithCallback: jest.fn((_name, _effect, callback) => {
        if (callback) setTimeout(() => callback(), 1)
      }),
      addEffectUnblockedNameWithCallback: jest.fn((_name, _effect, callback) => {
        if (callback) setTimeout(() => callback(), 1)
      }),
      setEffectUnblockedNameWithCallback: jest.fn((_name, _effect, callback) => {
        if (callback) setTimeout(() => callback(), 1)
      }),
      removeEffectCallback: jest.fn(),
      setEffect: jest.fn(),
      removeEffect: jest.fn(),
      removeAllEffects: jest.fn(),
      removeEffectByLayer: jest.fn(),
      addEffectUnblockedName: jest.fn(),
      setEffectUnblockedName: jest.fn(),
      getActiveEffectsForLight: jest.fn(),
      isLayerFreeForLight: jest.fn(),
      setState: jest.fn(),
      onBeat: jest.fn(),
      onMeasure: jest.fn(),
      onKeyframe: jest.fn(),
      onDrumNote: jest.fn(),
      onGuitarNote: jest.fn(),
      onBassNote: jest.fn(),
      onKeysNote: jest.fn(),
      blackout: jest.fn(),
      cancelBlackout: jest.fn(),
      enableDebug: jest.fn(),
      debugLightLayers: jest.fn(),
      shutdown: jest.fn(),
    } as unknown as ILightingController

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
      const eventNode: YargEventNode = {
        id: 'event1',
        type: 'event',
        eventType: 'beat',
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
          easing: 'linear',
        },
      }

      const definition: YargNodeCueDefinition = {
        id: 'test-cue',
        name: 'Test Cue',
        cueType: CueType.Default,
        style: 'primary',
        nodes: {
          events: [eventNode],
          actions: [actionNode],
          logic: [],
        },
        connections: [{ from: 'event1', to: 'action1' }],
      }

      const compiledCue: CompiledYargCue = {
        definition,
        eventMap: new Map([['event1', eventNode]]),
        actionMap: new Map([['action1', actionNode]]),
        logicMap: new Map(),
        eventRaiserMap: new Map(),
        eventListenerMap: new Map(),
        effectRaiserMap: new Map(),
        eventDefinitions: [],
        adjacency: new Map([['event1', [{ from: 'event1', to: 'action1' }]]]),
      }

      const engine = new NodeExecutionEngine(
        compiledCue,
        'test-group:test-cue',
        mockSequencer,
        mockLightManager,
        cueLevelVarStore,
        groupLevelVarStore,
        new EffectRegistry(),
      )

      const parameters = createCueData('Strong')
      engine.startExecution(eventNode, parameters)

      // Verify that addEffect was called
      expect(mockSequencer.addEffect).toHaveBeenCalledTimes(1)
      expect(mockLightManager.getLights).toHaveBeenCalled()
    })

    it('should handle action -> action chain', () => {
      const eventNode: YargEventNode = {
        id: 'event1',
        type: 'event',
        eventType: 'beat',
      }

      const action1: ActionNode = {
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
          duration: { source: 'literal', value: 100 },
          waitUntilCondition: { source: 'literal', value: 'none' },
          waitUntilTime: { source: 'literal', value: 0 },
        },
      }

      const action2: ActionNode = {
        id: 'action2',
        type: 'action',
        effectType: 'set-color',
        target: {
          groups: { source: 'literal', value: 'back' },
          filter: { source: 'literal', value: 'all' },
        },
        color: {
          name: { source: 'literal', value: 'blue' },
          brightness: { source: 'literal', value: 'high' },
        },
        timing: {
          waitForCondition: { source: 'literal', value: 'none' },
          waitForTime: { source: 'literal', value: 0 },
          duration: { source: 'literal', value: 100 },
          waitUntilCondition: { source: 'literal', value: 'none' },
          waitUntilTime: { source: 'literal', value: 0 },
        },
      }

      mockLightManager.getLights = jest.fn((group: string | string[]) => {
        const groups = Array.isArray(group) ? group : [group]
        if (groups.includes('back')) {
          return [
            {
              id: 'back1',
              position: 1,
              config: {
                panHome: 0,
                panMin: 0,
                panMax: 255,
                tiltHome: 0,
                tiltMin: 0,
                tiltMax: 255,
                invert: false,
              },
            },
          ]
        }
        return [
          {
            id: 'front1',
            position: 0,
            config: {
              panHome: 0,
              panMin: 0,
              panMax: 255,
              tiltHome: 0,
              tiltMin: 0,
              tiltMax: 255,
              invert: false,
            },
          },
        ]
      })

      const definition: YargNodeCueDefinition = {
        id: 'test-cue',
        name: 'Test Cue',
        cueType: CueType.Default,
        style: 'primary',
        nodes: {
          events: [eventNode],
          actions: [action1, action2],
          logic: [],
        },
        connections: [
          { from: 'event1', to: 'action1' },
          { from: 'action1', to: 'action2' },
        ],
      }

      const compiledCue: CompiledYargCue = {
        definition,
        eventMap: new Map([['event1', eventNode]]),
        actionMap: new Map([
          ['action1', action1],
          ['action2', action2],
        ]),
        logicMap: new Map(),
        eventRaiserMap: new Map(),
        eventListenerMap: new Map(),
        effectRaiserMap: new Map(),
        eventDefinitions: [],
        adjacency: new Map([
          ['event1', [{ from: 'event1', to: 'action1' }]],
          ['action1', [{ from: 'action1', to: 'action2' }]],
        ]),
      }

      const engine = new NodeExecutionEngine(
        compiledCue,
        'test-group:test-cue',
        mockSequencer,
        mockLightManager,
        cueLevelVarStore,
        groupLevelVarStore,
        new EffectRegistry(),
      )

      engine.startExecution(eventNode, createCueData('Strong'))

      // With different layers chain is not composed; each action is submitted (fire-and-forget)
      expect(mockSequencer.addEffect).toHaveBeenCalledTimes(2)
    })
  })

  describe('Logic Node Execution', () => {
    it('should evaluate conditional node at runtime', () => {
      const eventNode: YargEventNode = {
        id: 'event1',
        type: 'event',
        eventType: 'beat',
      }

      const conditionalNode: LogicNode = {
        id: 'logic1',
        type: 'logic',
        logicType: 'conditional',
        comparator: '>',
        left: { source: 'literal', value: 5 },
        right: { source: 'literal', value: 3 },
      }

      const actionTrue: ActionNode = {
        id: 'action-true',
        type: 'action',
        effectType: 'set-color',
        target: {
          groups: { source: 'literal', value: 'front' },
          filter: { source: 'literal', value: 'all' },
        },
        color: {
          name: { source: 'literal', value: 'green' },
          brightness: { source: 'literal', value: 'high' },
        },
        timing: {
          waitForCondition: { source: 'literal', value: 'none' },
          waitForTime: { source: 'literal', value: 0 },
          duration: { source: 'literal', value: 100 },
          waitUntilCondition: { source: 'literal', value: 'none' },
          waitUntilTime: { source: 'literal', value: 0 },
        },
      }

      const actionFalse: ActionNode = {
        id: 'action-false',
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
          duration: { source: 'literal', value: 100 },
          waitUntilCondition: { source: 'literal', value: 'none' },
          waitUntilTime: { source: 'literal', value: 0 },
        },
      }

      const definition: YargNodeCueDefinition = {
        id: 'test-cue',
        name: 'Test Cue',
        cueType: CueType.Default,
        style: 'primary',
        nodes: {
          events: [eventNode],
          actions: [actionTrue, actionFalse],
          logic: [conditionalNode],
        },
        connections: [
          { from: 'event1', to: 'logic1' },
          { from: 'logic1', to: 'action-true', fromPort: 'true' },
          { from: 'logic1', to: 'action-false', fromPort: 'false' },
        ],
      }

      const compiledCue: CompiledYargCue = {
        definition,
        eventMap: new Map([['event1', eventNode]]),
        actionMap: new Map([
          ['action-true', actionTrue],
          ['action-false', actionFalse],
        ]),
        logicMap: new Map([['logic1', conditionalNode]]),
        eventRaiserMap: new Map(),
        eventListenerMap: new Map(),
        effectRaiserMap: new Map(),
        eventDefinitions: [],
        adjacency: new Map([
          ['event1', [{ from: 'event1', to: 'logic1' }]],
          [
            'logic1',
            [
              { from: 'logic1', to: 'action-true', fromPort: 'true' },
              { from: 'logic1', to: 'action-false', fromPort: 'false' },
            ],
          ],
        ]),
      }

      const engine = new NodeExecutionEngine(
        compiledCue,
        'test-group:test-cue',
        mockSequencer,
        mockLightManager,
        cueLevelVarStore,
        groupLevelVarStore,
        new EffectRegistry(),
      )

      engine.startExecution(eventNode, createCueData('Strong'))

      // Since 5 > 3 is true, action-true should be executed
      expect(mockSequencer.addEffect).toHaveBeenCalledTimes(1)
      const call = jest.mocked(mockSequencer.addEffect).mock.calls[0]
      const effectName = call[0]
      expect(effectName).toContain('action-true')
    })

    it('should set and read variables at runtime', async () => {
      const eventNode: YargEventNode = {
        id: 'event1',
        type: 'event',
        eventType: 'beat',
      }

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

      const actionNode: ActionNode = {
        id: 'action1',
        type: 'action',
        effectType: 'set-color',
        target: {
          groups: { source: 'literal', value: 'front' },
          filter: { source: 'literal', value: 'all' },
        },
        color: {
          name: { source: 'literal', value: 'green' },
          brightness: { source: 'literal', value: 'high' },
        },
        timing: {
          waitForCondition: { source: 'literal', value: 'none' },
          waitForTime: { source: 'literal', value: 0 },
          duration: { source: 'literal', value: 100 },
          waitUntilCondition: { source: 'literal', value: 'none' },
          waitUntilTime: { source: 'literal', value: 0 },
        },
      }

      const definition: YargNodeCueDefinition = {
        id: 'test-cue',
        name: 'Test Cue',
        cueType: CueType.Default,
        style: 'primary',
        nodes: {
          events: [eventNode],
          actions: [actionNode],
          logic: [setVarNode, readVarNode],
        },
        connections: [
          { from: 'event1', to: 'logic1' },
          { from: 'logic1', to: 'logic2' },
          { from: 'logic2', to: 'action1', fromPort: 'true' },
        ],
        variables: [
          {
            name: 'counter',
            type: 'number',
            scope: 'cue',
            initialValue: 0,
          },
        ],
      }

      const compiledCue: CompiledYargCue = {
        definition,
        eventMap: new Map([['event1', eventNode]]),
        actionMap: new Map([['action1', actionNode]]),
        logicMap: new Map<string, LogicNode>([
          ['logic1', setVarNode],
          ['logic2', readVarNode],
        ]),
        eventRaiserMap: new Map(),
        eventListenerMap: new Map(),
        effectRaiserMap: new Map(),
        eventDefinitions: [],
        adjacency: new Map([
          ['event1', [{ from: 'event1', to: 'logic1' }]],
          ['logic1', [{ from: 'logic1', to: 'logic2' }]],
          ['logic2', [{ from: 'logic2', to: 'action1', fromPort: 'true' }]],
        ]),
      }

      const engine = new NodeExecutionEngine(
        compiledCue,
        'test-group:test-cue',
        mockSequencer,
        mockLightManager,
        cueLevelVarStore,
        groupLevelVarStore,
        new EffectRegistry(),
        definition.variables ?? [],
      )

      engine.startExecution(eventNode, createCueData('Strong'))

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
    it('should prevent cycles with visited tracking', () => {
      const eventNode: YargEventNode = {
        id: 'event1',
        type: 'event',
        eventType: 'beat',
      }

      const context = new ExecutionContext(
        eventNode,
        createCueData('Strong'),
        cueLevelVarStore,
        groupLevelVarStore,
      )

      // Mark node as visited
      context.markVisited('action1')

      // Should return true for visited node
      expect(context.hasVisited('action1')).toBe(true)

      // Should return false for unvisited node
      expect(context.hasVisited('action2')).toBe(false)
    })

    it('should track active actions', () => {
      const eventNode: YargEventNode = {
        id: 'event1',
        type: 'event',
        eventType: 'beat',
      }

      const context = new ExecutionContext(
        eventNode,
        createCueData('Strong'),
        cueLevelVarStore,
        groupLevelVarStore,
      )

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
          duration: { source: 'literal', value: 100 },
          waitUntilCondition: { source: 'literal', value: 'none' },
          waitUntilTime: { source: 'literal', value: 0 },
        },
      }

      // Register active action
      context.registerActiveAction('action1', actionNode)
      expect(context.hasActiveActions()).toBe(true)

      // Complete action
      context.completeAction('action1')
      expect(context.hasActiveActions()).toBe(false)
    })

    it('should detect completion correctly', () => {
      const eventNode: YargEventNode = {
        id: 'event1',
        type: 'event',
        eventType: 'beat',
      }

      const context = new ExecutionContext(
        eventNode,
        createCueData('Strong'),
        cueLevelVarStore,
        groupLevelVarStore,
      )

      // Context with no active nodes should be complete
      expect(context.isComplete()).toBe(true)
      expect(context.tryComplete()).toBe(true)

      // With an active action, context is not complete
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
          duration: { source: 'literal', value: 100 },
          waitUntilCondition: { source: 'literal', value: 'none' },
          waitUntilTime: { source: 'literal', value: 0 },
        },
      }
      context.registerActiveAction('action1', actionNode)
      expect(context.isComplete()).toBe(false)
      expect(context.tryComplete()).toBe(false)
    })
  })

  describe('Error Handling', () => {
    it('should handle missing action nodes gracefully', () => {
      const eventNode: YargEventNode = {
        id: 'event1',
        type: 'event',
        eventType: 'beat',
      }

      const definition: YargNodeCueDefinition = {
        id: 'test-cue',
        name: 'Test Cue',
        cueType: CueType.Default,
        style: 'primary',
        nodes: {
          events: [eventNode],
          actions: [],
          logic: [],
        },
        connections: [{ from: 'event1', to: 'nonexistent-action' }],
      }

      const compiledCue: CompiledYargCue = {
        definition,
        eventMap: new Map([['event1', eventNode]]),
        actionMap: new Map(),
        logicMap: new Map(),
        eventRaiserMap: new Map(),
        eventListenerMap: new Map(),
        effectRaiserMap: new Map(),
        eventDefinitions: [],
        adjacency: new Map([['event1', [{ from: 'event1', to: 'nonexistent-action' }]]]),
      }

      const engine = new NodeExecutionEngine(
        compiledCue,
        'test-group:test-cue',
        mockSequencer,
        mockLightManager,
        cueLevelVarStore,
        groupLevelVarStore,
        new EffectRegistry(),
      )

      // Should not throw
      expect(() => {
        engine.startExecution(eventNode, createCueData('Strong'))
      }).not.toThrow()
    })

    it('should cleanup on cancelAll', () => {
      const eventNode: YargEventNode = {
        id: 'event1',
        type: 'event',
        eventType: 'beat',
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
          duration: { source: 'literal', value: 100 },
          waitUntilCondition: { source: 'literal', value: 'none' },
          waitUntilTime: { source: 'literal', value: 0 },
        },
      }

      const definition: YargNodeCueDefinition = {
        id: 'test-cue',
        name: 'Test Cue',
        cueType: CueType.Default,
        style: 'primary',
        nodes: {
          events: [eventNode],
          actions: [actionNode],
          logic: [],
        },
        connections: [{ from: 'event1', to: 'action1' }],
      }

      const compiledCue: CompiledYargCue = {
        definition,
        eventMap: new Map([['event1', eventNode]]),
        actionMap: new Map([['action1', actionNode]]),
        logicMap: new Map(),
        eventRaiserMap: new Map(),
        eventListenerMap: new Map(),
        effectRaiserMap: new Map(),
        eventDefinitions: [],
        adjacency: new Map([['event1', [{ from: 'event1', to: 'action1' }]]]),
      }

      const engine = new NodeExecutionEngine(
        compiledCue,
        'test-group:test-cue',
        mockSequencer,
        mockLightManager,
        cueLevelVarStore,
        groupLevelVarStore,
        new EffectRegistry(),
      )

      engine.startExecution(eventNode, createCueData('Strong'))

      // Cancel all executions
      engine.cancelAll()

      // Execution state should be empty
      const state = engine.getExecutionState()
      expect(state.activeContexts).toHaveLength(0)
    })

    it('cancelAll(true) leaves effects on sequencer so lights stay lit during cue transition', () => {
      const eventNode: YargEventNode = {
        id: 'event1',
        type: 'event',
        eventType: 'beat',
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
          duration: { source: 'literal', value: 100 },
          waitUntilCondition: { source: 'literal', value: 'none' },
          waitUntilTime: { source: 'literal', value: 0 },
        },
      }

      const definition: YargNodeCueDefinition = {
        id: 'test-cue',
        name: 'Test Cue',
        cueType: CueType.Default,
        style: 'primary',
        nodes: {
          events: [eventNode],
          actions: [actionNode],
          logic: [],
        },
        connections: [{ from: 'event1', to: 'action1' }],
      }

      const compiledCue: CompiledYargCue = {
        definition,
        eventMap: new Map([['event1', eventNode]]),
        actionMap: new Map([['action1', actionNode]]),
        logicMap: new Map(),
        eventRaiserMap: new Map(),
        eventListenerMap: new Map(),
        effectRaiserMap: new Map(),
        eventDefinitions: [],
        adjacency: new Map([['event1', [{ from: 'event1', to: 'action1' }]]]),
      }

      const engine = new NodeExecutionEngine(
        compiledCue,
        'test-group:test-cue',
        mockSequencer,
        mockLightManager,
        cueLevelVarStore,
        groupLevelVarStore,
        new EffectRegistry(),
      )

      engine.startExecution(eventNode, createCueData('Strong'))

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
    it('should execute effect when Effect Raiser is triggered', async () => {
      const eventNode: YargEventNode = {
        id: 'event1',
        type: 'event',
        eventType: 'beat',
      }

      const effectRaiserNode = {
        id: 'raiser1',
        type: 'effect-raiser' as const,
        effectId: 'test-effect',
        label: 'Raise Effect',
        outputs: [],
      }

      const definition: YargNodeCueDefinition = {
        id: 'test-cue',
        name: 'Test Cue',
        cueType: 'TestType' as CueType,
        style: 'primary',
        description: 'Test',
        nodes: {
          events: [eventNode],
          actions: [],
          logic: [],
          eventRaisers: [],
          eventListeners: [],
          effectRaisers: [effectRaiserNode],
        },
        connections: [{ from: 'event1', to: 'raiser1' }],
      }

      const compiledCue: CompiledYargCue = {
        definition,
        eventMap: new Map([['event1', eventNode]]),
        actionMap: new Map(),
        logicMap: new Map(),
        eventRaiserMap: new Map(),
        eventListenerMap: new Map(),
        effectRaiserMap: new Map([['raiser1', effectRaiserNode]]),
        eventDefinitions: [],
        adjacency: new Map([['event1', [{ from: 'event1', to: 'raiser1' }]]]),
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

      const engine = new NodeExecutionEngine(
        compiledCue,
        'test-group:test-cue',
        mockSequencer,
        mockLightManager,
        cueLevelVarStore,
        groupLevelVarStore,
        effectRegistry,
      )

      await engine.startExecution(eventNode, createCueData('Strong'))

      // Effect should be found and executed (non-blocking)
      // In real execution, EffectExecutionEngine would be triggered
      expect(effectRegistry.hasEffect('test-effect')).toBe(true)
    })

    it('should handle missing effect gracefully', () => {
      const eventNode: YargEventNode = {
        id: 'event1',
        type: 'event',
        eventType: 'beat',
      }

      const effectRaiserNode = {
        id: 'raiser1',
        type: 'effect-raiser' as const,
        effectId: 'missing-effect',
        label: 'Raise Missing Effect',
        outputs: [],
      }

      const definition: YargNodeCueDefinition = {
        id: 'test-cue',
        name: 'Test Cue',
        cueType: 'TestType' as CueType,
        style: 'primary',
        description: 'Test',
        nodes: {
          events: [eventNode],
          actions: [],
          logic: [],
          eventRaisers: [],
          eventListeners: [],
          effectRaisers: [effectRaiserNode],
        },
        connections: [{ from: 'event1', to: 'raiser1' }],
      }

      const compiledCue: CompiledYargCue = {
        definition,
        eventMap: new Map([['event1', eventNode]]),
        actionMap: new Map(),
        logicMap: new Map(),
        eventRaiserMap: new Map(),
        eventListenerMap: new Map(),
        effectRaiserMap: new Map([['raiser1', effectRaiserNode]]),
        eventDefinitions: [],
        adjacency: new Map([['event1', [{ from: 'event1', to: 'raiser1' }]]]),
      }

      const effectRegistry = new EffectRegistry() // Empty registry

      const engine = new NodeExecutionEngine(
        compiledCue,
        'test-group:test-cue',
        mockSequencer,
        mockLightManager,
        cueLevelVarStore,
        groupLevelVarStore,
        effectRegistry,
      )

      // Should not throw, just log warning
      expect(() => {
        engine.startExecution(eventNode, createCueData('Strong'))
      }).not.toThrow()
    })

    it('should continue execution after Effect Raiser (non-blocking)', async () => {
      const eventNode: YargEventNode = {
        id: 'event1',
        type: 'event',
        eventType: 'beat',
      }

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
          easing: 'linear',
          level: { source: 'literal', value: 1 },
        },
        layer: { source: 'literal', value: 0 },
      }

      const definition: YargNodeCueDefinition = {
        id: 'test-cue',
        name: 'Test Cue',
        cueType: 'TestType' as CueType,
        style: 'primary',
        description: 'Test',
        nodes: {
          events: [eventNode],
          actions: [actionNode],
          logic: [],
          eventRaisers: [],
          eventListeners: [],
          effectRaisers: [effectRaiserNode],
        },
        connections: [
          { from: 'event1', to: 'raiser1' },
          { from: 'raiser1', to: 'action1' },
        ],
      }

      const compiledCue: CompiledYargCue = {
        definition,
        eventMap: new Map([['event1', eventNode]]),
        actionMap: new Map([['action1', actionNode]]),
        logicMap: new Map(),
        eventRaiserMap: new Map(),
        eventListenerMap: new Map(),
        effectRaiserMap: new Map([['raiser1', effectRaiserNode]]),
        eventDefinitions: [],
        adjacency: new Map([
          ['event1', [{ from: 'event1', to: 'raiser1' }]],
          ['raiser1', [{ from: 'raiser1', to: 'action1' }]],
        ]),
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

      const engine = new NodeExecutionEngine(
        compiledCue,
        'test-group:test-cue',
        mockSequencer,
        mockLightManager,
        cueLevelVarStore,
        groupLevelVarStore,
        effectRegistry,
      )

      await engine.startExecution(eventNode, createCueData('Strong'))

      // Both effect and subsequent action should execute
      // Effect executes async, action executes in chain
      expect(mockSequencer.addEffect).toHaveBeenCalled()
    })

    it('resolves effect raiser literal parameter values with correct types (score cue regression)', () => {
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
                easing: 'linear',
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

      const eventNode: YargEventNode = {
        id: 'event1',
        type: 'event',
        eventType: 'beat',
      }

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

      const definition: YargNodeCueDefinition = {
        id: 'test-cue',
        name: 'Test Cue',
        cueType: 'TestType' as CueType,
        style: 'primary',
        description: 'Test',
        nodes: {
          events: [eventNode],
          actions: [],
          logic: [],
          eventRaisers: [],
          eventListeners: [],
          effectRaisers: [effectRaiserNode],
        },
        connections: [{ from: 'event1', to: 'raiser1' }],
      }

      const compiledCue: CompiledYargCue = {
        definition,
        eventMap: new Map([['event1', eventNode]]),
        actionMap: new Map(),
        logicMap: new Map(),
        eventRaiserMap: new Map(),
        eventListenerMap: new Map(),
        effectRaiserMap: new Map([['raiser1', effectRaiserNode]]),
        eventDefinitions: [],
        adjacency: new Map([['event1', [{ from: 'event1', to: 'raiser1' }]]]),
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

      const engine = new NodeExecutionEngine(
        compiledCue,
        'test-group:test-cue',
        mockSequencer,
        mockLightManager,
        cueLevelVarStore,
        groupLevelVarStore,
        effectRegistry,
      )

      engine.startExecution(eventNode, createCueData('Strong'))

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
    it('should extract YARG cue data and assign to variable', () => {
      const eventNode: YargEventNode = {
        id: 'event1',
        type: 'event',
        eventType: 'beat',
      }

      const cueDataNode: LogicNode = {
        id: 'cuedata1',
        type: 'logic',
        logicType: 'cue-data',
        dataProperty: 'bpm',
        assignTo: 'currentBpm',
        outputs: [],
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
        },
      }

      const definition: YargNodeCueDefinition = {
        id: 'test-cue',
        name: 'Test Cue',
        cueType: CueType.Default,
        style: 'primary',
        nodes: {
          events: [eventNode],
          actions: [actionNode],
          logic: [cueDataNode],
        },
        connections: [
          { from: 'event1', to: 'cuedata1' },
          { from: 'cuedata1', to: 'action1' },
        ],
        variables: [{ name: 'currentBpm', type: 'number', scope: 'cue', initialValue: 0 }],
      }

      const compiledCue: CompiledYargCue = {
        definition,
        eventMap: new Map([['event1', eventNode]]),
        actionMap: new Map([['action1', actionNode]]),
        logicMap: new Map([['cuedata1', cueDataNode]]),
        eventRaiserMap: new Map(),
        eventListenerMap: new Map(),
        effectRaiserMap: new Map(),
        eventDefinitions: [],
        adjacency: new Map([
          ['event1', [{ from: 'event1', to: 'cuedata1' }]],
          ['cuedata1', [{ from: 'cuedata1', to: 'action1' }]],
        ]),
      }

      const engine = new NodeExecutionEngine(
        compiledCue,
        'test-group:test-cue',
        mockSequencer,
        mockLightManager,
        cueLevelVarStore,
        groupLevelVarStore,
        new EffectRegistry(),
        definition.variables,
      )

      const parameters = createCueData('Strong')
      parameters.beatsPerMinute = 140
      engine.startExecution(eventNode, parameters)

      // Verify variable was set
      const storedVar = cueLevelVarStore.get('currentBpm')
      expect(storedVar).toBeDefined()
      expect(storedVar?.value).toBe(140)
      expect(storedVar?.type).toBe('number')

      // Action should still execute
      expect(mockSequencer.addEffect).toHaveBeenCalled()
    })

    it('should extract config data and assign to variable', () => {
      const eventNode: YargEventNode = {
        id: 'event1',
        type: 'event',
        eventType: 'beat',
      }

      const configDataNode: LogicNode = {
        id: 'configdata1',
        type: 'logic',
        logicType: 'config-data',
        dataProperty: 'front-lights-count',
        assignTo: 'numFrontLights',
        outputs: [],
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
        },
      }

      const definition: YargNodeCueDefinition = {
        id: 'test-cue',
        name: 'Test Cue',
        cueType: CueType.Default,
        style: 'primary',
        nodes: {
          events: [eventNode],
          actions: [actionNode],
          logic: [configDataNode],
        },
        connections: [
          { from: 'event1', to: 'configdata1' },
          { from: 'configdata1', to: 'action1' },
        ],
        variables: [{ name: 'numFrontLights', type: 'number', scope: 'cue', initialValue: 0 }],
      }

      const compiledCue: CompiledYargCue = {
        definition,
        eventMap: new Map([['event1', eventNode]]),
        actionMap: new Map([['action1', actionNode]]),
        logicMap: new Map([['configdata1', configDataNode]]),
        eventRaiserMap: new Map(),
        eventListenerMap: new Map(),
        effectRaiserMap: new Map(),
        eventDefinitions: [],
        adjacency: new Map([
          ['event1', [{ from: 'event1', to: 'configdata1' }]],
          ['configdata1', [{ from: 'configdata1', to: 'action1' }]],
        ]),
      }

      // Mock getLightsInGroup to return 8 front lights
      mockLightManager.getLightsInGroup = jest
        .fn()
        .mockReturnValue([
          { id: 'f1' },
          { id: 'f2' },
          { id: 'f3' },
          { id: 'f4' },
          { id: 'f5' },
          { id: 'f6' },
          { id: 'f7' },
          { id: 'f8' },
        ])

      const engine = new NodeExecutionEngine(
        compiledCue,
        'test-group:test-cue',
        mockSequencer,
        mockLightManager,
        cueLevelVarStore,
        groupLevelVarStore,
        new EffectRegistry(),
        definition.variables,
      )

      engine.startExecution(eventNode, createCueData('Strong'))

      // Verify variable was set
      const storedVar = cueLevelVarStore.get('numFrontLights')
      expect(storedVar).toBeDefined()
      expect(storedVar?.value).toBe(8)
      expect(storedVar?.type).toBe('number')

      // Action should still execute
      expect(mockSequencer.addEffect).toHaveBeenCalled()
    })

    it('should handle cue data node without assignTo', () => {
      const eventNode: YargEventNode = {
        id: 'event1',
        type: 'event',
        eventType: 'beat',
      }

      const cueDataNode: LogicNode = {
        id: 'cuedata1',
        type: 'logic',
        logicType: 'cue-data',
        dataProperty: 'execution-count',
        // No assignTo - value should be ignored
        outputs: [],
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
        },
      }

      const definition: YargNodeCueDefinition = {
        id: 'test-cue',
        name: 'Test Cue',
        cueType: CueType.Default,
        style: 'primary',
        nodes: {
          events: [eventNode],
          actions: [actionNode],
          logic: [cueDataNode],
        },
        connections: [
          { from: 'event1', to: 'cuedata1' },
          { from: 'cuedata1', to: 'action1' },
        ],
      }

      const compiledCue: CompiledYargCue = {
        definition,
        eventMap: new Map([['event1', eventNode]]),
        actionMap: new Map([['action1', actionNode]]),
        logicMap: new Map([['cuedata1', cueDataNode]]),
        eventRaiserMap: new Map(),
        eventListenerMap: new Map(),
        effectRaiserMap: new Map(),
        eventDefinitions: [],
        adjacency: new Map([
          ['event1', [{ from: 'event1', to: 'cuedata1' }]],
          ['cuedata1', [{ from: 'cuedata1', to: 'action1' }]],
        ]),
      }

      const engine = new NodeExecutionEngine(
        compiledCue,
        'test-group:test-cue',
        mockSequencer,
        mockLightManager,
        cueLevelVarStore,
        groupLevelVarStore,
        new EffectRegistry(),
      )

      engine.startExecution(eventNode, createCueData('Strong'))

      // No variable should be set
      expect(cueLevelVarStore.size).toBe(0)

      // Action should still execute
      expect(mockSequencer.addEffect).toHaveBeenCalled()
    })

    it('should use cue data in conditional branching', () => {
      const eventNode: YargEventNode = {
        id: 'event1',
        type: 'event',
        eventType: 'beat',
      }

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

      const actionHigh: ActionNode = {
        id: 'action-high',
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
        },
      }

      const actionLow: ActionNode = {
        id: 'action-low',
        type: 'action',
        effectType: 'set-color',
        target: {
          groups: { source: 'literal', value: 'front' },
          filter: { source: 'literal', value: 'all' },
        },
        color: {
          name: { source: 'literal', value: 'blue' },
          brightness: { source: 'literal', value: 'low' },
        },
        timing: {
          waitForCondition: { source: 'literal', value: 'none' },
          waitForTime: { source: 'literal', value: 0 },
          duration: { source: 'literal', value: 200 },
          waitUntilCondition: { source: 'literal', value: 'none' },
          waitUntilTime: { source: 'literal', value: 0 },
        },
      }

      const definition: YargNodeCueDefinition = {
        id: 'test-cue',
        name: 'Test Cue',
        cueType: CueType.Default,
        style: 'primary',
        nodes: {
          events: [eventNode],
          actions: [actionHigh, actionLow],
          logic: [cueDataNode, conditionalNode],
        },
        connections: [
          { from: 'event1', to: 'cuedata1' },
          { from: 'cuedata1', to: 'conditional1' },
          { from: 'conditional1', to: 'action-high', fromPort: 'true' },
          { from: 'conditional1', to: 'action-low', fromPort: 'false' },
        ],
        variables: [{ name: 'noteCount', type: 'number', scope: 'cue', initialValue: 0 }],
      }

      const compiledCue: CompiledYargCue = {
        definition,
        eventMap: new Map([['event1', eventNode]]),
        actionMap: new Map([
          ['action-high', actionHigh],
          ['action-low', actionLow],
        ]),
        logicMap: new Map<string, LogicNode>([
          ['cuedata1', cueDataNode],
          ['conditional1', conditionalNode],
        ]),
        eventRaiserMap: new Map(),
        eventListenerMap: new Map(),
        effectRaiserMap: new Map(),
        eventDefinitions: [],
        adjacency: new Map([
          ['event1', [{ from: 'event1', to: 'cuedata1' }]],
          ['cuedata1', [{ from: 'cuedata1', to: 'conditional1' }]],
          [
            'conditional1',
            [
              { from: 'conditional1', to: 'action-high', fromPort: 'true' },
              { from: 'conditional1', to: 'action-low', fromPort: 'false' },
            ],
          ],
        ]),
      }

      const engine = new NodeExecutionEngine(
        compiledCue,
        'test-group:test-cue',
        mockSequencer,
        mockLightManager,
        cueLevelVarStore,
        groupLevelVarStore,
        new EffectRegistry(),
        definition.variables,
      )

      // Test with 3 guitar notes (should trigger high action)
      const parameters = createCueData('Strong')
      parameters.guitarNotes = ['Green', 'Red', 'Yellow'] as CueData['guitarNotes']
      engine.startExecution(eventNode, parameters)

      // Verify variable was set correctly
      const storedVar = cueLevelVarStore.get('noteCount')
      expect(storedVar?.value).toBe(3)

      // Should execute high action (3 >= 2)
      expect(mockSequencer.addEffect).toHaveBeenCalledWith(
        expect.stringContaining('action-high'),
        expect.anything(),
      )
    })

    it('should extract config data for total lights', () => {
      const eventNode: YargEventNode = {
        id: 'event1',
        type: 'event',
        eventType: 'beat',
      }

      const configDataNode: LogicNode = {
        id: 'configdata1',
        type: 'logic',
        logicType: 'config-data',
        dataProperty: 'total-lights',
        assignTo: 'totalCount',
        outputs: [],
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
        },
      }

      const definition: YargNodeCueDefinition = {
        id: 'test-cue',
        name: 'Test Cue',
        cueType: CueType.Default,
        style: 'primary',
        nodes: {
          events: [eventNode],
          actions: [actionNode],
          logic: [configDataNode],
        },
        connections: [
          { from: 'event1', to: 'configdata1' },
          { from: 'configdata1', to: 'action1' },
        ],
        variables: [{ name: 'totalCount', type: 'number', scope: 'cue', initialValue: 0 }],
      }

      const compiledCue: CompiledYargCue = {
        definition,
        eventMap: new Map([['event1', eventNode]]),
        actionMap: new Map([['action1', actionNode]]),
        logicMap: new Map([['configdata1', configDataNode]]),
        eventRaiserMap: new Map(),
        eventListenerMap: new Map(),
        effectRaiserMap: new Map(),
        eventDefinitions: [],
        adjacency: new Map([
          ['event1', [{ from: 'event1', to: 'configdata1' }]],
          ['configdata1', [{ from: 'configdata1', to: 'action1' }]],
        ]),
      }

      // Mock total lights count
      mockLightManager.getLightsInGroup = jest.fn((groups) => {
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
      })

      const engine = new NodeExecutionEngine(
        compiledCue,
        'test-group:test-cue',
        mockSequencer,
        mockLightManager,
        cueLevelVarStore,
        groupLevelVarStore,
        new EffectRegistry(),
        definition.variables,
      )

      engine.startExecution(eventNode, createCueData('Strong'))

      // Verify variable was set
      const storedVar = cueLevelVarStore.get('totalCount')
      expect(storedVar).toBeDefined()
      expect(storedVar?.value).toBe(7)
      expect(storedVar?.type).toBe('number')

      // Action should still execute
      expect(mockSequencer.addEffect).toHaveBeenCalled()
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

    it('should resolve variable for color name', () => {
      // Setup: event -> variable (set color) -> action (use color variable)
      const eventNode: YargEventNode = {
        id: 'event1',
        type: 'event',
        eventType: 'beat',
        outputs: ['var1'],
      }

      const variableNode: LogicNode = {
        id: 'var1',
        type: 'logic',
        logicType: 'variable',
        mode: 'set',
        varName: 'myColor',
        valueType: 'string',
        value: { source: 'literal', value: 'red' },
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
          name: { source: 'variable', name: 'myColor' },
          brightness: { source: 'literal', value: 'medium' },
          blendMode: { source: 'literal', value: 'replace' },
        },
        timing: {
          waitForCondition: { source: 'literal', value: 'none' },
          waitForTime: { source: 'literal', value: 0 },
          duration: { source: 'literal', value: 200 },
          waitUntilCondition: { source: 'literal', value: 'none' },
          waitUntilTime: { source: 'literal', value: 0 },
          easing: 'sinInOut',
          level: { source: 'literal', value: 1 },
        },
      }

      const definition: YargNodeCueDefinition = {
        id: 'test-cue',
        name: 'Test Cue',
        cueType: CueType.Intro,
        style: 'primary',
        nodes: {
          events: [eventNode],
          actions: [actionNode],
          logic: [variableNode],
        },
        connections: [
          { from: 'event1', to: 'var1', fromPort: 'event1', toPort: 'var1' },
          { from: 'var1', to: 'action1', fromPort: 'var1', toPort: 'action1' },
        ],
        variables: [{ name: 'myColor', type: 'string', scope: 'cue', initialValue: '' }],
      }

      const compiledCue: CompiledYargCue = {
        definition,
        eventMap: new Map([[eventNode.id, eventNode]]),
        actionMap: new Map([[actionNode.id, actionNode]]),
        logicMap: new Map<string, LogicNode>([[variableNode.id, variableNode]]),
        eventRaiserMap: new Map(),
        eventListenerMap: new Map(),
        effectRaiserMap: new Map(),
        eventDefinitions: [],
        adjacency: new Map([
          ['event1', [{ from: 'event1', to: 'var1' }]],
          ['var1', [{ from: 'var1', to: 'action1' }]],
        ]),
      }

      const engine = new NodeExecutionEngine(
        compiledCue,
        'test-cue',
        mockSequencer,
        mockLightManager,
        cueLevelVarStore,
        groupLevelVarStore,
        new EffectRegistry(),
        definition.variables,
      )

      engine.startExecution(eventNode, createCueData('Strong'))

      jest.runAllTimers()
      expect(mockSequencer.addEffect).toHaveBeenCalled()
      // The resolved color should be 'red' from the variable
    })

    it('should resolve variable for target groups', () => {
      // Setup: variable (set groups) -> action (use groups variable)
      const eventNode: YargEventNode = {
        id: 'event1',
        type: 'event',
        eventType: 'beat',
        outputs: ['var1'],
      }

      const variableNode: LogicNode = {
        id: 'var1',
        type: 'logic',
        logicType: 'variable',
        mode: 'set',
        varName: 'targetGroups',
        valueType: 'string',
        value: { source: 'literal', value: 'front,back' },
        outputs: ['action1'],
      }

      const actionNode: ActionNode = {
        id: 'action1',
        type: 'action',
        effectType: 'set-color',
        target: {
          groups: { source: 'variable', name: 'targetGroups' },
          filter: { source: 'literal', value: 'all' },
        },
        color: {
          name: { source: 'literal', value: 'blue' },
          brightness: { source: 'literal', value: 'high' },
          blendMode: { source: 'literal', value: 'replace' },
        },
        timing: {
          waitForCondition: { source: 'literal', value: 'none' },
          waitForTime: { source: 'literal', value: 0 },
          duration: { source: 'literal', value: 200 },
          waitUntilCondition: { source: 'literal', value: 'none' },
          waitUntilTime: { source: 'literal', value: 0 },
          easing: 'sinInOut',
          level: { source: 'literal', value: 1 },
        },
      }

      const definition: YargNodeCueDefinition = {
        id: 'test-cue',
        name: 'Test Cue',
        cueType: CueType.Intro,
        style: 'primary',
        nodes: {
          events: [eventNode],
          actions: [actionNode],
          logic: [variableNode],
        },
        connections: [
          { from: 'event1', to: 'var1' },
          { from: 'var1', to: 'action1' },
        ],
        variables: [{ name: 'targetGroups', type: 'string', scope: 'cue', initialValue: '' }],
      }

      const compiledCue: CompiledYargCue = {
        definition,
        eventMap: new Map([[eventNode.id, eventNode]]),
        actionMap: new Map([[actionNode.id, actionNode]]),
        logicMap: new Map<string, LogicNode>([[variableNode.id, variableNode]]),
        eventRaiserMap: new Map(),
        eventListenerMap: new Map(),
        effectRaiserMap: new Map(),
        eventDefinitions: [],
        adjacency: new Map([
          ['event1', [{ from: 'event1', to: 'var1' }]],
          ['var1', [{ from: 'var1', to: 'action1' }]],
        ]),
      }

      const engine = new NodeExecutionEngine(
        compiledCue,
        'test-cue',
        mockSequencer,
        mockLightManager,
        cueLevelVarStore,
        groupLevelVarStore,
        new EffectRegistry(),
        definition.variables,
      )

      engine.startExecution(eventNode, createCueData('Strong'))

      jest.runAllTimers()
      expect(mockSequencer.addEffect).toHaveBeenCalled()
      // Groups should be resolved to ['front', 'back']
    })

    it('should report runtime error when variable not found', () => {
      // Action references non-existent variable; runtime reports error via IPC
      const eventNode: YargEventNode = {
        id: 'event1',
        type: 'event',
        eventType: 'beat',
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
          easing: 'sinInOut',
          level: { source: 'literal', value: 1 },
        },
      }

      const definition: YargNodeCueDefinition = {
        id: 'test-cue',
        name: 'Test Cue',
        cueType: CueType.Intro,
        style: 'primary',
        nodes: {
          events: [eventNode],
          actions: [actionNode],
          logic: [],
        },
        connections: [{ from: 'event1', to: 'action1' }],
        variables: [],
      }

      const compiledCue: CompiledYargCue = {
        definition,
        eventMap: new Map([[eventNode.id, eventNode]]),
        actionMap: new Map([[actionNode.id, actionNode]]),
        logicMap: new Map<string, LogicNode>(),
        eventRaiserMap: new Map(),
        eventListenerMap: new Map(),
        effectRaiserMap: new Map(),
        eventDefinitions: [],
        adjacency: new Map([['event1', [{ from: 'event1', to: 'action1' }]]]),
      }

      const engine = new NodeExecutionEngine(
        compiledCue,
        'test-cue',
        mockSequencer,
        mockLightManager,
        cueLevelVarStore,
        groupLevelVarStore,
        new EffectRegistry(),
        definition.variables,
      )

      engine.startExecution(eventNode, createCueData('Strong'))

      jest.runAllTimers()
      expect(sendToAllWindows).toHaveBeenCalledWith(
        RENDERER_RECEIVE.NODE_CUE_RUNTIME_ERROR,
        expect.stringContaining('nonExistentColor'),
      )
    })

    it('should resolve variable for duration', () => {
      // Cue data -> math -> action with dynamic duration
      const eventNode: YargEventNode = {
        id: 'event1',
        type: 'event',
        eventType: 'beat',
        outputs: ['cuedata1'],
      }

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
          easing: 'sinInOut',
          level: { source: 'literal', value: 1 },
        },
      }

      const definition: YargNodeCueDefinition = {
        id: 'test-cue',
        name: 'Test Cue',
        cueType: CueType.Intro,
        style: 'primary',
        nodes: {
          events: [eventNode],
          actions: [actionNode],
          logic: [cueDataNode, mathNode],
        },
        connections: [
          { from: 'event1', to: 'cuedata1' },
          { from: 'cuedata1', to: 'math1' },
          { from: 'math1', to: 'action1' },
        ],
        variables: [
          { name: 'currentBpm', type: 'number', scope: 'cue', initialValue: 0 },
          { name: 'calculatedDuration', type: 'number', scope: 'cue', initialValue: 0 },
        ],
      }

      const compiledCue: CompiledYargCue = {
        definition,
        eventMap: new Map([[eventNode.id, eventNode]]),
        actionMap: new Map([[actionNode.id, actionNode]]),
        logicMap: new Map<string, LogicNode>([
          [cueDataNode.id, cueDataNode],
          [mathNode.id, mathNode],
        ]),
        eventRaiserMap: new Map(),
        eventListenerMap: new Map(),
        effectRaiserMap: new Map(),
        eventDefinitions: [],
        adjacency: new Map([
          ['event1', [{ from: 'event1', to: 'cuedata1' }]],
          ['cuedata1', [{ from: 'cuedata1', to: 'math1' }]],
          ['math1', [{ from: 'math1', to: 'action1' }]],
        ]),
      }

      const engine = new NodeExecutionEngine(
        compiledCue,
        'test-cue',
        mockSequencer,
        mockLightManager,
        cueLevelVarStore,
        groupLevelVarStore,
        new EffectRegistry(),
        definition.variables,
      )

      engine.startExecution(eventNode, createCueData('Strong'))

      jest.runAllTimers()
      expect(mockSequencer.addEffect).toHaveBeenCalled()
      // Duration should be 120 (BPM) * 5 = 600
      expect(cueLevelVarStore.get('calculatedDuration')?.value).toBe(600)
    })

    it('should handle invalid color variable gracefully', () => {
      // Variable contains invalid color, should use default
      const eventNode: YargEventNode = {
        id: 'event1',
        type: 'event',
        eventType: 'beat',
        outputs: ['var1'],
      }

      const variableNode: LogicNode = {
        id: 'var1',
        type: 'logic',
        logicType: 'variable',
        mode: 'set',
        varName: 'badColor',
        valueType: 'string',
        value: { source: 'literal', value: 'not-a-valid-color' },
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
          name: { source: 'variable', name: 'badColor' },
          brightness: { source: 'literal', value: 'medium' },
          blendMode: { source: 'literal', value: 'replace' },
        },
        timing: {
          waitForCondition: { source: 'literal', value: 'none' },
          waitForTime: { source: 'literal', value: 0 },
          duration: { source: 'literal', value: 200 },
          waitUntilCondition: { source: 'literal', value: 'none' },
          waitUntilTime: { source: 'literal', value: 0 },
          easing: 'sinInOut',
          level: { source: 'literal', value: 1 },
        },
      }

      const definition: YargNodeCueDefinition = {
        id: 'test-cue',
        name: 'Test Cue',
        cueType: CueType.Intro,
        style: 'primary',
        nodes: {
          events: [eventNode],
          actions: [actionNode],
          logic: [variableNode],
        },
        connections: [
          { from: 'event1', to: 'var1' },
          { from: 'var1', to: 'action1' },
        ],
        variables: [{ name: 'badColor', type: 'string', scope: 'cue', initialValue: '' }],
      }

      const compiledCue: CompiledYargCue = {
        definition,
        eventMap: new Map([[eventNode.id, eventNode]]),
        actionMap: new Map([[actionNode.id, actionNode]]),
        logicMap: new Map<string, LogicNode>([[variableNode.id, variableNode]]),
        eventRaiserMap: new Map(),
        eventListenerMap: new Map(),
        effectRaiserMap: new Map(),
        eventDefinitions: [],
        adjacency: new Map([
          ['event1', [{ from: 'event1', to: 'var1' }]],
          ['var1', [{ from: 'var1', to: 'action1' }]],
        ]),
      }

      const engine = new NodeExecutionEngine(
        compiledCue,
        'test-cue',
        mockSequencer,
        mockLightManager,
        cueLevelVarStore,
        groupLevelVarStore,
        new EffectRegistry(),
        definition.variables,
      )

      engine.startExecution(eventNode, createCueData('Strong'))

      jest.runAllTimers()
      expect(mockSequencer.addEffect).toHaveBeenCalled()
      // Should resolve to default color 'blue' (from resolveColor method)
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

      const eventNode: YargEventNode = {
        id: 'event1',
        type: 'event',
        eventType: 'beat',
      }

      const configDataNode: LogicNode = {
        id: 'config1',
        type: 'logic',
        logicType: 'config-data',
        dataProperty: 'front-lights-array',
        assignTo: 'frontLights',
      }

      const definition: YargNodeCueDefinition = {
        id: 'test-cue',
        name: 'Test Cue',
        cueType: CueType.Intro,
        style: 'primary',
        nodes: {
          events: [eventNode],
          actions: [],
          logic: [configDataNode],
        },
        connections: [{ from: 'event1', to: 'config1' }],
        variables: [{ name: 'frontLights', type: 'light-array', scope: 'cue', initialValue: [] }],
      }

      const compiledCue: CompiledYargCue = {
        definition,
        eventMap: new Map([[eventNode.id, eventNode]]),
        actionMap: new Map(),
        logicMap: new Map<string, LogicNode>([[configDataNode.id, configDataNode]]),
        eventRaiserMap: new Map(),
        eventListenerMap: new Map(),
        effectRaiserMap: new Map(),
        eventDefinitions: [],
        adjacency: new Map([['event1', [{ from: 'event1', to: 'config1' }]]]),
      }

      const engine = new NodeExecutionEngine(
        compiledCue,
        'test-cue',
        mockSequencer,
        mockLightManager,
        cueLevelVarStore,
        groupLevelVarStore,
        new EffectRegistry(),
        definition.variables,
      )

      engine.startExecution(eventNode, createCueData('Strong'))

      // Check that the light array was stored in the variable store
      const storedValue = cueLevelVarStore.get('frontLights')
      expect(storedValue).toBeDefined()
      expect(storedValue?.type).toBe('light-array')
      expect(Array.isArray(storedValue?.value)).toBe(true)
      expect(storedValue?.value).toEqual(mockLights)
    })

    it('should get all config-data array types', () => {
      const mockFrontLights: TrackedLight[] = [
        { id: 'front1', position: 0, config: {} as FixtureConfig },
        { id: 'front2', position: 1, config: {} as FixtureConfig },
      ]
      const mockBackLights: TrackedLight[] = [
        { id: 'back1', position: 0, config: {} as FixtureConfig },
      ]

      mockLightManager.getLightsInGroup = jest.fn((groups: string | string[]) => {
        if (groups === 'front') return mockFrontLights
        if (groups === 'back') return mockBackLights
        return []
      }) as unknown as DmxLightManager['getLightsInGroup']

      const eventNode: YargEventNode = {
        id: 'event1',
        type: 'event',
        eventType: 'beat',
      }

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

      const definition: YargNodeCueDefinition = {
        id: 'test-cue',
        name: 'Test Cue',
        cueType: CueType.Intro,
        style: 'primary',
        nodes: {
          events: [eventNode],
          actions: [],
          logic: [config1, config2],
        },
        connections: [
          { from: 'event1', to: 'config1' },
          { from: 'event1', to: 'config2' },
        ],
        variables: [
          { name: 'frontLights', type: 'light-array', scope: 'cue', initialValue: [] },
          { name: 'backLights', type: 'light-array', scope: 'cue', initialValue: [] },
        ],
      }

      const compiledCue: CompiledYargCue = {
        definition,
        eventMap: new Map([[eventNode.id, eventNode]]),
        actionMap: new Map(),
        logicMap: new Map<string, LogicNode>([
          [config1.id, config1],
          [config2.id, config2],
        ]),
        eventRaiserMap: new Map(),
        eventListenerMap: new Map(),
        effectRaiserMap: new Map(),
        eventDefinitions: [],
        adjacency: new Map([
          [
            'event1',
            [
              { from: 'event1', to: 'config1' },
              { from: 'event1', to: 'config2' },
            ],
          ],
        ]),
      }

      const engine = new NodeExecutionEngine(
        compiledCue,
        'test-cue',
        mockSequencer,
        mockLightManager,
        cueLevelVarStore,
        groupLevelVarStore,
        new EffectRegistry(),
        definition.variables,
      )

      engine.startExecution(eventNode, createCueData('Strong'))

      expect(cueLevelVarStore.get('frontLights')?.value).toEqual(mockFrontLights)
      expect(cueLevelVarStore.get('backLights')?.value).toEqual(mockBackLights)
    })
  })

  describe('Lights From Index Node', () => {
    it('should extract single light from array using index', () => {
      const mockLights = [
        { id: 'light0', position: 0, config: {} as MinimalLightConfig },
        { id: 'light1', position: 1, config: {} as MinimalLightConfig },
        { id: 'light2', position: 2, config: {} as MinimalLightConfig },
        { id: 'light3', position: 3, config: {} as MinimalLightConfig },
      ]

      mockLightManager.getLightsInGroup = jest.fn().mockReturnValue(mockLights)

      const eventNode: YargEventNode = {
        id: 'event1',
        type: 'event',
        eventType: 'beat',
      }

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
        index: { source: 'literal', value: 2 },
        assignTo: 'selectedLight',
      }

      const definition: YargNodeCueDefinition = {
        id: 'test-cue',
        name: 'Test Cue',
        cueType: CueType.Intro,
        style: 'primary',
        nodes: {
          events: [eventNode],
          actions: [],
          logic: [configNode, indexNode],
        },
        connections: [
          { from: 'event1', to: 'config1' },
          { from: 'config1', to: 'lights-index1' },
        ],
        variables: [
          { name: 'allLights', type: 'light-array', scope: 'cue', initialValue: [] },
          { name: 'selectedLight', type: 'light-array', scope: 'cue', initialValue: [] },
        ],
      }

      const compiledCue: CompiledYargCue = {
        definition,
        eventMap: new Map([[eventNode.id, eventNode]]),
        actionMap: new Map(),
        logicMap: new Map<string, LogicNode>([
          [configNode.id, configNode],
          [indexNode.id, indexNode],
        ]),
        eventRaiserMap: new Map(),
        eventListenerMap: new Map(),
        effectRaiserMap: new Map(),
        eventDefinitions: [],
        adjacency: new Map([
          ['event1', [{ from: 'event1', to: 'config1' }]],
          ['config1', [{ from: 'config1', to: 'lights-index1' }]],
        ]),
      }

      const engine = new NodeExecutionEngine(
        compiledCue,
        'test-cue',
        mockSequencer,
        mockLightManager,
        cueLevelVarStore,
        groupLevelVarStore,
        new EffectRegistry(),
        definition.variables,
      )

      engine.startExecution(eventNode, createCueData('Strong'))

      const selectedLight = cueLevelVarStore.get('selectedLight')
      expect(selectedLight).toBeDefined()
      expect(selectedLight?.type).toBe('light-array')
      expect(selectedLight?.value).toEqual([mockLights[2]])
    })

    it('should handle wraparound for out-of-bounds index', () => {
      const mockLights = [
        { id: 'light0', position: 0, config: {} as MinimalLightConfig },
        { id: 'light1', position: 1, config: {} as MinimalLightConfig },
        { id: 'light2', position: 2, config: {} as MinimalLightConfig },
      ]

      mockLightManager.getLightsInGroup = jest.fn().mockReturnValue(mockLights)

      const eventNode: YargEventNode = {
        id: 'event1',
        type: 'event',
        eventType: 'beat',
      }

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
        index: { source: 'literal', value: 5 },
        assignTo: 'selectedLight',
      }

      const definition: YargNodeCueDefinition = {
        id: 'test-cue',
        name: 'Test Cue',
        cueType: CueType.Intro,
        style: 'primary',
        nodes: {
          events: [eventNode],
          actions: [],
          logic: [configNode, indexNode],
        },
        connections: [
          { from: 'event1', to: 'config1' },
          { from: 'config1', to: 'lights-index1' },
        ],
        variables: [
          { name: 'allLights', type: 'light-array', scope: 'cue', initialValue: [] },
          { name: 'selectedLight', type: 'light-array', scope: 'cue', initialValue: [] },
        ],
      }

      const compiledCue: CompiledYargCue = {
        definition,
        eventMap: new Map([[eventNode.id, eventNode]]),
        actionMap: new Map(),
        logicMap: new Map<string, LogicNode>([
          [configNode.id, configNode],
          [indexNode.id, indexNode],
        ]),
        eventRaiserMap: new Map(),
        eventListenerMap: new Map(),
        effectRaiserMap: new Map(),
        eventDefinitions: [],
        adjacency: new Map([
          ['event1', [{ from: 'event1', to: 'config1' }]],
          ['config1', [{ from: 'config1', to: 'lights-index1' }]],
        ]),
      }

      const engine = new NodeExecutionEngine(
        compiledCue,
        'test-cue',
        mockSequencer,
        mockLightManager,
        cueLevelVarStore,
        groupLevelVarStore,
        new EffectRegistry(),
        definition.variables,
      )

      engine.startExecution(eventNode, createCueData('Strong'))

      const selectedLight = cueLevelVarStore.get('selectedLight')
      expect(selectedLight).toBeDefined()
      expect(selectedLight?.type).toBe('light-array')
      // Index 5 with array length 3 should wrap to index 2 (5 % 3 = 2)
      expect(selectedLight?.value).toEqual([mockLights[2]])
    })

    it('should handle negative index with wraparound', () => {
      const mockLights = [
        { id: 'light0', position: 0, config: {} as MinimalLightConfig },
        { id: 'light1', position: 1, config: {} as MinimalLightConfig },
        { id: 'light2', position: 2, config: {} as MinimalLightConfig },
      ]

      mockLightManager.getLightsInGroup = jest.fn().mockReturnValue(mockLights)

      const eventNode: YargEventNode = {
        id: 'event1',
        type: 'event',
        eventType: 'beat',
      }

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
        index: { source: 'literal', value: -1 },
        assignTo: 'selectedLight',
      }

      const definition: YargNodeCueDefinition = {
        id: 'test-cue',
        name: 'Test Cue',
        cueType: CueType.Intro,
        style: 'primary',
        nodes: {
          events: [eventNode],
          actions: [],
          logic: [configNode, indexNode],
        },
        connections: [
          { from: 'event1', to: 'config1' },
          { from: 'config1', to: 'lights-index1' },
        ],
        variables: [
          { name: 'allLights', type: 'light-array', scope: 'cue', initialValue: [] },
          { name: 'selectedLight', type: 'light-array', scope: 'cue', initialValue: [] },
        ],
      }

      const compiledCue: CompiledYargCue = {
        definition,
        eventMap: new Map([[eventNode.id, eventNode]]),
        actionMap: new Map(),
        logicMap: new Map<string, LogicNode>([
          [configNode.id, configNode],
          [indexNode.id, indexNode],
        ]),
        eventRaiserMap: new Map(),
        eventListenerMap: new Map(),
        effectRaiserMap: new Map(),
        eventDefinitions: [],
        adjacency: new Map([
          ['event1', [{ from: 'event1', to: 'config1' }]],
          ['config1', [{ from: 'config1', to: 'lights-index1' }]],
        ]),
      }

      const engine = new NodeExecutionEngine(
        compiledCue,
        'test-cue',
        mockSequencer,
        mockLightManager,
        cueLevelVarStore,
        groupLevelVarStore,
        new EffectRegistry(),
        definition.variables,
      )

      engine.startExecution(eventNode, createCueData('Strong'))

      const selectedLight = cueLevelVarStore.get('selectedLight')
      expect(selectedLight).toBeDefined()
      expect(selectedLight?.type).toBe('light-array')
      // Index -1 should wrap to the last element (index 2)
      expect(selectedLight?.value).toEqual([mockLights[2]])
    })
  })

  describe('two cues sharing one groupId, one stops', () => {
    it('second cue can still run after first cue is stopped', async () => {
      const groupId = 'shared-group'
      const eventNode: YargEventNode = {
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
          easing: 'linear',
        },
      }
      const definition1: YargNodeCueDefinition = {
        id: 'cue-a',
        name: 'Cue A',
        cueType: CueType.Sweep,
        style: 'primary',
        nodes: { events: [eventNode], actions: [actionNode], logic: [] },
        connections: [{ from: 'event1', to: 'action1' }],
      }
      const definition2: YargNodeCueDefinition = {
        id: 'cue-b',
        name: 'Cue B',
        cueType: CueType.Stomp,
        style: 'primary',
        nodes: {
          events: [{ ...eventNode, id: 'ev2', eventType: 'cue-started' }],
          actions: [{ ...actionNode, id: 'act2' }],
          logic: [],
        },
        connections: [{ from: 'ev2', to: 'act2' }],
      }
      const compiled1 = NodeCueCompiler.compileYargCue(definition1)
      const compiled2 = NodeCueCompiler.compileYargCue(definition2)
      const registry = new EffectRegistry()
      const cue1 = new YargNodeCue(groupId, compiled1, registry)
      const cue2 = new YargNodeCue(groupId, compiled2, registry)
      const params = createCueData('Strong')

      await cue1.execute(params, mockSequencer, mockLightManager)
      cue1.onStop()
      const totalCallsBefore =
        (mockSequencer.setEffectUnblockedName as jest.Mock).mock.calls.length +
        (mockSequencer.addEffect as jest.Mock).mock.calls.length
      await cue2.execute(params, mockSequencer, mockLightManager)
      const totalCallsAfter =
        (mockSequencer.setEffectUnblockedName as jest.Mock).mock.calls.length +
        (mockSequencer.addEffect as jest.Mock).mock.calls.length

      expect(totalCallsAfter).toBeGreaterThan(totalCallsBefore)
    })
  })
})
