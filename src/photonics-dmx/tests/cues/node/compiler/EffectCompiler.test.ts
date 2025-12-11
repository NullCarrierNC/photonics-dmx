import { EffectCompiler, EffectCompilationError } from '../../../../cues/node/compiler/EffectCompiler';
import type { YargEffectDefinition, AudioEffectDefinition } from '../../../../cues/types/nodeCueTypes';

describe('EffectCompiler', () => {
  describe('YARG Effect Compilation', () => {
    it('should compile a valid YARG effect', () => {
      const effect: YargEffectDefinition = {
        id: 'test-effect',
        mode: 'yarg',
        name: 'Test Effect',
        description: 'A test effect',
        parameters: [],
        nodes: {
          events: [],
          actions: [
            {
              id: 'action-1',
              type: 'action',
              effectType: 'single-color',
              target: { groups: ['front'], filter: 'all' },
              color: { name: 'white', brightness: 'medium', blendMode: 'replace' },
              secondaryColor: { name: 'white', brightness: 'medium', blendMode: 'replace' },
              timing: { 
                waitForCondition: 'none',
                waitForTime: 0,
                duration: 100, 
                waitUntilCondition: 'none',
                waitUntilTime: 0,
                easing: 'linear', 
                level: 1 
              },
              layer: 0
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

      const compiled = EffectCompiler.compile(effect);

      expect(compiled.definition).toBe(effect);
      expect(compiled.parameters.size).toBe(0);
      expect(compiled.effectListenerMap.size).toBe(1);
      expect(compiled.actionMap.size).toBe(1);
    });

    it('should throw error when effect has no Effect Listener', () => {
      const effect: YargEffectDefinition = {
        id: 'test-effect',
        mode: 'yarg',
        name: 'Test',
        description: '',
        parameters: [],
        nodes: {
          events: [],
          actions: [
            {
              id: 'action-1',
              type: 'action',
              effectType: 'single-color',
              target: { groups: ['front'], filter: 'all' },
              color: { name: 'white', brightness: 'medium', blendMode: 'replace' },
              secondaryColor: { name: 'white', brightness: 'medium', blendMode: 'replace' },
              timing: { 
                waitForCondition: 'none',
                waitForTime: 0,
                duration: 100, 
                waitUntilCondition: 'none',
                waitUntilTime: 0,
                easing: 'linear', 
                level: 1 
              },
              layer: 0
            }
          ],
          logic: [],
          eventRaisers: [],
          eventListeners: [],
          effectListeners: [] // NO LISTENER!
        },
        connections: [],
        layout: { nodePositions: {} }
      };

      expect(() => EffectCompiler.compile(effect)).toThrow(EffectCompilationError);
      expect(() => EffectCompiler.compile(effect)).toThrow('At least one Effect Listener node is required');
    });

    it('should throw error when effect contains Effect Raiser node', () => {
      const effect: YargEffectDefinition = {
        id: 'test-effect',
        mode: 'yarg',
        name: 'Test',
        description: '',
        parameters: [],
        nodes: {
          events: [],
          actions: [],
          logic: [],
          eventRaisers: [],
          eventListeners: [],
          effectListeners: [
            {
              id: 'listener-1',
              type: 'effect-listener',
              label: 'Entry',
              outputs: []
            }
          ],
          effectRaisers: [
            {
              id: 'raiser-1',
              type: 'effect-raiser',
              effectId: 'other-effect',
              label: 'Raise',
              outputs: []
            }
          ]
        },
        connections: [],
        layout: { nodePositions: {} }
      };

      expect(() => EffectCompiler.compile(effect)).toThrow(EffectCompilationError);
      expect(() => EffectCompiler.compile(effect)).toThrow('Effects cannot contain Effect Raiser nodes');
    });

    it('should compile effect with parameter variables', () => {
      const effect: YargEffectDefinition = {
        id: 'test-effect',
        mode: 'yarg',
        name: 'Test',
        description: '',
        parameters: [
          { name: 'speed', type: 'number', description: '' } // DEPRECATED - will be migrated
        ],
        variables: [
          { name: 'speedParam', type: 'number', scope: 'cue', initialValue: 100, isParameter: true }
        ],
        nodes: {
          events: [],
          actions: [
            {
              id: 'action-1',
              type: 'action',
              effectType: 'single-color',
              target: { groups: ['front'], filter: 'all' },
              color: { name: 'white', brightness: 'medium', blendMode: 'replace' },
              secondaryColor: { name: 'white', brightness: 'medium', blendMode: 'replace' },
              timing: { 
                waitForCondition: 'none',
                waitForTime: 0,
                duration: 100, 
                waitUntilCondition: 'none',
                waitUntilTime: 0,
                easing: 'linear', 
                level: 1 
              },
              layer: 0
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

      const compiled = EffectCompiler.compile(effect);
      expect(compiled).toBeDefined();
      // Parameters are now auto-derived from variables with isParameter: true
    });
  });

  describe('Audio Effect Compilation', () => {
    it('should compile a valid Audio effect', () => {
      const effect: AudioEffectDefinition = {
        id: 'test-effect',
        mode: 'audio',
        name: 'Audio Test',
        description: '',
        parameters: [],
        nodes: {
          events: [],
          actions: [
            {
              id: 'action-1',
              type: 'action',
              effectType: 'single-color',
              target: { groups: ['front'], filter: 'all' },
              color: { name: 'blue', brightness: 'high', blendMode: 'replace' },
              secondaryColor: { name: 'blue', brightness: 'high', blendMode: 'replace' },
              timing: { 
                waitForCondition: 'none',
                waitForTime: 0,
                duration: 200, 
                waitUntilCondition: 'none',
                waitUntilTime: 0,
                easing: 'linear', 
                level: 1 
              },
              layer: 0
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

      const compiled = EffectCompiler.compile(effect);

      expect(compiled.definition).toBe(effect);
      expect(compiled.effectListenerMap.size).toBe(1);
      expect(compiled.actionMap.size).toBe(1);
    });
  });

  describe('Edge Cases', () => {
    it('should handle effect with multiple Effect Listeners', () => {
      const effect: YargEffectDefinition = {
        id: 'test-effect',
        mode: 'yarg',
        name: 'Test',
        description: '',
        parameters: [],
        nodes: {
          events: [],
          actions: [
            {
              id: 'action-1',
              type: 'action',
              effectType: 'single-color',
              target: { groups: ['front'], filter: 'all' },
              color: { name: 'white', brightness: 'medium', blendMode: 'replace' },
              secondaryColor: { name: 'white', brightness: 'medium', blendMode: 'replace' },
              timing: { 
                waitForCondition: 'none',
                waitForTime: 0,
                duration: 100, 
                waitUntilCondition: 'none',
                waitUntilTime: 0,
                easing: 'linear', 
                level: 1 
              },
              layer: 0
            }
          ],
          logic: [],
          eventRaisers: [],
          eventListeners: [],
          effectListeners: [
            {
              id: 'listener-1',
              type: 'effect-listener',
              label: 'Entry 1',
              outputs: ['action-1']
            },
            {
              id: 'listener-2',
              type: 'effect-listener',
              label: 'Entry 2',
              outputs: []
            }
          ]
        },
        connections: [
          { from: 'listener-1', to: 'action-1' }
        ],
        layout: { nodePositions: {} }
      };

      const compiled = EffectCompiler.compile(effect);
      expect(compiled.effectListenerMap.size).toBe(2);
    });

    it('should handle empty parameter array', () => {
      const effect: YargEffectDefinition = {
        id: 'test-effect',
        mode: 'yarg',
        name: 'Test',
        description: '',
        parameters: [],
        nodes: {
          events: [],
          actions: [
            {
              id: 'action-1',
              type: 'action',
              effectType: 'single-color',
              target: { groups: ['front'], filter: 'all' },
              color: { name: 'white', brightness: 'medium', blendMode: 'replace' },
              secondaryColor: { name: 'white', brightness: 'medium', blendMode: 'replace' },
              timing: { 
                waitForCondition: 'none',
                waitForTime: 0,
                duration: 100, 
                waitUntilCondition: 'none',
                waitUntilTime: 0,
                easing: 'linear', 
                level: 1 
              },
              layer: 0
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

      const compiled = EffectCompiler.compile(effect);
      expect(compiled.parameters.size).toBe(0);
    });
  });
});
