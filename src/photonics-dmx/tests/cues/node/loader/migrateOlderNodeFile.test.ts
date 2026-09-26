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

    const notes = migrateOlderNodeFile(file)

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
    expect(notes).toEqual([expect.stringContaining("'beat-count' is now 'beat_count_2'")])
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

  it('stores an unknown easing as the default, in a value source or a bare string', () => {
    const file = {
      effects: [
        {
          id: 'e1',
          name: 'Swell',
          nodes: {
            actions: [
              { id: 'a1', timing: { easing: { source: 'literal', value: 'sin-out' } } },
              { id: 'a2', timing: { easing: 'bounce' } },
              { id: 'a3', timing: { easing: { source: 'literal', value: 'cubicIn' } } },
              { id: 'a4', timing: { easing: { source: 'variable', name: 'curve' } } },
            ],
          },
        },
      ],
    }

    const notes = migrateOlderNodeFile(file)

    expect(file.effects[0].nodes.actions.map((a) => a.timing.easing)).toEqual([
      { source: 'literal', value: 'sinInOut' },
      'sinInOut',
      { source: 'literal', value: 'cubicIn' },
      { source: 'variable', name: 'curve' },
    ])
    expect(notes).toEqual(["Unknown easing 'sin-out', 'bounce' in 'Swell' now reads sinInOut."])
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

    expect(migrateOlderNodeFile(file)).toEqual([])
    expect(file).toEqual(before)
  })
})
