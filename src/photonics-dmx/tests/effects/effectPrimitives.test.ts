/**
 * Regression tests for legacy effect primitives:
 *  - getSweepEffect must not divide sweepTime by zero groups when no lights are given.
 *  - getEffectFadeInColorFadeOut must carry its own id, not the cross-fade id it was copied from.
 *  - getEffectFlashColor holds bright then dark for equal time (the looping menu-breath rhythm).
 */
import { describe, expect, it } from '@jest/globals'
import { getSweepEffect } from '../../effects/sweepEffect'
import { getEffectFadeInColorFadeOut } from '../../effects/effectFadeInColorFadeOut'
import { getEffectFlashColor } from '../../effects/effectFlashColor'
import { createMockRGBIP, createMockTrackedLight } from '../helpers/testFixtures'

const isFiniteTransform = (duration: number): boolean => Number.isFinite(duration)

describe('getSweepEffect', () => {
  it('returns an empty sweep with no lights instead of dividing by zero', () => {
    // waitFor 'beat' pushes a trigger transition before the per-group loop, so without the
    // zero-groups guard the divide-by-zero (Infinity/NaN slot time) reaches a real transition.
    const effect = getSweepEffect({
      lights: [],
      high: createMockRGBIP(),
      low: createMockRGBIP({ intensity: 0 }),
      sweepTime: 1000,
      fadeInDuration: 100,
      fadeOutDuration: 100,
      waitFor: 'beat',
    })
    expect(effect.transitions).toEqual([])
    for (const t of effect.transitions) {
      expect(Number.isFinite(t.waitUntilTime)).toBe(true)
      expect(Number.isFinite(t.transform.duration)).toBe(true)
    }
  })

  it('produces only finite transition durations with real lights', () => {
    const effect = getSweepEffect({
      lights: [
        createMockTrackedLight({ id: 'l1', position: 0 }),
        createMockTrackedLight({ id: 'l2', position: 1 }),
      ],
      high: createMockRGBIP(),
      low: createMockRGBIP({ intensity: 0 }),
      sweepTime: 1000,
      fadeInDuration: 100,
      fadeOutDuration: 100,
    })
    expect(effect.transitions.length).toBeGreaterThan(0)
    for (const t of effect.transitions) {
      expect(isFiniteTransform(t.transform.duration)).toBe(true)
      expect(isFiniteTransform(t.waitUntilTime)).toBe(true)
    }
  })
})

describe('getEffectFadeInColorFadeOut', () => {
  it('carries its own id, not the cross-fade id', () => {
    const effect = getEffectFadeInColorFadeOut({
      startColor: createMockRGBIP({ intensity: 0 }),
      endColor: createMockRGBIP(),
      waitBeforeFadeIn: 0,
      fadeInDuration: 100,
      holdDuration: 100,
      fadeOutDuration: 100,
      waitAfterFadeOut: 0,
      lights: [createMockTrackedLight()],
    })
    expect(effect.id).toBe('fade-in-color-fade-out')
  })
})

describe('getEffectFlashColor', () => {
  it('holds the flash colour bright then holds dark for equal time', () => {
    const holdTime = 750
    const effect = getEffectFlashColor({
      color: createMockRGBIP(),
      startTrigger: 'delay',
      durationIn: 500,
      holdTime,
      durationOut: 500,
      lights: [createMockTrackedLight()],
    })
    expect(effect.transitions).toHaveLength(2)
    // Both phases dwell for holdTime: bright hold (phase 1) then dark hold (phase 2).
    expect(effect.transitions[0].waitUntilTime).toBe(holdTime)
    expect(effect.transitions[1].waitUntilTime).toBe(holdTime)
    // The fade-out phase drives intensity to 0 (dark).
    expect(effect.transitions[1].transform.color.intensity).toBe(0)
  })
})
