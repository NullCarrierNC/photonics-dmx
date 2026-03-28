import {
  EffectCompiler,
  EffectCompilationError,
} from '../../../../cues/node/compiler/EffectCompiler'
import type {
  YargEffectDefinition,
  AudioEffectDefinition,
} from '../../../../cues/types/nodeCueTypes'

describe('EffectCompiler', () => {
  describe('YARG Effect Compilation', () => {
    it('should compile a valid YARG effect', () => {
      const effect: YargEffectDefinition = {
        id: 'test-effect',
        mode: 'yarg',
        name: 'Test Effect',
        description: 'A test effect',
        nodes: {
          events: [],
          actions: [
            {
              id: 'action-1',
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
            },
          ],
          logic: [],
          eventRaisers: [],
          eventListeners: [],
          effectListeners: [
            {
              id: 'listener-1',
              type: 'effect-listener',
              label: 'Entry',
              outputs: ['action-1'],
            },
          ],
        },
        connections: [{ from: 'listener-1', to: 'action-1' }],
        layout: { nodePositions: {} },
      }

      const compiled = EffectCompiler.compile(effect)

      expect(compiled.definition).toBe(effect)
      expect(compiled.parameters.size).toBe(0)
      expect(compiled.effectListenerMap.size).toBe(1)
      expect(compiled.actionMap.size).toBe(1)
    })

    it('should throw error when effect has no Effect Listener', () => {
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
            },
          ],
          logic: [],
          eventRaisers: [],
          eventListeners: [],
          effectListeners: [], // NO LISTENER!
        },
        connections: [],
        layout: { nodePositions: {} },
      }

      expect(() => EffectCompiler.compile(effect)).toThrow(EffectCompilationError)
      expect(() => EffectCompiler.compile(effect)).toThrow(
        'At least one Effect Listener node is required',
      )
    })

    it('should throw error when effect contains Effect Raiser node', () => {
      const effect: YargEffectDefinition = {
        id: 'test-effect',
        mode: 'yarg',
        name: 'Test',
        description: '',
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
              outputs: [],
            },
          ],
          effectRaisers: [
            {
              id: 'raiser-1',
              type: 'effect-raiser',
              effectId: 'other-effect',
              label: 'Raise',
              outputs: [],
            },
          ],
        },
        connections: [],
        layout: { nodePositions: {} },
      }

      expect(() => EffectCompiler.compile(effect)).toThrow(EffectCompilationError)
      expect(() => EffectCompiler.compile(effect)).toThrow(
        'Effects cannot contain Effect Raiser nodes',
      )
    })

    it('should compile effect with parameter variables', () => {
      const effect: YargEffectDefinition = {
        id: 'test-effect',
        mode: 'yarg',
        name: 'Test',
        description: '',
        variables: [
          {
            name: 'speedParam',
            type: 'number',
            scope: 'cue',
            initialValue: 100,
            isParameter: true,
          },
        ],
        nodes: {
          events: [],
          actions: [
            {
              id: 'action-1',
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
            },
          ],
          logic: [],
          eventRaisers: [],
          eventListeners: [],
          effectListeners: [
            {
              id: 'listener-1',
              type: 'effect-listener',
              label: 'Entry',
              outputs: ['action-1'],
            },
          ],
        },
        connections: [{ from: 'listener-1', to: 'action-1' }],
        layout: { nodePositions: {} },
      }

      const compiled = EffectCompiler.compile(effect)
      expect(compiled).toBeDefined()
      // Parameters are now auto-derived from variables with isParameter: true
    })
  })

  describe('Audio Effect Compilation', () => {
    it('should compile a valid Audio effect', () => {
      const effect: AudioEffectDefinition = {
        id: 'test-effect',
        mode: 'audio',
        name: 'Audio Test',
        description: '',
        nodes: {
          events: [],
          actions: [
            {
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
                blendMode: { source: 'literal', value: 'replace' },
              },
              timing: {
                waitForCondition: { source: 'literal', value: 'none' },
                waitForTime: { source: 'literal', value: 0 },
                duration: { source: 'literal', value: 200 },
                waitUntilCondition: { source: 'literal', value: 'none' },
                waitUntilTime: { source: 'literal', value: 0 },
                easing: { source: 'literal', value: 'linear' },
                level: { source: 'literal', value: 1 },
              },
              layer: { source: 'literal', value: 0 },
            },
          ],
          logic: [],
          eventRaisers: [],
          eventListeners: [],
          effectListeners: [
            {
              id: 'listener-1',
              type: 'effect-listener',
              label: 'Entry',
              outputs: ['action-1'],
            },
          ],
        },
        connections: [{ from: 'listener-1', to: 'action-1' }],
        layout: { nodePositions: {} },
      }

      const compiled = EffectCompiler.compile(effect)

      expect(compiled.definition).toBe(effect)
      expect(compiled.effectListenerMap.size).toBe(1)
      expect(compiled.actionMap.size).toBe(1)
    })
  })

  describe('Edge Cases', () => {
    it('should handle effect with multiple Effect Listeners', () => {
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
            },
          ],
          logic: [],
          eventRaisers: [],
          eventListeners: [],
          effectListeners: [
            {
              id: 'listener-1',
              type: 'effect-listener',
              label: 'Entry 1',
              outputs: ['action-1'],
            },
            {
              id: 'listener-2',
              type: 'effect-listener',
              label: 'Entry 2',
              outputs: [],
            },
          ],
        },
        connections: [{ from: 'listener-1', to: 'action-1' }],
        layout: { nodePositions: {} },
      }

      const compiled = EffectCompiler.compile(effect)
      expect(compiled.effectListenerMap.size).toBe(2)
    })

    it('should handle empty parameter array', () => {
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
            },
          ],
          logic: [],
          eventRaisers: [],
          eventListeners: [],
          effectListeners: [
            {
              id: 'listener-1',
              type: 'effect-listener',
              label: 'Entry',
              outputs: ['action-1'],
            },
          ],
        },
        connections: [{ from: 'listener-1', to: 'action-1' }],
        layout: { nodePositions: {} },
      }

      const compiled = EffectCompiler.compile(effect)
      expect(compiled.parameters.size).toBe(0)
    })

    it('should compile effect with logic nodes and populate logicMap', () => {
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
            },
          ],
          logic: [
            {
              id: 'logic-1',
              type: 'logic',
              logicType: 'math',
              operator: 'add',
              left: { source: 'literal', value: 1 },
              right: { source: 'literal', value: 2 },
              assignTo: 'sum',
            },
          ],
          eventRaisers: [],
          eventListeners: [],
          effectListeners: [
            {
              id: 'listener-1',
              type: 'effect-listener',
              label: 'Entry',
              outputs: ['logic-1'],
            },
          ],
        },
        connections: [
          { from: 'listener-1', to: 'logic-1' },
          { from: 'logic-1', to: 'action-1' },
        ],
        variables: [{ name: 'sum', type: 'number', scope: 'cue', initialValue: 0 }],
        layout: { nodePositions: {} },
      }

      const compiled = EffectCompiler.compile(effect)
      expect(compiled.logicMap.size).toBeGreaterThan(0)
      expect(compiled.logicMap.has('logic-1')).toBe(true)
    })

    it('should include color and light-array parameter types in parameters map', () => {
      const effect: YargEffectDefinition = {
        id: 'test-effect',
        mode: 'yarg',
        name: 'Test',
        description: '',
        variables: [
          {
            name: 'colorParam',
            type: 'color',
            scope: 'cue',
            initialValue: 'blue',
            isParameter: true,
          },
          {
            name: 'lightsParam',
            type: 'light-array',
            scope: 'cue',
            initialValue: [],
            isParameter: true,
          },
        ],
        nodes: {
          events: [],
          actions: [
            {
              id: 'action-1',
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
            },
          ],
          logic: [],
          eventRaisers: [],
          eventListeners: [],
          effectListeners: [
            {
              id: 'listener-1',
              type: 'effect-listener',
              label: 'Entry',
              outputs: ['action-1'],
            },
          ],
        },
        connections: [{ from: 'listener-1', to: 'action-1' }],
        layout: { nodePositions: {} },
      }

      const compiled = EffectCompiler.compile(effect)
      expect(compiled.parameters.size).toBe(2)
      expect(compiled.parameters.has('colorParam')).toBe(true)
      expect(compiled.parameters.get('colorParam')?.type).toBe('color')
      expect(compiled.parameters.has('lightsParam')).toBe(true)
      expect(compiled.parameters.get('lightsParam')?.type).toBe('light-array')
    })

    it('should throw when effect has duplicate effectListener IDs', () => {
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
            },
          ],
          logic: [],
          eventRaisers: [],
          eventListeners: [],
          effectListeners: [
            { id: 'listener-1', type: 'effect-listener', label: 'Entry 1', outputs: ['action-1'] },
            { id: 'listener-1', type: 'effect-listener', label: 'Entry 2', outputs: [] },
          ],
        },
        connections: [{ from: 'listener-1', to: 'action-1' }],
        layout: { nodePositions: {} },
      }

      expect(() => EffectCompiler.compile(effect)).toThrow(EffectCompilationError)
      expect(() => EffectCompiler.compile(effect)).toThrow(/duplicate.*effect listener/i)
    })
  })
})
