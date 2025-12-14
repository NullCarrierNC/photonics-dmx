import { NodeExecutionEngine } from '../../../cues/node/runtime/NodeExecutionEngine';
import { NodeCueCompiler } from '../../../cues/node/compiler/NodeCueCompiler';
import { EffectRegistry } from '../../../cues/node/runtime/EffectRegistry';
import {
  YargNodeCueDefinition,
  YargEventNode,
  ActionNode,
  EventRaiserNode,
  EventListenerNode,
  EventDefinition
} from '../../../cues/types/nodeCueTypes';
import { ILightingController } from '../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../controllers/DmxLightManager';
import { CueData } from '../../../cues/types/cueTypes';
import { VariableValue } from '../../../cues/node/runtime/executionTypes';

describe('Runtime Event System', () => {
  let mockSequencer: ILightingController;
  let mockLightManager: DmxLightManager;
  let cueLevelVarStore: Map<string, VariableValue>;
  let groupLevelVarStore: Map<string, VariableValue>;

  const createCueData = (): CueData => ({
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
    beat: 'Off'
  });

  beforeEach(() => {
    mockSequencer = {
      addEffect: jest.fn(),
      addEffectWithCallback: jest.fn((_name, _effect, callback) => {
        // Simulate immediate completion for testing
        setTimeout(() => callback(), 0);
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

    mockLightManager = {
      getLights: jest.fn().mockReturnValue([
        { id: 'light1', config: {} },
        { id: 'light2', config: {} }
      ])
    } as any;

    cueLevelVarStore = new Map();
    groupLevelVarStore = new Map();
  });

  describe('Event Raiser Node', () => {
    it('should raise an event when triggered', () => {
      const eventDef: EventDefinition = {
        name: 'testEvent',
        description: 'Test event'
      };

      const systemEvent: YargEventNode = {
        id: 'event1',
        type: 'event',
        eventType: 'beat'
      };

      const raiser: EventRaiserNode = {
        id: 'raiser1',
        type: 'event-raiser',
        eventName: 'testEvent',
        label: 'Raise testEvent'
      };

      const listener: EventListenerNode = {
        id: 'listener1',
        type: 'event-listener',
        eventName: 'testEvent',
        label: 'Listen testEvent'
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
          brightness: { source: 'literal', value: 'medium' } 
        },
        timing: {
          waitForCondition: 'none',
          waitForTime: { source: 'literal', value: 0 },
          duration: { source: 'literal', value: 100 },
          waitUntilCondition: 'none',
          waitUntilTime: { source: 'literal', value: 0 }
        }
      };

      const cueDefinition: YargNodeCueDefinition = {
        id: 'cue1',
        name: 'Test Cue',
        cueType: 'keyframe' as any,
        style: 'primary',
        nodes: {
          events: [systemEvent],
          actions: [actionNode],
          logic: [],
          eventRaisers: [raiser],
          eventListeners: [listener]
        },
        connections: [
          { from: 'event1', to: 'raiser1' },
          { from: 'listener1', to: 'action1' }
        ],
        events: [eventDef]
      };

      const compiled = NodeCueCompiler.compileYargCue(cueDefinition);
      const engine = new NodeExecutionEngine(
        compiled,
        'cue1',
        mockSequencer,
        mockLightManager,
        cueLevelVarStore,
        groupLevelVarStore,
        new EffectRegistry()
      );

      engine.startExecution(systemEvent, createCueData());

      // Verify action was triggered via listener (synchronously)
      expect(mockSequencer.addEffectWithCallback).toHaveBeenCalled();
    });

    it('should continue immediately after raising event (non-blocking)', () => {
      const eventDef: EventDefinition = {
        name: 'testEvent'
      };

      const systemEvent: YargEventNode = {
        id: 'event1',
        type: 'event',
        eventType: 'beat'
      };

      const raiser: EventRaiserNode = {
        id: 'raiser1',
        type: 'event-raiser',
        eventName: 'testEvent'
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
          brightness: { source: 'literal', value: 'medium' } 
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
          brightness: { source: 'literal', value: 'medium' } 
        },
        timing: {
          waitForCondition: 'none',
          waitForTime: { source: 'literal', value: 0 },
          duration: { source: 'literal', value: 100 },
          waitUntilCondition: 'none',
          waitUntilTime: { source: 'literal', value: 0 }
        }
      };

      const listener: EventListenerNode = {
        id: 'listener1',
        type: 'event-listener',
        eventName: 'testEvent'
      };

      const cueDefinition: YargNodeCueDefinition = {
        id: 'cue1',
        name: 'Test Cue',
        cueType: 'keyframe' as any,
        style: 'primary',
        nodes: {
          events: [systemEvent],
          actions: [action1, action2],
          eventRaisers: [raiser],
          eventListeners: [listener]
        },
        connections: [
          { from: 'event1', to: 'raiser1' },
          { from: 'raiser1', to: 'action2' }, // Raiser continues to action2
          { from: 'listener1', to: 'action1' } // Listener triggers action1
        ],
        events: [eventDef]
      };

      const compiled = NodeCueCompiler.compileYargCue(cueDefinition);
      const engine = new NodeExecutionEngine(
        compiled,
        'cue1',
        mockSequencer,
        mockLightManager,
        cueLevelVarStore,
        groupLevelVarStore,
        new EffectRegistry()
      );

      engine.startExecution(systemEvent, createCueData());

      // Both actions should be triggered (synchronously)
      expect(mockSequencer.addEffectWithCallback).toHaveBeenCalledTimes(2);
    });
  });

  describe('Multiple Listeners', () => {
    it('should trigger all listeners for a single event', () => {
      const eventDef: EventDefinition = {
        name: 'multiEvent'
      };

      const systemEvent: YargEventNode = {
        id: 'event1',
        type: 'event',
        eventType: 'beat'
      };

      const raiser: EventRaiserNode = {
        id: 'raiser1',
        type: 'event-raiser',
        eventName: 'multiEvent'
      };

      const listener1: EventListenerNode = {
        id: 'listener1',
        type: 'event-listener',
        eventName: 'multiEvent'
      };

      const listener2: EventListenerNode = {
        id: 'listener2',
        type: 'event-listener',
        eventName: 'multiEvent'
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
          brightness: { source: 'literal', value: 'medium' } 
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
          brightness: { source: 'literal', value: 'medium' } 
        },
        timing: {
          waitForCondition: 'none',
          waitForTime: { source: 'literal', value: 0 },
          duration: { source: 'literal', value: 100 },
          waitUntilCondition: 'none',
          waitUntilTime: { source: 'literal', value: 0 }
        }
      };

      const cueDefinition: YargNodeCueDefinition = {
        id: 'cue1',
        name: 'Test Cue',
        cueType: 'keyframe' as any,
        style: 'primary',
        nodes: {
          events: [systemEvent],
          actions: [action1, action2],
          eventRaisers: [raiser],
          eventListeners: [listener1, listener2]
        },
        connections: [
          { from: 'event1', to: 'raiser1' },
          { from: 'listener1', to: 'action1' },
          { from: 'listener2', to: 'action2' }
        ],
        events: [eventDef]
      };

      const compiled = NodeCueCompiler.compileYargCue(cueDefinition);
      const engine = new NodeExecutionEngine(
        compiled,
        'cue1',
        mockSequencer,
        mockLightManager,
        cueLevelVarStore,
        groupLevelVarStore,
        new EffectRegistry()
      );

      engine.startExecution(systemEvent, createCueData());

      // Both listeners should trigger their actions (synchronously)
      expect(mockSequencer.addEffectWithCallback).toHaveBeenCalledTimes(2);
    });
  });

  describe('Event Scoping', () => {
    it('should only trigger listeners for the specific event raised', () => {
      const event1Def: EventDefinition = { name: 'event1' };
      const event2Def: EventDefinition = { name: 'event2' };

      const systemEvent: YargEventNode = {
        id: 'sysEvent',
        type: 'event',
        eventType: 'beat'
      };

      const raiser1: EventRaiserNode = {
        id: 'raiser1',
        type: 'event-raiser',
        eventName: 'event1'
      };

      const listener1: EventListenerNode = {
        id: 'listener1',
        type: 'event-listener',
        eventName: 'event1'
      };

      const listener2: EventListenerNode = {
        id: 'listener2',
        type: 'event-listener',
        eventName: 'event2'
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
          brightness: { source: 'literal', value: 'medium' } 
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
          brightness: { source: 'literal', value: 'medium' } 
        },
        timing: {
          waitForCondition: 'none',
          waitForTime: { source: 'literal', value: 0 },
          duration: { source: 'literal', value: 100 },
          waitUntilCondition: 'none',
          waitUntilTime: { source: 'literal', value: 0 }
        }
      };

      const cueDefinition: YargNodeCueDefinition = {
        id: 'cue1',
        name: 'Test Cue',
        cueType: 'keyframe' as any,
        style: 'primary',
        nodes: {
          events: [systemEvent],
          actions: [action1, action2],
          eventRaisers: [raiser1],
          eventListeners: [listener1, listener2]
        },
        connections: [
          { from: 'sysEvent', to: 'raiser1' },
          { from: 'listener1', to: 'action1' },
          { from: 'listener2', to: 'action2' }
        ],
        events: [event1Def, event2Def]
      };

      const compiled = NodeCueCompiler.compileYargCue(cueDefinition);
      const engine = new NodeExecutionEngine(
        compiled,
        'cue1',
        mockSequencer,
        mockLightManager,
        cueLevelVarStore,
        groupLevelVarStore,
        new EffectRegistry()
      );

      engine.startExecution(systemEvent, createCueData());

      // Only listener1 should trigger (listening to event1) - synchronously
      // listener2 should not trigger (listening to event2, which wasn't raised)
      expect(mockSequencer.addEffectWithCallback).toHaveBeenCalledTimes(1);
    });
  });

  describe('Compiler Validation', () => {
    it('should fail compilation if event raiser references undefined event', () => {
      const systemEvent: YargEventNode = {
        id: 'event1',
        type: 'event',
        eventType: 'beat'
      };

      const raiser: EventRaiserNode = {
        id: 'raiser1',
        type: 'event-raiser',
        eventName: 'undefinedEvent' // Not in events array
      };

      const action: ActionNode = {
        id: 'action1',
        type: 'action',
        effectType: 'set-color',
        target: { 
          groups: { source: 'literal', value: 'front' }, 
          filter: { source: 'literal', value: 'all' } 
        },
        color: { 
          name: { source: 'literal', value: 'red' }, 
          brightness: { source: 'literal', value: 'medium' } 
        },
        timing: {
          waitForCondition: 'none',
          waitForTime: { source: 'literal', value: 0 },
          duration: { source: 'literal', value: 100 },
          waitUntilCondition: 'none',
          waitUntilTime: { source: 'literal', value: 0 }
        }
      };

      const cueDefinition: YargNodeCueDefinition = {
        id: 'cue1',
        name: 'Test Cue',
        cueType: 'keyframe' as any,
        style: 'primary',
        nodes: {
          events: [systemEvent],
          actions: [action],
          eventRaisers: [raiser],
          eventListeners: []
        },
        connections: [
          { from: 'event1', to: 'raiser1' }
        ],
        events: [] // No events defined
      };

      expect(() => {
        NodeCueCompiler.compileYargCue(cueDefinition);
      }).toThrow(/references undefined event/);
    });

    it('should fail compilation if event listener references undefined event', () => {
      const systemEvent: YargEventNode = {
        id: 'event1',
        type: 'event',
        eventType: 'beat'
      };

      const listener: EventListenerNode = {
        id: 'listener1',
        type: 'event-listener',
        eventName: 'undefinedEvent' // Not in events array
      };

      const action: ActionNode = {
        id: 'action1',
        type: 'action',
        effectType: 'set-color',
        target: { 
          groups: { source: 'literal', value: 'front' }, 
          filter: { source: 'literal', value: 'all' } 
        },
        color: { 
          name: { source: 'literal', value: 'red' }, 
          brightness: { source: 'literal', value: 'medium' } 
        },
        timing: {
          waitForCondition: 'none',
          waitForTime: { source: 'literal', value: 0 },
          duration: { source: 'literal', value: 100 },
          waitUntilCondition: 'none',
          waitUntilTime: { source: 'literal', value: 0 }
        }
      };

      const cueDefinition: YargNodeCueDefinition = {
        id: 'cue1',
        name: 'Test Cue',
        cueType: 'keyframe' as any,
        style: 'primary',
        nodes: {
          events: [systemEvent],
          actions: [action],
          eventRaisers: [],
          eventListeners: [listener]
        },
        connections: [
          { from: 'listener1', to: 'action1' }
        ],
        events: [] // No events defined
      };

      expect(() => {
        NodeCueCompiler.compileYargCue(cueDefinition);
      }).toThrow(/references undefined event/);
    });
  });
});
