/**
 * Guards the cue-path blend-mode resolution. A cue/effect action's blendMode flows through
 * resolveBlendMode before reaching the compositor; this validates that 'mix' (and the other
 * real modes) survive resolution rather than being coerced to 'replace'. Regression guard for
 * the YARG Alt 1 > Score crossfade fix.
 */
import { resolveBlendMode } from '../../../../cues/node/runtime/valueResolver'
import type { ExecutionContext } from '../../../../cues/node/runtime/ExecutionContext'
import type { ValueSource } from '../../../../cues/types/nodeCueTypes'

// Literal blendMode resolution doesn't read the context.
const ctx = {} as ExecutionContext
const literal = (value: string): ValueSource => ({ source: 'literal', value })

describe('resolveBlendMode', () => {
  it('preserves every supported blend mode, including mix', () => {
    for (const mode of ['replace', 'add', 'mix']) {
      expect(resolveBlendMode(literal(mode), ctx)).toBe(mode)
    }
  })

  it('coerces the removed modes (multiply, overlay) to replace', () => {
    expect(resolveBlendMode(literal('multiply'), ctx)).toBe('replace')
    expect(resolveBlendMode(literal('overlay'), ctx)).toBe('replace')
  })

  it('falls back to replace for an unknown mode', () => {
    expect(resolveBlendMode(literal('bogus'), ctx)).toBe('replace')
  })

  it('returns undefined when no source is provided', () => {
    expect(resolveBlendMode(undefined, ctx)).toBeUndefined()
  })
})
