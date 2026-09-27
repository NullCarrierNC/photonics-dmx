import { describe, expect, it } from '@jest/globals'
import { parameterRules } from '../../../cues/node/cueValueRules'

describe('parameterRules', () => {
  it('gives a parameter named like a conventional field that field rule', () => {
    expect(parameterRules({ name: 'blendMode', type: 'string' }, [])).toEqual(['blend-mode'])
  })

  it.each(['toString', 'constructor'])('gives a parameter named %s no rule', (name) => {
    expect(parameterRules({ name, type: 'number' }, [])).toEqual([])
  })
})
