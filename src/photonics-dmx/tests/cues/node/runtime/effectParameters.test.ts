import { describe, expect, it } from '@jest/globals'
import { effectParameterValue } from '../../../../cues/node/runtime/effectParameters'
import type { VariableDefinition } from '../../../../cues/types/nodeCueTypes'

const parameter = (
  type: VariableDefinition['type'],
  initialValue: VariableDefinition['initialValue'],
): VariableDefinition => ({ name: 'p', type, scope: 'cue', initialValue, isParameter: true })

describe('effectParameterValue', () => {
  const lights = [{ id: 'l1', position: 0 }]

  it.each([
    ['a number for a number', parameter('number', 0), 150, 150],
    ['a numeric string for a number', parameter('number', 0), '42.5', 42.5],
    ['an unreadable string for a number', parameter('number', 0), 'fast', 0],
    ['a string for a string', parameter('string', ''), 'beat', 'beat'],
    ['a number for a string', parameter('string', ''), 5, '5'],
    ['a colour name for a colour', parameter('color', 'red'), 'blue', 'blue'],
    ['a flag for a flag', parameter('boolean', false), true, true],
  ] as const)('keeps %s', (_label, variable, given, expected) => {
    expect(effectParameterValue(given, variable)).toEqual(expected)
  })

  it('keeps a light array for a light-array parameter', () => {
    expect(effectParameterValue(lights, parameter('light-array', []))).toEqual(lights)
  })

  it('uses the initial value, coerced, for a parameter the raiser does not send', () => {
    expect(effectParameterValue(undefined, parameter('number', 75))).toBe(75)
    expect(effectParameterValue(undefined, parameter('number', '12'))).toBe(12)
    expect(effectParameterValue(undefined, parameter('string', 'strobe'))).toBe('strobe')
  })
})
