import {
  EffectCompiler,
  EffectCompilationError,
} from '../../../../cues/node/compiler/EffectCompiler'
import type {
  ActionNode,
  AudioEffectDefinition,
  EffectDefinition,
  EffectEventListenerNode,
  NodeGraph,
  YargEffectDefinition,
} from '../../../../cues/types/nodeCueTypes'

const setColorAction = (name = 'white', brightness = 'medium', duration = 100): ActionNode => ({
  id: 'action-1',
  type: 'action',
  effectType: 'set-color',
  target: {
    groups: { source: 'literal', value: 'front' },
    filter: { source: 'literal', value: 'all' },
  },
  color: {
    name: { source: 'literal', value: name },
    brightness: { source: 'literal', value: brightness },
    blendMode: { source: 'literal', value: 'replace' },
  },
  timing: {
    waitForCondition: { source: 'literal', value: 'none' },
    waitForTime: { source: 'literal', value: 0 },
    duration: { source: 'literal', value: duration },
    waitUntilCondition: { source: 'literal', value: 'none' },
    waitUntilTime: { source: 'literal', value: 0 },
    easing: { source: 'literal', value: 'linear' },
    level: { source: 'literal', value: 1 },
  },
  layer: { source: 'literal', value: 0 },
})

const entryListener = (
  id = 'listener-1',
  label = 'Entry',
  outputs = ['action-1'],
): EffectEventListenerNode => ({ id, type: 'effect-listener', label, outputs })

// Event-free, so the same graph fits both YARG and audio effects.
const buildGraph = (
  overrides: Partial<NodeGraph<never, ActionNode>> = {},
): NodeGraph<never, ActionNode> => ({
  events: [],
  actions: [setColorAction()],
  logic: [],
  eventRaisers: [],
  eventListeners: [],
  effectListeners: [entryListener()],
  ...overrides,
})

// A single set-color action wired from one Entry listener.
const buildYargEffect = (overrides: Partial<YargEffectDefinition> = {}): YargEffectDefinition => ({
  id: 'test-effect',
  mode: 'yarg',
  name: 'Test',
  description: '',
  nodes: buildGraph(),
  connections: [{ from: 'listener-1', to: 'action-1' }],
  layout: { nodePositions: {} },
  ...overrides,
})

const expectCompileError = (effect: EffectDefinition, message: string | RegExp) => {
  expect(() => EffectCompiler.compile(effect)).toThrow(EffectCompilationError)
  expect(() => EffectCompiler.compile(effect)).toThrow(message)
}

describe('EffectCompiler', () => {
  describe('YARG Effect Compilation', () => {
    it('should compile a valid YARG effect', () => {
      const effect = buildYargEffect({ name: 'Test Effect', description: 'A test effect' })

      const compiled = EffectCompiler.compile(effect)

      expect(compiled.definition).toBe(effect)
      expect(compiled.parameters.size).toBe(0)
      expect(compiled.effectListenerMap.size).toBe(1)
      expect(compiled.actionMap.size).toBe(1)
    })

    it('should throw error when effect has no Effect Listener', () => {
      expectCompileError(
        buildYargEffect({ nodes: buildGraph({ effectListeners: [] }), connections: [] }),
        'At least one Effect Listener node is required',
      )
    })

    it('should throw error when effect contains Effect Raiser node', () => {
      expectCompileError(
        buildYargEffect({
          nodes: buildGraph({
            actions: [],
            effectListeners: [entryListener('listener-1', 'Entry', [])],
            effectRaisers: [
              {
                id: 'raiser-1',
                type: 'effect-raiser',
                effectId: 'other-effect',
                label: 'Raise',
                outputs: [],
              },
            ],
          }),
          connections: [],
        }),
        'Effects cannot contain Effect Raiser nodes',
      )
    })

    it('should compile effect with parameter variables', () => {
      const effect = buildYargEffect({
        variables: [
          {
            name: 'speedParam',
            type: 'number',
            scope: 'cue',
            initialValue: 100,
            isParameter: true,
          },
        ],
      })

      const compiled = EffectCompiler.compile(effect)
      expect(compiled).toBeDefined()
      // Parameters are derived from variables with isParameter: true
    })
  })

  describe('Audio Effect Compilation', () => {
    it('should compile a valid Audio effect', () => {
      const effect: AudioEffectDefinition = {
        id: 'test-effect',
        mode: 'audio',
        name: 'Audio Test',
        description: '',
        nodes: buildGraph({ actions: [setColorAction('blue', 'high', 200)] }),
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
      const effect = buildYargEffect({
        nodes: buildGraph({
          effectListeners: [
            entryListener('listener-1', 'Entry 1'),
            entryListener('listener-2', 'Entry 2', []),
          ],
        }),
      })

      const compiled = EffectCompiler.compile(effect)
      expect(compiled.effectListenerMap.size).toBe(2)
    })

    it('should compile an effect with no parameters to an empty parameter map', () => {
      const compiled = EffectCompiler.compile(buildYargEffect())
      expect(compiled.parameters.size).toBe(0)
    })

    it('should compile effect with logic nodes and populate logicMap', () => {
      const effect = buildYargEffect({
        nodes: buildGraph({
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
          effectListeners: [entryListener('listener-1', 'Entry', ['logic-1'])],
        }),
        connections: [
          { from: 'listener-1', to: 'logic-1' },
          { from: 'logic-1', to: 'action-1' },
        ],
        variables: [{ name: 'sum', type: 'number', scope: 'cue', initialValue: 0 }],
      })

      const compiled = EffectCompiler.compile(effect)
      expect(compiled.logicMap.size).toBeGreaterThan(0)
      expect(compiled.logicMap.has('logic-1')).toBe(true)
    })

    it('should include color and light-array parameter types in parameters map', () => {
      const effect = buildYargEffect({
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
      })

      const compiled = EffectCompiler.compile(effect)
      expect(compiled.parameters.size).toBe(2)
      expect(compiled.parameters.has('colorParam')).toBe(true)
      expect(compiled.parameters.get('colorParam')?.type).toBe('color')
      expect(compiled.parameters.has('lightsParam')).toBe(true)
      expect(compiled.parameters.get('lightsParam')?.type).toBe('light-array')
    })

    it('should throw when effect has duplicate effectListener IDs', () => {
      expectCompileError(
        buildYargEffect({
          nodes: buildGraph({
            effectListeners: [
              entryListener('listener-1', 'Entry 1'),
              entryListener('listener-1', 'Entry 2', []),
            ],
          }),
        }),
        /duplicate.*effect listener/i,
      )
    })
  })
})
