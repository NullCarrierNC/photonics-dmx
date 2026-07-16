import { beforeEach, afterEach, describe, expect, it, jest } from '@jest/globals'
import { Clock } from '../../controllers/sequencer/Clock'
import { setLogSink, resetLogConfiguration, type LogEntry } from '../../../shared/logger'

describe('Clock', () => {
  let clock: Clock

  beforeEach(() => {
    jest.useFakeTimers()
    clock = new Clock()
  })

  afterEach(() => {
    clock.destroy()
    jest.useRealTimers()
  })

  describe('constructor', () => {
    it('should initialize with correct initial state', () => {
      expect(clock.isActive()).toBe(false)
      expect(clock.getCurrentTimeMs()).toBe(0)
      expect(clock.getTickCount()).toBe(0)
    })
  })

  describe('start and stop', () => {
    it('should start and stop correctly', () => {
      clock.start()
      expect(clock.isActive()).toBe(true)

      clock.stop()
      expect(clock.isActive()).toBe(false)
    })

    it('should not start multiple times', () => {
      clock.start()
      clock.start()
      expect(clock.isActive()).toBe(true)
    })

    it('should not stop when not running', () => {
      clock.stop()
      expect(clock.isActive()).toBe(false)
    })
  })

  describe('time tracking', () => {
    it('should track tick count correctly', () => {
      expect(clock.getTickCount()).toBe(0)

      // In test environment, tick count should increment even without real timing
      clock.start()
      expect(clock.getTickCount()).toBe(0) // Still 0 until first update

      clock.stop()
    })

    it('should provide absolute time', () => {
      const absoluteTime = clock.getAbsoluteTimeMs()
      expect(typeof absoluteTime).toBe('number')
      expect(absoluteTime).toBeGreaterThanOrEqual(0)
    })
  })

  describe('destroy', () => {
    it('should clean up resources on destroy', () => {
      clock.start()
      expect(clock.isActive()).toBe(true)

      clock.destroy()
      expect(clock.isActive()).toBe(false)
    })
  })

  describe('cadence', () => {
    // The whole sequencer runs off this tick, so a regression in the tick rate would silently
    // rescale every fade and strobe. These pin the rate under deterministic fake timers.
    it('ticks about once per interval over a span', () => {
      const c = new Clock(10)
      c.start()
      jest.advanceTimersByTime(100)
      // ~10 ticks over 100ms at a 10ms interval (drift correction lands the last tick on the edge).
      expect(c.getTickCount()).toBeGreaterThanOrEqual(9)
      expect(c.getTickCount()).toBeLessThanOrEqual(10)
      c.destroy()
    })

    it('ticks proportionally fewer times with a larger interval', () => {
      const fast = new Clock(10)
      const slow = new Clock(25)
      fast.start()
      slow.start()
      jest.advanceTimersByTime(100)
      expect(slow.getTickCount()).toBeLessThan(fast.getTickCount())
      expect(slow.getTickCount()).toBeGreaterThanOrEqual(3)
      expect(slow.getTickCount()).toBeLessThanOrEqual(4)
      fast.destroy()
      slow.destroy()
    })

    it('calls each registered tick callback once per tick', () => {
      const cb = jest.fn()
      const c = new Clock(10)
      c.onTick(cb)
      c.start()
      jest.advanceTimersByTime(50)
      expect(cb.mock.calls.length).toBe(c.getTickCount())
      expect(cb.mock.calls.length).toBeGreaterThanOrEqual(4)
      c.destroy()
    })

    it('warns once when the tick callbacks overrun the interval', () => {
      // Real timers so performance.now() advances for a real busy-wait (fake timers can freeze it).
      jest.useRealTimers()
      const entries: LogEntry[] = []
      setLogSink((e) => entries.push(e))
      try {
        const c = new Clock(10) // overrun threshold is 20ms
        c.onTick(() => {
          const start = performance.now()
          while (performance.now() - start < 25) {
            // busy-wait past the threshold
          }
        })
        const tick = (): void => (c as unknown as { update(): void }).update()
        const overrunWarns = (): number =>
          entries.filter((e) => e.level === 'warn' && e.message.includes('over the')).length

        tick()
        expect(overrunWarns()).toBe(1)
        // A second overrunning tick in the same episode does not re-warn.
        tick()
        expect(overrunWarns()).toBe(1)
        c.destroy()
      } finally {
        resetLogConfiguration()
      }
    })

    it('clamps the interval to the 1-100ms range and still ticks', () => {
      // 0 clamps up to 1ms, 1000 clamps down to 100ms. Neither should stall.
      const tooFast = new Clock(0)
      const tooSlow = new Clock(1000)
      tooFast.start()
      tooSlow.start()
      jest.advanceTimersByTime(200)
      expect(tooFast.getTickCount()).toBeGreaterThan(0)
      expect(tooSlow.getTickCount()).toBeGreaterThan(0)
      // The 1ms clock ticks far more often than the 100ms clock.
      expect(tooFast.getTickCount()).toBeGreaterThan(tooSlow.getTickCount())
      tooFast.destroy()
      tooSlow.destroy()
    })
  })
})
