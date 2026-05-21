/**
 * Output-rate governor + dirty-skip tests for DmxPublisher.
 *
 * Added to protect cheap USB / low-end sACN adapters from being fed at the render
 * tick rate:
 *  - Governor disabled (no `outputRateHz`): legacy behaviour — every publish sends, no dirty-skip.
 *  - Leading edge: the first governed frame (and any frame after the interval) sends immediately.
 *  - Coalescing: distinct frames inside the interval are held; a single trailing timer flushes
 *    the most recent one (no stale tail).
 *  - Dirty-skip: a frame byte-identical to the last sent frame is not re-sent.
 *  - Manual console mode resets the governor (cancels any in-flight trailing frame).
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { DmxPublisher, type PublisherTiming } from '../../controllers/DmxPublisher'
import { SenderManager } from '../../controllers/SenderManager'
import { LightStateManager } from '../../controllers/sequencer/LightStateManager'
import { StrobeStateManager } from '../../controllers/StrobeStateManager'
import { ConfigStrobeType, FixtureTypes, type DmxRig, type RGBIO } from '../../types'

type Handle = ReturnType<typeof setTimeout>

/** Deterministic, manually-advanced time + timer source. */
class FakeTiming implements PublisherTiming {
  public t = 0
  private timers: Array<{ id: number; fireAt: number; cb: () => void }> = []
  private nextId = 1

  now(): number {
    return this.t
  }
  setTimer(cb: () => void, ms: number): Handle {
    const id = this.nextId++
    this.timers.push({ id, fireAt: this.t + ms, cb })
    return id as unknown as Handle
  }
  clearTimer(handle: Handle): void {
    const id = handle as unknown as number
    this.timers = this.timers.filter((x) => x.id !== id)
  }
  /** Advance virtual time, firing any timers that come due (in order). */
  advance(ms: number): void {
    this.t += ms
    const due = this.timers.filter((x) => x.fireAt <= this.t).sort((a, b) => a.fireAt - b.fireAt)
    this.timers = this.timers.filter((x) => x.fireAt > this.t)
    for (const d of due) {
      d.cb()
    }
  }
}

function rgbio(overrides: Partial<RGBIO> = {}): RGBIO {
  return { red: 0, green: 0, blue: 0, intensity: 0, opacity: 1, blendMode: 'replace', ...overrides }
}

interface Ctx {
  publisher: DmxPublisher
  send: jest.Mock<(buffer: Record<number, number>) => Promise<void>>
  timing: FakeTiming
  publish: (light: RGBIO) => void
  lastBuffer: () => Record<number, number>
}

/** RGB light at channels masterDimmer:1, red:2, green:3, blue:4. */
function setup(outputRateHz?: number): Ctx {
  const send = jest.fn<(buffer: Record<number, number>) => Promise<void>>(() => Promise.resolve())
  const timing = new FakeTiming()
  const publisher = new DmxPublisher(
    { send } as unknown as SenderManager,
    new LightStateManager(),
    new StrobeStateManager(),
    { outputRateHz, timing },
  )
  const rig: DmxRig = {
    id: 'rig-1',
    name: 'Rig',
    active: true,
    config: {
      numLights: 1,
      lightLayout: { id: 'two-rows', label: 'Two Rows (one in front of the other)' },
      strobeType: ConfigStrobeType.None,
      frontLights: [
        {
          id: 'l1',
          fixtureId: 'tpl-1',
          position: 1,
          name: 'L1',
          label: 'L1',
          fixture: FixtureTypes.RGB,
          isStrobeEnabled: false,
          group: 'front',
          universe: 1,
          mount: 'floor',
          channels: {
            masterDimmer: 1,
            red: 2,
            green: 3,
            blue: 4,
          } as unknown as DmxRig['config']['frontLights'][number]['channels'],
        },
      ],
      backLights: [],
      strobeLights: [],
    },
  }
  publisher.updateActiveRigs([rig])
  return {
    publisher,
    send,
    timing,
    publish: (light) => publisher.publish(new Map([['l1', light]])),
    lastBuffer: () => {
      const calls = send.mock.calls
      return calls[calls.length - 1]![0] as Record<number, number>
    },
  }
}

