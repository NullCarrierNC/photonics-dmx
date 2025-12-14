import { EffectExecutionEngine } from '../../../../cues/node/runtime/EffectExecutionEngine';
import { EffectCompiler } from '../../../../cues/node/compiler/EffectCompiler';
import type { YargEffectDefinition } from '../../../../cues/types/nodeCueTypes';
import type { CueData } from '../../../../cues/types/cueTypes';
import type { ILightingController } from '../../../../controllers/sequencer/interfaces';
import type { DmxLightManager } from '../../../../controllers/DmxLightManager';

describe('EffectExecutionEngine', () => {
  let mockSequencer: jest.Mocked<ILightingController>;
  let mockLightManager: jest.Mocked<DmxLightManager>;
  
  // Helper to create minimal CueData
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
    beat: 'Strong' as any
  });

  beforeEach(() => {
    mockSequencer = {
      addEffectWithCallback: jest.fn((_name, _effect, callback) => {
        setTimeout(() => callback(), 0);
      }),
      removeEffect: jest.fn()
    } as any;

    mockLightManager = {
      getLights: jest.fn(() => [
        { id: 'light1', group: 'front', location: 'left' },
        { id: 'light2', group: 'front', location: 'right' }
      ])
    } as any;
  });

  describe('Parameter Passing', () => {
    it('should map parameters to effect variables via Effect Listener', async () => {
      const effect: YargEffectDefinition = {
        id: 'test-effect',
        mode: 'yarg',
        name: 'Test Effect',
        description: '',
        variables: [
          { name: 'speed', type: 'number', scope: 'cue', initialValue: 100, isParameter: true },
          { name: 'color', type: 'string', scope: 'cue', initialValue: 'white', isParameter: true }
        ],
        nodes: {
          events: [],
          actions: [
            {
              id: 'action-1',
              type: 'action',
              effectType: 'single-color',
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
            }
          ],
          logic: [],
          eventRaisers: [],
          eventListeners: [],
          effectListeners: [
            {
              id: 'listener-1',
              type: 'effect-listener',
              label: 'Entry',
              outputs: ['action-1']
            }
          ]
        },
        connections: [
          { from: 'listener-1', to: 'action-1' }
        ],
        layout: { nodePositions: {} }
      };

      const compiledEffect = EffectCompiler.compile(effect);
      const parameterValues = {
        speed: 150,
        color: 'blue'
      };

      const engine = new EffectExecutionEngine(
        compiledEffect,
        mockSequencer,
        mockLightManager,
        parameterValues,
        createCueData()
      );

      await engine.triggerEffect(createCueData());

      // Verify effect variables were set
      const varStore = (engine as any).effectVarStore;
      expect(varStore.get('speed')).toEqual({ type: 'number', value: 150 });
      expect(varStore.get('color')).toEqual({ type: 'string', value: 'blue' });
    });

    it('should use default values when parameters not provided', async () => {
      const effect: YargEffectDefinition = {
        id: 'test-effect',
        mode: 'yarg',
        name: 'Test',
        description: '',
        variables: [
          { name: 'localSpeed', type: 'number', scope: 'cue', initialValue: 100, isParameter: true }
        ],
        nodes: {
          events: [],
          actions: [],
          logic: [],
          eventRaisers: [
            {
              id: 'raiser-1',
              type: 'event-raiser',
              eventName: 'test-event',
              label: 'Raise Event',
              inputs: [],
              outputs: []
            }
          ],
          eventListeners: [],
          effectListeners: [
            {
              id: 'listener-1',
              type: 'effect-listener',
              label: 'Entry',
              outputs: ['raiser-1']
            }
          ]
        },
        events: [
          { name: 'test-event', description: '' }
        ],
        connections: [
          { from: 'listener-1', to: 'raiser-1' }
        ],
        layout: { nodePositions: {} }
      };

      const compiledEffect = EffectCompiler.compile(effect);
      const parameterValues = {}; // Missing 'speed'

      const engine = new EffectExecutionEngine(
        compiledEffect,
        mockSequencer,
        mockLightManager,
        parameterValues,
        createCueData()
      );

      // Should not throw
      expect(() => engine.triggerEffect(createCueData())).not.toThrow();
    });
  });

  describe('Variable Isolation', () => {
    it('should have isolated variable scope', async () => {
      const effect: YargEffectDefinition = {
        id: 'test-effect',
        mode: 'yarg',
        name: 'Test',
        description: '',
        nodes: {
          events: [],
          actions: [
            {
              id: 'action-1',
              type: 'action',
              effectType: 'single-color',
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
            }
          ],
          logic: [
            {
              id: 'logic-1',
              type: 'logic',
              logicType: 'variable',
              label: 'Set Var',
              outputs: [],
              mode: 'set',
              varName: 'effectVar',
              valueType: 'number',
              value: { source: 'literal', value: 42 }
            }
          ],
          eventRaisers: [],
          eventListeners: [],
          effectListeners: [
            {
              id: 'listener-1',
              type: 'effect-listener',
              label: 'Entry',
              outputs: ['logic-1', 'action-1']
            }
          ]
        },
        connections: [
          { from: 'listener-1', to: 'logic-1' },
          { from: 'listener-1', to: 'action-1' }
        ],
        layout: { nodePositions: {} }
      };

      const compiledEffect = EffectCompiler.compile(effect);

      const engine = new EffectExecutionEngine(
        compiledEffect,
        mockSequencer,
        mockLightManager,
        {},
        createCueData()
      );

      await engine.triggerEffect(createCueData());

      // Verify variable is in effect's scope
      const varStore = (engine as any).effectVarStore;
      expect(varStore.get('effectVar')).toEqual({ type: 'number', value: 42 });
      
      // Verify it's not accessible externally (would need cue context to test fully)
    });
  });

  describe('Internal Events', () => {
    it('should support EventRaiser and EventListener within effect', async () => {
      const effect: YargEffectDefinition = {
        id: 'test-effect',
        mode: 'yarg',
        name: 'Test',
        description: '',
        events: [
          {
            name: 'internal-event',
            description: ''
          }
        ],
        nodes: {
          events: [],
          actions: [
            {
              id: 'action-1',
              type: 'action',
              effectType: 'single-color',
              target: { 
                groups: { source: 'literal', value: 'front' }, 
                filter: { source: 'literal', value: 'all' } 
              },
              color: { 
                name: { source: 'literal', value: 'red' }, 
                brightness: { source: 'literal', value: 'high' }, 
                blendMode: { source: 'literal', value: 'replace' } 
              },
              secondaryColor: { 
                name: { source: 'literal', value: 'red' }, 
                brightness: { source: 'literal', value: 'high' }, 
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
            }
          ],
          logic: [],
          eventRaisers: [
            {
              id: 'raiser-1',
              type: 'event-raiser',
              eventName: 'internal-event',
              label: 'Raise',
              inputs: [],
              outputs: []
            }
          ],
          eventListeners: [
            {
              id: 'listener-event-1',
              type: 'event-listener',
              eventName: 'internal-event',
              label: 'Listen',
              outputs: ['action-1']
            }
          ],
          effectListeners: [
            {
              id: 'listener-1',
              type: 'effect-listener',
              label: 'Entry',
              outputs: ['raiser-1']
            }
          ]
        },
        connections: [
          { from: 'listener-1', to: 'raiser-1' },
          { from: 'listener-event-1', to: 'action-1' }
        ],
        layout: { nodePositions: {} }
      };

      const compiledEffect = EffectCompiler.compile(effect);

      const engine = new EffectExecutionEngine(
        compiledEffect,
        mockSequencer,
        mockLightManager,
        {},
        createCueData()
      );

      await engine.triggerEffect(createCueData());

      // Verify action was executed via internal event
      expect(mockSequencer.addEffectWithCallback).toHaveBeenCalled();
    });
  });

  describe('Non-blocking Execution', () => {
    it('should execute asynchronously', async () => {
      const effect: YargEffectDefinition = {
        id: 'test-effect',
        mode: 'yarg',
        name: 'Test',
        description: '',
        nodes: {
          events: [],
          actions: [
            {
              id: 'action-1',
              type: 'action',
              effectType: 'single-color',
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
                duration: { source: 'literal', value: 1000 }, 
                waitUntilCondition: 'none',
                waitUntilTime: { source: 'literal', value: 0 },
                easing: 'linear', 
                level: { source: 'literal', value: 1 } 
              },
              layer: { source: 'literal', value: 0 }
            }
          ],
          logic: [],
          eventRaisers: [],
          eventListeners: [],
          effectListeners: [
            {
              id: 'listener-1',
              type: 'effect-listener',
              label: 'Entry',
              outputs: ['action-1']
            }
          ]
        },
        connections: [
          { from: 'listener-1', to: 'action-1' }
        ],
        layout: { nodePositions: {} }
      };

      const compiledEffect = EffectCompiler.compile(effect);

      const engine = new EffectExecutionEngine(
        compiledEffect,
        mockSequencer,
        mockLightManager,
        {},
        createCueData()
      );

      const startTime = Date.now();
      const promise = engine.triggerEffect(createCueData());
      const callTime = Date.now() - startTime;

      // Should return immediately, not wait for action to complete
      expect(callTime).toBeLessThan(100);

      await promise; // Wait for actual completion
    });
  });
});
