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

  it('renames a variable named like an expression built-in and leaves expression text as it is', () => {
    const file = {
      group: { id: 'g', name: 'G' },
      cues: [
        {
          id: 'c1',
          name: 'One',
          kind: 'lighting',
          variables: ['min', 'pi', 'pi_2', 'a', 'b'].map((name) => variable(name)),
          nodes: {
            events: [],
            actions: [{ id: 'a1', timing: { duration: read('pi') } }],
            logic: [
              { id: 'l1', logicType: 'expression', expression: 'min(a, b) + pi', assignTo: 'min' },
            ],
          },
        },
      ],
    }

    const changes = migrateOlderNodeFile(file)

    expect(file.cues[0].variables.map((v) => v.name)).toEqual(['min_2', 'pi_3', 'pi_2', 'a', 'b'])
    expect(file.cues[0].nodes.actions[0].timing.duration).toEqual(read('pi_3'))
    expect(file.cues[0].nodes.logic).toEqual([
      { id: 'l1', logicType: 'expression', expression: 'min(a, b) + pi', assignTo: 'min_2' },
    ])
    expect(changes.older).toEqual([
      "Variable names cannot be built-in expression names: 'min' is now 'min_2', 'pi' is now 'pi_3'.",
    ])
  })

  it('renames a bare use of a variable named like a built-in function in expression text', () => {
    const expression = (id: string, text: string) => ({
      id,
      logicType: 'expression',
      expression: text,
      assignTo: 'a',
    })
    const file = {
      group: { id: 'g', name: 'G' },
      cues: [
        {
          id: 'c1',
          name: 'One',
          kind: 'lighting',
          variables: ['min', 'pi', 'a', 'b'].map((name) => variable(name)),
          nodes: {
            events: [],
            actions: [],
            logic: [
              expression('l1', 'min(a,b)*2.50+  min /pi'),
              expression('l2', 'max(min, 1)'),
              expression('l3', 'min (a) + pi'),
            ],
          },
        },
      ],
    }

    migrateOlderNodeFile(file)

    expect(file.cues[0].nodes.logic.map((node) => node.expression)).toEqual([
      'min(a,b)*2.50+  min_2 /pi',
      'max(min_2, 1)',
      'min (a) + pi',
    ])
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
      unknown: [],
    })
  })

  it('draws an action layer above the top cue layer on the top cue layer', () => {
    const layer = (value: unknown) => ({ source: 'literal', value })
    const file = {
      group: { id: 'g', name: 'G' },
      effects: [
        {
          id: 'e1',
          name: 'Flash',
          nodes: {
            actions: [
              { id: 'a1', layer: layer(255) },
              { id: 'a2', layer: layer(300) },
              { id: 'a3', layer: layer(254) },
              { id: 'a4', layer: read('lyr') },
            ],
          },
        },
      ],
    }

    const changes = migrateOlderNodeFile(file)

    expect(file.effects[0].nodes.actions.map((action) => action.layer)).toEqual([
      layer(254),
      layer(254),
      layer(254),
      read('lyr'),
    ])
    expect(changes).toEqual({
      older: ["Layer 255, 300 in 'Flash' now reads 254, the top layer a cue draws on."],
      unknown: [],
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

      const notes = migrateOlderNodeFile(file, undefined, effects)

      const [r1, r2, r3] = file.cues[0].nodes.effectRaisers ?? []
      expect(r1.parameterValues).toEqual({
        lights: { source: 'literal', value: 'front,back' },
        lightFilter: read('everyLight'),
        patternBGroups: read('mixed'),
      })
      expect(r2.parameterValues).toEqual({ lights: read('everyLight') })
      expect(r3.parameterValues).toEqual({ lights: { source: 'literal', value: 'back' } })
      expect(notes).toEqual({
        older: [
          "A light array passed where an effect takes group names now passes the names of its groups: 'One' raiser 'r1' lights is now 'front,back', 'One' raiser 'r3' lights is now 'back'.",
        ],
        unknown: [],
      })
    })

    it('draws a raiser layer above the top cue layer on the top cue layer', () => {
      const lit = (value: unknown) => ({ source: 'literal', value })
      const file = {
        group: { id: 'g', name: 'G' },
        cues: [
          {
            id: 'c1',
            name: 'Strobe',
            kind: 'lighting',
            effects: [{ effectId: 'effect-flash-color', effectFileId: 'yarg-core-effects' }],
            nodes: {
              events: [],
              actions: [],
              logic: [],
              effectRaisers: [
                raiser('r1', 'effect-flash-color', { layer: lit(255), holdTime: lit(255) }),
                raiser('r2', 'effect-flash-color', { layer: lit(200) }),
              ],
            },
          },
        ],
      }

      const notes = migrateOlderNodeFile(file, undefined, effects)

      const [r1, r2] = file.cues[0].nodes.effectRaisers
      expect(r1.parameterValues).toEqual({ layer: lit(254), holdTime: lit(255) })
      expect(r2.parameterValues).toEqual({ layer: lit(200) })
      expect(notes).toEqual({
        older: ["Layer 255 in 'Strobe' now reads 254, the top layer a cue draws on."],
        unknown: [],
      })
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

      expect(migrateOlderNodeFile(file, undefined, effects)).toEqual({ older: [], unknown: [] })
      expect(file).toEqual(before)
    })
  })
})
