import { describe, expect, it, jest } from '@jest/globals'
import { resolveActionLayer } from '../../../cues/node/runtime/actionResolver'
import { ExecutionContext } from '../../../cues/node/runtime/ExecutionContext'
import type { VariableValue } from '../../../cues/node/runtime/executionTypes'
import type { CueData } from '../../../cues/types/cueTypes'
import type { NetEventNode } from '../../../cues/types/nodeCueTypes'
import { UnknownValueWarnings } from '../../../cues/node/runtime/valueResolver'

function contextWithLayer(value: number, warnings = new UnknownValueWarnings('test')) {
  const ev: NetEventNode = { id: 'ev', type: 'event', eventType: 'cue-started' }
  const vars = new Map<string, VariableValue>([['lyr', { type: 'number', value }]])
  return new ExecutionContext(ev, {} as CueData, vars, new Map(), warnings)
}

describe('resolveActionLayer', () => {
  it.each([
    [300, 254],
    [255, 254],
    [-3, 0],
    [42, 42],
    [254, 254],
  ])('keeps a variable layer of %p on the layers a cue draws on, at %p', (value, expected) => {
    const layer = resolveActionLayer({ source: 'variable', name: 'lyr' }, contextWithLayer(value))
    expect(layer).toBe(expected)
  })

  it.each([255, 300, -3])('reports a variable layer of %p outside those layers', (value) => {
    const warnings = new UnknownValueWarnings('test')
    const report = jest.spyOn(warnings, 'report')

    resolveActionLayer({ source: 'variable', name: 'lyr' }, contextWithLayer(value, warnings))

    expect(report).toHaveBeenCalledWith('layer', value, expect.stringContaining('layer'))
  })

  it('reports nothing for a layer a cue may draw on', () => {
    const warnings = new UnknownValueWarnings('test')
    const report = jest.spyOn(warnings, 'report')

    resolveActionLayer({ source: 'variable', name: 'lyr' }, contextWithLayer(254, warnings))

    expect(report).not.toHaveBeenCalled()
  })
})
