import { describe, expect, it } from '@jest/globals'
import { variableValue } from '../../../../cues/node/runtime/executionTypes'
import { CueSession } from '../../../../cues/node/runtime/CueSession'
import type { VariableDefinition } from '../../../../cues/types/nodeCueTypes'
import { createMockTrackedLight } from '../../../helpers/testFixtures'

describe('variableValue', () => {
  it.each([
    ['a number', 150, 150],
    ['a numeric string', '42.5', 42.5],
    ['a string with a numeric prefix', '5abc', 5],
    ['an unreadable string', 'fast', 0],
    ['NaN', Number.NaN, 0],
    ['true', true, 1],
    ['false', false, 0],
    ['nothing', undefined, 0],
  ])('reads %s as a number', (_label, raw, expected) => {
    expect(variableValue('number', raw)).toEqual({ type: 'number', value: expected })
  })

  it.each([
    [true, true],
    ['true', true],
    [false, false],
    ['yes', false],
    [1, false],
  ])('reads %p as the flag %p', (raw, expected) => {
    expect(variableValue('boolean', raw)).toEqual({ type: 'boolean', value: expected })
  })

  it.each(['string', 'cue-type', 'event'] as const)('reads %s values as text', (type) => {
    expect(variableValue(type, 5)).toEqual({ type, value: '5' })
    expect(variableValue(type, 'beat')).toEqual({ type, value: 'beat' })
  })

  it('reads a colour as that colour, and anything else as blue', () => {
    expect(variableValue('color', 'red')).toEqual({ type: 'color', value: 'red' })
    expect(variableValue('color', 'mauve')).toEqual({ type: 'color', value: 'blue' })
    expect(variableValue('color', 5)).toEqual({ type: 'color', value: 'blue' })
  })

  it('keeps only the known colours of a colour array', () => {
    expect(variableValue('color-array', ['red', 'mauve', 'blue', 3])).toEqual({
      type: 'color-array',
      value: ['red', 'blue'],
    })
    expect(variableValue('color-array', 'red')).toEqual({ type: 'color-array', value: [] })
  })

  it('starts a light array empty whatever it is given', () => {
    expect(variableValue('light-array', [createMockTrackedLight()])).toEqual({
      type: 'light-array',
      value: [],
    })
  })
})

describe('CueSession variable initialisation', () => {
  const variable = (
    type: VariableDefinition['type'],
    initialValue: VariableDefinition['initialValue'],
  ): VariableDefinition => ({ name: 'v', type, scope: 'cue', initialValue })

  it('starts a light-array variable empty whatever it declares', () => {
    const session = new CueSession()
    session.initializeVariables([variable('light-array', ['red'])], [])
    expect(session.getCueLevelVarStore().get('v')).toEqual({ type: 'light-array', value: [] })
  })

  it('holds a number for a number variable declared as a numeric string', () => {
    const session = new CueSession()
    session.initializeVariables([variable('number', '12')], [])
    expect(session.getCueLevelVarStore().get('v')).toEqual({ type: 'number', value: 12 })
  })
})
