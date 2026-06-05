import * as fs from 'fs'
import * as path from 'path'
import { jest } from '@jest/globals'
import { NodeCueCompiler } from '../../../cues/node/compiler/NodeCueCompiler'
import {
  validateYargNodeCueFile,
  validateAudioNodeCueFile,
  validateYargEffectFile,
  validateAudioEffectFile,
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
      kind: 'lighting',
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
              easing: { source: 'literal', value: 'sinInOut' },
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
      kind: 'lighting',
      cueTypeId: 'custom-audio',
      nodes: {
        events: [
          {
            id: 'event-1',
            type: 'event',
            eventType: 'beat',
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
              easing: { source: 'literal', value: 'sinInOut' },
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

  it("normalizes legacy eventType 'audio-beat' to 'beat' and warns once per file", () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const file = {
      version: 1,
      mode: 'audio' as const,
      group: { id: 'legacy-audio-group', name: 'Legacy' },
      cues: [
        {
          id: 'legacy-cue',
          name: 'Legacy',
          kind: 'lighting' as const,
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
                  waitUntilCondition: { source: 'literal', value: 'none' },
                  waitUntilTime: { source: 'literal', value: 0 },
                  easing: { source: 'literal', value: 'sinInOut' },
                  level: { source: 'literal', value: 1 },
                },
              },
            ],
          },
          connections: [{ from: 'event-1', to: 'action-1' }],
          layout: { nodePositions: {} },
        },
      ],
    }
    const result = validateAudioNodeCueFile(file)
    expect(result.valid).toBe(true)
    if (!result.valid || !result.data) {
      throw new Error('expected valid result with data')
    }
    const ev = result.data.cues[0].nodes.events[0]
    expect(ev.eventType).toBe('beat')
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("deprecated 'audio-beat'"))
    warnSpy.mockRestore()
  })

  it('validates audio node cue with cue-started event type', () => {
    const definition: AudioNodeCueDefinition = {
      id: 'audio-cue-started',
      name: 'Cue Started Setup',
      kind: 'lighting',
      cueTypeId: 'custom-audio',
      nodes: {
        events: [
          {
            id: 'ev-start',
            type: 'event',
            eventType: 'cue-started',
            threshold: 0.5,
            triggerMode: 'edge',
          },
          {
            id: 'ev-beat',
            type: 'event',
            eventType: 'beat',
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
              easing: { source: 'literal', value: 'linear' },
              level: { source: 'literal', value: 1 },
            },
          },
        ],
      },
      connections: [
        { from: 'ev-start', to: 'action-1' },
        { from: 'ev-beat', to: 'action-1' },
      ],
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

  it('validates audio node cue with cue-called event type', () => {
    const definition: AudioNodeCueDefinition = {
      id: 'audio-cue-called',
      name: 'Cue Called Sustain',
      kind: 'motion',
      nodes: {
        events: [
          {
            id: 'ev-called',
            type: 'event',
            eventType: 'cue-called',
            threshold: 0.5,
            triggerMode: 'edge',
          },
        ],
        actions: [
          {
            id: 'action-pos',
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
              waitUntilCondition: { source: 'literal', value: 'beat' },
              waitUntilTime: { source: 'literal', value: 0 },
              easing: { source: 'literal', value: 'linear' },
              level: { source: 'literal', value: 1 },
            },
          },
        ],
      },
      connections: [{ from: 'ev-called', to: 'action-pos' }],
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

  it('validates audio node cue with style primary and secondary', () => {
    const primaryDef: AudioNodeCueDefinition = {
      id: 'audio-primary-style',
      name: 'Primary',
      kind: 'lighting',
      cueTypeId: 'custom-primary',
      style: 'primary',
      nodes: {
        events: [
          {
            id: 'event-1',
            type: 'event',
            eventType: 'beat',
            threshold: 0.5,
            triggerMode: 'edge',
          },
        ],
        actions: [],
      },
      connections: [],
      layout: { nodePositions: {} },
    }
    const secondaryDef: AudioNodeCueDefinition = {
      id: 'audio-secondary-style',
      name: 'Secondary',
      kind: 'lighting',
      cueTypeId: 'custom-secondary',
      style: 'secondary',
      nodes: {
        events: [
          {
            id: 'event-1',
            type: 'event',
            eventType: 'beat',
            threshold: 0.5,
            triggerMode: 'edge',
          },
        ],
        actions: [],
      },
      connections: [],
      layout: { nodePositions: {} },
    }
    const r1 = validateAudioNodeCueFile({
      version: 1,
      mode: 'audio',
      group: { id: 'g', name: 'G' },
      cues: [primaryDef],
    })
    const r2 = validateAudioNodeCueFile({
      version: 1,
      mode: 'audio',
      group: { id: 'g', name: 'G' },
      cues: [secondaryDef],
    })
    expect(r1.valid).toBe(true)
    expect(r2.valid).toBe(true)
  })

  it('validates audio node cue with style strobe', () => {
    const strobeDef: AudioNodeCueDefinition = {
      id: 'audio-strobe-style',
      name: 'Strobe',
      kind: 'lighting',
      cueTypeId: 'custom-strobe',
      style: 'strobe',
      nodes: {
        events: [
          {
            id: 'event-1',
            type: 'event',
            eventType: 'beat',
            threshold: 0.5,
            triggerMode: 'edge',
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
      cues: [strobeDef],
    })
    expect(result.valid).toBe(true)
  })

  it('validates audio cue with audio-hfc event type', () => {
    const definition: AudioNodeCueDefinition = {
      id: 'hfc-cue',
      name: 'HFC Cue',
      kind: 'lighting',
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
      kind: 'lighting',
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
              easing: { source: 'literal', value: 'sinInOut' },
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
      kind: 'lighting',
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
      kind: 'lighting',
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
      kind: 'lighting',
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
      kind: 'lighting',
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
      kind: 'lighting',
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
              easing: { source: 'literal', value: 'sinInOut' },
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
      kind: 'lighting',
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
              easing: { source: 'literal', value: 'sinInOut' },
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

    describe('effect raiser and effect listener', () => {
      it('rejects effect raiser with wrong type discriminator', () => {
        const cue = validCue()
        ;(cue.nodes as { effectRaisers?: unknown[] }).effectRaisers = [
          { id: 'r1', type: 'effect-raisers', effectId: 'eff' },
        ]
        const result = validateYargNodeCueFile({ ...validFile(), cues: [cue] })
        expect(result.valid).toBe(false)
        expect(result.errors.length).toBeGreaterThan(0)
      })

      it('rejects effect raiser with unknown additional property', () => {
        const cue = validCue()
        ;(cue.nodes as { effectRaisers?: unknown[] }).effectRaisers = [
          {
            id: 'r1',
            type: 'effect-raiser',
            effectId: 'eff',
            unknownProp: 'x',
          },
        ]
        const result = validateYargNodeCueFile({ ...validFile(), cues: [cue] })
        expect(result.valid).toBe(false)
        expect(result.errors.length).toBeGreaterThan(0)
      })

      it('rejects effect raiser missing effectId', () => {
        const cue = validCue()
        ;(cue.nodes as { effectRaisers?: unknown[] }).effectRaisers = [
          { id: 'r1', type: 'effect-raiser' },
        ]
        const result = validateYargNodeCueFile({ ...validFile(), cues: [cue] })
        expect(result.valid).toBe(false)
        expect(result.errors.length).toBeGreaterThan(0)
      })

      it('rejects effect raiser with non-ValueSource parameterValues entry', () => {
        const cue = validCue()
        ;(cue.nodes as { effectRaisers?: unknown[] }).effectRaisers = [
          {
            id: 'r1',
            type: 'effect-raiser',
            effectId: 'eff',
            parameterValues: { p: 42 },
          },
        ]
        const result = validateYargNodeCueFile({ ...validFile(), cues: [cue] })
        expect(result.valid).toBe(false)
        expect(result.errors.length).toBeGreaterThan(0)
      })

      it('rejects effect listener with unknown additional property', () => {
        const cue = validCue()
        ;(cue.nodes as { effectListeners?: unknown[] }).effectListeners = [
          { id: 'l1', type: 'effect-listener', spurious: true },
        ]
        const result = validateYargNodeCueFile({ ...validFile(), cues: [cue] })
        expect(result.valid).toBe(false)
        expect(result.errors.length).toBeGreaterThan(0)
      })
    })
  })

  describe('node variety coverage', () => {
    it('validates cue with effectRaiser and effectListener nodes', () => {
      const definition: YargNodeCueDefinition = {
        id: 'effect-cue',
        name: 'Effect Cue',
        kind: 'lighting',
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
                easing: { source: 'literal', value: 'sinInOut' },
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
        kind: 'lighting',
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
                easing: { source: 'literal', value: 'sinInOut' },
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
        kind: 'lighting',
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
                easing: { source: 'literal', value: 'sinInOut' },
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

  it('validates bundled audio-stagekit.json', () => {
    const filePath = path.join(
      __dirname,
      '../../../../../resources/defaults/node-data/cues/audio/audio-stagekit.json',
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

  it('validates bundled audio-disco.json', () => {
    const filePath = path.join(
      __dirname,
      '../../../../../resources/defaults/node-data/cues/audio/audio-disco.json',
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

  it('validates bundled audio-rock.json', () => {
    const filePath = path.join(
      __dirname,
      '../../../../../resources/defaults/node-data/cues/audio/audio-rock.json',
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

  it('validates bundled audio-motion-default.json', () => {
    const filePath = path.join(
      __dirname,
      '../../../../../resources/defaults/node-data/cues/audio/audio-motion-default.json',
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

  it('validates bundled yarg-stagekit-negative-space.json', () => {
    const filePath = path.join(
      __dirname,
      '../../../../../resources/defaults/node-data/cues/yarg/yarg-stagekit-negative-space.json',
    )
    const raw = fs.readFileSync(filePath, 'utf8')
    const result = validateYargNodeCueFile(JSON.parse(raw))
    expect(result.valid).toBe(true)
    if (result.valid) {
      for (const cue of result.data.cues) {
        expect(() => NodeCueCompiler.compileYargCue(cue)).not.toThrow()
      }
    }
  })

  for (const fileName of ['yarg-fade.json']) {
    it(`validates bundled ${fileName} (compiles, caps brightness at high, no strobes)`, () => {
      const filePath = path.join(
        __dirname,
        `../../../../../resources/defaults/node-data/cues/yarg/${fileName}`,
      )
      const raw = fs.readFileSync(filePath, 'utf8')
      const result = validateYargNodeCueFile(JSON.parse(raw))
      expect(result.valid).toBe(true)
      if (result.valid) {
        for (const cue of result.data.cues) {
          expect(() => NodeCueCompiler.compileYargCue(cue)).not.toThrow()
        }
      }
      // max/linear brightness is reserved for strobes; these libraries must not use it
      expect(raw).not.toMatch(
        /"brightness":\s*\{\s*"source":\s*"literal",\s*"value":\s*"(max|linear)"\s*\}/,
      )
      expect(raw).not.toContain('Strobe')
    })
  }

  it('audio stagekit rotation effect raisers are persistent (seamless loop at wrap)', () => {
    const filePath = path.join(
      __dirname,
      '../../../../../resources/defaults/node-data/cues/audio/audio-stagekit.json',
    )
    const raw = fs.readFileSync(filePath, 'utf8')
    const data = JSON.parse(raw) as {
      cues: Array<{
        id: string
        nodes?: {
          effectRaisers?: Array<{
            id: string
            effectId?: string
            isPersistent?: boolean
          }>
        }
      }>
    }
    const cueIds = [
      'cue-sk-audio-cool-auto',
      'cue-sk-audio-warm-auto',
      'cue-sk-audio-harmony',
      'cue-sk-audio-searchlights',
      'cue-sk-audio-score',
      'cue-sk-audio-sweep',
    ]
    for (const cueId of cueIds) {
      const cue = data.cues.find((c) => c.id === cueId)
      expect(cue).toBeDefined()
      const raisers = cue!.nodes?.effectRaisers ?? []
      for (const r of raisers) {
        if (
          r.effectId === 'effect-audio-rotation-cw' ||
          r.effectId === 'effect-audio-rotation-ccw' ||
          r.effectId === 'effect-audio-diagonal-sweep' ||
          r.effectId === 'effect-audio-sweep-color'
        ) {
          expect(r.isPersistent).toBe(true)
        }
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

    it('validates a minimal Audio effect file', () => {
      const result = validateAudioEffectFile({
        version: 1,
        mode: 'audio',
        group: { id: 'effect-group-audio', name: 'Audio Effect Group' },
        effects: [
          {
            id: 'eff-audio-1',
            name: 'Test Audio Effect',
            mode: 'audio',
            nodes: {
              events: [
                {
                  id: 'e1',
                  type: 'event',
                  eventType: 'beat',
                  triggerMode: 'edge',
                },
              ],
              actions: [],
            },
            connections: [],
          },
        ],
      })
      expect(result.valid).toBe(true)
      expect(result.data?.effects).toHaveLength(1)
      expect(result.mode).toBe('audio')
    })

    it('rejects duplicate effect ids for Audio (semantic)', () => {
      const result = validateAudioEffectFile({
        version: 1,
        mode: 'audio',
        group: { id: 'g', name: 'G' },
        effects: [
          {
            id: 'dup',
            name: 'First',
            mode: 'audio',
            nodes: { events: [], actions: [] },
            connections: [],
          },
          {
            id: 'dup',
            name: 'Second',
            mode: 'audio',
            nodes: { events: [], actions: [] },
            connections: [],
          },
        ],
      })
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('Duplicate effect id'))).toBe(true)
    })

    it('rejects Audio effect file when effects array is empty (schema)', () => {
      const result = validateAudioEffectFile({
        version: 1,
        mode: 'audio',
        group: { id: 'g', name: 'G' },
        effects: [],
      })
      expect(result.valid).toBe(false)
    })

    it('rejects Audio effect when an effect has wrong mode (schema)', () => {
      const result = validateAudioEffectFile({
        version: 1,
        mode: 'audio',
        group: { id: 'g', name: 'G' },
        effects: [
          {
            id: 'e1',
            name: 'Wrong mode',
            mode: 'yarg',
            nodes: { events: [], actions: [] },
            connections: [],
          },
        ],
      })
      expect(result.valid).toBe(false)
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

      const validAudio = validateEffectFile({
        version: 1,
        mode: 'audio',
        group: { id: 'ag', name: 'AG' },
        effects: [
          {
            id: 'ae1',
            name: 'AE',
            mode: 'audio',
            nodes: { events: [], actions: [] },
            connections: [],
          },
        ],
      })
      expect(validAudio.valid).toBe(true)
      expect(validAudio.mode).toBe('audio')
    })

    it('validates bundled audio-core-effects.json', () => {
      const filePath = path.join(
        __dirname,
        '../../../../../resources/defaults/node-data/effects/audio/audio-core-effects.json',
      )
      const raw = fs.readFileSync(filePath, 'utf8')
      const result = validateEffectFile(JSON.parse(raw))
      expect(result.valid).toBe(true)
      expect(result.mode).toBe('audio')
    })

    it('validates bundled audio-stagekit-effects.json', () => {
      const filePath = path.join(
        __dirname,
        '../../../../../resources/defaults/node-data/effects/audio/audio-stagekit-effects.json',
      )
      const raw = fs.readFileSync(filePath, 'utf8')
      const result = validateEffectFile(JSON.parse(raw))
      expect(result.valid).toBe(true)
      expect(result.mode).toBe('audio')
    })

    it('validates bundled yarg-fade-effects.json', () => {
      const filePath = path.join(
        __dirname,
        '../../../../../resources/defaults/node-data/effects/yarg/yarg-fade-effects.json',
      )
      const raw = fs.readFileSync(filePath, 'utf8')
      const result = validateEffectFile(JSON.parse(raw))
      expect(result.valid).toBe(true)
      expect(result.mode).toBe('yarg')
    })
  })
})
