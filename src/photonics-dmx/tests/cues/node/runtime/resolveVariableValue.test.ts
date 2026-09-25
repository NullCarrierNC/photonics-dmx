import { describe, expect, it } from '@jest/globals'
import { ExecutionContext } from '../../../../cues/node/runtime/ExecutionContext'
import {
  resolveVariableValue,
  UninitializedVariableError,
} from '../../../../cues/node/runtime/valueResolver'
import type { VariableValue } from '../../../../cues/node/runtime/executionTypes'
import type { CueData } from '../../../../cues/types/cueTypes'
import type { NetEventNode, ValueSource } from '../../../../cues/types/nodeCueTypes'
import { createMockTrackedLight } from '../../../helpers/testFixtures'

function contextWith(variables: Record<string, VariableValue> = {}): ExecutionContext {
  const ev: NetEventNode = { id: 'ev', type: 'event', eventType: 'cue-started' }
  return new ExecutionContext(ev, {} as CueData, new Map(Object.entries(variables)), new Map())
}

const literal = (value: number | boolean | string): ValueSource => ({ source: 'literal', value })
const variable = (name: string): ValueSource => ({ source: 'variable', name })

describe('resolveVariableValue', () => {
  it.each([
    ['a number as a number', 'number', literal(150), 150],
    ['a numeric string as a number', 'number', literal('42.5'), 42.5],
    ['an unreadable string as a number', 'number', literal('fast'), 0],
    ['a string as a string', 'string', literal('beat'), 'beat'],
    ['a number as a string', 'string', literal(5), '5'],
    ['a colour name as a colour', 'color', literal('blue'), 'blue'],
    ['a flag as a flag', 'boolean', literal(true), true],
  ] as const)('reads %s', (_label, type, source, expected) => {
    expect(resolveVariableValue(type, source, contextWith())).toEqual({ type, value: expected })
  })

  it('reads a light-array variable as its lights', () => {
    const lights = [createMockTrackedLight()]
    const context = contextWith({ rig: { type: 'light-array', value: lights } })
    expect(resolveVariableValue('light-array', variable('rig'), context)).toEqual({
      type: 'light-array',
      value: lights,
    })
  })

  it('reads a variable of another type as no lights', () => {
    const context = contextWith({ rig: { type: 'number', value: 3 } })
    expect(resolveVariableValue('light-array', variable('rig'), context)).toEqual({
      type: 'light-array',
      value: [],
    })
  })

  it.each<[string, VariableValue]>([
    ['an empty light array', { type: 'light-array', value: [] }],
    ['a colour array', { type: 'color-array', value: ['red'] }],
    ['NaN', { type: 'number', value: Number.NaN }],
  ])('reads a variable holding %s as the number 0', (_label, held) => {
    const context = contextWith({ v: held })
    expect(resolveVariableValue('number', variable('v'), context)).toEqual({
      type: 'number',
      value: 0,
    })
  })

  it('throws for a variable that was never set', () => {
    expect(() => resolveVariableValue('number', variable('missing'), contextWith())).toThrow(
      UninitializedVariableError,
    )
  })
})