describe('DmxPublisher output governor', () => {
  describe('governor disabled (legacy)', () => {
    let ctx: Ctx
    beforeEach(() => {
      ctx = setup() // no outputRateHz
    })

    it('sends every frame synchronously, including unchanged repeats', () => {
      ctx.publish(rgbio({ red: 255 }))
      ctx.publish(rgbio({ red: 255 })) // identical — still sent (no dirty-skip)
      ctx.publish(rgbio({ red: 255 }))
      expect(ctx.send).toHaveBeenCalledTimes(3)
    })
  })

  describe('governor enabled', () => {
    let ctx: Ctx
    beforeEach(() => {
      ctx = setup(40) // 25 ms interval
    })

    it('sends the first frame immediately (leading edge)', () => {
      ctx.publish(rgbio({ red: 100 }))
      expect(ctx.send).toHaveBeenCalledTimes(1)
      expect(ctx.lastBuffer()[2]).toBe(100)
    })

    it('dirty-skips a frame identical to the last sent frame', () => {
      ctx.publish(rgbio({ red: 100 }))
      expect(ctx.send).toHaveBeenCalledTimes(1)

      ctx.timing.advance(50) // well past the interval
      ctx.publish(rgbio({ red: 100 })) // identical
      expect(ctx.send).toHaveBeenCalledTimes(1) // not re-sent
    })

    it('coalesces over-rate frames and flushes the latest via the trailing timer', () => {
      ctx.publish(rgbio({ red: 10 })) // leading send @ t=0
      expect(ctx.send).toHaveBeenCalledTimes(1)

      ctx.timing.advance(5)
      ctx.publish(rgbio({ red: 20 })) // within interval -> deferred
      ctx.timing.advance(5)
      ctx.publish(rgbio({ red: 30 })) // within interval -> supersedes pending
      expect(ctx.send).toHaveBeenCalledTimes(1) // nothing extra yet

      ctx.timing.advance(20) // t=30, trailing timer (armed for t=25) fires
      expect(ctx.send).toHaveBeenCalledTimes(2)
      expect(ctx.lastBuffer()[2]).toBe(30) // latest, not the intermediate 20
    })

    it('trailing flush is skipped when the pending frame equals the last sent frame', () => {
      ctx.publish(rgbio({ red: 50 })) // leading send @ t=0
      ctx.timing.advance(5)
      ctx.publish(rgbio({ red: 99 })) // deferred
      ctx.timing.advance(5)
      ctx.publish(rgbio({ red: 50 })) // back to the last-sent value
      ctx.timing.advance(30) // trailing fires, but pending == last sent
      expect(ctx.send).toHaveBeenCalledTimes(1)
    })

    it('a frame after the interval elapses sends immediately (new leading edge)', () => {
      ctx.publish(rgbio({ red: 1 }))
      ctx.timing.advance(30) // > 25 ms
      ctx.publish(rgbio({ red: 2 }))
      expect(ctx.send).toHaveBeenCalledTimes(2)
      expect(ctx.lastBuffer()[2]).toBe(2)
    })

    it('setOutputRateHz hot-swaps the rate and drops any in-flight trailing frame', () => {
      ctx.publish(rgbio({ red: 10 })) // leading @ t=0 at 40 Hz (25 ms)
      ctx.timing.advance(5)
      ctx.publish(rgbio({ red: 20 })) // deferred, trailing armed for t=25

      // User lowers the publisher rate mid-flight. The pending frame is dropped so it can't
      // sneak out at the old cadence, and the next publish becomes the new leading edge.
      ctx.publisher.setOutputRateHz(20) // 50 ms
      ctx.timing.advance(100) // well past any old/new interval — no stale trailing send
      expect(ctx.send).toHaveBeenCalledTimes(1)

      ctx.publish(rgbio({ red: 30 })) // new leading edge after the hot-swap reset
      expect(ctx.send).toHaveBeenCalledTimes(2)
      expect(ctx.lastBuffer()[2]).toBe(30)

      // New 50 ms interval is enforced: a frame 30 ms later is deferred, not sent.
      ctx.timing.advance(30)
      ctx.publish(rgbio({ red: 40 }))
      expect(ctx.send).toHaveBeenCalledTimes(2)
      ctx.timing.advance(30) // total 60 ms since the leading send → trailing fires
      expect(ctx.send).toHaveBeenCalledTimes(3)
      expect(ctx.lastBuffer()[2]).toBe(40)
    })

    it('setOutputRateHz(0) disables the governor (pass-through)', () => {
      ctx.publish(rgbio({ red: 1 })) // leading send under 40 Hz
      ctx.publisher.setOutputRateHz(0)
      ctx.publish(rgbio({ red: 1 })) // identical — would dirty-skip when governed, now sent
      ctx.publish(rgbio({ red: 1 }))
      expect(ctx.send).toHaveBeenCalledTimes(3)
    })

    it('manual console mode cancels an in-flight trailing frame', () => {
      ctx.publish(rgbio({ red: 5 })) // leading send
      ctx.timing.advance(5)
      ctx.publish(rgbio({ red: 6 })) // pending + trailing armed

      ctx.publisher.setManualBuffer({ 1: 200 })
      const manualCalls = ctx.send.mock.calls.length
      ctx.timing.advance(50) // trailing timer must not fire stale cue data
      expect(ctx.send).toHaveBeenCalledTimes(manualCalls)

      // After clearing manual mode the next cue frame sends at the leading edge again.
      ctx.publisher.clearManualBuffer()
      ctx.publish(rgbio({ red: 7 }))
      expect(ctx.lastBuffer()[2]).toBe(7)
    })
  })
})
