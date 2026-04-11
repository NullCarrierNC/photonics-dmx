import { describe, expect, it } from '@jest/globals'
import {
  resolvedMotionPatternSettingsEqual,
  resolvedMotionPatternSettingsEqualExceptBearing,
} from '../../../cues/node/compiler/ActionEffectFactory'
import { resolveMotionPattern } from '../../../cues/node/runtime/actionResolver'
import { ExecutionContext } from '../../../cues/node/runtime/ExecutionContext'
import type { CueData } from '../../../cues/types/cueTypes'
import type { NodeMotionPatternSetting, YargEventNode } from '../../../cues/types/nodeCueTypes'

function makeContext(): ExecutionContext {
  const ev: YargEventNode = { id: 'ev', type: 'event', eventType: 'cue-started' }
  return new ExecutionContext(ev, {} as CueData, new Map(), new Map())
}

function literalPattern(pattern: string): NodeMotionPatternSetting {
  return {
    pattern: { source: 'literal', value: pattern },
    speed: { source: 'literal', value: 0.5 },
    size: { source: 'literal', value: 40 },
  }
}

describe('resolveMotionPattern presets', () => {
  it('expands figure-8 with cosine tilt at 2x for a proper infinity Lissajous', () => {
    const ctx = makeContext()
    const r = resolveMotionPattern(literalPattern('figure-8'), ctx)
    expect(r.panWaveform).toBe('sine')
    expect(r.tiltWaveform).toBe('cosine')
    expect(r.tiltFreqMultiplier).toBe(2)
  })

  it('expands star with sine tilt at 2x (bowtie / star Lissajous)', () => {
    const ctx = makeContext()
    const r = resolveMotionPattern(literalPattern('star'), ctx)
    expect(r.panWaveform).toBe('sine')
    expect(r.tiltWaveform).toBe('sine')
    expect(r.tiltFreqMultiplier).toBe(2)
    expect(r.gimbalCompensation).toBe(false)
  })

  it('enables gimbal compensation only for circle preset', () => {
    const ctx = makeContext()
    expect(resolveMotionPattern(literalPattern('circle'), ctx).gimbalCompensation).toBe(true)
    expect(resolveMotionPattern(literalPattern('figure-8'), ctx).gimbalCompensation).toBe(false)
    expect(resolveMotionPattern(literalPattern('linear-sweep'), ctx).gimbalCompensation).toBe(false)
  })

  it('resolvedMotionPatternSettingsEqual includes gimbalCompensation', () => {
    const ctx = makeContext()
    const a = resolveMotionPattern(literalPattern('circle'), ctx)
    const b = { ...a, gimbalCompensation: false }
    expect(resolvedMotionPatternSettingsEqual(a, a)).toBe(true)
    expect(resolvedMotionPatternSettingsEqual(a, b)).toBe(false)
  })

  it('circle defaults bearingDeg to 180 (downstage) when bearing is omitted', () => {
    const ctx = makeContext()
    const r = resolveMotionPattern(literalPattern('circle'), ctx)
    expect(r.bearingDeg).toBe(180)
  })

  it('defaults reverse to false when omitted', () => {
    const ctx = makeContext()
    expect(resolveMotionPattern(literalPattern('circle'), ctx).reverse).toBe(false)
  })

  it('resolves literal reverse', () => {
    const ctx = makeContext()
    const r = resolveMotionPattern(
      { ...literalPattern('circle'), reverse: { source: 'literal', value: true } },
      ctx,
    )
    expect(r.reverse).toBe(true)
  })

  it('resolvedMotionPatternSettingsEqual includes reverse', () => {
    const ctx = makeContext()
    const a = resolveMotionPattern(literalPattern('circle'), ctx)
    const b = { ...a, reverse: true }
    expect(resolvedMotionPatternSettingsEqual(a, b)).toBe(false)
  })

  it('circle resolves named bearing', () => {
    const ctx = makeContext()
    const r = resolveMotionPattern(
      {
        ...literalPattern('circle'),
        bearing: { source: 'literal', value: 'stage-right' },
      },
      ctx,
    )
    expect(r.bearingDeg).toBe(90)
  })

  it('resolvedMotionPatternSettingsEqualExceptBearing ignores bearingDeg', () => {
    const ctx = makeContext()
    const a = resolveMotionPattern(literalPattern('circle'), ctx)
    const b = { ...a, bearingDeg: 45 }
    expect(resolvedMotionPatternSettingsEqualExceptBearing(a, b)).toBe(true)
    expect(resolvedMotionPatternSettingsEqual(a, b)).toBe(false)
  })
})
