import { describe, expect, it } from '@jest/globals'
import { resolveActionLayer } from '../../../cues/node/runtime/actionResolver'
import { ExecutionContext } from '../../../cues/node/runtime/ExecutionContext'
import type { VariableValue } from '../../../cues/node/runtime/executionTypes'
import type { CueData } from '../../../cues/types/cueTypes'
import type { NetEventNode } from '../../../cues/types/nodeCueTypes'
import { UnknownValueWarnings } from '../../../cues/node/runtime/valueResolver'

function contextWithLayer(value: number): ExecutionContext {
  const ev: NetEventNode = { id: 'ev', type: 'event', eventType: 'cue-started' }
  const vars = new Map<string, VariableValue>([['lyr', { type: 'number', value }]])
  return new ExecutionContext(ev, {} as CueData, vars, new Map(), new UnknownValueWarnings('test'))
}

describe('resolveActionLayer', () => {
  it.each([
    [300, 255],
    [-3, 0],
    [42, 42],
  ])('keeps a variable layer of %p on the layers that exist, at %p', (value, expected) => {
    const layer = resolveActionLayer({ source: 'variable', name: 'lyr' }, contextWithLayer(value))
    expect(layer).toBe(expected)
  })
})
