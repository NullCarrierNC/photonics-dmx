import { YargNodeCue } from '../../../cues/node/runtime/YargNodeCue'
import { NodeCueCompiler } from '../../../cues/node/compiler/NodeCueCompiler'
import { NodeExecutionEngine } from '../../../cues/node/runtime/NodeExecutionEngine'
import { EffectRegistry } from '../../../cues/node/runtime/EffectRegistry'
import { CueType } from '../../../cues/types/cueTypes'
import type {
  YargNodeCueDefinition,
  LogicNode,
  YargEventNode,
  ActionNode,
} from '../../../cues/types/nodeCueTypes'
import { ActionEffectFactory } from '../../../cues/node/compiler/ActionEffectFactory'
import { VariableValue } from '../../../cues/node/runtime/executionTypes'
import { Beat, CueData } from '../../../cues/types/cueTypes'
import type { ILightingController } from '../../../controllers/sequencer/interfaces'
import type { DmxLightManager } from '../../../controllers/DmxLightManager'
import type { TrackedLight } from '../../../types'

jest.mock('../../../../main/utils/windowUtils', () => ({ sendToAllWindows: jest.fn() }))

const createCueData = (beat?: Beat): CueData =>
  ({
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
    beat: beat ?? 'Unknown',
  }) as CueData

function minimalAction(id: string): ActionNode {
  return {
    id,
    type: 'action',
    effectType: 'set-color',
    target: {
      groups: { source: 'literal', value: 'front' },
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
      duration: { source: 'literal', value: 100 },
      waitUntilCondition: { source: 'literal', value: 'none' },
      waitUntilTime: { source: 'literal', value: 0 },
      easing: 'sinInOut',
      level: { source: 'literal', value: 1 },
    },
  }
}

