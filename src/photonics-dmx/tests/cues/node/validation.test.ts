import * as fs from 'fs'
import * as path from 'path'
import { describe, expect, it, jest } from '@jest/globals'
import { NodeCueCompiler } from '../../../cues/node/compiler/NodeCueCompiler'
import {
  validateYargNodeCueFile,
  validateAudioNodeCueFile,
  validateRb3NodeCueFile,
  validateNodeCueFile,
  validateYargEffectFile,
  validateAudioEffectFile,
  validateEffectFile,
} from '../../../cues/node/schema/validation'
import { NetNodeCueDefinition, AudioNodeCueDefinition } from '../../../cues/types/nodeCueTypes'
import { CueType } from '../../../cues/types/cueTypes'
import type { ActionNode, AudioEventNodeUnion } from '../../../cues/types/nodeCueTypes'

const setColorAction = (): ActionNode => ({
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
})

const audioCueFile = (event: Record<string, unknown>, fields: Record<string, unknown> = {}) => ({
  version: 1,
  mode: 'audio',
  group: { id: 'g', name: 'G' },
  cues: [
    {
      id: 'audio-cue',
      name: 'Audio Cue',
      kind: 'lighting',
      cueTypeId: 'custom-audio',
      ...fields,
      nodes: { events: [event], actions: [] },
      connections: [],
      layout: { nodePositions: {} },
    },
  ],
})

const readBundled = (relativePath: string): string =>
  fs.readFileSync(
    path.join(__dirname, '../../../../../resources/defaults/node-data', relativePath),
    'utf8',
  )

