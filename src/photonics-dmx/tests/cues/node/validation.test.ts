import * as fs from 'fs'
import * as path from 'path'
import { NodeCueCompiler } from '../../../cues/node/compiler/NodeCueCompiler'
import {
  validateYargNodeCueFile,
  validateAudioNodeCueFile,
  validateYargEffectFile,
  validateEffectFile,
} from '../../../cues/node/schema/validation'
import { YargNodeCueDefinition, AudioNodeCueDefinition } from '../../../cues/types/nodeCueTypes'
import { CueType } from '../../../cues/types/cueTypes'

describe('Node cue validation', () => {
  it('validates a simple YARG node cue', () => {
    const definition: YargNodeCueDefinition = {
      id: 'test-cue',
      name: 'Test Cue',
      description: '',
      cueType: CueType.Chorus,
      style: 'primary',
      nodes: {
        events: [{ id: 'event-1', type: 'event', eventType: 'beat' }],
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
          },
        ],
      },
      connections: [{ from: 'event-1', to: 'action-1' }],
      layout: {
        nodePositions: {},
      },
    }

    const result = validateYargNodeCueFile({
      version: 1,
      mode: 'yarg',
      group: {
        id: 'group-1',
        name: 'Test Group',
      },
      cues: [definition],
    })

    expect(result.valid).toBe(true)
  })

  it('validates a simple audio node cue', () => {
    const definition: AudioNodeCueDefinition = {
      id: 'audio-cue',
      name: 'Audio Cue',
      cueTypeId: 'custom-audio',
      nodes: {
        events: [
          {
            id: 'event-1',
            type: 'event',
            eventType: 'audio-beat',
            threshold: 0.5,
            triggerMode: 'edge',
          },
        ],
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
              blendMode: { source: 'literal', value: 'add' },
            },
            timing: {
              waitForCondition: { source: 'literal', value: 'none' },
              waitForTime: { source: 'literal', value: 0 },
              duration: { source: 'literal', value: 150 },
              waitUntilCondition: { source: 'literal', value: 'delay' },
              waitUntilTime: { source: 'literal', value: 100 },
              easing: 'sinInOut',
              level: { source: 'literal', value: 1 },
            },
          },
        ],
      },
      connections: [{ from: 'event-1', to: 'action-1' }],
      layout: { nodePositions: {} },
    }

    const result = validateAudioNodeCueFile({
      version: 1,
      mode: 'audio',
      group: { id: 'audio-group', name: 'Audio Group' },
      cues: [definition],
    })

    expect(result.valid).toBe(true)
  })

  it('validates audio cue with audio-hfc event type', () => {
    const definition: AudioNodeCueDefinition = {
      id: 'hfc-cue',
      name: 'HFC Cue',
      cueTypeId: 'custom-audio',
      nodes: {
        events: [
          {
            id: 'event-1',
            type: 'event',
            eventType: 'audio-hfc',
            threshold: 0.4,
            triggerMode: 'level',
          },
        ],
        actions: [],
      },
      connections: [],
      layout: { nodePositions: {} },
    }
    const result = validateAudioNodeCueFile({
      version: 1,
      mode: 'audio',
      group: { id: 'g', name: 'G' },
      cues: [definition],
    })
    expect(result.valid).toBe(true)
  })

  it('validates audio cue with audio-trigger event (full trigger shape)', () => {
    const definition: AudioNodeCueDefinition = {
      id: 'trigger-cue',
      name: 'Trigger Cue',
      cueTypeId: 'custom-audio',
      nodes: {
        events: [
          {
            id: 'event-1',
            type: 'event',
            eventType: 'audio-trigger',
            frequencyRange: { minHz: 120, maxHz: 500 },
            threshold: 0.5,
            hysteresis: 0.05,
            holdMs: 0,
            color: '#60a5fa',
            nodeLabel: 'Audio Trigger',
            outputs: ['enter', 'during', 'exit'],
          },
        ],
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
              blendMode: { source: 'literal', value: 'add' },
            },
            timing: {
              waitForCondition: { source: 'literal', value: 'none' },
              waitForTime: { source: 'literal', value: 0 },
              duration: { source: 'literal', value: 150 },
              waitUntilCondition: { source: 'literal', value: 'none' },
              waitUntilTime: { source: 'literal', value: 0 },
              easing: 'sinInOut',
              level: { source: 'literal', value: 1 },
            },
          },
        ],
      },
      connections: [{ from: 'event-1', to: 'action-1', fromPort: 'enter' }],
      layout: { nodePositions: {} },
    }

    const result = validateAudioNodeCueFile({
      version: 1,
      mode: 'audio',
      group: { id: 'audio-group', name: 'Audio Group' },
      cues: [definition],
    })

    expect(result.valid).toBe(true)
  })

  it('validates audio-trigger with frequency range at 20 Hz minimum (matches schema and runtime clamp)', () => {
    const definition: AudioNodeCueDefinition = {
      id: 'trigger-low-hz',
      name: 'Low Hz',
      cueTypeId: 'custom-audio',
      nodes: {
        events: [
          {
            id: 'event-1',
            type: 'event',
            eventType: 'audio-trigger',
            frequencyRange: { minHz: 20, maxHz: 200 },
            threshold: 0.4,
            color: '#60a5fa',
            nodeLabel: 'Sub',
            outputs: ['enter', 'during', 'exit'],
          },
        ],
        actions: [],
      },
      connections: [],
      layout: { nodePositions: {} },
    }
    const result = validateAudioNodeCueFile({
      version: 1,
      mode: 'audio',
      group: { id: 'g', name: 'G' },
      cues: [definition],
    })
    expect(result.valid).toBe(true)
  })

  it('rejects audio-trigger when minHz is below schema minimum (20 Hz)', () => {
    const definition: AudioNodeCueDefinition = {
      id: 'bad-hz',
      name: 'Bad Hz',
      cueTypeId: 'custom-audio',
      nodes: {
        events: [
          {
            id: 'event-1',
            type: 'event',
            eventType: 'audio-trigger',
            frequencyRange: { minHz: 19, maxHz: 200 },
            threshold: 0.4,
            color: '#60a5fa',
            nodeLabel: 'X',
            outputs: ['enter', 'during', 'exit'],
          },
        ],
        actions: [],
      },
      connections: [],
      layout: { nodePositions: {} },
    }
    const result = validateAudioNodeCueFile({
      version: 1,
      mode: 'audio',
      group: { id: 'g', name: 'G' },
      cues: [definition],
    })
    expect(result.valid).toBe(false)
  })

  it('rejects audio-trigger when hysteresis is out of range', () => {
    const definition: AudioNodeCueDefinition = {
      id: 'bad-hyst',
      name: 'Bad Hyst',
      cueTypeId: 'custom-audio',
      nodes: {
        events: [
          {
            id: 'event-1',
            type: 'event',
            eventType: 'audio-trigger',
            frequencyRange: { minHz: 100, maxHz: 500 },
            threshold: 0.5,
            hysteresis: 1.5,
            color: '#60a5fa',
            nodeLabel: 'T',
            outputs: ['enter', 'during', 'exit'],
          },
        ],
        actions: [],
      },
      connections: [],
      layout: { nodePositions: {} },
    }
    const result = validateAudioNodeCueFile({
      version: 1,
      mode: 'audio',
      group: { id: 'g', name: 'G' },
      cues: [definition],
    })
    expect(result.valid).toBe(false)
  })

  it('rejects audio-trigger event missing required trigger fields', () => {
    const definition: AudioNodeCueDefinition = {
      id: 'bad-trigger-cue',
      name: 'Bad Trigger',
      cueTypeId: 'custom-audio',
      nodes: {
        events: [
          {
            id: 'event-1',
            type: 'event',
            eventType: 'audio-trigger',
            // missing frequencyRange, threshold, color, nodeLabel, outputs
          } as any,
        ],
        actions: [],
      },
      connections: [],
      layout: { nodePositions: {} },
    }

    const result = validateAudioNodeCueFile({
      version: 1,
      mode: 'audio',
      group: { id: 'g', name: 'G' },
      cues: [definition],
    })

    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('validates logic nodes and detects cycles across logic/actions', () => {
    const definition: YargNodeCueDefinition = {
      id: 'logic-validate',
      name: 'Logic Validate',
      cueType: CueType.Chorus,
      style: 'primary',
      nodes: {
        events: [{ id: 'event-1', type: 'event', eventType: 'beat' }],
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
            id: 'logic-1',
            type: 'logic',
            logicType: 'conditional',
            comparator: '>',
            left: { source: 'literal', value: 1 },
            right: { source: 'literal', value: 0 },
          },
        ],
      },
      connections: [
        { from: 'event-1', to: 'logic-1' },
        { from: 'logic-1', to: 'action-1', fromPort: 'true' },
      ],
      layout: { nodePositions: {} },
    }

    const valid = validateYargNodeCueFile({
      version: 1,
      mode: 'yarg',
      group: { id: 'g1', name: 'Group' },
      cues: [definition],
    })
    expect(valid.valid).toBe(true)

    // Cycles that include an action node are allowed (runtime uses visit tracking to break loops)
    const cycleWithAction = validateYargNodeCueFile({
      version: 1,
      mode: 'yarg',
      group: { id: 'g1', name: 'Group' },
      cues: [
        {
          ...definition,
          connections: [
            { from: 'logic-1', to: 'action-1' },
            { from: 'action-1', to: 'logic-1' },
          ],
        },
      ],
    })
    expect(cycleWithAction.valid).toBe(true)
  })

  describe('schema rejections', () => {
    const validCue = (): YargNodeCueDefinition => ({
      id: 'test-cue',
      name: 'Test Cue',
      description: '',
      cueType: CueType.Chorus,
      style: 'primary',
      nodes: {
        events: [{ id: 'event-1', type: 'event', eventType: 'beat' }],
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
          },
        ],
      },
      connections: [{ from: 'event-1', to: 'action-1' }],
      layout: { nodePositions: {} },
    })

    const validFile = () => ({
      version: 1,
      mode: 'yarg',
      group: { id: 'group-1', name: 'Test Group' },
      cues: [validCue()],
    })

    it('rejects cue missing id', () => {
      const cue = validCue()
      const { id: _id, ...cueWithoutId } = cue
      const result = validateYargNodeCueFile({
        ...validFile(),
        cues: [cueWithoutId as YargNodeCueDefinition],
      })
      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    })

    it('rejects cue missing name', () => {
      const cue = validCue()
      const { name: _n, ...cueWithoutName } = cue
      const result = validateYargNodeCueFile({
        ...validFile(),
        cues: [{ ...cueWithoutName, name: undefined } as unknown as YargNodeCueDefinition],
      })
      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    })

    it('rejects invalid effectType on action node', () => {
      const cue = validCue()
      const action = cue.nodes.actions[0]
      const invalidCue = {
        ...cue,
        nodes: {
          ...cue.nodes,
          actions: [{ ...action, effectType: 'invalid-effect' as any }],
        },
      }
      const result = validateYargNodeCueFile({ ...validFile(), cues: [invalidCue] })
      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    })

    it('rejects invalid logicType on logic node', () => {
      const cue = validCue()
      cue.nodes.logic = [
        {
          id: 'logic-1',
          type: 'logic',
          logicType: 'invalid-logic' as any,
          operator: 'add',
          left: { source: 'literal', value: 1 },
          right: { source: 'literal', value: 2 },
        } as any,
      ]
      cue.connections = [
        { from: 'event-1', to: 'logic-1' },
        { from: 'logic-1', to: 'action-1' },
      ]
      const result = validateYargNodeCueFile({ ...validFile(), cues: [cue] })
      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    })

    it('rejects invalid comparator on conditional node', () => {
      const cue = validCue()
      cue.nodes.logic = [
        {
          id: 'logic-1',
          type: 'logic',
          logicType: 'conditional',
          comparator: 'invalid-comp' as any,
          left: { source: 'literal', value: 1 },
          right: { source: 'literal', value: 0 },
        } as any,
      ]
      cue.connections = [
        { from: 'event-1', to: 'logic-1' },
        { from: 'logic-1', to: 'action-1', fromPort: 'true' },
      ]
      const result = validateYargNodeCueFile({ ...validFile(), cues: [cue] })
      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    })

    it('rejects invalid operator on math node', () => {
      const cue = validCue()
      cue.nodes.logic = [
        {
          id: 'logic-1',
          type: 'logic',
          logicType: 'math',
          operator: 'invalid-op' as any,
          left: { source: 'literal', value: 1 },
          right: { source: 'literal', value: 2 },
        } as any,
      ]
      cue.connections = [
        { from: 'event-1', to: 'logic-1' },
        { from: 'logic-1', to: 'action-1' },
      ]
      const result = validateYargNodeCueFile({ ...validFile(), cues: [cue] })
      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    })
  })

  describe('node variety coverage', () => {
    it('validates cue with effectRaiser and effectListener nodes', () => {
      const definition: YargNodeCueDefinition = {
        id: 'effect-cue',
        name: 'Effect Cue',
        cueType: CueType.Chorus,
        style: 'primary',
        nodes: {
          events: [{ id: 'event-1', type: 'event', eventType: 'beat' }],
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
            },
          ],
          effectRaisers: [{ id: 'raiser-1', type: 'effect-raiser', effectId: 'eff-1' }],
          effectListeners: [{ id: 'listener-1', type: 'effect-listener' }],
        },
        connections: [
          { from: 'event-1', to: 'action-1' },
          { from: 'listener-1', to: 'action-1' },
        ],
        layout: { nodePositions: {} },
      }
      const result = validateYargNodeCueFile({
        version: 1,
        mode: 'yarg',
        group: { id: 'g1', name: 'Group' },
        cues: [definition],
      })
      expect(result.valid).toBe(true)
    })

    it('validates cue with eventRaiser and eventListener nodes', () => {
      const definition: YargNodeCueDefinition = {
        id: 'event-cue',
        name: 'Event Cue',
        cueType: CueType.Chorus,
        style: 'primary',
        nodes: {
          events: [{ id: 'event-1', type: 'event', eventType: 'beat' }],
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
            },
          ],
          eventRaisers: [{ id: 'raiser-1', type: 'event-raiser', eventName: 'custom' }],
          eventListeners: [{ id: 'listener-1', type: 'event-listener', eventName: 'custom' }],
        },
        connections: [
          { from: 'event-1', to: 'action-1' },
          { from: 'listener-1', to: 'action-1' },
        ],
        events: [{ name: 'custom', description: '' }],
        layout: { nodePositions: {} },
      }
      const result = validateYargNodeCueFile({
        version: 1,
        mode: 'yarg',
        group: { id: 'g1', name: 'Group' },
        cues: [definition],
      })
      expect(result.valid).toBe(true)
    })

    it('validates cue containing array-manipulation logic node types', () => {
      const definition: YargNodeCueDefinition = {
        id: 'array-cue',
        name: 'Array Cue',
        cueType: CueType.Chorus,
        style: 'primary',
        nodes: {
          events: [{ id: 'event-1', type: 'event', eventType: 'beat' }],
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
            },
          ],
          logic: [
            {
              id: 'rev-1',
              type: 'logic',
              logicType: 'reverse-lights',
              sourceVariable: 'arr',
              assignTo: 'rev',
            },
            {
              id: 'concat-1',
              type: 'logic',
              logicType: 'concat-lights',
              sourceVariables: ['a', 'b'],
              assignTo: 'c',
            },
            {
              id: 'len-1',
              type: 'logic',
              logicType: 'array-length',
              sourceVariable: 'arr',
              assignTo: 'len',
            },
            {
              id: 'shuf-1',
              type: 'logic',
              logicType: 'shuffle-lights',
              sourceVariable: 'arr',
              assignTo: 'shuf',
            },
            {
              id: 'rand-1',
              type: 'logic',
              logicType: 'random',
              mode: 'random-integer',
              min: { source: 'literal', value: 0 },
              max: { source: 'literal', value: 10 },
              assignTo: 'r',
            },
            {
              id: 'delay-1',
              type: 'logic',
              logicType: 'delay',
              delayTime: { source: 'literal', value: 0 },
            },
            {
              id: 'dbg-1',
              type: 'logic',
              logicType: 'debugger',
              message: { source: 'literal', value: 'ok' },
              variablesToLog: [],
            },
          ],
        },
        connections: [
          { from: 'event-1', to: 'rev-1' },
          { from: 'rev-1', to: 'action-1' },
        ],
        variables: [
          { name: 'arr', type: 'light-array', scope: 'cue', initialValue: [] },
          { name: 'rev', type: 'light-array', scope: 'cue', initialValue: [] },
          { name: 'a', type: 'light-array', scope: 'cue', initialValue: [] },
          { name: 'b', type: 'light-array', scope: 'cue', initialValue: [] },
          { name: 'c', type: 'light-array', scope: 'cue', initialValue: [] },
          { name: 'len', type: 'number', scope: 'cue', initialValue: 0 },
          { name: 'shuf', type: 'light-array', scope: 'cue', initialValue: [] },
          { name: 'r', type: 'number', scope: 'cue', initialValue: 0 },
        ],
        layout: { nodePositions: {} },
      }
      const result = validateYargNodeCueFile({
        version: 1,
        mode: 'yarg',
        group: { id: 'g1', name: 'Group' },
        cues: [definition],
      })
      expect(result.valid).toBe(true)
    })
  })

  it('validates bundled audio-70s-light-organs.json', () => {
    const filePath = path.join(
      __dirname,
      '../../../../../resources/defaults/node-data/cues/audio/audio-70s-light-organs.json',
    )
    const raw = fs.readFileSync(filePath, 'utf8')
    const result = validateAudioNodeCueFile(JSON.parse(raw))
    expect(result.valid).toBe(true)
    if (result.valid) {
      for (const cue of result.data.cues) {
        expect(() => NodeCueCompiler.compileAudioCue(cue)).not.toThrow()
      }
    }
  })

  describe('Effect file validation', () => {
    it('validates a minimal YARG effect file', () => {
      const result = validateYargEffectFile({
        version: 1,
        mode: 'yarg',
        group: { id: 'effect-group', name: 'Effect Group' },
        effects: [
          {
            id: 'eff-1',
            name: 'Test Effect',
            mode: 'yarg',
            nodes: {
              events: [{ id: 'e1', type: 'event', eventType: 'beat' }],
              actions: [],
            },
            connections: [],
          },
        ],
      })
      expect(result.valid).toBe(true)
      expect(result.data?.effects).toHaveLength(1)
    })

    it('rejects duplicate effect ids (semantic)', () => {
      const result = validateYargEffectFile({
        version: 1,
        mode: 'yarg',
        group: { id: 'g', name: 'G' },
        effects: [
          {
            id: 'dup',
            name: 'First',
            mode: 'yarg',
            nodes: { events: [], actions: [] },
            connections: [],
          },
          {
            id: 'dup',
            name: 'Second',
            mode: 'yarg',
            nodes: { events: [], actions: [] },
            connections: [],
          },
        ],
      })
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('Duplicate effect id'))).toBe(true)
    })

    it('validateEffectFile dispatches by mode', () => {
      expect(
        validateEffectFile({ version: 1, mode: 'yarg', group: { id: 'a', name: 'A' }, effects: [] })
          .valid,
      ).toBe(false)
      const validYarg = validateEffectFile({
        version: 1,
        mode: 'yarg',
        group: { id: 'a', name: 'A' },
        effects: [
          {
            id: 'e1',
            name: 'E',
            mode: 'yarg',
            nodes: { events: [], actions: [] },
            connections: [],
          },
        ],
      })
      expect(validYarg.valid).toBe(true)
      expect(validYarg.mode).toBe('yarg')
    })
  })
})
