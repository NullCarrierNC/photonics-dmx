/**
 * Cue-path blend-mode resolution. A cue or effect action's blendMode flows through
 * resolveBlendMode before it reaches the compositor, and 'mix' and the other real modes come
 * through as themselves rather than coerced to 'replace'.
 */
import { jest } from '@jest/globals'
import { UnknownValueWarnings, resolveBlendMode } from '../../../../cues/node/runtime/valueResolver'
import { ExecutionContext } from '../../../../cues/node/runtime/ExecutionContext'
import type { VariableValue } from '../../../../cues/node/runtime/executionTypes'
import type { CueData } from '../../../../cues/types/cueTypes'
import type { NetEventNode, ValueSource } from '../../../../cues/types/nodeCueTypes'

const literal = (value: string): ValueSource => ({ source: 'literal', value })

/** A context whose variable `blend` holds `held`, with a spy on the warnings it reports. */
function contextHolding(held = '') {
  const warnings = new UnknownValueWarnings('test')
  const report = jest.spyOn(warnings, 'report')
  const ev: NetEventNode = { id: 'ev', type: 'event', eventType: 'cue-started' }
  const vars = new Map<string, VariableValue>([['blend', { type: 'string', value: held }]])
  return { ctx: new ExecutionContext(ev, {} as CueData, vars, new Map(), warnings), report }
}

describe('resolveBlendMode', () => {
  it('preserves every supported blend mode, including mix', () => {
    const { ctx, report } = contextHolding()
    for (const mode of ['replace', 'add', 'mix']) {
      expect(resolveBlendMode(literal(mode), ctx)).toBe(mode)
    }
    expect(report).not.toHaveBeenCalled()
  })

  it('coerces the removed modes (multiply, overlay) to replace', () => {
    const { ctx } = contextHolding()
    expect(resolveBlendMode(literal('multiply'), ctx)).toBe('replace')
    expect(resolveBlendMode(literal('overlay'), ctx)).toBe('replace')
  })

  it('blends a variable holding a mode this version does not know as replace, and warns', () => {
    const { ctx, report } = contextHolding('glow')

    expect(resolveBlendMode({ source: 'variable', name: 'blend' }, ctx)).toBe('replace')
    expect(report).toHaveBeenCalledWith('blend mode', 'glow', 'blending as replace')
  })

  it('returns undefined when no source is provided', () => {
    const { ctx } = contextHolding()
    expect(resolveBlendMode(undefined, ctx)).toBeUndefined()
  })
})