describe('Node cue validation', () => {
  it('validates a simple YARG node cue', () => {
    const definition: NetNodeCueDefinition = {
      id: 'test-cue',
      name: 'Test Cue',
      description: '',
      kind: 'lighting',
      cueType: CueType.Chorus,
      style: 'primary',
      nodes: {
        events: [{ id: 'event-1', type: 'event', eventType: 'beat' }],
        actions: [setColorAction()],
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

  describe('logic node schemas', () => {
    const isValidLogic = (
      logic: Record<string, unknown>,
      context: {
        cueType?: CueType
        eventType?: 'cue-called' | 'cue-started'
        fromPort?: string
      } = {},
    ): boolean => {
      const { cueType = CueType.Chorus, eventType = 'cue-called', fromPort } = context
      const cue = {
        id: 'logic-cue',
        name: 'Logic Cue',
        description: '',
        kind: 'lighting',
        cueType,
        style: 'primary',
        nodes: {
          events: [{ id: 'event-1', type: 'event', eventType }],
          actions: [setColorAction()],
          logic: [logic as never],
        },
        connections: [
          { from: 'event-1', to: 'logic-1' },
          fromPort
            ? { from: 'logic-1', to: 'action-1', fromPort }
            : { from: 'logic-1', to: 'action-1' },
        ],
        layout: { nodePositions: {} },
      } as NetNodeCueDefinition
      return validateYargNodeCueFile({
        version: 1,
        mode: 'yarg',
        group: { id: 'g1', name: 'Group' },
        cues: [cue],
      }).valid
    }

    const validPulse = {
      id: 'logic-1',
      type: 'logic',
      logicType: 'pulse',
      interval: { source: 'literal', value: 500 },
      anchorVar: 'anchor',
      assignTo: 'idx',
      assignPhase: 'phase',
    }
    const { anchorVar: _omit, ...pulseWithoutAnchor } = validPulse
    const validRandom = {
      id: 'logic-1',
      type: 'logic',
      logicType: 'random',
      mode: 'random-integer',
      assignTo: 'a',
      rolls: [
        {
          mode: 'random-integer',
          assignTo: 'x',
          min: { source: 'literal', value: 0 },
          max: { source: 'literal', value: 5 },
        },
        { mode: 'random-choice', assignTo: 'pick', choices: ['a', 'b'] },
      ],
    }

    it.each([
      ['accepts a pulse node in a YARG cue', validPulse, true],
      ['rejects a pulse node missing its required anchorVar', pulseWithoutAnchor, false],
      [
        'accepts a multi-set variable node alongside its required single-var envelope',
        {
          id: 'logic-1',
          type: 'logic',
          logicType: 'variable',
          mode: 'set',
          varName: 'a',
          valueType: 'number',
          assignments: [
            { varName: 'a', valueType: 'number', value: { source: 'literal', value: 1 } },
            { varName: 'b', valueType: 'string', value: { source: 'literal', value: 'x' } },
          ],
        },
        true,
      ],
      [
        'accepts a multi-roll random node alongside its required single-roll envelope',
        validRandom,
        true,
      ],
      [
        'rejects a random roll missing its assignTo',
        {
          ...validRandom,
          rolls: [{ mode: 'random-integer', min: { source: 'literal', value: 0 } }],
        },
        false,
      ],
    ])('%s', (_name, logic, valid) => {
      expect(isValidLogic(logic)).toBe(valid)
    })

    it.each([
      [
        'accepts a tempo node with only its required beat output',
        { id: 'logic-1', type: 'logic', logicType: 'tempo', assignBeatMs: 'beat_ms' },
        true,
      ],
      [
        'accepts a tempo node with every optional field populated',
        {
          id: 'logic-1',
          type: 'logic',
          logicType: 'tempo',
          assignBeatMs: 'beat_ms',
          assignBarMs: 'bar_ms',
          assignPhraseMs: 'phrase_ms',
          beatsPerBar: { source: 'literal', value: 4 },
          barsPerPhrase: { source: 'literal', value: 2 },
          minBeatMs: { source: 'literal', value: 250 },
          maxBeatMs: { source: 'literal', value: 1000 },
          fallbackBeatMs: { source: 'literal', value: 461 },
          assignCycles: 'wave_cycles',
          cycleBands: [110, 150],
          cycleValues: [2, 3, 5],
        },
        true,
      ],
      [
        'rejects a tempo node missing its required assignBeatMs',
        { id: 'logic-1', type: 'logic', logicType: 'tempo' },
        false,
      ],
    ])('%s', (_name, logic, valid) => {
      expect(isValidLogic(logic, { eventType: 'cue-started' })).toBe(valid)
    })

    it.each([
      [
        'accepts an indexed-variable set with a value',
        {
          id: 'logic-1',
          type: 'logic',
          logicType: 'indexed-variable',
          mode: 'set',
          varName: 'lit',
          index: { source: 'literal', value: 0 },
          valueType: 'number',
          value: { source: 'literal', value: 1 },
        },
        true,
      ],
      [
        'accepts an indexed-variable get with assignTo',
        {
          id: 'logic-1',
          type: 'logic',
          logicType: 'indexed-variable',
          mode: 'get',
          varName: 'lit',
          index: { source: 'variable', name: 'i' },
          valueType: 'number',
          assignTo: 'out',
        },
        true,
      ],
      [
        'rejects an indexed-variable missing its required index',
        {
          id: 'logic-1',
          type: 'logic',
          logicType: 'indexed-variable',
          mode: 'set',
          varName: 'lit',
          valueType: 'number',
        },
        false,
      ],
      [
        'rejects an indexed-variable missing its required valueType',
        {
          id: 'logic-1',
          type: 'logic',
          logicType: 'indexed-variable',
          mode: 'get',
          varName: 'lit',
          index: { source: 'literal', value: 0 },
          assignTo: 'out',
        },
        false,
      ],
      [
        'accepts a led-changed node with only its required assignIndex',
        { id: 'logic-1', type: 'logic', logicType: 'led-changed', assignIndex: 'i' },
        true,
      ],
      [
        'accepts a led-changed node with the optional colour and edge outputs',
        {
          id: 'logic-1',
          type: 'logic',
          logicType: 'led-changed',
          assignIndex: 'i',
          assignColor: 'c',
          assignEdge: 'e',
        },
        true,
      ],
      [
        'rejects a led-changed node missing its required assignIndex',
        { id: 'logic-1', type: 'logic', logicType: 'led-changed' },
        false,
      ],
    ])('%s', (_name, logic, valid) => {
      expect(isValidLogic(logic, { cueType: CueType.RB3, fromPort: 'each' })).toBe(valid)
    })
  })

  it('validates a simple RB3 node cue (YARG-shaped, mode rb3)', () => {
    const definition: NetNodeCueDefinition = {
      id: 'rb3-cue',
      name: 'RB3 Cue',
      kind: 'lighting',
      cueType: CueType.Strobe_Fast,
      style: 'secondary',
      nodes: {
        events: [{ id: 'event-1', type: 'event', eventType: 'cue-called' }],
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
              brightness: { source: 'literal', value: 'max' },
            },
            timing: {
              waitForCondition: { source: 'literal', value: 'none' },
              waitForTime: { source: 'literal', value: 0 },
              duration: { source: 'literal', value: 200 },
              waitUntilCondition: { source: 'literal', value: 'none' },
              waitUntilTime: { source: 'literal', value: 0 },
            },
          },
        ],
      },
      connections: [{ from: 'event-1', to: 'action-1' }],
      layout: { nodePositions: {} },
    }

    const file = {
      version: 1,
      mode: 'rb3',
      group: { id: 'rb3-group', name: 'RB3' },
      cues: [definition],
    }
    const result = validateRb3NodeCueFile(file)
    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.mode).toBe('rb3')
    }
    // validateNodeCueFile dispatches on the mode discriminant to the rb3 validator.
    expect(validateNodeCueFile(file).valid).toBe(true)
  })

  it('accepts a StageKit LED event node and rejects an audio-shaped one in an RB3 cue', () => {
    const makeFile = (event: Record<string, unknown>) => ({
      version: 1,
      mode: 'rb3',
      group: { id: 'rb3-group', name: 'RB3' },
      cues: [
        {
          id: 'rb3-cue',
          name: 'RB3 Cue',
          kind: 'lighting',
          cueType: CueType.RB3,
          style: 'primary',
          nodes: {
            events: [event],
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
                  brightness: { source: 'literal', value: 'medium' },
                },
                timing: {
                  waitForCondition: { source: 'literal', value: 'none' },
                  waitForTime: { source: 'literal', value: 0 },
                  duration: { source: 'literal', value: 200 },
                  waitUntilCondition: { source: 'literal', value: 'none' },
                  waitUntilTime: { source: 'literal', value: 0 },
                },
              },
            ],
          },
          connections: [{ from: 'event-1', to: 'action-1' }],
          layout: { nodePositions: {} },
        },
      ],
    })

    // A YARG-shaped LED edge event validates.
    expect(
      validateRb3NodeCueFile(makeFile({ id: 'event-1', type: 'event', eventType: 'led-3' })).valid,
    ).toBe(true)

    // The audio node shape (extra threshold/triggerMode props) is rejected by the rb3 schema.
    expect(
      validateRb3NodeCueFile(
        makeFile({
          id: 'event-1',
          type: 'event',
          eventType: 'led-3',
          threshold: 0.5,
          triggerMode: 'edge',
        }),
      ).valid,
    ).toBe(false)
  })

  it('rejects an RB3 file whose mode is not "rb3"', () => {
    const result = validateRb3NodeCueFile({
      version: 1,
      mode: 'yarg',
      group: { id: 'g', name: 'G' },
      cues: [],
    })
    expect(result.valid).toBe(false)
  })

  it('reports the three-mode error for an unknown mode', () => {
    const result = validateNodeCueFile({
      version: 1,
      mode: 'bogus',
      group: { id: 'g', name: 'G' },
      cues: [],
    })
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('mode must be "yarg", "audio", or "rb3"')
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

  it("migrates a removed 'half-beat' event and wait condition to 'beat' and warns once per file", () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    // Untyped on purpose: 'half-beat' is legacy data no longer accepted by NetNodeCueDefinition's
    // event/wait-condition types, which is exactly the file this migration exists to still load.
    const definition = {
      id: 'legacy-half-beat-cue',
      name: 'Legacy Half Beat',
      description: '',
      kind: 'lighting',
      cueType: CueType.Chorus,
      style: 'primary',
      nodes: {
        events: [{ id: 'event-1', type: 'event', eventType: 'half-beat' }],
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
              waitForCondition: { source: 'literal', value: 'half-beat' },
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
    }

    const result = validateYargNodeCueFile({
      version: 1,
      mode: 'yarg',
      group: { id: 'legacy-half-beat-group', name: 'Legacy' },
      cues: [definition],
    })

    expect(result.valid).toBe(true)
    if (!result.valid || !result.data) {
      throw new Error('expected valid result with data')
    }
    expect(result.data.cues[0].nodes.events[0].eventType).toBe('beat')
    const action = result.data.cues[0].nodes.actions[0] as {
      timing: { waitForCondition: { value: unknown } }
    }
    expect(action.timing.waitForCondition.value).toBe('beat')
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("deprecated 'half-beat'"))
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

  it.each([
    ['primary', 'Primary'],
    ['secondary', 'Secondary'],
    ['strobe', 'Strobe'],
  ])('validates audio node cue with style %s', (style, name) => {
    const file = audioCueFile(
      { id: 'event-1', type: 'event', eventType: 'beat', threshold: 0.5, triggerMode: 'edge' },
      { id: `audio-${style}-style`, name, cueTypeId: `custom-${style}`, style },
    )
    expect(validateAudioNodeCueFile(file).valid).toBe(true)
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

  const triggerEvent = (fields: Record<string, unknown>) => ({
    id: 'event-1',
    type: 'event',
    eventType: 'audio-trigger',
    color: '#60a5fa',
    outputs: ['enter', 'during', 'exit'],
    ...fields,
  })

  it.each([
    [
      'audio cue with audio-hfc event type',
      {
        id: 'event-1',
        type: 'event',
        eventType: 'audio-hfc',
        threshold: 0.4,
        triggerMode: 'level',
      },
    ],
    [
      'audio-trigger with frequency range at 20 Hz minimum (matches schema and runtime clamp)',
      triggerEvent({ frequencyRange: { minHz: 20, maxHz: 200 }, threshold: 0.4, nodeLabel: 'Sub' }),
    ],
    [
      'audio-trigger with attackMs and releaseMs set',
      triggerEvent({
        frequencyRange: { minHz: 100, maxHz: 500 },
        threshold: 0.5,
        attackMs: 30,
        releaseMs: 300,
        nodeLabel: 'T',
      }),
    ],
  ])('validates %s', (_label, event) => {
    expect(validateAudioNodeCueFile(audioCueFile(event)).valid).toBe(true)
  })

  it.each([
    [
      'when minHz is below schema minimum (20 Hz)',
      triggerEvent({ frequencyRange: { minHz: 19, maxHz: 200 }, threshold: 0.4, nodeLabel: 'X' }),
    ],
    [
      'when hysteresis is out of range',
      triggerEvent({
        frequencyRange: { minHz: 100, maxHz: 500 },
        threshold: 0.5,
        hysteresis: 1.5,
        nodeLabel: 'T',
      }),
    ],
    [
      'when releaseMs is negative',
      triggerEvent({
        frequencyRange: { minHz: 100, maxHz: 500 },
        threshold: 0.5,
        releaseMs: -1,
        nodeLabel: 'T',
      }),
    ],
    [
      'event missing required trigger fields',
      { id: 'event-1', type: 'event', eventType: 'audio-trigger' },
    ],
  ])('rejects audio-trigger %s', (_label, event) => {
    const result = validateAudioNodeCueFile(audioCueFile(event))
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('validates logic nodes and detects cycles across logic/actions', () => {
    const definition: NetNodeCueDefinition = {
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
    const validCue = (): NetNodeCueDefinition => ({
      id: 'test-cue',
      name: 'Test Cue',
      description: '',
      kind: 'lighting',
      cueType: CueType.Chorus,
      style: 'primary',
      nodes: {
        events: [{ id: 'event-1', type: 'event', eventType: 'beat' }],
        actions: [setColorAction()],
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

    const withNodes = (nodes: Record<string, unknown>) => {
      const cue = validCue()
      return { ...cue, nodes: { ...cue.nodes, ...nodes } }
    }

    const withLogic = (logic: Record<string, unknown>, fromPort?: string) => ({
      ...withNodes({ logic: [logic] }),
      connections: [
        { from: 'event-1', to: 'logic-1' },
        fromPort
          ? { from: 'logic-1', to: 'action-1', fromPort }
          : { from: 'logic-1', to: 'action-1' },
      ],
    })

    const { id: _id, ...cueWithoutId } = validCue()

    const withVariable = (type: string, initialValue: unknown) => ({
      ...validFile(),
      cues: [{ ...validCue(), variables: [{ name: 'v', type, scope: 'cue', initialValue }] }],
    })
    const withPalette = (initialValue: unknown) => withVariable('color-array', initialValue)

    it('accepts a colour-array variable that starts as known colours', () => {
      expect(validateNodeCueFile(withPalette(['red', 'amber'])).valid).toBe(true)
    })

    it.each([
      ['a number', ['red', 3]],
      ['a single colour', 'red'],
    ])('rejects a colour-array variable that starts as %s', (_label, initialValue) => {
      expect(validateNodeCueFile(withPalette(initialValue)).valid).toBe(false)
    })

    it.each([
      ['color', 'mauve', "'mauve' is not a known Color and plays as blue"],
      ['color', '', "'' is not a known Color and plays as blue"],
      ['color-array', ['red', 'bleu'], "'bleu' is not a known Color and the list plays without it"],
    ])(
      'loads a %s variable that starts as %p and warns about it',
      (type, initialValue, message) => {
        const result = validateNodeCueFile(withVariable(type, initialValue))

        expect(result.valid && result.warnings).toEqual([
          `cue 'Test Cue': variable 'v' initial value ${message}.`,
        ])
      },
    )

    it('warns about a group variable that starts as a colour this version does not know', () => {
      const file = validFile()
      const result = validateNodeCueFile({
        ...file,
        group: {
          ...file.group,
          variables: [{ name: 'tint', type: 'color', scope: 'cue-group', initialValue: 'mauve' }],
        },
      })

      expect(result.valid && result.warnings).toEqual([
        "group 'Test Group': variable 'tint' initial value 'mauve' is not a known Color and plays as blue.",
      ])
    })

    it('loads an action colour this version does not know and warns that it plays as blue', () => {
      const action = setColorAction()
      const result = validateNodeCueFile({
        ...validFile(),
        cues: [
          withNodes({
            actions: [
              {
                ...action,
                color: {
                  name: { source: 'literal', value: 'mauve' },
                  brightness: { source: 'literal', value: 'medium' },
                },
              },
            ],
          }),
        ],
      })

      expect(result.valid && result.warnings).toEqual([
        "cue 'Test Cue': action 'action-1' color.name 'mauve' is not a known Color and plays as blue.",
      ])
    })

    it('accepts a light-array variable that starts empty', () => {
      expect(validateNodeCueFile(withVariable('light-array', [])).valid).toBe(true)
    })

    it.each([
      ['a light', [{ id: 'l1', position: 0 }]],
      ['a colour', ['red']],
      ['a number', 0],
      ['text', ''],
    ])('rejects a light-array variable that starts as %s', (_label, initialValue) => {
      expect(validateNodeCueFile(withVariable('light-array', initialValue)).valid).toBe(false)
    })

    it.each([
      ['color', 5],
      ['boolean', 1],
      ['boolean', 'true'],
      ['number', 'abc'],
      ['number', true],
      ['string', true],
    ])('rejects a %s variable that starts as %p', (type, initialValue) => {
      expect(validateNodeCueFile(withVariable(type, initialValue)).valid).toBe(false)
    })

    it.each([
      ['color', 'amber'],
      ['boolean', false],
      ['number', 2.5],
      ['string', 'front'],
      ['cue-type', 'Default'],
      ['event', 'beat'],
    ])('accepts a %s variable that starts as %p', (type, initialValue) => {
      expect(validateNodeCueFile(withVariable(type, initialValue)).valid).toBe(true)
    })

    it.each(['number', 'boolean', 'string', 'color', 'cue-type', 'event'])(
      'rejects an array initial value on %s variables',
      (type) => {
        expect(validateNodeCueFile(withVariable(type, [])).valid).toBe(false)
      },
    )

    it.each([
      ['cue missing id', cueWithoutId],
      ['cue missing name', { ...validCue(), name: undefined }],
      [
        'invalid effectType on action node',
        withNodes({ actions: [{ ...setColorAction(), effectType: 'invalid-effect' }] }),
      ],
      [
        'invalid logicType on logic node',
        withLogic({
          id: 'logic-1',
          type: 'logic',
          logicType: 'invalid-logic',
          operator: 'add',
          left: { source: 'literal', value: 1 },
          right: { source: 'literal', value: 2 },
        }),
      ],
      [
        'build-ring node missing assignGroupSize',
        {
          ...withLogic({ id: 'logic-1', type: 'logic', logicType: 'build-ring', assignTo: 'ring' }),
          variables: [{ name: 'ring', type: 'light-array', scope: 'cue', initialValue: [] }],
        },
      ],
      [
        'invalid comparator on conditional node',
        withLogic(
          {
            id: 'logic-1',
            type: 'logic',
            logicType: 'conditional',
            comparator: 'invalid-comp',
            left: { source: 'literal', value: 1 },
            right: { source: 'literal', value: 0 },
          },
          'true',
        ),
      ],
      [
        'invalid operator on math node',
        withLogic({
          id: 'logic-1',
          type: 'logic',
          logicType: 'math',
          operator: 'invalid-op',
          left: { source: 'literal', value: 1 },
          right: { source: 'literal', value: 2 },
        }),
      ],
    ])('rejects %s', (_label, cue) => {
      const result = validateYargNodeCueFile({ ...validFile(), cues: [cue] })
      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    })

    it('accepts a cue using the wrap operator, clamp, and select-from-list nodes', () => {
      const cue = validCue()
      cue.nodes.logic = [
        {
          id: 'wrap-1',
          type: 'logic',
          logicType: 'math',
          operator: 'wrap',
          left: { source: 'literal', value: -1 },
          right: { source: 'literal', value: 5 },
          assignTo: 'a',
        },
        {
          id: 'clamp-1',
          type: 'logic',
          logicType: 'clamp',
          value: { source: 'variable', name: 'a' },
          min: { source: 'literal', value: 0 },
          max: { source: 'literal', value: 2 },
          assignTo: 'b',
        },
        {
          id: 'sel-1',
          type: 'logic',
          logicType: 'select-from-list',
          list: [100, 200, 300],
          index: { source: 'variable', name: 'b' },
          assignTo: 'c',
        },
      ] as any
      cue.connections = [
        { from: 'event-1', to: 'wrap-1' },
        { from: 'wrap-1', to: 'clamp-1' },
        { from: 'clamp-1', to: 'sel-1' },
        { from: 'sel-1', to: 'action-1' },
      ]
      const result = validateYargNodeCueFile({ ...validFile(), cues: [cue] })
      expect(result.valid).toBe(true)
    })

    describe('effect raiser and effect listener', () => {
      it.each([
        [
          'effect raiser with wrong type discriminator',
          { effectRaisers: [{ id: 'r1', type: 'effect-raisers', effectId: 'eff' }] },
        ],
        [
          'effect raiser with unknown additional property',
          {
            effectRaisers: [{ id: 'r1', type: 'effect-raiser', effectId: 'eff', unknownProp: 'x' }],
          },
        ],
        [
          'effect raiser missing effectId',
          { effectRaisers: [{ id: 'r1', type: 'effect-raiser' }] },
        ],
        [
          'effect raiser with non-ValueSource parameterValues entry',
          {
            effectRaisers: [
              { id: 'r1', type: 'effect-raiser', effectId: 'eff', parameterValues: { p: 42 } },
            ],
          },
        ],
        [
          'effect listener with unknown additional property',
          { effectListeners: [{ id: 'l1', type: 'effect-listener', spurious: true }] },
        ],
      ])('rejects %s', (_label, nodes) => {
        const result = validateYargNodeCueFile({ ...validFile(), cues: [withNodes(nodes)] })
        expect(result.valid).toBe(false)
        expect(result.errors.length).toBeGreaterThan(0)
      })
    })
  })

  describe('node variety coverage', () => {
    it('validates cue with effectRaiser and effectListener nodes', () => {
      const definition: NetNodeCueDefinition = {
        id: 'effect-cue',
        name: 'Effect Cue',
        kind: 'lighting',
        cueType: CueType.Chorus,
        style: 'primary',
        nodes: {
          events: [{ id: 'event-1', type: 'event', eventType: 'beat' }],
          actions: [setColorAction()],
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
      const definition: NetNodeCueDefinition = {
        id: 'event-cue',
        name: 'Event Cue',
        kind: 'lighting',
        cueType: CueType.Chorus,
        style: 'primary',
        nodes: {
          events: [{ id: 'event-1', type: 'event', eventType: 'beat' }],
          actions: [setColorAction()],
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
      const definition: NetNodeCueDefinition = {
        id: 'array-cue',
        name: 'Array Cue',
        kind: 'lighting',
        cueType: CueType.Chorus,
        style: 'primary',
        nodes: {
          events: [{ id: 'event-1', type: 'event', eventType: 'beat' }],
          actions: [setColorAction()],
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
              id: 'ring-1',
              type: 'logic',
              logicType: 'build-ring',
              assignTo: 'ring',
              assignGroupSize: 'ringGroupSize',
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
          { name: 'ring', type: 'light-array', scope: 'cue', initialValue: [] },
          { name: 'ringGroupSize', type: 'number', scope: 'cue', initialValue: 1 },
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

  it.each([
    'audio-70s-light-organs',
    'audio-stagekit',
    'audio-disco',
    'audio-rock',
    'audio-motion-default',
  ])('validates bundled %s.json', (name) => {
    const result = validateAudioNodeCueFile(JSON.parse(readBundled(`cues/audio/${name}.json`)))
    expect(result.valid).toBe(true)
    if (result.valid) {
      for (const cue of result.data.cues) {
        expect(() => NodeCueCompiler.compileCue<AudioEventNodeUnion>(cue, 'audio')).not.toThrow()
      }
    }
  })

  it('validates bundled yarg-stagekit.json', () => {
    const result = validateYargNodeCueFile(JSON.parse(readBundled('cues/yarg/yarg-stagekit.json')))
    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.data.group.id).toBe('yarg-stagekit')
      for (const cue of result.data.cues) {
        expect(() => NodeCueCompiler.compileCue(cue, 'yarg')).not.toThrow()
      }
      // every cue must lay its nodes out (no stacking at the origin in the editor)
      for (const cue of result.data.cues) {
        const positions = cue.layout?.nodePositions ?? {}
        expect(Object.keys(positions).length).toBeGreaterThan(0)
      }
    }
  })

  it('validates bundled rb3-stagekit.json (strobes + RB3 base cue, compiles, lays out nodes)', () => {
    const result = validateRb3NodeCueFile(JSON.parse(readBundled('cues/rb3/rb3-stagekit.json')))
    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.data.group.id).toBe('rb3-stagekit')
      expect(result.data.group.isStageKit).toBe(true)
      // The four strobe rates plus the always-active RB3 gameplay mirror.
      const cueTypes = result.data.cues.map((c) => (c.kind === 'lighting' ? c.cueType : c.id))
      expect(cueTypes).toEqual([
        CueType.Strobe_Slow,
        CueType.Strobe_Medium,
        CueType.Strobe_Fast,
        CueType.Strobe_Fastest,
        CueType.RB3,
      ])
      for (const cue of result.data.cues) {
        expect(() => NodeCueCompiler.compileCue(cue, 'yarg')).not.toThrow()
        const positions = cue.layout?.nodePositions ?? {}
        expect(Object.keys(positions).length).toBeGreaterThan(0)
      }
    }
  })

  // The interpretive RB3 libraries ship only their gameplay cue; the strobes live once, in
  // rb3-stagekit. Neither the StageKit nor the default slot may be claimed here.
  it.each([
    'rb3-mirror',
    'rb3-mirror-blended',
    'rb3-stagekit-reversed',
    'rb3-stagekit-wash',
    'rb3-trail',
    'rb3-bloom',
    'rb3-glow',
  ])('validates bundled %s.json (RB3 gameplay cue only, compiles, lays out nodes)', (groupId) => {
    const result = validateRb3NodeCueFile(JSON.parse(readBundled(`cues/rb3/${groupId}.json`)))
    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.data.group.id).toBe(groupId)
      expect(result.data.group.isStageKit).toBeUndefined()
      expect(result.data.group.isDefault).toBeUndefined()
      const cueTypes = result.data.cues.map((c) => (c.kind === 'lighting' ? c.cueType : c.id))
      expect(cueTypes).toEqual([CueType.RB3])
      const positionsSeen = new Set<string>()
      for (const cue of result.data.cues) {
        expect(() => NodeCueCompiler.compileCue(cue, 'yarg')).not.toThrow()
        const positions = cue.layout?.nodePositions ?? {}
        const nodeCount = Object.values(cue.nodes ?? {}).reduce(
          (total, bucket) => total + (Array.isArray(bucket) ? bucket.length : 0),
          0,
        )
        // Every node is placed, and no two share a slot, so the graph opens legibly.
        expect(Object.keys(positions).length).toBe(nodeCount)
        if (cue.kind === 'lighting' && cue.cueType === CueType.RB3) {
          for (const p of Object.values(positions)) {
            const key = `${p.x},${p.y}`
            expect(positionsSeen.has(key)).toBe(false)
            positionsSeen.add(key)
          }
        }
      }
    }
  })

  it('validates bundled rb3-motion-default.json (time-driven motion cues, compiles)', () => {
    const result = validateRb3NodeCueFile(
      JSON.parse(readBundled('cues/rb3/rb3-motion-default.json')),
    )
    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.data.group.id).toBe('rb3-motion-default')
      // Every cue is a motion cue and compiles; none depend on beat/measure/keyframe events.
      expect(result.data.cues.length).toBe(9)
      for (const cue of result.data.cues) {
        expect(cue.kind).toBe('motion')
        expect(() => NodeCueCompiler.compileCue(cue, 'yarg')).not.toThrow()
        const eventTypes = (cue.nodes?.events ?? []).map((e) => e.eventType)
        expect(eventTypes).toEqual(['cue-started'])
      }
    }
  })

  it.each(['yarg-fade.json'])(
    'validates bundled %s (compiles, caps brightness at high, no strobes)',
    (fileName) => {
      const raw = readBundled(`cues/yarg/${fileName}`)
      const result = validateYargNodeCueFile(JSON.parse(raw))
      expect(result.valid).toBe(true)
      if (result.valid) {
        for (const cue of result.data.cues) {
          expect(() => NodeCueCompiler.compileCue(cue, 'yarg')).not.toThrow()
        }
      }
      // max/linear brightness is reserved for strobes; these libraries must not use it
      expect(raw).not.toMatch(
        /"brightness":\s*\{\s*"source":\s*"literal",\s*"value":\s*"(max|linear)"\s*\}/,
      )
      expect(raw).not.toContain('Strobe')
    },
  )

  it.each([
    'cue-sk-audio-cool-auto',
    'cue-sk-audio-warm-auto',
    'cue-sk-audio-harmony',
    'cue-sk-audio-searchlights',
    'cue-sk-audio-sweep',
  ])(
    'audio stagekit cue %s keeps its rotation effect raisers persistent (seamless loop at wrap)',
    (cueId) => {
      const data = JSON.parse(readBundled('cues/audio/audio-stagekit.json')) as {
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
    },
  )

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

    it('loads an effect holding colours this version does not know and warns about each', () => {
      const action = setColorAction()
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
              actions: [
                {
                  ...action,
                  color: { ...action.color, name: { source: 'literal', value: 'mauve' } },
                },
              ],
            },
            connections: [{ from: 'e1', to: 'action-1' }],
            variables: [
              { name: 'palette', type: 'color-array', scope: 'cue', initialValue: ['bleu'] },
            ],
          },
        ],
      })

      expect(result).toEqual(
        expect.objectContaining({
          valid: true,
          warnings: [
            "effect 'Test Effect': variable 'palette' initial value 'bleu' is not a known Color and the list plays without it.",
            "effect 'Test Effect': action 'action-1' color.name 'mauve' is not a known Color and plays as blue.",
          ],
        }),
      )
    })

    it('rejects an effect whose light-array parameter starts with lights', () => {
      const result = validateYargEffectFile({
        version: 1,
        mode: 'yarg',
        group: { id: 'effect-group', name: 'Effect Group' },
        effects: [
          {
            id: 'eff-1',
            name: 'Test Effect',
            mode: 'yarg',
            nodes: { events: [{ id: 'e1', type: 'event', eventType: 'beat' }], actions: [] },
            connections: [],
            variables: [
              {
                name: 'targets',
                type: 'light-array',
                scope: 'cue',
                isParameter: true,
                initialValue: [{ id: 'l1', position: 0 }],
              },
            ],
          },
        ],
      })
      expect(result.valid).toBe(false)
    })

    it("migrates a removed 'half-beat' event to 'beat' in an effect file and warns once", () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
      const result = validateYargEffectFile({
        version: 1,
        mode: 'yarg',
        group: { id: 'legacy-half-beat-effect-group', name: 'Legacy Effect Group' },
        effects: [
          {
            id: 'eff-1',
            name: 'Test Effect',
            mode: 'yarg',
            nodes: {
              events: [{ id: 'e1', type: 'event', eventType: 'half-beat' }],
              actions: [],
            },
            connections: [],
          },
        ],
      })
      expect(result.valid).toBe(true)
      const events = result.data?.effects[0].nodes.events as { eventType: string }[] | undefined
      expect(events?.[0].eventType).toBe('beat')
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("deprecated 'half-beat'"))
      warnSpy.mockRestore()
    })

    it.each([
      ['YARG', 'yarg', validateYargEffectFile],
      ['Audio', 'audio', validateAudioEffectFile],
    ] as const)('rejects duplicate %s effect ids (semantic)', (_label, mode, validate) => {
      const effect = (name: string) => ({
        id: 'dup',
        name,
        mode,
        nodes: { events: [], actions: [] },
        connections: [],
      })
      const result = validate({
        version: 1,
        mode,
        group: { id: 'g', name: 'G' },
        effects: [effect('First'), effect('Second')],
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

    it.each([
      ['audio', 'audio-core-effects'],
      ['audio', 'audio-stagekit-effects'],
      ['yarg', 'yarg-fade-effects'],
    ] as const)('validates bundled %s/%s.json', (mode, name) => {
      const result = validateEffectFile(JSON.parse(readBundled(`effects/${mode}/${name}.json`)))
      expect(result.valid).toBe(true)
      expect(result.mode).toBe(mode)
    })
  })
})
