import { EffectExecutionEngine } from '../../../../cues/node/runtime/EffectExecutionEngine'
import { EffectCompiler } from '../../../../cues/node/compiler/EffectCompiler'
import type { YargEffectDefinition } from '../../../../cues/types/nodeCueTypes'
import type { CueData } from '../../../../cues/types/cueTypes'
import type { ILightingController } from '../../../../controllers/sequencer/interfaces'
import type { DmxLightManager } from '../../../../controllers/DmxLightManager'

jest.mock('../../../../../main/utils/windowUtils', () => ({ sendToAllWindows: jest.fn() }))

describe('EffectExecutionEngine', () => {
  let mockSequencer: jest.Mocked<ILightingController>
  let mockLightManager: jest.Mocked<DmxLightManager>

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
    keyframe: 'Off',
    bonusEffect: false,
    beat: 'Strong' as any,
  })

  beforeEach(() => {
    mockSequencer = {
      addEffect: jest.fn(),
      setEffect: jest.fn(),
      addEffectWithCallback: jest.fn((_name, _effect, callback) => {
        setTimeout(() => callback(), 0)
      }),
      setEffectWithCallback: jest.fn((_name, _effect, callback) => {
        setTimeout(() => callback(), 0)
      }),
      addEffectUnblockedName: jest.fn().mockReturnValue(true),
      setEffectUnblockedName: jest.fn().mockReturnValue(true),
      addEffectUnblockedNameWithCallback: jest.fn((_name, _effect, callback) => {
        setTimeout(() => callback(), 0)
      }),
      setEffectUnblockedNameWithCallback: jest.fn((_name, _effect, callback) => {
        setTimeout(() => callback(), 0)
      }),
      removeEffectCallback: jest.fn(),
      removeEffect: jest.fn(),
    } as any

    mockLightManager = {
      getLights: jest.fn(() => [
        { id: 'light1', group: 'front', location: 'left' },
        { id: 'light2', group: 'front', location: 'right' },
      ]),
    } as any
  })

  describe('Parameter Passing', () => {
    it('should map parameters to effect variables via Effect Listener', async () => {
      const effect: YargEffectDefinition = {
        id: 'test-effect',
        mode: 'yarg',
        name: 'Test Effect',
        description: '',
        variables: [
          { name: 'speed', type: 'number', scope: 'cue', initialValue: 100, isParameter: true },
          { name: 'color', type: 'string', scope: 'cue', initialValue: 'white', isParameter: true },
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

      const compiledEffect = EffectCompiler.compile(effect)
      const parameterValues = {
        speed: 150,
        color: 'blue',
      }

      const engine = new EffectExecutionEngine(
        compiledEffect,
        mockSequencer,
        mockLightManager,
        parameterValues,
        createCueData(),
      )

      await engine.triggerEffect(createCueData())

      // Verify effect variables were set
      const varStore = (engine as any).effectVarStore
      expect(varStore.get('speed')).toEqual({ type: 'number', value: 150 })
      expect(varStore.get('color')).toEqual({ type: 'string', value: 'blue' })
    })

    it('should use default values when parameters not provided', async () => {
      const effect: YargEffectDefinition = {
        id: 'test-effect',
        mode: 'yarg',
        name: 'Test',
        description: '',
        variables: [
          {
            name: 'localSpeed',
            type: 'number',
            scope: 'cue',
            initialValue: 100,
            isParameter: true,
          },
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
              outputs: [],
            },
          ],
          eventListeners: [],
          effectListeners: [
            {
              id: 'listener-1',
              type: 'effect-listener',
              label: 'Entry',
              outputs: ['raiser-1'],
            },
          ],
        },
        events: [{ name: 'test-event', description: '' }],
        connections: [{ from: 'listener-1', to: 'raiser-1' }],
        layout: { nodePositions: {} },
      }

      const compiledEffect = EffectCompiler.compile(effect)
      const parameterValues = {} // Missing 'speed'

      const engine = new EffectExecutionEngine(
        compiledEffect,
        mockSequencer,
        mockLightManager,
        parameterValues,
        createCueData(),
      )

      // Should not throw
      expect(() => engine.triggerEffect(createCueData())).not.toThrow()
    })

    it('preserves delay timing and color in transitions when params are delay and 500/200 (score cue regression)', async () => {
      const effect: YargEffectDefinition = {
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

      const compiledEffect = EffectCompiler.compile(effect)
      const parameterValues = {
        lights: [
          { id: 'light1', position: 0 },
          { id: 'light2', position: 1 },
        ],
        color: 'yellow',
        waitUntilCondition: 'delay',
        waitUntilTime: 500,
      }

      let submittedEffect: any
      mockSequencer.addEffectUnblockedNameWithCallback.mockImplementation(
        (_name, effectArg, _callback) => {
          submittedEffect = effectArg
        },
      )

      const engine = new EffectExecutionEngine(
        compiledEffect,
        mockSequencer,
        mockLightManager,
        parameterValues,
        createCueData(),
      )

      await engine.triggerEffect(createCueData())

      expect(submittedEffect).toBeDefined()
      expect(submittedEffect.transitions).toBeDefined()
      expect(submittedEffect.transitions.length).toBeGreaterThan(0)
      const firstTransition = submittedEffect.transitions[0]
      expect(firstTransition.waitUntilCondition).toBe('delay')
      expect(firstTransition.waitUntilTime).toBe(500)
      // Resolved color is RGBIO (yellow has high R/G, low B); would be wrong if param was coerced to 0
      expect(firstTransition.transform?.color).toBeDefined()
      expect(firstTransition.transform.color.red).toBeGreaterThan(0)
      expect(firstTransition.transform.color.green).toBeGreaterThan(0)
    })

    it('second trigger still applies delay params (regression: stop then start score)', async () => {
      const effect: YargEffectDefinition = {
        id: 'score-like',
        mode: 'yarg',
        name: 'Score-like',
        description: '',
        variables: [
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
                duration: { source: 'literal', value: 0 },
                waitUntilCondition: { source: 'variable', name: 'waitUntilCondition' },
                waitUntilTime: { source: 'variable', name: 'waitUntilTime' },
                easing: { source: 'literal', value: 'linear' },
                level: { source: 'literal', value: 1 },
              },
              layer: { source: 'literal', value: 1 },
            },
          ],
          logic: [],
          eventRaisers: [],
          eventListeners: [],
          effectListeners: [
            { id: 'listener-1', type: 'effect-listener', label: 'Entry', outputs: ['action-1'] },
          ],
        },
        connections: [{ from: 'listener-1', to: 'action-1' }],
        layout: { nodePositions: {} },
      }

      const compiledEffect = EffectCompiler.compile(effect)
      const parameterValues = { waitUntilCondition: 'delay', waitUntilTime: 500 }

      const submitted: any[] = []
      mockSequencer.addEffectUnblockedNameWithCallback.mockImplementation(
        (_name, effectArg, _callback) => {
          submitted.push(effectArg)
        },
      )

      const engine = new EffectExecutionEngine(
        compiledEffect,
        mockSequencer,
        mockLightManager,
        parameterValues,
        createCueData(),
      )

      await engine.triggerEffect(createCueData())
      expect(submitted.length).toBe(1)
      expect(submitted[0].transitions?.[0].waitUntilCondition).toBe('delay')
      expect(submitted[0].transitions?.[0].waitUntilTime).toBe(500)

      submitted.length = 0
      await engine.triggerEffect(createCueData())
      expect(submitted.length).toBe(1)
      expect(submitted[0].transitions?.[0].waitUntilCondition).toBe('delay')
      expect(submitted[0].transitions?.[0].waitUntilTime).toBe(500)
    })

    it('coerces delay + waitUntilTime 0 to none + 0 (Stage Kit menu-style, no warning)', async () => {
      const effect: YargEffectDefinition = {
        id: 'sweep-like',
        mode: 'yarg',
        name: 'Sweep-like',
        description: '',
        variables: [
          {
            name: 'lights',
            type: 'light-array',
            scope: 'cue',
            initialValue: [],
            isParameter: true,
          },
          {
            name: 'waitUntilCondition',
            type: 'string',
            scope: 'cue',
            initialValue: 'delay',
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
                name: { source: 'literal', value: 'blue' },
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
              outputs: [],
            },
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

      const compiledEffect = EffectCompiler.compile(effect)
      const lights = [{ id: 'light1', position: 0 }]
      const parameterValues = {
        lights,
        waitUntilCondition: 'delay',
        waitUntilTime: 0,
      }

      const submitted: any[] = []
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
      mockSequencer.addEffectUnblockedNameWithCallback.mockImplementation(
        (_name, effectArg, _callback) => {
          submitted.push(effectArg)
        },
      )
      mockSequencer.addEffect.mockImplementation((_name, effectArg) => {
        submitted.push(effectArg)
        return true
      })

      const engine = new EffectExecutionEngine(
        compiledEffect,
        mockSequencer,
        mockLightManager,
        parameterValues,
        createCueData(),
      )

      await engine.triggerEffect(createCueData())

      expect(submitted.length).toBe(1)
      expect(submitted[0].transitions?.[0].waitUntilCondition).toBe('none')
      expect(submitted[0].transitions?.[0].waitUntilTime).toBe(0)
      expect(warnSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('waitUntilCondition is delay but waitUntilTime'),
      )
      warnSpy.mockRestore()
    })

    it('score-like chained rotation: all transitions get delay and waitUntilTime from effect params (200ms)', async () => {
      const effect: YargEffectDefinition = {
        id: 'rotation-like',
        mode: 'yarg',
        name: 'Rotation-like',
        description: '',
        variables: [
          {
            name: 'lights',
            type: 'light-array',
            scope: 'cue',
            initialValue: [],
            isParameter: true,
          },
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
              id: 'phase1',
              type: 'action',
              effectType: 'set-color',
              target: {
                groups: { source: 'variable', name: 'currentLight' },
                filter: { source: 'literal', value: 'all' },
              },
              color: {
                name: { source: 'literal', value: 'blue' },
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
            {
              id: 'phase2',
              type: 'action',
              effectType: 'set-color',
              target: {
                groups: { source: 'variable', name: 'currentLight' },
                filter: { source: 'literal', value: 'all' },
              },
              color: {
                name: { source: 'literal', value: 'blue' },
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
            {
              id: 'phase3',
              type: 'action',
              effectType: 'set-color',
              target: {
                groups: { source: 'variable', name: 'currentLight' },
                filter: { source: 'literal', value: 'all' },
              },
              color: {
                name: { source: 'literal', value: 'blue' },
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
              outputs: [],
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
          { from: 'for-each-1', to: 'phase1', fromPort: 'each' },
          { from: 'phase1', to: 'phase2' },
          { from: 'phase2', to: 'phase3' },
        ],
        layout: { nodePositions: {} },
      }

      const compiledEffect = EffectCompiler.compile(effect)
      const parameterValues = {
        lights: [{ id: 'light1', position: 0 }],
        waitUntilCondition: 'delay',
        waitUntilTime: 200,
      }

      let submittedEffect: any
      mockSequencer.addEffectUnblockedNameWithCallback.mockImplementation(
        (_name, effectArg, _callback) => {
          submittedEffect = effectArg
        },
      )

      const engine = new EffectExecutionEngine(
        compiledEffect,
        mockSequencer,
        mockLightManager,
        parameterValues,
        createCueData(),
      )

      await engine.triggerEffect(createCueData())

      expect(submittedEffect?.transitions?.length).toBe(3)
      submittedEffect.transitions.forEach(
        (t: { waitUntilCondition: string; waitUntilTime: number }) => {
          expect(t.waitUntilCondition).toBe('delay')
          expect(t.waitUntilTime).toBe(200)
        },
      )
    })

    it('iterates in groups when groupSize is set (pairs fire together)', async () => {
      const effect: YargEffectDefinition = {
        id: 'grouped-foreach',
        mode: 'yarg',
        name: 'Grouped',
        description: '',
        variables: [
          {
            name: 'lights',
            type: 'light-array',
            scope: 'cue',
            initialValue: [],
            isParameter: true,
          },
          { name: 'groupSize', type: 'number', scope: 'cue', initialValue: 1, isParameter: true },
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
                name: { source: 'literal', value: 'white' },
                brightness: { source: 'literal', value: 'medium' },
                blendMode: { source: 'literal', value: 'replace' },
              },
              timing: {
                waitForCondition: { source: 'literal', value: 'none' },
                waitForTime: { source: 'literal', value: 0 },
                duration: { source: 'literal', value: 0 },
                waitUntilCondition: { source: 'literal', value: 'none' },
                waitUntilTime: { source: 'literal', value: 0 },
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
              groupSize: { source: 'variable', name: 'groupSize' },
              outputs: [],
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

      const compiledEffect = EffectCompiler.compile(effect)
      const lights = [
        { id: 'light1', position: 0 },
        { id: 'light2', position: 1 },
        { id: 'light3', position: 2 },
        { id: 'light4', position: 3 },
      ]
      const parameterValues = { lights, groupSize: 2 }

      const submissions: any[] = []
      const captureEffect = (_name: string, effectArg: any) => submissions.push(effectArg)
      mockSequencer.addEffectUnblockedNameWithCallback.mockImplementation(
        (name, effectArg, _callback) => captureEffect(name, effectArg),
      )
      mockSequencer.addEffect.mockImplementation((name, effectArg) => {
        captureEffect(name, effectArg)
        return true
      })

      const engine = new EffectExecutionEngine(
        compiledEffect,
        mockSequencer,
        mockLightManager,
        parameterValues,
        createCueData(),
      )

      await engine.triggerEffect(createCueData())

      // 4 lights / groupSize 2 = 2 iterations; each iteration submits one effect
      expect(submissions.length).toBe(2)
      // First submission: group [light1, light2]
      expect(submissions[0].transitions[0].lights).toHaveLength(2)
      expect(submissions[0].transitions[0].lights.map((l: { id: string }) => l.id)).toEqual([
        'light1',
        'light2',
      ])
      // Second submission: group [light3, light4]
      expect(submissions[1].transitions[0].lights).toHaveLength(2)
      expect(submissions[1].transitions[0].lights.map((l: { id: string }) => l.id)).toEqual([
        'light3',
        'light4',
      ])
    })
  })

  describe('Variable Isolation', () => {
    it('should have isolated variable scope', async () => {
      const effect: YargEffectDefinition = {
        id: 'test-effect',
        mode: 'yarg',
        name: 'Test',
        description: '',
        variables: [{ name: 'effectVar', type: 'number', scope: 'cue', initialValue: 0 }],
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
              logicType: 'variable',
              label: 'Set Var',
              outputs: [],
              mode: 'set',
              varName: 'effectVar',
              valueType: 'number',
              value: { source: 'literal', value: 42 },
            },
          ],
          eventRaisers: [],
          eventListeners: [],
          effectListeners: [
            {
              id: 'listener-1',
              type: 'effect-listener',
              label: 'Entry',
              outputs: ['logic-1', 'action-1'],
            },
          ],
        },
        connections: [
          { from: 'listener-1', to: 'logic-1' },
          { from: 'listener-1', to: 'action-1' },
        ],
        layout: { nodePositions: {} },
      }

      const compiledEffect = EffectCompiler.compile(effect)

      const engine = new EffectExecutionEngine(
        compiledEffect,
        mockSequencer,
        mockLightManager,
        {},
        createCueData(),
      )

      await engine.triggerEffect(createCueData())

      // Verify variable is in effect's scope
      const varStore = (engine as any).effectVarStore
      expect(varStore.get('effectVar')).toEqual({ type: 'number', value: 42 })

      // Verify it's not accessible externally (would need cue context to test fully)
    })
  })

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
            description: '',
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
                name: { source: 'literal', value: 'red' },
                brightness: { source: 'literal', value: 'high' },
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
          eventRaisers: [
            {
              id: 'raiser-1',
              type: 'event-raiser',
              eventName: 'internal-event',
              label: 'Raise',
              inputs: [],
              outputs: [],
            },
          ],
          eventListeners: [
            {
              id: 'listener-event-1',
              type: 'event-listener',
              eventName: 'internal-event',
              label: 'Listen',
              outputs: ['action-1'],
            },
          ],
          effectListeners: [
            {
              id: 'listener-1',
              type: 'effect-listener',
              label: 'Entry',
              outputs: ['raiser-1'],
            },
          ],
        },
        connections: [
          { from: 'listener-1', to: 'raiser-1' },
          { from: 'listener-event-1', to: 'action-1' },
        ],
        layout: { nodePositions: {} },
      }

      const compiledEffect = EffectCompiler.compile(effect)

      const engine = new EffectExecutionEngine(
        compiledEffect,
        mockSequencer,
        mockLightManager,
        {},
        createCueData(),
      )

      await engine.triggerEffect(createCueData())

      // Verify action was executed via internal event (engine may use addEffect or addEffectUnblockedNameWithCallback)
      expect(
        mockSequencer.addEffectUnblockedNameWithCallback.mock.calls.length +
          mockSequencer.addEffect.mock.calls.length,
      ).toBeGreaterThanOrEqual(1)
    })
  })

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
                duration: { source: 'literal', value: 1000 },
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

      const compiledEffect = EffectCompiler.compile(effect)

      const engine = new EffectExecutionEngine(
        compiledEffect,
        mockSequencer,
        mockLightManager,
        {},
        createCueData(),
      )

      const startTime = Date.now()
      const promise = engine.triggerEffect(createCueData())
      const callTime = Date.now() - startTime

      // Should return immediately, not wait for action to complete
      expect(callTime).toBeLessThan(100)

      await promise // Wait for actual completion
    })
  })

  describe('maybeFireIdle re-entrancy (persistent re-trigger)', () => {
    const createSyncMinimalEffect = (): YargEffectDefinition => ({
      id: 'sync-idle-effect',
      mode: 'yarg',
      name: 'Sync Idle Effect',
      description: '',
      variables: [],
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
    })

    it('does not stack overflow when onIdle re-triggers triggerEffect synchronously', () => {
      const compiledEffect = EffectCompiler.compile(createSyncMinimalEffect())
      const engine = new EffectExecutionEngine(
        compiledEffect,
        mockSequencer,
        mockLightManager,
        {},
        createCueData(),
      )
      const cueData = createCueData()
      const onIdle = jest.fn(() => {
        engine.triggerEffect(cueData)
      })
      engine.setOnIdle(onIdle)

      expect(() => engine.triggerEffect(cueData)).not.toThrow()
      expect(onIdle).toHaveBeenCalledTimes(1)
    })
  })

  describe('Idle gating for callback-backed effects', () => {
    const createForEachBlockingEffect = (): YargEffectDefinition => ({
      id: 'for-each-blocking-effect',
      mode: 'yarg',
      name: 'For Each Blocking Effect',
      description: '',
      variables: [
        {
          name: 'lights',
          type: 'light-array',
          scope: 'cue',
          initialValue: [
            { id: 'light1', position: 0 },
            { id: 'light2', position: 1 },
          ],
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
              name: { source: 'literal', value: 'blue' },
              brightness: { source: 'literal', value: 'medium' },
              blendMode: { source: 'literal', value: 'replace' },
            },
            timing: {
              waitForCondition: { source: 'literal', value: 'none' },
              waitForTime: { source: 'literal', value: 0 },
              duration: { source: 'literal', value: 50 },
              waitUntilCondition: { source: 'literal', value: 'delay' },
              waitUntilTime: { source: 'literal', value: 25 },
              easing: { source: 'literal', value: 'linear' },
              level: { source: 'literal', value: 1 },
            },
            layer: { source: 'literal', value: 0 },
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
          {
            id: 'listener-1',
            type: 'effect-listener',
            label: 'Entry',
            outputs: ['for-each-1'],
          },
        ],
      },
      connections: [
        { from: 'listener-1', to: 'for-each-1' },
        { from: 'for-each-1', to: 'action-1', fromPort: 'each' },
      ],
      layout: { nodePositions: {} },
    })

    it('does not fire idle until all pending callback-backed submissions complete', () => {
      const callbacks: Array<() => void> = []
      mockSequencer.addEffectUnblockedNameWithCallback.mockImplementation(
        (_name, _effect, callback) => {
          callbacks.push(callback)
        },
      )

      const compiledEffect = EffectCompiler.compile(createForEachBlockingEffect())
      const engine = new EffectExecutionEngine(
        compiledEffect,
        mockSequencer,
        mockLightManager,
        {},
        createCueData(),
      )
      const onIdle = jest.fn()
      engine.setOnIdle(onIdle)

      engine.triggerEffect(createCueData())

      expect(callbacks).toHaveLength(2)
      expect(onIdle).not.toHaveBeenCalled()

      callbacks[0]()
      expect(onIdle).not.toHaveBeenCalled()

      callbacks[1]()
      expect(onIdle).toHaveBeenCalledTimes(1)
    })

    it('cancelAll clears submitted callback-backed effects and prevents idle retrigger', () => {
      const callbacks: Array<() => void> = []
      mockSequencer.addEffectUnblockedNameWithCallback.mockImplementation(
        (_name, _effect, callback) => {
          callbacks.push(callback)
        },
      )

      const compiledEffect = EffectCompiler.compile(createForEachBlockingEffect())
      const engine = new EffectExecutionEngine(
        compiledEffect,
        mockSequencer,
        mockLightManager,
        {},
        createCueData(),
      )
      const onIdle = jest.fn()
      engine.setOnIdle(onIdle)

      engine.triggerEffect(createCueData())
      expect(callbacks).toHaveLength(2)

      const submittedNames = mockSequencer.addEffectUnblockedNameWithCallback.mock.calls.map(
        (call) => call[0],
      )
      engine.cancelAll()

      expect(mockSequencer.removeEffectCallback).toHaveBeenCalledTimes(2)
      expect(mockSequencer.removeEffect).toHaveBeenCalledTimes(2)
      for (const name of submittedNames) {
        expect(mockSequencer.removeEffectCallback).toHaveBeenCalledWith(name)
        expect(mockSequencer.removeEffect).toHaveBeenCalledWith(name, 0)
      }

      // Simulate stale callback invocations after cancel: idle callback should already be detached.
      callbacks[0]()
      callbacks[1]()
      expect(onIdle).not.toHaveBeenCalled()
    })

    it('cancelAll(true) leaves effects on sequencer so lights stay lit during cue transition', () => {
      const callbacks: Array<() => void> = []
      mockSequencer.addEffectUnblockedNameWithCallback.mockImplementation(
        (_name, _effect, callback) => {
          callbacks.push(callback)
        },
      )

      const compiledEffect = EffectCompiler.compile(createForEachBlockingEffect())
      const engine = new EffectExecutionEngine(
        compiledEffect,
        mockSequencer,
        mockLightManager,
        {},
        createCueData(),
      )

      engine.triggerEffect(createCueData())
      expect(mockSequencer.addEffectUnblockedNameWithCallback).toHaveBeenCalled()

      const removeEffectBefore = (mockSequencer.removeEffect as jest.Mock).mock.calls.length
      const removeCallbackBefore = (mockSequencer.removeEffectCallback as jest.Mock).mock.calls
        .length

      engine.cancelAll(true)

      expect(mockSequencer.removeEffectCallback).toHaveBeenCalledTimes(removeCallbackBefore + 2)
      expect(mockSequencer.removeEffect).toHaveBeenCalledTimes(removeEffectBefore)
    })
  })
})
