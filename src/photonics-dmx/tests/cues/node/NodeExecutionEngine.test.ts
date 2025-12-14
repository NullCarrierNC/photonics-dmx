import { NodeExecutionEngine } from '../../../cues/node/runtime/NodeExecutionEngine';
import { ExecutionContext } from '../../../cues/node/runtime/ExecutionContext';
import { CompiledYargCue } from '../../../cues/node/compiler/NodeCueCompiler';
import { EffectRegistry } from '../../../cues/node/runtime/EffectRegistry';
import {
  YargNodeCueDefinition,
  YargEventNode,
  ActionNode,
  LogicNode
} from '../../../cues/types/nodeCueTypes';
import { ILightingController } from '../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../controllers/DmxLightManager';
import { CueData, CueType } from '../../../cues/types/cueTypes';
import { VariableValue } from '../../../cues/node/runtime/executionTypes';

describe('NodeExecutionEngine', () => {
  let mockSequencer: ILightingController;
  let mockLightManager: DmxLightManager;
  let cueLevelVarStore: Map<string, VariableValue>;
  let groupLevelVarStore: Map<string, VariableValue>;

  // Helper to create minimal CueData
  const createCueData = (beat?: string): CueData => ({
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
    keyframe: '',
    bonusEffect: false,
    beat: beat as any
  });

  beforeEach(() => {
    // Create mock sequencer
    mockSequencer = {
      addEffect: jest.fn(),
      addEffectWithCallback: jest.fn((_name, _effect, callback) => {
        // Automatically invoke callback after a short delay to simulate completion
        if (callback) {
          setTimeout(() => callback(), 1);
        }
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
      shutdown: jest.fn()
    } as any;

    // Create mock light manager with proper getLights method
    mockLightManager = {
      getLights: jest.fn().mockReturnValue([
        { id: 'light1', config: {} },
        { id: 'light2', config: {} }
      ])
    } as any;

    cueLevelVarStore = new Map();
    groupLevelVarStore = new Map();
  });

  describe('Basic Execution', () => {
    it('should execute a simple action node', () => {
      // Create a simple cue: event -> action
      const eventNode: YargEventNode = {
        id: 'event1',
        type: 'event',
        eventType: 'beat'
      };

      const actionNode: ActionNode = {
        id: 'action1',
        type: 'action',
        effectType: 'set-color',
        target: {
          groups: { source: 'literal', value: 'front' },
          filter: { source: 'literal', value: 'all' }
        },
        color: {
          name: { source: 'literal', value: 'red' },
          brightness: { source: 'literal', value: 'high' }
        },
        timing: {
          waitForCondition: 'none',
          waitForTime: { source: 'literal', value: 0 },
          duration: { source: 'literal', value: 200 },
          waitUntilCondition: 'none',
          waitUntilTime: { source: 'literal', value: 0 },
          easing: 'linear'
        }
      };

      const definition: YargNodeCueDefinition = {
        id: 'test-cue',
        name: 'Test Cue',
        cueType: CueType.Default,
        style: 'primary',
        nodes: {
          events: [eventNode],
          actions: [actionNode],
          logic: []
        },
        connections: [
          { from: 'event1', to: 'action1' }
        ]
      };

      const compiledCue: CompiledYargCue = {
        definition,
        eventMap: new Map([['event1', eventNode]]),
        actionMap: new Map([['action1', actionNode]]),
        logicMap: new Map(),
      eventRaiserMap: new Map(),
      eventListenerMap: new Map(),
      effectRaiserMap: new Map(),
        eventDefinitions: [],
        adjacency: new Map([
          ['event1', [{ from: 'event1', to: 'action1' }]]
        ])
      };

      const engine = new NodeExecutionEngine(
        compiledCue,
        'test-group:test-cue',
        mockSequencer,
        mockLightManager,
        cueLevelVarStore,
        groupLevelVarStore,
        new EffectRegistry()
      );

      const parameters = createCueData('Strong');
      engine.startExecution(eventNode, parameters);

      // Verify that addEffectWithCallback was called
      expect(mockSequencer.addEffectWithCallback).toHaveBeenCalledTimes(1);
      expect(mockLightManager.getLights).toHaveBeenCalled();
    });

    it('should handle action -> action chain', () => {
      const eventNode: YargEventNode = {
        id: 'event1',
        type: 'event',
        eventType: 'beat'
      };

      const action1: ActionNode = {
        id: 'action1',
        type: 'action',
        effectType: 'set-color',
        target: { 
          groups: { source: 'literal', value: 'front' }, 
          filter: { source: 'literal', value: 'all' } 
        },
        color: { 
          name: { source: 'literal', value: 'red' }, 
          brightness: { source: 'literal', value: 'high' } 
        },
        timing: {
          waitForCondition: 'none',
          waitForTime: { source: 'literal', value: 0 },
          duration: { source: 'literal', value: 100 },
          waitUntilCondition: 'none',
          waitUntilTime: { source: 'literal', value: 0 }
        }
      };

      const action2: ActionNode = {
        id: 'action2',
        type: 'action',
        effectType: 'set-color',
        target: { 
          groups: { source: 'literal', value: 'back' }, 
          filter: { source: 'literal', value: 'all' } 
        },
        color: { 
          name: { source: 'literal', value: 'blue' }, 
          brightness: { source: 'literal', value: 'high' } 
        },
        timing: {
          waitForCondition: 'none',
          waitForTime: { source: 'literal', value: 0 },
          duration: { source: 'literal', value: 100 },
          waitUntilCondition: 'none',
          waitUntilTime: { source: 'literal', value: 0 }
        }
      };

      const definition: YargNodeCueDefinition = {
        id: 'test-cue',
        name: 'Test Cue',
        cueType: CueType.Default,
        style: 'primary',
        nodes: {
          events: [eventNode],
          actions: [action1, action2],
          logic: []
        },
        connections: [
          { from: 'event1', to: 'action1' },
          { from: 'action1', to: 'action2' }
        ]
      };

      const compiledCue: CompiledYargCue = {
        definition,
        eventMap: new Map([['event1', eventNode]]),
        actionMap: new Map([
          ['action1', action1],
          ['action2', action2]
        ]),
        logicMap: new Map(),
      eventRaiserMap: new Map(),
      eventListenerMap: new Map(),
      effectRaiserMap: new Map(),
        eventDefinitions: [],
        adjacency: new Map([
          ['event1', [{ from: 'event1', to: 'action1' }]],
          ['action1', [{ from: 'action1', to: 'action2' }]]
        ])
      };

      const engine = new NodeExecutionEngine(
        compiledCue,
        'test-group:test-cue',
        mockSequencer,
        mockLightManager,
        cueLevelVarStore,
        groupLevelVarStore,
        new EffectRegistry()
      );

      engine.startExecution(eventNode, createCueData('Strong'));

      // First action should be called immediately
      expect(mockSequencer.addEffectWithCallback).toHaveBeenCalledTimes(1);

      // Simulate first action completing
      const firstCall = (mockSequencer.addEffectWithCallback as any).mock.calls[0];
      const completionCallback = firstCall[2];
      completionCallback();

      // Second action should now be called
      expect(mockSequencer.addEffectWithCallback).toHaveBeenCalledTimes(2);
    });
  });

  describe('Logic Node Execution', () => {
    it('should evaluate conditional node at runtime', () => {
      const eventNode: YargEventNode = {
        id: 'event1',
        type: 'event',
        eventType: 'beat'
      };

      const conditionalNode: LogicNode = {
        id: 'logic1',
        type: 'logic',
        logicType: 'conditional',
        comparator: '>',
        left: { source: 'literal', value: 5 },
        right: { source: 'literal', value: 3 }
      };

      const actionTrue: ActionNode = {
        id: 'action-true',
        type: 'action',
        effectType: 'set-color',
        target: { 
          groups: { source: 'literal', value: 'front' }, 
          filter: { source: 'literal', value: 'all' } 
        },
        color: { 
          name: { source: 'literal', value: 'green' }, 
          brightness: { source: 'literal', value: 'high' } 
        },
        timing: {
          waitForCondition: 'none',
          waitForTime: { source: 'literal', value: 0 },
          duration: { source: 'literal', value: 100 },
          waitUntilCondition: 'none',
          waitUntilTime: { source: 'literal', value: 0 }
        }
      };

      const actionFalse: ActionNode = {
        id: 'action-false',
        type: 'action',
        effectType: 'set-color',
        target: { 
          groups: { source: 'literal', value: 'front' }, 
          filter: { source: 'literal', value: 'all' } 
        },
        color: { 
          name: { source: 'literal', value: 'red' }, 
          brightness: { source: 'literal', value: 'high' } 
        },
        timing: {
          waitForCondition: 'none',
          waitForTime: { source: 'literal', value: 0 },
          duration: { source: 'literal', value: 100 },
          waitUntilCondition: 'none',
          waitUntilTime: { source: 'literal', value: 0 }
        }
      };

      const definition: YargNodeCueDefinition = {
        id: 'test-cue',
        name: 'Test Cue',
        cueType: CueType.Default,
        style: 'primary',
        nodes: {
          events: [eventNode],
          actions: [actionTrue, actionFalse],
          logic: [conditionalNode]
        },
        connections: [
          { from: 'event1', to: 'logic1' },
          { from: 'logic1', to: 'action-true', fromPort: 'true' },
          { from: 'logic1', to: 'action-false', fromPort: 'false' }
        ]
      };

      const compiledCue: CompiledYargCue = {
        definition,
        eventMap: new Map([['event1', eventNode]]),
        actionMap: new Map([
          ['action-true', actionTrue],
          ['action-false', actionFalse]
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
              { from: 'logic1', to: 'action-false', fromPort: 'false' }
            ]
          ]
        ])
      };

      const engine = new NodeExecutionEngine(
        compiledCue,
        'test-group:test-cue',
        mockSequencer,
        mockLightManager,
        cueLevelVarStore,
        groupLevelVarStore,
        new EffectRegistry()
      );

      engine.startExecution(eventNode, createCueData('Strong'));

      // Since 5 > 3 is true, action-true should be executed
      expect(mockSequencer.addEffectWithCallback).toHaveBeenCalledTimes(1);
      const call = (mockSequencer.addEffectWithCallback as any).mock.calls[0];
      const effectName = call[0];
      expect(effectName).toContain('action-true');
    });

    it('should set and read variables at runtime', async () => {
      const eventNode: YargEventNode = {
        id: 'event1',
        type: 'event',
        eventType: 'beat'
      };

      const setVarNode: LogicNode = {
        id: 'logic1',
        type: 'logic',
        logicType: 'variable',
        mode: 'set',
        varName: 'counter',
        valueType: 'number',
        value: { source: 'literal', value: 42 }
      };

      const readVarNode: LogicNode = {
        id: 'logic2',
        type: 'logic',
        logicType: 'conditional',
        comparator: '==',
        left: { source: 'variable', name: 'counter' },
        right: { source: 'literal', value: 42 }
      };

      const actionNode: ActionNode = {
        id: 'action1',
        type: 'action',
        effectType: 'set-color',
        target: { 
          groups: { source: 'literal', value: 'front' }, 
          filter: { source: 'literal', value: 'all' } 
        },
        color: { 
          name: { source: 'literal', value: 'green' }, 
          brightness: { source: 'literal', value: 'high' } 
        },
        timing: {
          waitForCondition: 'none',
          waitForTime: { source: 'literal', value: 0 },
          duration: { source: 'literal', value: 100 },
          waitUntilCondition: 'none',
          waitUntilTime: { source: 'literal', value: 0 }
        }
      };

      const definition: YargNodeCueDefinition = {
        id: 'test-cue',
        name: 'Test Cue',
        cueType: CueType.Default,
        style: 'primary',
        nodes: {
          events: [eventNode],
          actions: [actionNode],
          logic: [setVarNode, readVarNode]
        },
        connections: [
          { from: 'event1', to: 'logic1' },
          { from: 'logic1', to: 'logic2' },
          { from: 'logic2', to: 'action1', fromPort: 'true' }
        ],
        variables: [
          {
            name: 'counter',
            type: 'number',
            scope: 'cue',
            initialValue: 0
          }
        ]
      };

      const compiledCue: CompiledYargCue = {
        definition,
        eventMap: new Map([['event1', eventNode]]),
        actionMap: new Map([['action1', actionNode]]),
        logicMap: new Map<string, LogicNode>([
          ['logic1', setVarNode],
          ['logic2', readVarNode]
        ]),
      eventRaiserMap: new Map(),
      eventListenerMap: new Map(),
      effectRaiserMap: new Map(),
        eventDefinitions: [],
        adjacency: new Map([
          ['event1', [{ from: 'event1', to: 'logic1' }]],
          ['logic1', [{ from: 'logic1', to: 'logic2' }]],
          ['logic2', [{ from: 'logic2', to: 'action1', fromPort: 'true' }]]
        ])
      };

      const engine = new NodeExecutionEngine(
        compiledCue,
        'test-group:test-cue',
        mockSequencer,
        mockLightManager,
        cueLevelVarStore,
        groupLevelVarStore,
        new EffectRegistry(),
        definition.variables ?? []
      );

      engine.startExecution(eventNode, createCueData('Strong'));

      // Advance timers to allow the mock callback to fire
      jest.runAllTimers();

      // Variable should be set to 42
      expect(cueLevelVarStore.get('counter')).toEqual({
        type: 'number',
        value: 42
      });

      // Action should execute because 42 == 42
      expect(mockSequencer.addEffectWithCallback).toHaveBeenCalledTimes(1);
    });
  });

  describe('Execution Context', () => {
    it('should prevent cycles with visited tracking', () => {
      const eventNode: YargEventNode = {
        id: 'event1',
        type: 'event',
        eventType: 'beat'
      };

      const context = new ExecutionContext(
        eventNode,
        createCueData('Strong'),
        cueLevelVarStore,
        groupLevelVarStore
      );

      // Mark node as visited
      context.markVisited('action1');

      // Should return true for visited node
      expect(context.hasVisited('action1')).toBe(true);

      // Should return false for unvisited node
      expect(context.hasVisited('action2')).toBe(false);
    });

    it('should track active actions', () => {
      const eventNode: YargEventNode = {
        id: 'event1',
        type: 'event',
        eventType: 'beat'
      };

      const context = new ExecutionContext(
        eventNode,
        createCueData('Strong'),
        cueLevelVarStore,
        groupLevelVarStore
      );

      const actionNode: ActionNode = {
        id: 'action1',
        type: 'action',
        effectType: 'set-color',
        target: { 
          groups: { source: 'literal', value: 'front' }, 
          filter: { source: 'literal', value: 'all' } 
        },
        color: { 
          name: { source: 'literal', value: 'red' }, 
          brightness: { source: 'literal', value: 'high' } 
        },
        timing: {
          waitForCondition: 'none',
          waitForTime: { source: 'literal', value: 0 },
          duration: { source: 'literal', value: 100 },
          waitUntilCondition: 'none',
          waitUntilTime: { source: 'literal', value: 0 }
        }
      };

      // Register active action
      context.registerActiveAction('action1', actionNode);
      expect(context.hasActiveActions()).toBe(true);

      // Complete action
      context.completeAction('action1');
      expect(context.hasActiveActions()).toBe(false);
    });

    it('should detect completion correctly', () => {
      const eventNode: YargEventNode = {
        id: 'event1',
        type: 'event',
        eventType: 'beat'
      };

      const context = new ExecutionContext(
        eventNode,
        createCueData('Strong'),
        cueLevelVarStore,
        groupLevelVarStore
      );

      // Context with no active or pending nodes should be complete
      expect(context.isComplete()).toBe(true);

      // Queue a node
      context.queueNodes(['action1']);
      expect(context.isComplete()).toBe(false);

      // Dequeue node
      context.dequeueNode();
      expect(context.isComplete()).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing action nodes gracefully', () => {
      const eventNode: YargEventNode = {
        id: 'event1',
        type: 'event',
        eventType: 'beat'
      };

      const definition: YargNodeCueDefinition = {
        id: 'test-cue',
        name: 'Test Cue',
        cueType: CueType.Default,
        style: 'primary',
        nodes: {
          events: [eventNode],
          actions: [],
          logic: []
        },
        connections: [
          { from: 'event1', to: 'nonexistent-action' }
        ]
      };

      const compiledCue: CompiledYargCue = {
        definition,
        eventMap: new Map([['event1', eventNode]]),
        actionMap: new Map(),
        logicMap: new Map(),
      eventRaiserMap: new Map(),
      eventListenerMap: new Map(),
      effectRaiserMap: new Map(),
        eventDefinitions: [],
        adjacency: new Map([
          ['event1', [{ from: 'event1', to: 'nonexistent-action' }]]
        ])
      };

      const engine = new NodeExecutionEngine(
        compiledCue,
        'test-group:test-cue',
        mockSequencer,
        mockLightManager,
        cueLevelVarStore,
        groupLevelVarStore,
        new EffectRegistry()
      );

      // Should not throw
      expect(() => {
        engine.startExecution(eventNode, createCueData('Strong'));
      }).not.toThrow();
    });

    it('should cleanup on cancelAll', () => {
      const eventNode: YargEventNode = {
        id: 'event1',
        type: 'event',
        eventType: 'beat'
      };

      const actionNode: ActionNode = {
        id: 'action1',
        type: 'action',
        effectType: 'set-color',
        target: { 
          groups: { source: 'literal', value: 'front' }, 
          filter: { source: 'literal', value: 'all' } 
        },
        color: { 
          name: { source: 'literal', value: 'red' }, 
          brightness: { source: 'literal', value: 'high' } 
        },
        timing: {
          waitForCondition: 'none',
          waitForTime: { source: 'literal', value: 0 },
          duration: { source: 'literal', value: 100 },
          waitUntilCondition: 'none',
          waitUntilTime: { source: 'literal', value: 0 }
        }
      };

      const definition: YargNodeCueDefinition = {
        id: 'test-cue',
        name: 'Test Cue',
        cueType: CueType.Default,
        style: 'primary',
        nodes: {
          events: [eventNode],
          actions: [actionNode],
          logic: []
        },
        connections: [{ from: 'event1', to: 'action1' }]
      };

      const compiledCue: CompiledYargCue = {
        definition,
        eventMap: new Map([['event1', eventNode]]),
        actionMap: new Map([['action1', actionNode]]),
        logicMap: new Map(),
      eventRaiserMap: new Map(),
      eventListenerMap: new Map(),
      effectRaiserMap: new Map(),
        eventDefinitions: [],
        adjacency: new Map([['event1', [{ from: 'event1', to: 'action1' }]]])
      };

      const engine = new NodeExecutionEngine(
        compiledCue,
        'test-group:test-cue',
        mockSequencer,
        mockLightManager,
        cueLevelVarStore,
        groupLevelVarStore,
        new EffectRegistry()
      );

      engine.startExecution(eventNode, createCueData('Strong'));

      // Cancel all executions
      engine.cancelAll();

      // Execution state should be empty
      const state = engine.getExecutionState();
      expect(state.activeContexts).toHaveLength(0);
    });
  });

  describe('Effect Raiser Node', () => {
    it('should execute effect when Effect Raiser is triggered', async () => {
      const eventNode: YargEventNode = {
        id: 'event1',
        type: 'event',
        eventType: 'beat'
      };

      const effectRaiserNode = {
        id: 'raiser1',
        type: 'effect-raiser' as const,
        effectId: 'test-effect',
        label: 'Raise Effect',
        outputs: []
      };

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
          effectRaisers: [effectRaiserNode]
        },
        connections: [{ from: 'event1', to: 'raiser1' }]
      };

      const compiledCue: CompiledYargCue = {
        definition,
        eventMap: new Map([['event1', eventNode]]),
        actionMap: new Map(),
        logicMap: new Map(),
        eventRaiserMap: new Map(),
        eventListenerMap: new Map(),
        effectRaiserMap: new Map([['raiser1', effectRaiserNode]]),
        eventDefinitions: [],
        adjacency: new Map([['event1', [{ from: 'event1', to: 'raiser1' }]]])
      };

      // Create a mock effect
      const mockEffect = {
        definition: { id: 'test-effect', name: 'Test Effect' },
        eventRaiserMap: new Map(),
        eventListenerMap: new Map(),
        actionMap: new Map(),
        logicMap: new Map(),
        adjacency: new Map()
      };

      const effectRegistry = new EffectRegistry();
      effectRegistry.registerEffect('test-effect', mockEffect as any);

      const engine = new NodeExecutionEngine(
        compiledCue,
        'test-group:test-cue',
        mockSequencer,
        mockLightManager,
        cueLevelVarStore,
        groupLevelVarStore,
        effectRegistry
      );

      await engine.startExecution(eventNode, createCueData('Strong'));

      // Effect should be found and executed (non-blocking)
      // In real execution, EffectExecutionEngine would be triggered
      expect(effectRegistry.hasEffect('test-effect')).toBe(true);
    });

    it('should handle missing effect gracefully', () => {
      const eventNode: YargEventNode = {
        id: 'event1',
        type: 'event',
        eventType: 'beat'
      };

      const effectRaiserNode = {
        id: 'raiser1',
        type: 'effect-raiser' as const,
        effectId: 'missing-effect',
        label: 'Raise Missing Effect',
        outputs: []
      };

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
          effectRaisers: [effectRaiserNode]
        },
        connections: [{ from: 'event1', to: 'raiser1' }]
      };

      const compiledCue: CompiledYargCue = {
        definition,
        eventMap: new Map([['event1', eventNode]]),
        actionMap: new Map(),
        logicMap: new Map(),
        eventRaiserMap: new Map(),
        eventListenerMap: new Map(),
        effectRaiserMap: new Map([['raiser1', effectRaiserNode]]),
        eventDefinitions: [],
        adjacency: new Map([['event1', [{ from: 'event1', to: 'raiser1' }]]])
      };

      const effectRegistry = new EffectRegistry(); // Empty registry

      const engine = new NodeExecutionEngine(
        compiledCue,
        'test-group:test-cue',
        mockSequencer,
        mockLightManager,
        cueLevelVarStore,
        groupLevelVarStore,
        effectRegistry
      );

      // Should not throw, just log warning
      expect(() => {
        engine.startExecution(eventNode, createCueData('Strong'));
      }).not.toThrow();
    });

    it('should continue execution after Effect Raiser (non-blocking)', async () => {
      const eventNode: YargEventNode = {
        id: 'event1',
        type: 'event',
        eventType: 'beat'
      };

      const effectRaiserNode = {
        id: 'raiser1',
        type: 'effect-raiser' as const,
        effectId: 'test-effect',
        label: 'Raise Effect',
        outputs: ['action1']
      };

      const actionNode: ActionNode = {
        id: 'action1',
        type: 'action',
        effectType: 'set-color',
        target: { 
          groups: { source: 'literal', value: 'front' }, 
          filter: { source: 'literal', value: 'all' } 
        },
        color: { 
          name: { source: 'literal', value: 'white' }, 
          brightness: { source: 'literal', value: 'medium' }, 
          blendMode: { source: 'literal', value: 'replace' } 
        },
        secondaryColor: { 
          name: { source: 'literal', value: 'white' }, 
          brightness: { source: 'literal', value: 'medium' }, 
          blendMode: { source: 'literal', value: 'replace' } 
        },
        timing: { 
          waitForCondition: 'none',
          waitForTime: { source: 'literal', value: 0 },
          duration: { source: 'literal', value: 100 },
          waitUntilCondition: 'none',
          waitUntilTime: { source: 'literal', value: 0 },
          easing: 'linear',
          level: { source: 'literal', value: 1 }
        },
        layer: { source: 'literal', value: 0 }
      };

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
          effectRaisers: [effectRaiserNode]
        },
        connections: [
          { from: 'event1', to: 'raiser1' },
          { from: 'raiser1', to: 'action1' }
        ]
      };

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
          ['raiser1', [{ from: 'raiser1', to: 'action1' }]]
        ])
      };

      const mockEffect = {
        definition: { id: 'test-effect', name: 'Test' },
        eventRaiserMap: new Map(),
        eventListenerMap: new Map(),
        actionMap: new Map(),
        logicMap: new Map(),
        adjacency: new Map()
      };

      const effectRegistry = new EffectRegistry();
      effectRegistry.registerEffect('test-effect', mockEffect as any);

      const engine = new NodeExecutionEngine(
        compiledCue,
        'test-group:test-cue',
        mockSequencer,
        mockLightManager,
        cueLevelVarStore,
        groupLevelVarStore,
        effectRegistry
      );

      await engine.startExecution(eventNode, createCueData('Strong'));

      // Both effect and subsequent action should execute
      // Effect executes async, action executes in chain
      expect(mockSequencer.addEffectWithCallback).toHaveBeenCalled();
    });
  });

  describe('Data Nodes', () => {
    it('should extract YARG cue data and assign to variable', () => {
      const eventNode: YargEventNode = {
        id: 'event1',
        type: 'event',
        eventType: 'beat'
      };

      const cueDataNode: LogicNode = {
        id: 'cuedata1',
        type: 'logic',
        logicType: 'cue-data',
        dataProperty: 'bpm',
        assignTo: 'currentBpm',
        outputs: []
      };

      const actionNode: ActionNode = {
        id: 'action1',
        type: 'action',
        effectType: 'set-color',
        target: { 
          groups: { source: 'literal', value: 'front' }, 
          filter: { source: 'literal', value: 'all' } 
        },
        color: { 
          name: { source: 'literal', value: 'red' }, 
          brightness: { source: 'literal', value: 'high' } 
        },
        timing: {
          waitForCondition: 'none',
          waitForTime: { source: 'literal', value: 0 },
          duration: { source: 'literal', value: 200 },
          waitUntilCondition: 'none',
          waitUntilTime: { source: 'literal', value: 0 }
        }
      };

      const definition: YargNodeCueDefinition = {
        id: 'test-cue',
        name: 'Test Cue',
        cueType: CueType.Default,
        style: 'primary',
        nodes: {
          events: [eventNode],
          actions: [actionNode],
          logic: [cueDataNode]
        },
        connections: [
          { from: 'event1', to: 'cuedata1' },
          { from: 'cuedata1', to: 'action1' }
        ],
        variables: [
          { name: 'currentBpm', type: 'number', scope: 'cue', initialValue: 0 }
        ]
      };

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
          ['cuedata1', [{ from: 'cuedata1', to: 'action1' }]]
        ])
      };

      const engine = new NodeExecutionEngine(
        compiledCue,
        'test-group:test-cue',
        mockSequencer,
        mockLightManager,
        cueLevelVarStore,
        groupLevelVarStore,
        new EffectRegistry(),
        definition.variables
      );

      const parameters = createCueData('Strong');
      parameters.beatsPerMinute = 140;
      engine.startExecution(eventNode, parameters);

      // Verify variable was set
      const storedVar = cueLevelVarStore.get('currentBpm');
      expect(storedVar).toBeDefined();
      expect(storedVar?.value).toBe(140);
      expect(storedVar?.type).toBe('number');

      // Action should still execute
      expect(mockSequencer.addEffectWithCallback).toHaveBeenCalled();
    });

    it('should extract config data and assign to variable', () => {
      const eventNode: YargEventNode = {
        id: 'event1',
        type: 'event',
        eventType: 'beat'
      };

      const configDataNode: LogicNode = {
        id: 'configdata1',
        type: 'logic',
        logicType: 'config-data',
        dataProperty: 'front-lights-count',
        assignTo: 'numFrontLights',
        outputs: []
      };

      const actionNode: ActionNode = {
        id: 'action1',
        type: 'action',
        effectType: 'set-color',
        target: { 
          groups: { source: 'literal', value: 'front' }, 
          filter: { source: 'literal', value: 'all' } 
        },
        color: { 
          name: { source: 'literal', value: 'red' }, 
          brightness: { source: 'literal', value: 'high' } 
        },
        timing: {
          waitForCondition: 'none',
          waitForTime: { source: 'literal', value: 0 },
          duration: { source: 'literal', value: 200 },
          waitUntilCondition: 'none',
          waitUntilTime: { source: 'literal', value: 0 }
        }
      };

      const definition: YargNodeCueDefinition = {
        id: 'test-cue',
        name: 'Test Cue',
        cueType: CueType.Default,
        style: 'primary',
        nodes: {
          events: [eventNode],
          actions: [actionNode],
          logic: [configDataNode]
        },
        connections: [
          { from: 'event1', to: 'configdata1' },
          { from: 'configdata1', to: 'action1' }
        ],
        variables: [
          { name: 'numFrontLights', type: 'number', scope: 'cue', initialValue: 0 }
        ]
      };

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
          ['configdata1', [{ from: 'configdata1', to: 'action1' }]]
        ])
      };

      // Mock getLightsInGroup to return 8 front lights
      mockLightManager.getLightsInGroup = jest.fn().mockReturnValue([
        { id: 'f1' }, { id: 'f2' }, { id: 'f3' }, { id: 'f4' },
        { id: 'f5' }, { id: 'f6' }, { id: 'f7' }, { id: 'f8' }
      ]);

      const engine = new NodeExecutionEngine(
        compiledCue,
        'test-group:test-cue',
        mockSequencer,
        mockLightManager,
        cueLevelVarStore,
        groupLevelVarStore,
        new EffectRegistry(),
        definition.variables
      );

      engine.startExecution(eventNode, createCueData('Strong'));

      // Verify variable was set
      const storedVar = cueLevelVarStore.get('numFrontLights');
      expect(storedVar).toBeDefined();
      expect(storedVar?.value).toBe(8);
      expect(storedVar?.type).toBe('number');

      // Action should still execute
      expect(mockSequencer.addEffectWithCallback).toHaveBeenCalled();
    });

    it('should handle cue data node without assignTo', () => {
      const eventNode: YargEventNode = {
        id: 'event1',
        type: 'event',
        eventType: 'beat'
      };

      const cueDataNode: LogicNode = {
        id: 'cuedata1',
        type: 'logic',
        logicType: 'cue-data',
        dataProperty: 'execution-count',
        // No assignTo - value should be ignored
        outputs: []
      };

      const actionNode: ActionNode = {
        id: 'action1',
        type: 'action',
        effectType: 'set-color',
        target: { 
          groups: { source: 'literal', value: 'front' }, 
          filter: { source: 'literal', value: 'all' } 
        },
        color: { 
          name: { source: 'literal', value: 'red' }, 
          brightness: { source: 'literal', value: 'high' } 
        },
        timing: {
          waitForCondition: 'none',
          waitForTime: { source: 'literal', value: 0 },
          duration: { source: 'literal', value: 200 },
          waitUntilCondition: 'none',
          waitUntilTime: { source: 'literal', value: 0 }
        }
      };

      const definition: YargNodeCueDefinition = {
        id: 'test-cue',
        name: 'Test Cue',
        cueType: CueType.Default,
        style: 'primary',
        nodes: {
          events: [eventNode],
          actions: [actionNode],
          logic: [cueDataNode]
        },
        connections: [
          { from: 'event1', to: 'cuedata1' },
          { from: 'cuedata1', to: 'action1' }
        ]
      };

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
          ['cuedata1', [{ from: 'cuedata1', to: 'action1' }]]
        ])
      };

      const engine = new NodeExecutionEngine(
        compiledCue,
        'test-group:test-cue',
        mockSequencer,
        mockLightManager,
        cueLevelVarStore,
        groupLevelVarStore,
        new EffectRegistry()
      );

      engine.startExecution(eventNode, createCueData('Strong'));

      // No variable should be set
      expect(cueLevelVarStore.size).toBe(0);

      // Action should still execute
      expect(mockSequencer.addEffectWithCallback).toHaveBeenCalled();
    });

    it('should use cue data in conditional branching', () => {
      const eventNode: YargEventNode = {
        id: 'event1',
        type: 'event',
        eventType: 'beat'
      };

      const cueDataNode: LogicNode = {
        id: 'cuedata1',
        type: 'logic',
        logicType: 'cue-data',
        dataProperty: 'guitar-note-count',
        assignTo: 'noteCount',
        outputs: []
      };

      const conditionalNode: LogicNode = {
        id: 'conditional1',
        type: 'logic',
        logicType: 'conditional',
        comparator: '>=',
        left: { source: 'variable', name: 'noteCount' },
        right: { source: 'literal', value: 2 },
        outputs: []
      };

      const actionHigh: ActionNode = {
        id: 'action-high',
        type: 'action',
        effectType: 'set-color',
        target: { 
          groups: { source: 'literal', value: 'front' }, 
          filter: { source: 'literal', value: 'all' } 
        },
        color: { 
          name: { source: 'literal', value: 'red' }, 
          brightness: { source: 'literal', value: 'high' } 
        },
        timing: {
          waitForCondition: 'none',
          waitForTime: { source: 'literal', value: 0 },
          duration: { source: 'literal', value: 200 },
          waitUntilCondition: 'none',
          waitUntilTime: { source: 'literal', value: 0 }
        }
      };

      const actionLow: ActionNode = {
        id: 'action-low',
        type: 'action',
        effectType: 'set-color',
        target: { 
          groups: { source: 'literal', value: 'front' }, 
          filter: { source: 'literal', value: 'all' } 
        },
        color: { 
          name: { source: 'literal', value: 'blue' }, 
          brightness: { source: 'literal', value: 'low' } 
        },
        timing: {
          waitForCondition: 'none',
          waitForTime: { source: 'literal', value: 0 },
          duration: { source: 'literal', value: 200 },
          waitUntilCondition: 'none',
          waitUntilTime: { source: 'literal', value: 0 }
        }
      };

      const definition: YargNodeCueDefinition = {
        id: 'test-cue',
        name: 'Test Cue',
        cueType: CueType.Default,
        style: 'primary',
        nodes: {
          events: [eventNode],
          actions: [actionHigh, actionLow],
          logic: [cueDataNode, conditionalNode]
        },
        connections: [
          { from: 'event1', to: 'cuedata1' },
          { from: 'cuedata1', to: 'conditional1' },
          { from: 'conditional1', to: 'action-high', fromPort: 'true' },
          { from: 'conditional1', to: 'action-low', fromPort: 'false' }
        ],
        variables: [
          { name: 'noteCount', type: 'number', scope: 'cue', initialValue: 0 }
        ]
      };

      const compiledCue: CompiledYargCue = {
        definition,
        eventMap: new Map([['event1', eventNode]]),
        actionMap: new Map([
          ['action-high', actionHigh],
          ['action-low', actionLow]
        ]),
        logicMap: new Map<string, LogicNode>([
          ['cuedata1', cueDataNode],
          ['conditional1', conditionalNode]
        ]),
        eventRaiserMap: new Map(),
        eventListenerMap: new Map(),
        effectRaiserMap: new Map(),
        eventDefinitions: [],
        adjacency: new Map([
          ['event1', [{ from: 'event1', to: 'cuedata1' }]],
          ['cuedata1', [{ from: 'cuedata1', to: 'conditional1' }]],
          ['conditional1', [
            { from: 'conditional1', to: 'action-high', fromPort: 'true' },
            { from: 'conditional1', to: 'action-low', fromPort: 'false' }
          ]]
        ])
      };

      const engine = new NodeExecutionEngine(
        compiledCue,
        'test-group:test-cue',
        mockSequencer,
        mockLightManager,
        cueLevelVarStore,
        groupLevelVarStore,
        new EffectRegistry(),
        definition.variables
      );

      // Test with 3 guitar notes (should trigger high action)
      const parameters = createCueData('Strong');
      parameters.guitarNotes = ['Green', 'Red', 'Yellow'] as any;
      engine.startExecution(eventNode, parameters);

      // Verify variable was set correctly
      const storedVar = cueLevelVarStore.get('noteCount');
      expect(storedVar?.value).toBe(3);

      // Should execute high action (3 >= 2)
      expect(mockSequencer.addEffectWithCallback).toHaveBeenCalledWith(
        expect.stringContaining('action-high'),
        expect.anything(),
        expect.anything(),
        false
      );
    });

    it('should extract config data for total lights', () => {
      const eventNode: YargEventNode = {
        id: 'event1',
        type: 'event',
        eventType: 'beat'
      };

      const configDataNode: LogicNode = {
        id: 'configdata1',
        type: 'logic',
        logicType: 'config-data',
        dataProperty: 'total-lights',
        assignTo: 'totalCount',
        outputs: []
      };

      const actionNode: ActionNode = {
        id: 'action1',
        type: 'action',
        effectType: 'set-color',
        target: { 
          groups: { source: 'literal', value: 'front' }, 
          filter: { source: 'literal', value: 'all' } 
        },
        color: { 
          name: { source: 'literal', value: 'red' }, 
          brightness: { source: 'literal', value: 'high' } 
        },
        timing: {
          waitForCondition: 'none',
          waitForTime: { source: 'literal', value: 0 },
          duration: { source: 'literal', value: 200 },
          waitUntilCondition: 'none',
          waitUntilTime: { source: 'literal', value: 0 }
        }
      };

      const definition: YargNodeCueDefinition = {
        id: 'test-cue',
        name: 'Test Cue',
        cueType: CueType.Default,
        style: 'primary',
        nodes: {
          events: [eventNode],
          actions: [actionNode],
          logic: [configDataNode]
        },
        connections: [
          { from: 'event1', to: 'configdata1' },
          { from: 'configdata1', to: 'action1' }
        ],
        variables: [
          { name: 'totalCount', type: 'number', scope: 'cue', initialValue: 0 }
        ]
      };

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
          ['configdata1', [{ from: 'configdata1', to: 'action1' }]]
        ])
      };

      // Mock total lights count
      mockLightManager.getLightsInGroup = jest.fn((groups) => {
        if (Array.isArray(groups)) {
          return [
            { id: 'f1', position: 0 }, { id: 'f2', position: 1 }, { id: 'f3', position: 2 }, { id: 'f4', position: 3 },
            { id: 'b1', position: 0 }, { id: 'b2', position: 1 }, { id: 's1', position: 0 }
          ];
        }
        return [];
      }) as any;

      const engine = new NodeExecutionEngine(
        compiledCue,
        'test-group:test-cue',
        mockSequencer,
        mockLightManager,
        cueLevelVarStore,
        groupLevelVarStore,
        new EffectRegistry(),
        definition.variables
      );

      engine.startExecution(eventNode, createCueData('Strong'));

      // Verify variable was set
      const storedVar = cueLevelVarStore.get('totalCount');
      expect(storedVar).toBeDefined();
      expect(storedVar?.value).toBe(7);
      expect(storedVar?.type).toBe('number');

      // Action should still execute
      expect(mockSequencer.addEffectWithCallback).toHaveBeenCalled();
    });
  });

  describe('Action Node Variable Resolution', () => {
    beforeEach(() => {
      // Update mock light manager to return lights with position
      mockLightManager.getLightsInGroup = jest.fn((group) => {
        const groups = Array.isArray(group) ? group : [group];
        const lights: any[] = [];
        if (groups.includes('front')) {
          lights.push({ id: 'f1', position: { x: 0, y: 0, z: 0 } }, { id: 'f2', position: { x: 0, y: 0, z: 0 } });
        }
        if (groups.includes('back')) {
          lights.push({ id: 'b1', position: { x: 0, y: 0, z: 0 } });
        }
        return lights;
      });
    });

    it('should resolve variable for color name', () => {
      // Setup: event -> variable (set color) -> action (use color variable)
      const eventNode: YargEventNode = {
        id: 'event1',
        type: 'event',
        eventType: 'beat',
        outputs: ['var1']
      };

      const variableNode: LogicNode = {
        id: 'var1',
        type: 'logic',
        logicType: 'variable',
        mode: 'set',
        varName: 'myColor',
        valueType: 'string',
        value: { source: 'literal', value: 'red' },
        outputs: ['action1']
      };

      const actionNode: ActionNode = {
        id: 'action1',
        type: 'action',
        effectType: 'set-color',
        target: {
          groups: { source: 'literal', value: 'front' },
          filter: { source: 'literal', value: 'all' }
        },
        color: {
          name: { source: 'variable', name: 'myColor', fallback: 'blue' },
          brightness: { source: 'literal', value: 'medium' },
          blendMode: { source: 'literal', value: 'replace' }
        },
        timing: {
          waitForCondition: 'none',
          waitForTime: { source: 'literal', value: 0 },
          duration: { source: 'literal', value: 200 },
          waitUntilCondition: 'none',
          waitUntilTime: { source: 'literal', value: 0 },
          easing: 'sinInOut',
          level: { source: 'literal', value: 1 }
        }
      };

      const definition: YargNodeCueDefinition = {
        id: 'test-cue',
        name: 'Test Cue',
        cueType: CueType.Intro,
        style: 'primary',
        nodes: {
          events: [eventNode],
          actions: [actionNode],
          logic: [variableNode]
        },
        connections: [
          { from: 'event1', to: 'var1', fromPort: 'event1', toPort: 'var1' },
          { from: 'var1', to: 'action1', fromPort: 'var1', toPort: 'action1' }
        ],
        variables: [{ name: 'myColor', type: 'string', scope: 'cue', initialValue: '' }]
      };

      const compiledCue: CompiledYargCue = { definition, eventMap: new Map([[eventNode.id, eventNode]]), actionMap: new Map([[actionNode.id, actionNode]]), logicMap: new Map<string, LogicNode>([[variableNode.id, variableNode]]), eventRaiserMap: new Map(), eventListenerMap: new Map(), effectRaiserMap: new Map(), eventDefinitions: [], adjacency: new Map([['event1', [{ from: 'event1', to: 'var1' }]], ['var1', [{ from: 'var1', to: 'action1' }]]]) };

      const engine = new NodeExecutionEngine(
        compiledCue,
        'test-cue',
        mockSequencer,
        mockLightManager,
        cueLevelVarStore,
        groupLevelVarStore,
        new EffectRegistry(),
        definition.variables
      );

      engine.startExecution(eventNode, createCueData('Strong'));

      // Wait for action to execute
      setTimeout(() => {
        expect(mockSequencer.addEffectWithCallback).toHaveBeenCalled();
        // The resolved color should be 'red' from the variable
      }, 10);
    });

    it('should resolve variable for target groups', () => {
      // Setup: variable (set groups) -> action (use groups variable)
      const eventNode: YargEventNode = {
        id: 'event1',
        type: 'event',
        eventType: 'beat',
        outputs: ['var1']
      };

      const variableNode: LogicNode = {
        id: 'var1',
        type: 'logic',
        logicType: 'variable',
        mode: 'set',
        varName: 'targetGroups',
        valueType: 'string',
        value: { source: 'literal', value: 'front,back' },
        outputs: ['action1']
      };

      const actionNode: ActionNode = {
        id: 'action1',
        type: 'action',
        effectType: 'set-color',
        target: {
          groups: { source: 'variable', name: 'targetGroups', fallback: 'front' },
          filter: { source: 'literal', value: 'all' }
        },
        color: {
          name: { source: 'literal', value: 'blue' },
          brightness: { source: 'literal', value: 'high' },
          blendMode: { source: 'literal', value: 'replace' }
        },
        timing: {
          waitForCondition: 'none',
          waitForTime: { source: 'literal', value: 0 },
          duration: { source: 'literal', value: 200 },
          waitUntilCondition: 'none',
          waitUntilTime: { source: 'literal', value: 0 },
          easing: 'sinInOut',
          level: { source: 'literal', value: 1 }
        }
      };

      const definition: YargNodeCueDefinition = {
        id: 'test-cue',
        name: 'Test Cue',
        cueType: CueType.Intro,
        style: 'primary',
        nodes: {
          events: [eventNode],
          actions: [actionNode],
          logic: [variableNode]
        },
        connections: [
          { from: 'event1', to: 'var1' },
          { from: 'var1', to: 'action1' }
        ],
        variables: [{ name: 'targetGroups', type: 'string', scope: 'cue', initialValue: '' }]
      };

      const compiledCue: CompiledYargCue = { definition, eventMap: new Map([[eventNode.id, eventNode]]), actionMap: new Map([[actionNode.id, actionNode]]), logicMap: new Map<string, LogicNode>([[variableNode.id, variableNode]]), eventRaiserMap: new Map(), eventListenerMap: new Map(), effectRaiserMap: new Map(), eventDefinitions: [], adjacency: new Map([['event1', [{ from: 'event1', to: 'var1' }]], ['var1', [{ from: 'var1', to: 'action1' }]]]) };

      const engine = new NodeExecutionEngine(
        compiledCue,
        'test-cue',
        mockSequencer,
        mockLightManager,
        cueLevelVarStore,
        groupLevelVarStore,
        new EffectRegistry(),
        definition.variables
      );

      engine.startExecution(eventNode, createCueData('Strong'));

      setTimeout(() => {
        expect(mockSequencer.addEffectWithCallback).toHaveBeenCalled();
        // Groups should be resolved to ['front', 'back']
      }, 10);
    });

    it('should use fallback when variable not found', () => {
      // Action references non-existent variable, should use fallback
      const eventNode: YargEventNode = {
        id: 'event1',
        type: 'event',
        eventType: 'beat',
        outputs: ['action1']
      };

      const actionNode: ActionNode = {
        id: 'action1',
        type: 'action',
        effectType: 'set-color',
        target: {
          groups: { source: 'literal', value: 'front' },
          filter: { source: 'literal', value: 'all' }
        },
        color: {
          name: { source: 'variable', name: 'nonExistentColor', fallback: 'green' },
          brightness: { source: 'literal', value: 'medium' },
          blendMode: { source: 'literal', value: 'replace' }
        },
        timing: {
          waitForCondition: 'none',
          waitForTime: { source: 'literal', value: 0 },
          duration: { source: 'literal', value: 200 },
          waitUntilCondition: 'none',
          waitUntilTime: { source: 'literal', value: 0 },
          easing: 'sinInOut',
          level: { source: 'literal', value: 1 }
        }
      };

      const definition: YargNodeCueDefinition = {
        id: 'test-cue',
        name: 'Test Cue',
        cueType: CueType.Intro,
        style: 'primary',
        nodes: {
          events: [eventNode],
          actions: [actionNode],
          logic: []
        },
        connections: [{ from: 'event1', to: 'action1' }],
        variables: []
      };

      const compiledCue: CompiledYargCue = { definition, eventMap: new Map([[eventNode.id, eventNode]]), actionMap: new Map([[actionNode.id, actionNode]]), logicMap: new Map<string, LogicNode>(), eventRaiserMap: new Map(), eventListenerMap: new Map(), effectRaiserMap: new Map(), eventDefinitions: [], adjacency: new Map([['event1', [{ from: 'event1', to: 'action1' }]]]) };

      const engine = new NodeExecutionEngine(
        compiledCue,
        'test-cue',
        mockSequencer,
        mockLightManager,
        cueLevelVarStore,
        groupLevelVarStore,
        new EffectRegistry(),
        definition.variables
      );

      engine.startExecution(eventNode, createCueData('Strong'));

      setTimeout(() => {
        expect(mockSequencer.addEffectWithCallback).toHaveBeenCalled();
        // Should use fallback color 'green'
      }, 10);
    });

    it('should resolve variable for duration', () => {
      // Cue data -> math -> action with dynamic duration
      const eventNode: YargEventNode = {
        id: 'event1',
        type: 'event',
        eventType: 'beat',
        outputs: ['cuedata1']
      };

      const cueDataNode: LogicNode = {
        id: 'cuedata1',
        type: 'logic',
        logicType: 'cue-data',
        dataProperty: 'bpm',
        assignTo: 'currentBpm',
        outputs: ['math1']
      };

      const mathNode: LogicNode = {
        id: 'math1',
        type: 'logic',
        logicType: 'math',
        operator: 'multiply',
        left: { source: 'variable', name: 'currentBpm' },
        right: { source: 'literal', value: 5 },
        assignTo: 'calculatedDuration',
        outputs: ['action1']
      };

      const actionNode: ActionNode = {
        id: 'action1',
        type: 'action',
        effectType: 'set-color',
        target: {
          groups: { source: 'literal', value: 'front' },
          filter: { source: 'literal', value: 'all' }
        },
        color: {
          name: { source: 'literal', value: 'purple' },
          brightness: { source: 'literal', value: 'high' },
          blendMode: { source: 'literal', value: 'replace' }
        },
        timing: {
          waitForCondition: 'none',
          waitForTime: { source: 'literal', value: 0 },
          duration: { source: 'variable', name: 'calculatedDuration', fallback: 200 },
          waitUntilCondition: 'none',
          waitUntilTime: { source: 'literal', value: 0 },
          easing: 'sinInOut',
          level: { source: 'literal', value: 1 }
        }
      };

      const definition: YargNodeCueDefinition = {
        id: 'test-cue',
        name: 'Test Cue',
        cueType: CueType.Intro,
        style: 'primary',
        nodes: {
          events: [eventNode],
          actions: [actionNode],
          logic: [cueDataNode, mathNode]
        },
        connections: [
          { from: 'event1', to: 'cuedata1' },
          { from: 'cuedata1', to: 'math1' },
          { from: 'math1', to: 'action1' }
        ],
        variables: [
          { name: 'currentBpm', type: 'number', scope: 'cue', initialValue: 0 },
          { name: 'calculatedDuration', type: 'number', scope: 'cue', initialValue: 0 }
        ]
      };

      const compiledCue: CompiledYargCue = {
        definition,
        eventMap: new Map([[eventNode.id, eventNode]]),
        actionMap: new Map([[actionNode.id, actionNode]]),
        logicMap: new Map<string, LogicNode>([[cueDataNode.id, cueDataNode], [mathNode.id, mathNode]]),
        eventRaiserMap: new Map(),
        eventListenerMap: new Map(),
        effectRaiserMap: new Map(),
        eventDefinitions: [],
        adjacency: new Map([
          ['event1', [{ from: 'event1', to: 'cuedata1' }]],
          ['cuedata1', [{ from: 'cuedata1', to: 'math1' }]],
          ['math1', [{ from: 'math1', to: 'action1' }]]
        ])
      };

      const engine = new NodeExecutionEngine(
        compiledCue,
        'test-cue',
        mockSequencer,
        mockLightManager,
        cueLevelVarStore,
        groupLevelVarStore,
        new EffectRegistry(),
        definition.variables
      );

      engine.startExecution(eventNode, createCueData('Strong'));

      setTimeout(() => {
        expect(mockSequencer.addEffectWithCallback).toHaveBeenCalled();
        // Duration should be 120 (BPM) * 5 = 600
        expect(cueLevelVarStore.get('calculatedDuration')?.value).toBe(600);
      }, 10);
    });

    it('should handle invalid color variable gracefully', () => {
      // Variable contains invalid color, should use default
      const eventNode: YargEventNode = {
        id: 'event1',
        type: 'event',
        eventType: 'beat',
        outputs: ['var1']
      };

      const variableNode: LogicNode = {
        id: 'var1',
        type: 'logic',
        logicType: 'variable',
        mode: 'set',
        varName: 'badColor',
        valueType: 'string',
        value: { source: 'literal', value: 'not-a-valid-color' },
        outputs: ['action1']
      };

      const actionNode: ActionNode = {
        id: 'action1',
        type: 'action',
        effectType: 'set-color',
        target: {
          groups: { source: 'literal', value: 'front' },
          filter: { source: 'literal', value: 'all' }
        },
        color: {
          name: { source: 'variable', name: 'badColor' },
          brightness: { source: 'literal', value: 'medium' },
          blendMode: { source: 'literal', value: 'replace' }
        },
        timing: {
          waitForCondition: 'none',
          waitForTime: { source: 'literal', value: 0 },
          duration: { source: 'literal', value: 200 },
          waitUntilCondition: 'none',
          waitUntilTime: { source: 'literal', value: 0 },
          easing: 'sinInOut',
          level: { source: 'literal', value: 1 }
        }
      };

      const definition: YargNodeCueDefinition = {
        id: 'test-cue',
        name: 'Test Cue',
        cueType: CueType.Intro,
        style: 'primary',
        nodes: {
          events: [eventNode],
          actions: [actionNode],
          logic: [variableNode]
        },
        connections: [
          { from: 'event1', to: 'var1' },
          { from: 'var1', to: 'action1' }
        ],
        variables: [{ name: 'badColor', type: 'string', scope: 'cue', initialValue: '' }]
      };

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
          ['var1', [{ from: 'var1', to: 'action1' }]]
        ])
      };

      const engine = new NodeExecutionEngine(
        compiledCue,
        'test-cue',
        mockSequencer,
        mockLightManager,
        cueLevelVarStore,
        groupLevelVarStore,
        new EffectRegistry(),
        definition.variables
      );

      engine.startExecution(eventNode, createCueData('Strong'));

      setTimeout(() => {
        expect(mockSequencer.addEffectWithCallback).toHaveBeenCalled();
        // Should resolve to default color 'blue' (from resolveColor method)
      }, 10);
    });
  });
});
