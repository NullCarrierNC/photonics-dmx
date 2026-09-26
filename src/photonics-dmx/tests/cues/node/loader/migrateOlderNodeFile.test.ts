import * as fs from 'fs'
import * as path from 'path'
import { describe, expect, it } from '@jest/globals'
import {
  migrateOlderNodeFile,
  type EffectLookup,
} from '../../../../cues/node/loader/migrateOlderNodeFile'
import type { EffectFile } from '../../../../cues/types/nodeCueTypes'

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

  it('reads a cue stored with no kind as a lighting cue', () => {
    const file = {
      group: { id: 'g', name: 'G' },
      cues: [
        { id: 'c1', name: 'One', cueType: 'Intro', nodes: {} },
        { id: 'c2', name: 'Two', kind: 'motion', cueType: 'Sweep', nodes: {} },
        { id: 'c3', name: 'Three', kind: 'lighting', cueType: 'Verse', nodes: {} },
      ],
    }

    const notes = migrateOlderNodeFile(file)

    expect(file.cues.map((cue) => cue.kind)).toEqual(['lighting', 'motion', 'lighting'])
    expect(notes).toEqual(['Cues stored with no kind now read as lighting cues.'])
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

    const notes = migrateOlderNodeFile(file)

    expect(file.cues[0].nodes.actions.map((a) => a.timing)).toEqual([
      { waitForCondition: lit('none'), waitUntilCondition: lit('none') },
      { waitUntilCondition: lit('beat'), waitUntilConditionCount: lit(0) },
      { waitUntilCondition: lit('none'), waitUntilConditionCount: lit(2) },
    ])
    expect(notes).toEqual([
      "A wait count below one on a wait with no condition in 'Stomp' is dropped.",
    ])
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

  describe('with the effects each raiser raises', () => {
    const coreEffects: EffectFile = JSON.parse(
      fs.readFileSync(
        path.resolve(
          __dirname,
          '../../../../../../resources/defaults/node-data/effects/yarg/yarg-core-effects.json',
        ),
        'utf-8',
      ),
    )
    const effects: EffectLookup = (fileId, effectId) =>
      fileId === 'yarg-core-effects'
        ? coreEffects.effects.find((effect) => effect.id === effectId)
        : undefined
    const lightArray = (name: string, scope = 'cue') => ({
      name,
      type: 'light-array',
      scope,
      initialValue: [],
    })
    const configData = (id: string, dataProperty: string, assignTo: string) => ({
      id,
      type: 'logic',
      logicType: 'config-data',
      dataProperty,
      assignTo,
    })
    const raiser = (id: string, effectId: string, parameterValues: Record<string, unknown>) => ({
      id,
      type: 'effect-raiser',
      effectId,
      parameterValues,
    })
    const references = [
      { effectId: 'effect-alternating-pattern', effectFileId: 'yarg-core-effects' },
      { effectId: 'effect-rotation-cw', effectFileId: 'yarg-core-effects' },
    ]

    it('passes group names for a light array whose every write is a whole-group array', () => {
      const file = {
        group: { id: 'g', name: 'G', variables: [lightArray('backs', 'cue-group')] },
        cues: [
          {
            id: 'c1',
            name: 'One',
            kind: 'lighting',
            effects: references,
            variables: [lightArray('everyLight'), lightArray('mixed')],
            nodes: {
              events: [],
              actions: [],
              logic: [
                configData('l1', 'all-lights-array', 'everyLight'),
                configData('l2', 'front-lights-array', 'mixed'),
                {
                  id: 'l3',
                  logicType: 'shuffle-lights',
                  sourceVariable: 'everyLight',
                  assignTo: 'mixed',
                },
              ],
              effectRaisers: [
                raiser('r1', 'effect-alternating-pattern', {
                  lights: read('everyLight'),
                  lightFilter: read('everyLight'),
                  patternBGroups: read('mixed'),
                }),
                raiser('r2', 'effect-rotation-cw', { lights: read('everyLight') }),
                raiser('r3', 'effect-alternating-pattern', { lights: read('backs') }),
              ],
            },
          },
          {
            id: 'c2',
            name: 'Two',
            kind: 'lighting',
            nodes: {
              events: [],
              actions: [],
              logic: [configData('l4', 'back-lights-array', 'backs')],
            },
          },
        ],
      }

      const notes = migrateOlderNodeFile(file, effects)

      const [r1, r2, r3] = file.cues[0].nodes.effectRaisers ?? []
      expect(r1.parameterValues).toEqual({
        lights: { source: 'literal', value: 'front,back' },
        lightFilter: read('everyLight'),
        patternBGroups: read('mixed'),
      })
      expect(r2.parameterValues).toEqual({ lights: read('everyLight') })
      expect(r3.parameterValues).toEqual({ lights: { source: 'literal', value: 'back' } })
      expect(notes).toEqual([
        "A light array passed where an effect takes group names now passes the names of its groups: 'One' raiser 'r1' lights is now 'front,back', 'One' raiser 'r3' lights is now 'back'.",
      ])
    })

    it('leaves a raiser whose effect this build cannot find', () => {
      const file = {
        group: { id: 'g', name: 'G' },
        cues: [
          {
            id: 'c1',
            name: 'One',
            kind: 'lighting',
            effects: [{ effectId: 'effect-alternating-pattern', effectFileId: 'my-effects' }],
            variables: [lightArray('everyLight')],
            nodes: {
              events: [],
              actions: [],
              logic: [configData('l1', 'all-lights-array', 'everyLight')],
              effectRaisers: [
                raiser('r1', 'effect-alternating-pattern', { lights: read('everyLight') }),
              ],
            },
          },
        ],
      }
      const before = structuredClone(file)

      expect(migrateOlderNodeFile(file, effects)).toEqual([])
      expect(file).toEqual(before)
    })
  })
})
