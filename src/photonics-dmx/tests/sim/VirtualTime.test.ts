import { describe, it, expect, afterEach } from '@jest/globals'
import { performance as nodePerformance } from 'perf_hooks'
import { VirtualTime } from '../../sim/VirtualTime'

/**
 * The sinon clock and the `performance.now` patch are process-global, so ownership passes from one
 * VirtualTime to the next. Jest abandons a timed-out test without running its `finally`, which is
 * how an instance is left installed on a slow CI runner.
 */
describe('VirtualTime ownership', () => {
  const live: VirtualTime[] = []
  const track = (vt: VirtualTime): VirtualTime => {
    live.push(vt)
    return vt
  }

  afterEach(() => {
    while (live.length > 0) live.pop()?.dispose()
  })

  it('reclaims the clock from an instance that never disposed', () => {
    const abandoned = track(new VirtualTime())
    abandoned.install()

    const next = track(new VirtualTime())
    expect(() => next.install()).not.toThrow()
    expect(next.isInstalled()).toBe(true)
    expect(abandoned.isInstalled()).toBe(false)
  })

  it('leaves the active clock alone when a superseded instance disposes late', () => {
    const abandoned = track(new VirtualTime())
    abandoned.install()
    const next = track(new VirtualTime())
    next.install()

    // The abandoned instance disposes late, after the next one has already taken over.
    abandoned.dispose()

    expect(next.isInstalled()).toBe(true)
    // Still the virtual clock, not restored to wall time.
    expect(nodePerformance.now()).toBe(0)
  })

  it('restores real time once the owner disposes', () => {
    const vt = track(new VirtualTime())
    vt.install()
    expect(nodePerformance.now()).toBe(0)

    vt.dispose()
    expect(vt.isInstalled()).toBe(false)
    expect(nodePerformance.now()).toBeGreaterThan(0)
  })

  it('is safe to dispose more than once', () => {
    const vt = track(new VirtualTime())
    vt.install()
    vt.dispose()
    expect(() => vt.dispose()).not.toThrow()
  })

  it('rejects installing the same instance twice', () => {
    const vt = track(new VirtualTime())
    vt.install()
    expect(() => vt.install()).toThrow(/already installed/)
  })
})
