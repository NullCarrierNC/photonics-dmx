/**
 * Tests for the microsecond busy-wait used to time OpenDMX BREAK/MAB framing.
 * Timing bounds are deliberately loose: the busy-wait can only overshoot (it
 * spins on the monotonic clock), so the lower bound is safe, and the high
 * ceiling guards against a runaway loop without being flaky under load.
 */
import { describe, expect, it } from '@jest/globals'
import { usleep } from '../../senders/usleep'

function elapsedMicros(fn: () => void): number {
  const start = process.hrtime.bigint()
  fn()
  return Number(process.hrtime.bigint() - start) / 1000
}

describe('usleep', () => {
  it('blocks for at least the requested duration', () => {
    const elapsed = elapsedMicros(() => usleep(1000))
    expect(elapsed).toBeGreaterThanOrEqual(900)
    expect(elapsed).toBeLessThan(50_000)
  })

  it('returns promptly for zero', () => {
    expect(elapsedMicros(() => usleep(0))).toBeLessThan(5_000)
  })

  it('does not throw or hang on non-positive or non-finite input', () => {
    expect(() => usleep(-5)).not.toThrow()
    expect(() => usleep(Number.NaN)).not.toThrow()
    expect(() => usleep(Number.POSITIVE_INFINITY)).not.toThrow()
    expect(elapsedMicros(() => usleep(Number.NaN))).toBeLessThan(5_000)
  })
})