describe('Node cue logic runtime', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('branches through conditional logic and clamps divide-by-zero', async () => {
    const definition: YargNodeCueDefinition = {
      id: 'logic-cue',
      name: 'Logic Cue',
      cueType: CueType.Chorus,
      style: 'primary',
      nodes: {
        events: [{ id: 'event-1', type: 'event', eventType: 'beat' }],
        actions: [
          {
            id: 'action-true',
            type: 'action',
            effectType: 'set-color',
            target: {
              groups: { source: 'literal', value: 'front' },
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
              duration: { source: 'literal', value: 100 },
              waitUntilCondition: { source: 'literal', value: 'none' },
              waitUntilTime: { source: 'literal', value: 0 },
              easing: 'sinInOut',
              level: { source: 'literal', value: 1 },
            },
          },
          {
            id: 'action-false',
            type: 'action',
            effectType: 'set-color',
            target: {
              groups: { source: 'literal', value: 'front' },
              filter: { source: 'literal', value: 'all' },
            },
            color: {
              name: { source: 'literal', value: 'red' },
              brightness: { source: 'literal', value: 'medium' },
              blendMode: { source: 'literal', value: 'replace' },
            },
            timing: {
              waitForCondition: { source: 'literal', value: 'none' },
              waitForTime: { source: 'literal', value: 0 },
              duration: { source: 'literal', value: 100 },
              waitUntilCondition: { source: 'literal', value: 'none' },
              waitUntilTime: { source: 'literal', value: 0 },
              easing: 'sinInOut',
              level: { source: 'literal', value: 1 },
            },
          },
        ],
        logic: [
          {
            id: 'math-1',
            type: 'logic',
            logicType: 'math',
            operator: 'divide',
            left: { source: 'literal', value: 10 },
            right: { source: 'literal', value: 0 },
            assignTo: 'calc',
          },
          {
            id: 'cond-1',
            type: 'logic',
            logicType: 'conditional',
            comparator: '==',
            left: { source: 'variable', name: 'calc' },
            right: { source: 'literal', value: 0 },
          },
        ],
      },
      connections: [
        { from: 'event-1', to: 'math-1' },
        { from: 'math-1', to: 'cond-1' },
        { from: 'cond-1', to: 'action-true', fromPort: 'true' },
        { from: 'cond-1', to: 'action-false', fromPort: 'false' },
      ],
      layout: { nodePositions: {} },
    }

    const compiled = NodeCueCompiler.compileYargCue(definition)
    const cue = new YargNodeCue('group-1', compiled)

    const addEffect = jest.fn()

    const sequencer = {
      addEffect,
    } as any

    const lightManager = {
      getLights: jest.fn().mockReturnValue([{ id: 'l1', position: 0 }]),
    } as any

    jest
      .spyOn(ActionEffectFactory, 'resolveLights')
      .mockReturnValue([{ id: 'l1', position: 0 } as any])
    const buildEffectSpy = jest.spyOn(ActionEffectFactory, 'buildEffect').mockImplementation(
      ({ action, waitTime }) =>
        ({
          id: action.id,
          description: 'mock',
          transitions: [
            {
              lights: [],
              layer: action.layer ?? 0,
              waitForCondition: { source: 'literal', value: 'none' },
              waitForTime: waitTime ?? 0,
              transform: {
                color: {
                  red: 0,
                  green: 0,
                  blue: 0,
                  intensity: 0,
                  opacity: 1,
                  blendMode: 'replace',
                },
                easing: 'sin.in',
                duration: action.timing.duration,
              },
              waitUntilCondition: { source: 'literal', value: 'none' },
              waitUntilTime: 0,
            },
          ],
        }) as any,
    )

    await cue.execute({ beat: 'Strong' } as any, sequencer, lightManager)

    // Verify the conditional logic evaluated correctly (10/0 = 0, 0 == 0 is true)
    expect(buildEffectSpy).toHaveBeenCalledWith(
      expect.objectContaining({ action: expect.objectContaining({ id: 'action-true' }) }),
    )
    expect(buildEffectSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: expect.objectContaining({ id: 'action-false' }) }),
    )
    expect(addEffect).toHaveBeenCalledTimes(1)
  })

  describe('shuffle-lights', () => {
    it('outputs same lights as input with randomised order (same length and members)', () => {
      const mockLights: TrackedLight[] = [
        { id: 'l1', position: 0, config: {} as any },
        { id: 'l2', position: 1, config: {} as any },
        { id: 'l3', position: 2, config: {} as any },
      ]
      const cueLevelVarStore = new Map<string, VariableValue>()
      const groupLevelVarStore = new Map<string, VariableValue>()
      const mockSequencer = { addEffect: jest.fn() } as unknown as ILightingController
      const mockLightManager = { getLights: jest.fn() } as unknown as DmxLightManager

      const eventNode: YargEventNode = { id: 'e1', type: 'event', eventType: 'beat' }
      const initNode: LogicNode = {
        id: 'init1',
        type: 'logic',
        logicType: 'variable',
        mode: 'init',
        varName: 'arr',
        valueType: 'light-array',
        value: { source: 'literal', value: mockLights },
      }
      const shuffleNode: LogicNode = {
        id: 'shuffle1',
        type: 'logic',
        logicType: 'shuffle-lights',
        sourceVariable: 'arr',
        assignTo: 'out',
      }
      const action = minimalAction('action1')
      const definition: YargNodeCueDefinition = {
        id: 'shuffle-cue',
        name: 'Shuffle Cue',
        cueType: CueType.Chorus,
        style: 'primary',
        nodes: {
          events: [eventNode],
          actions: [action],
          logic: [initNode, shuffleNode],
        },
        connections: [
          { from: 'e1', to: 'init1' },
          { from: 'init1', to: 'shuffle1' },
          { from: 'shuffle1', to: 'action1' },
        ],
        variables: [
          { name: 'arr', type: 'light-array', scope: 'cue', initialValue: [] },
          { name: 'out', type: 'light-array', scope: 'cue', initialValue: [] },
        ],
      }
      const compiled = NodeCueCompiler.compileYargCue(definition)
      const engine = new NodeExecutionEngine(
        compiled,
        definition.id,
        mockSequencer,
        mockLightManager,
        cueLevelVarStore,
        groupLevelVarStore,
        new EffectRegistry(),
        definition.variables,
      )
      engine.startExecution(eventNode, createCueData('Strong'))

      const out = cueLevelVarStore.get('out')
      expect(out).toBeDefined()
      expect(out?.type).toBe('light-array')
      const arr = out?.value as TrackedLight[]
      expect(arr).toHaveLength(3)
      const ids = new Set(arr.map((l) => l.id))
      expect(ids).toEqual(new Set(['l1', 'l2', 'l3']))
    })

    it('empty array input produces empty output', () => {
      const cueLevelVarStore = new Map<string, VariableValue>()
      const groupLevelVarStore = new Map<string, VariableValue>()
      const mockSequencer = { addEffect: jest.fn() } as unknown as ILightingController
      const mockLightManager = { getLights: jest.fn() } as unknown as DmxLightManager

      const eventNode: YargEventNode = { id: 'e1', type: 'event', eventType: 'beat' }
      const initNode: LogicNode = {
        id: 'init1',
        type: 'logic',
        logicType: 'variable',
        mode: 'init',
        varName: 'arr',
        valueType: 'light-array',
        value: { source: 'literal', value: [] },
      }
      const shuffleNode: LogicNode = {
        id: 'shuffle1',
        type: 'logic',
        logicType: 'shuffle-lights',
        sourceVariable: 'arr',
        assignTo: 'out',
      }
      const action = minimalAction('action1')
      const definition: YargNodeCueDefinition = {
        id: 'shuffle-cue',
        name: 'Shuffle Cue',
        cueType: CueType.Chorus,
        style: 'primary',
        nodes: {
          events: [eventNode],
          actions: [action],
          logic: [initNode, shuffleNode],
        },
        connections: [
          { from: 'e1', to: 'init1' },
          { from: 'init1', to: 'shuffle1' },
          { from: 'shuffle1', to: 'action1' },
        ],
        variables: [
          { name: 'arr', type: 'light-array', scope: 'cue', initialValue: [] },
          { name: 'out', type: 'light-array', scope: 'cue', initialValue: [] },
        ],
      }
      const compiled = NodeCueCompiler.compileYargCue(definition)
      const engine = new NodeExecutionEngine(
        compiled,
        definition.id,
        mockSequencer,
        mockLightManager,
        cueLevelVarStore,
        groupLevelVarStore,
        new EffectRegistry(),
        definition.variables,
      )
      engine.startExecution(eventNode, createCueData('Strong'))

      const out = cueLevelVarStore.get('out')
      expect(out?.type).toBe('light-array')
      expect(out?.value).toEqual([])
    })
  })

  describe('random', () => {
    it('random-integer: result is in [min, max] and min === max returns that value', () => {
      const cueLevelVarStore = new Map<string, VariableValue>()
      const groupLevelVarStore = new Map<string, VariableValue>()
      const mockSequencer = { addEffect: jest.fn() } as unknown as ILightingController
      const mockLightManager = { getLights: jest.fn() } as unknown as DmxLightManager

      const eventNode: YargEventNode = { id: 'e1', type: 'event', eventType: 'beat' }
      const randomNode: LogicNode = {
        id: 'r1',
        type: 'logic',
        logicType: 'random',
        mode: 'random-integer',
        min: { source: 'literal', value: 1 },
        max: { source: 'literal', value: 5 },
        assignTo: 'r',
      }
      const action = minimalAction('action1')
      const definition: YargNodeCueDefinition = {
        id: 'rand-cue',
        name: 'Random Cue',
        cueType: CueType.Chorus,
        style: 'primary',
        nodes: {
          events: [eventNode],
          actions: [action],
          logic: [randomNode],
        },
        connections: [
          { from: 'e1', to: 'r1' },
          { from: 'r1', to: 'action1' },
        ],
        variables: [{ name: 'r', type: 'number', scope: 'cue', initialValue: 0 }],
      }
      const compiled = NodeCueCompiler.compileYargCue(definition)
      const engine = new NodeExecutionEngine(
        compiled,
        definition.id,
        mockSequencer,
        mockLightManager,
        cueLevelVarStore,
        groupLevelVarStore,
        new EffectRegistry(),
        definition.variables,
      )
      engine.startExecution(eventNode, createCueData('Strong'))

      const r = cueLevelVarStore.get('r')
      expect(r).toBeDefined()
      expect(r?.type).toBe('number')
      const val = r?.value as number
      expect(val).toBeGreaterThanOrEqual(1)
      expect(val).toBeLessThanOrEqual(5)
      expect(Number.isInteger(val)).toBe(true)
    })

    it('random-integer: min === max always returns that value', () => {
      const cueLevelVarStore = new Map<string, VariableValue>()
      const groupLevelVarStore = new Map<string, VariableValue>()
      const mockSequencer = { addEffect: jest.fn() } as unknown as ILightingController
      const mockLightManager = { getLights: jest.fn() } as unknown as DmxLightManager

      const eventNode: YargEventNode = { id: 'e1', type: 'event', eventType: 'beat' }
      const randomNode: LogicNode = {
        id: 'r1',
        type: 'logic',
        logicType: 'random',
        mode: 'random-integer',
        min: { source: 'literal', value: 7 },
        max: { source: 'literal', value: 7 },
        assignTo: 'r',
      }
      const action = minimalAction('action1')
      const definition: YargNodeCueDefinition = {
        id: 'rand-cue',
        name: 'Random Cue',
        cueType: CueType.Chorus,
        style: 'primary',
        nodes: {
          events: [eventNode],
          actions: [action],
          logic: [randomNode],
        },
        connections: [
          { from: 'e1', to: 'r1' },
          { from: 'r1', to: 'action1' },
        ],
        variables: [{ name: 'r', type: 'number', scope: 'cue', initialValue: 0 }],
      }
      const compiled = NodeCueCompiler.compileYargCue(definition)
      const engine = new NodeExecutionEngine(
        compiled,
        definition.id,
        mockSequencer,
        mockLightManager,
        cueLevelVarStore,
        groupLevelVarStore,
        new EffectRegistry(),
        definition.variables,
      )
      engine.startExecution(eventNode, createCueData('Strong'))

      expect(cueLevelVarStore.get('r')).toEqual({ type: 'number', value: 7 })
    })

    it('random-choice: result is one of the choices', () => {
      const cueLevelVarStore = new Map<string, VariableValue>()
      const groupLevelVarStore = new Map<string, VariableValue>()
      const mockSequencer = { addEffect: jest.fn() } as unknown as ILightingController
      const mockLightManager = { getLights: jest.fn() } as unknown as DmxLightManager

      const eventNode: YargEventNode = { id: 'e1', type: 'event', eventType: 'beat' }
      const randomNode: LogicNode = {
        id: 'r1',
        type: 'logic',
        logicType: 'random',
        mode: 'random-choice',
        choices: ['a', 'b', 'c'],
        assignTo: 'r',
      }
      const action = minimalAction('action1')
      const definition: YargNodeCueDefinition = {
        id: 'rand-cue',
        name: 'Random Cue',
        cueType: CueType.Chorus,
        style: 'primary',
        nodes: {
          events: [eventNode],
          actions: [action],
          logic: [randomNode],
        },
        connections: [
          { from: 'e1', to: 'r1' },
          { from: 'r1', to: 'action1' },
        ],
        variables: [{ name: 'r', type: 'string', scope: 'cue', initialValue: '' }],
      }
      const compiled = NodeCueCompiler.compileYargCue(definition)
      const engine = new NodeExecutionEngine(
        compiled,
        definition.id,
        mockSequencer,
        mockLightManager,
        cueLevelVarStore,
        groupLevelVarStore,
        new EffectRegistry(),
        definition.variables,
      )
      engine.startExecution(eventNode, createCueData('Strong'))

      const r = cueLevelVarStore.get('r')
      expect(r?.type).toBe('string')
      expect(['a', 'b', 'c']).toContain(r?.value)
    })

    it('random-light: result is a light-array of one light from input', () => {
      const mockLights: TrackedLight[] = [
        { id: 'front1', position: 0, config: {} as any },
        { id: 'front2', position: 1, config: {} as any },
      ]
      const cueLevelVarStore = new Map<string, VariableValue>()
      const groupLevelVarStore = new Map<string, VariableValue>()
      const mockSequencer = { addEffect: jest.fn() } as unknown as ILightingController
      const mockLightManager = {
        getLightsInGroup: jest.fn().mockReturnValue(mockLights),
      } as unknown as DmxLightManager

      const eventNode: YargEventNode = { id: 'e1', type: 'event', eventType: 'beat' }
      const configNode: LogicNode = {
        id: 'config1',
        type: 'logic',
        logicType: 'config-data',
        dataProperty: 'front-lights-array',
        assignTo: 'allLights',
      }
      const randomNode: LogicNode = {
        id: 'r1',
        type: 'logic',
        logicType: 'random',
        mode: 'random-light',
        sourceVariable: 'allLights',
        count: { source: 'literal', value: 1 },
        assignTo: 'picked',
      }
      const action = minimalAction('action1')
      const definition: YargNodeCueDefinition = {
        id: 'rand-cue',
        name: 'Random Cue',
        cueType: CueType.Chorus,
        style: 'primary',
        nodes: {
          events: [eventNode],
          actions: [action],
          logic: [configNode, randomNode],
        },
        connections: [
          { from: 'e1', to: 'config1' },
          { from: 'config1', to: 'r1' },
          { from: 'r1', to: 'action1' },
        ],
        variables: [
          { name: 'allLights', type: 'light-array', scope: 'cue', initialValue: [] },
          { name: 'picked', type: 'light-array', scope: 'cue', initialValue: [] },
        ],
      }
      const compiled = NodeCueCompiler.compileYargCue(definition)
      const engine = new NodeExecutionEngine(
        compiled,
        definition.id,
        mockSequencer,
        mockLightManager,
        cueLevelVarStore,
        groupLevelVarStore,
        new EffectRegistry(),
        definition.variables,
      )
      engine.startExecution(eventNode, createCueData('Strong'))

      const picked = cueLevelVarStore.get('picked')
      expect(picked?.type).toBe('light-array')
      const arr = picked?.value as TrackedLight[]
      expect(arr).toHaveLength(1)
      expect(['front1', 'front2']).toContain(arr[0].id)
    })
  })

  describe('debugger', () => {
    it('execution passes through and downstream action fires', () => {
      const addEffect = jest.fn()
      const mockSequencer = { addEffect } as unknown as ILightingController
      const mockLightManager = {
        getLights: jest.fn().mockReturnValue([{ id: 'l1', position: 0, config: {} }]),
      } as unknown as DmxLightManager
      const cueLevelVarStore = new Map<string, VariableValue>()
      const groupLevelVarStore = new Map<string, VariableValue>()

      const eventNode: YargEventNode = { id: 'e1', type: 'event', eventType: 'beat' }
      const debuggerNode: LogicNode = {
        id: 'dbg1',
        type: 'logic',
        logicType: 'debugger',
        message: { source: 'literal', value: 'test message' },
        variablesToLog: [],
      }
      const action = minimalAction('action1')
      const definition: YargNodeCueDefinition = {
        id: 'debug-cue',
        name: 'Debug Cue',
        cueType: CueType.Chorus,
        style: 'primary',
        nodes: {
          events: [eventNode],
          actions: [action],
          logic: [debuggerNode],
        },
        connections: [
          { from: 'e1', to: 'dbg1' },
          { from: 'dbg1', to: 'action1' },
        ],
      }
      const compiled = NodeCueCompiler.compileYargCue(definition)
      const engine = new NodeExecutionEngine(
        compiled,
        definition.id,
        mockSequencer,
        mockLightManager,
        cueLevelVarStore,
        groupLevelVarStore,
        new EffectRegistry(),
        definition.variables,
      )
      engine.startExecution(eventNode, createCueData('Strong'))

      expect(addEffect).toHaveBeenCalledTimes(1)
    })
  })
})
