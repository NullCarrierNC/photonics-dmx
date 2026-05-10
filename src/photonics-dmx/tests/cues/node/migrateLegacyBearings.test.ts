/**
 * migrateLegacyBearings: rewrites compass bearing strings inside parsed cue-file JSON before validation.
 */
import { describe, expect, it } from '@jest/globals'
import { migrateLegacyBearingToken } from '../../../helpers/stageDirections'
import { migrateLegacyBearings } from '../../../cues/node/loader/migrateLegacyBearings'

describe('migrateLegacyBearingToken', () => {
  const cases = [
    ['se', 'downstage-right'],
    ['ne', 'upstage-right'],
    ['sw', 'downstage-left'],
    ['nw', 'upstage-left'],
    ['n', 'upstage'],
    ['north', 'upstage'],
    ['e', 'stage-right'],
    ['east', 'stage-right'],
    ['s', 'downstage'],
    ['south', 'downstage'],
    ['w', 'stage-left'],
    ['west', 'stage-left'],
  ] as const

  it.each(cases)("'%s' -> '%s'", (from, to) => {
    expect(migrateLegacyBearingToken(from)).toBe(to)
  })

  it('returns null for unknown tokens and already-canonical bearings', () => {
    expect(migrateLegacyBearingToken('front')).toBeNull()
    expect(migrateLegacyBearingToken('red')).toBeNull()
    expect(migrateLegacyBearingToken('downstage')).toBeNull()
    expect(migrateLegacyBearingToken('upstage-right')).toBeNull()
  })
})

describe('migrateLegacyBearings', () => {
  it('rewrites position.bearing literal strings', () => {
    const file = {
      version: 1,
      cues: [
        {
          variables: [],
          nodes: {
            actions: [
              {
                id: 'a1',
                type: 'action',
                effectType: 'set-position',
                position: {
                  mode: 'direction',
                  bearing: { source: 'literal', value: 'NE' },
                  angle: { source: 'literal', value: 20 },
                },
              },
            ],
            logic: [],
          },
        },
      ],
    }
    migrateLegacyBearings(file)
    expect(file.cues[0].nodes.actions[0].position.bearing.value).toBe('upstage-right')
  })

  it('rewrites motionPattern.bearing literal strings', () => {
    const file = {
      version: 1,
      cues: [
        {
          variables: [],
          nodes: {
            actions: [
              {
                id: 'a1',
                type: 'action',
                effectType: 'motion-pattern',
                motionPattern: {
                  pattern: { source: 'literal', value: 'circle' },
                  bearing: { source: 'literal', value: 'se' },
                },
              },
            ],
            logic: [],
          },
        },
      ],
    }
    migrateLegacyBearings(file)
    expect(file.cues[0].nodes.actions[0].motionPattern.bearing.value).toBe('downstage-right')
  })

  it('rewrites random-choice strings', () => {
    const file = {
      version: 1,
      cues: [
        {
          variables: [],
          nodes: {
            actions: [],
            logic: [
              {
                logicType: 'random',
                mode: 'random-choice',
                choices: ['downstage', 'ne', 'sw'],
              },
            ],
          },
        },
      ],
    }
    migrateLegacyBearings(file)
    expect(file.cues[0].nodes.logic[0].choices).toEqual([
      'downstage',
      'upstage-right',
      'downstage-left',
    ])
  })

  it('rewrites variable logic literal value when compass token', () => {
    const file = {
      version: 1,
      cues: [
        {
          variables: [],
          nodes: {
            actions: [],
            logic: [
              {
                logicType: 'variable',
                mode: 'set',
                varName: 'b',
                valueType: 'string',
                value: { source: 'literal', value: 'nw' },
              },
            ],
          },
        },
      ],
    }
    migrateLegacyBearings(file)
    expect(file.cues[0].nodes.logic[0].value.value).toBe('upstage-left')
  })

  it('rewrites cue variables initialValue for string variables', () => {
    const file = {
      version: 1,
      cues: [
        {
          variables: [
            {
              name: 'x',
              type: 'string',
              scope: 'cue',
              initialValue: 'east',
            },
          ],
          nodes: { actions: [], logic: [] },
        },
      ],
    }
    migrateLegacyBearings(file)
    expect(file.cues[0].variables[0].initialValue).toBe('stage-right')
  })

  it('is idempotent', () => {
    const file = {
      version: 1,
      cues: [
        {
          variables: [],
          nodes: {
            actions: [],
            logic: [
              {
                logicType: 'random',
                mode: 'random-choice',
                choices: ['n', 's'],
              },
            ],
          },
        },
      ],
    }
    migrateLegacyBearings(file)
    migrateLegacyBearings(file)
    expect(file.cues[0].nodes.logic[0].choices).toEqual(['upstage', 'downstage'])
  })

  it('does not change unrelated string literals', () => {
    const file = {
      version: 1,
      cues: [
        {
          variables: [{ name: 'g', type: 'string', scope: 'cue', initialValue: 'front' }],
          nodes: {
            actions: [],
            logic: [],
          },
        },
      ],
    }
    migrateLegacyBearings(file)
    expect(file.cues[0].variables[0].initialValue).toBe('front')
  })
})
