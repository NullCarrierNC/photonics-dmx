import { describe, expect, it } from '@jest/globals'
import { migrateOlderNodeFile } from '../../../../cues/node/loader/migrateOlderNodeFile'

const variable = (name: string, scope = 'cue') => ({
  name,
  type: 'number',
  scope,
  initialValue: 0,
})

const read = (name: string) => ({ source: 'variable', name })

describe('migrateOlderNodeFile', () => {
  it('renames each non-conforming variable and every use of it in the file', () => {
    const file = {
      group: { id: 'g', name: 'G', variables: [variable('my var', 'cue-group')] },
      cues: [
        {
          id: 'c1',
          name: 'One',
          kind: 'lighting',
          variables: [variable('beat-count'), variable('beat_count'), variable('2x')],
          nodes: {
            events: [],
            actions: [{ id: 'a1', timing: { duration: read('beat-count') } }],
            logic: [
              { id: 'l1', logicType: 'variable', varName: '2x', value: read('my var') },
              {
                id: 'l2',
                logicType: 'variable',
                assignments: [{ varName: 'beat-count', value: read('2x') }],
              },
              { id: 'l3', logicType: 'random', rolls: [{ assignTo: 'my var' }] },
              { id: 'l4', logicType: 'concat-lights', sourceVariables: ['2x', 'other'] },
              { id: 'l5', logicType: 'debugger', variablesToLog: ['beat-count'] },
            ],
          },
        },
      ],
    }

    const changes = migrateOlderNodeFile(file)

    expect(file.group.variables[0].name).toBe('my_var')
    expect(file.cues[0].variables.map((v) => v.name)).toEqual(['beat_count_2', 'beat_count', '_2x'])
    expect(file.cues[0].nodes).toEqual({
      events: [],
      actions: [{ id: 'a1', timing: { duration: read('beat_count_2') } }],
      logic: [
        { id: 'l1', logicType: 'variable', varName: '_2x', value: read('my_var') },
        {
          id: 'l2',
          logicType: 'variable',
          assignments: [{ varName: 'beat_count_2', value: read('_2x') }],
        },
        { id: 'l3', logicType: 'random', rolls: [{ assignTo: 'my_var' }] },
        { id: 'l4', logicType: 'concat-lights', sourceVariables: ['_2x', 'other'] },
        { id: 'l5', logicType: 'debugger', variablesToLog: ['beat_count_2'] },
      ],
    })
    expect(changes).toEqual({
      older: [expect.stringContaining("'beat-count' is now 'beat_count_2'")],
      unknown: [],
    })
  })

  it('renames an effect raiser parameter the effect file renames', () => {
    const file = {
      group: { id: 'g', name: 'G' },
      cues: [
        {
          id: 'c1',
          name: 'One',
          nodes: {
            events: [],
            actions: [],
            effectRaisers: [
              {
                id: 'r1',
                type: 'effect-raiser',
                effectId: 'fx',
                parameterValues: { 'beat-count': { source: 'literal', value: 4 } },
              },
            ],
          },
        },
      ],
    }

    migrateOlderNodeFile(file)

    expect(file.cues[0].nodes.effectRaisers[0].parameterValues).toEqual({
      beat_count: { source: 'literal', value: 4 },
    })
  })

  it('reports a raiser key and a variable of one name that take different names', () => {
    const file = {
      group: { id: 'g', name: 'G' },
      cues: [
        {
          id: 'c1',
          name: 'One',
          kind: 'lighting',
          variables: [variable('beat-count')],
          effects: [{ effectFileId: 'fx', effectId: 'counter', name: 'Counter' }],
          nodes: {
            events: [],
            actions: [],
            effectRaisers: [
              {
                id: 'r1',
                type: 'effect-raiser',
                effectId: 'counter',
                parameterValues: { 'beat-count': read('beat-count') },
              },
            ],
          },
        },
      ],
    }

    const changes = migrateOlderNodeFile(file, () => new Map([['beat-count', 'beat_count_2']]))

    expect(file.cues[0].nodes.effectRaisers[0].parameterValues).toEqual({
      beat_count_2: read('beat_count'),
    })
    expect(changes.older).toEqual([
      "Variable names must use letters, digits and underscores: 'beat-count' is now 'beat_count', 'beat-count' is now 'beat_count_2'.",
    ])
  })

  it('renames a raiser key as its own file renames the effect it raises', () => {
    const file = {
      group: { id: 'fx', name: 'FX' },
      effects: [
        {
          id: 'counter',
          name: 'Counter',
          variables: [
            { name: 'beat_count', type: 'number', initialValue: 1, isParameter: true },
            { name: 'beat-count', type: 'number', initialValue: 2, isParameter: true },
          ],
          nodes: {},
        },
        {
          id: 'outer',
          name: 'Outer',
          nodes: {
            effectRaisers: [
              {
                id: 'r1',
                type: 'effect-raiser',
                effectId: 'counter',
                parameterValues: { 'beat-count': { source: 'literal', value: 4 } },
              },
            ],
          },
        },
      ],
    }

    migrateOlderNodeFile(file)

    expect(file.effects[0].variables?.map((v) => v.name)).toEqual(['beat_count', 'beat_count_2'])
    expect(file.effects[1].nodes.effectRaisers?.[0].parameterValues).toEqual({
      beat_count_2: { source: 'literal', value: 4 },
    })
  })

  it('reads an unknown easing as the default, in a value source or a bare string', () => {
    const file = {
      effects: [
        {
          id: 'e1',
          name: 'Swell',
          nodes: {
            actions: [
              { id: 'a1', timing: { easing: { source: 'literal', value: 'sin-out' } } },
              { id: 'a2', timing: { easing: 'sin-out' } },
              { id: 'a3', timing: { easing: { source: 'literal', value: 'springOut' } } },
              { id: 'a4', timing: { easing: 'bounce' } },
              { id: 'a5', timing: { easing: { source: 'literal', value: 'cubicIn' } } },
              { id: 'a6', timing: { easing: { source: 'variable', name: 'curve' } } },
            ],
          },
        },
      ],
    }

    const changes = migrateOlderNodeFile(file)

    expect(file.effects[0].nodes.actions.map((a) => a.timing.easing)).toEqual([
      { source: 'literal', value: 'sinInOut' },
      'sinInOut',
      { source: 'literal', value: 'sinInOut' },
      'sinInOut',
      { source: 'literal', value: 'cubicIn' },
      { source: 'variable', name: 'curve' },
    ])
    expect(changes).toEqual({
      older: ["Unknown easing 'sin-out' in 'Swell' now reads sinInOut."],
      unknown: [
        "Easing 'springOut', 'bounce' in 'Swell' is not one this version knows and plays as sinInOut.",
      ],
    })
  })

  it('leaves colour initial values as they are and stores other values as they read', () => {
    const file = {
      group: {
        id: 'g',
        name: 'G',
        variables: [
          { name: 'accent', type: 'color', scope: 'cue-group', initialValue: 'mauve' },
          {
            name: 'palette',
            type: 'color-array',
            scope: 'cue-group',
            initialValue: ['red', 'Bleu'],
          },
          { name: 'steps', type: 'number', scope: 'cue-group', initialValue: '4' },
        ],
      },
      cues: [],
    }

    const changes = migrateOlderNodeFile(file)

    expect(file.group.variables.map((v) => v.initialValue)).toEqual(['mauve', ['red', 'Bleu'], 4])
    expect(changes).toEqual({
      older: [
        "Initial values their type cannot hold now hold what the cue reads: 'steps' is now 4.",
      ],
      unknown: [],
    })
  })

  it('leaves an action blend mode this version does not know as it is', () => {
    const lit = (value: unknown) => ({ source: 'literal', value })
    const file = {
      cues: [
        {
          id: 'c1',
          name: 'Glow',
          kind: 'lighting',
          nodes: {
            actions: [
              { id: 'a1', color: { name: lit('red'), blendMode: lit('screen') } },
              { id: 'a2', color: { name: lit('red'), blendMode: lit('overlay') } },
            ],
          },
        },
      ],
    }

    const changes = migrateOlderNodeFile(file)

    expect(file.cues[0].nodes.actions.map((a) => a.color)).toEqual([
      { name: lit('red'), blendMode: lit('screen') },
      { name: lit('red'), blendMode: lit('replace') },
    ])
    expect(changes).toEqual({
      older: ["Retired blend mode multiply or overlay in 'Glow' now reads replace."],
      unknown: ["Blend mode 'screen' in 'Glow' is not one this version knows."],
    })
  })

  it('reads a cue stored with no kind as a lighting cue', () => {
    const file = {
      group: { id: 'g', name: 'G' },
      cues: [
        { id: 'c1', name: 'One', cueType: 'Intro', nodes: {} },
        { id: 'c2', name: 'Two', kind: 'motion', cueType: 'Sweep', nodes: {} },
        { id: 'c3', name: 'Three', kind: 'lighting', cueType: 'Verse', nodes: {} },
      ],
    }

    const changes = migrateOlderNodeFile(file)

    expect(file.cues.map((cue) => cue.kind)).toEqual(['lighting', 'motion', 'lighting'])
    expect(changes).toEqual({
      older: ['Cues stored with no kind now read as lighting cues.'],
      unknown: [],
    })
  })

  it('drops a wait count below one from a wait with no condition', () => {
    const lit = (value: unknown) => ({ source: 'literal', value })
    const file = {
      cues: [
        {
          id: 'c1',
          name: 'Stomp',
          kind: 'lighting',
          nodes: {
            actions: [
              {
                id: 'a1',
                timing: {
                  waitForCondition: lit('none'),
                  waitForConditionCount: lit(0),
                  waitUntilCondition: lit('none'),
                  waitUntilConditionCount: lit(0),
                },
              },
              {
                id: 'a2',
                timing: { waitUntilCondition: lit('beat'), waitUntilConditionCount: lit(0) },
              },
              {
                id: 'a3',
                timing: { waitUntilCondition: lit('none'), waitUntilConditionCount: lit(2) },
              },
            ],
          },
        },
      ],
    }

    const changes = migrateOlderNodeFile(file)

    expect(file.cues[0].nodes.actions.map((a) => a.timing)).toEqual([
      { waitForCondition: lit('none'), waitUntilCondition: lit('none') },
      { waitUntilCondition: lit('beat'), waitUntilConditionCount: lit(0) },
      { waitUntilCondition: lit('none'), waitUntilConditionCount: lit(2) },
    ])
    expect(changes).toEqual({
      older: ["A wait count below one on a wait with no condition in 'Stomp' is dropped."],
      unknown: [],
    })
  })

  it('changes nothing in a file already on the current rules', () => {
    const file = {
      group: { id: 'g', name: 'G', variables: [variable('speed', 'cue-group')] },
      effects: [
        {
          id: 'e1',
          name: 'E',
          variables: [variable('beat_count')],
          nodes: {
            actions: [{ id: 'a1', color: { blendMode: { source: 'literal', value: 'add' } } }],
          },
        },
      ],
    }
    const before = structuredClone(file)

    expect(migrateOlderNodeFile(file)).toEqual({ older: [], unknown: [] })
    expect(file).toEqual(before)
  })
})
