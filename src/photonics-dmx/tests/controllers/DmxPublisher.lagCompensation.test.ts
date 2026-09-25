/**
 * Lag compensation holds wire output, never the preview.
 *
 * The rig visualiser is fed from `sendIpc`, which goes out in the frame it was computed in while
 * the fixtures wait. See {@link WireOutputDelay} for why the hold sits at that fork.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { DmxPublisher, type PublisherTiming } from '../../controllers/DmxPublisher'
import { SenderManager } from '../../controllers/SenderManager'
import { LightStateManager } from '../../controllers/sequencer/LightStateManager'
import { StrobeStateManager } from '../../controllers/StrobeStateManager'
import { MasterOutputState } from '../../controllers/MasterOutputState'
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
  advance(ms: number): void {
    this.t += ms
    const due = this.timers.filter((x) => x.fireAt <= this.t).sort((a, b) => a.fireAt - b.fireAt)
    this.timers = this.timers.filter((x) => x.fireAt > this.t)
    for (const d of due) {
      d.cb()
    }
  }
  get armed(): number {
    return this.timers.length
  }
}

function rgbio(overrides: Partial<RGBIO> = {}): RGBIO {
  return { red: 0, green: 0, blue: 0, intensity: 0, opacity: 1, blendMode: 'replace', ...overrides }
}

const LAG_MS = 200

interface Ctx {
  publisher: DmxPublisher
  send: jest.Mock<(slotId: string, buffer: Record<number, number>) => Promise<boolean>>
  sendIpc: jest.Mock<(payload: unknown) => void>
  timing: FakeTiming
  masterOutput: MasterOutputState
  publish: (light: RGBIO) => void
  setLag: (ms: number) => void
}

function setup(options: { sendResult?: boolean } = {}): Ctx {
  const send = jest.fn<(slotId: string, buffer: Record<number, number>) => Promise<boolean>>(() =>
    Promise.resolve(options.sendResult ?? true),
  )
  const sendIpc = jest.fn<(payload: unknown) => void>()
  const mockSenderManager = {
    send,
    sendIpc,
    getEnabledWireSenders: () => ['sacn'],
    isIpcEnabled: () => true,
  }
  const timing = new FakeTiming()
  const masterOutput = new MasterOutputState()
  let lagMs = 0
  const publisher = new DmxPublisher(
    mockSenderManager as unknown as SenderManager,
    new LightStateManager(),
    new StrobeStateManager(),
    { timing, masterOutput, getLagCompensationMs: () => lagMs },
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
          },
        },
      ],
      backLights: [],
      strobeLights: [],
    },
  }
  publisher.updateActiveRigs([rig])
  send.mockClear()
  sendIpc.mockClear()
  return {
    publisher,
    send,
    sendIpc,
    timing,
    masterOutput,
    publish: (light) => publisher.publish(new Map([['l1', light]])),
    setLag: (ms) => {
      lagMs = ms
    },
  }
}

describe('DmxPublisher lag compensation', () => {
  let ctx: Ctx

  beforeEach(() => {
    ctx = setup()
  })

  describe('turned off', () => {
    it('sends on the wire in the publishing frame, arming nothing', () => {
      ctx.publish(rgbio({ red: 255, intensity: 255 }))

      expect(ctx.send).toHaveBeenCalledTimes(1)
      expect(ctx.timing.armed).toBe(0)
    })
  })

  describe('turned on', () => {
    beforeEach(() => {
      ctx.setLag(LAG_MS)
    })

    it('holds the wire frame while the preview goes out at once', () => {
      ctx.publish(rgbio({ red: 255, intensity: 255 }))

      expect(ctx.send).not.toHaveBeenCalled()
      expect(ctx.sendIpc).toHaveBeenCalledTimes(1)

      ctx.timing.advance(LAG_MS)
      expect(ctx.send).toHaveBeenCalledTimes(1)
    })

    it('holds for the delay and no longer', () => {
      ctx.publish(rgbio({ red: 255, intensity: 255 }))

      ctx.timing.advance(LAG_MS - 1)
      expect(ctx.send).not.toHaveBeenCalled()

      ctx.timing.advance(1)
      expect(ctx.send).toHaveBeenCalledTimes(1)
    })

    it('sends what was published, not what the buffer became later', () => {
      // The governor reuses and mutates one buffer per slot, so the queue has to hold a copy.
      ctx.publish(rgbio({ red: 255, intensity: 255 }))
      ctx.publish(rgbio({ red: 0, green: 255, intensity: 255 }))

      ctx.timing.advance(LAG_MS * 2)

      const first = ctx.send.mock.calls[0]![1]
      expect(first[2]).toBe(255)
      expect(first[3]).toBe(0)
    })

    it('keeps frames in the order they were published', () => {
      ctx.publish(rgbio({ red: 10, intensity: 255 }))
      ctx.timing.advance(10)
      ctx.publish(rgbio({ red: 20, intensity: 255 }))

      ctx.timing.advance(LAG_MS * 2)

      const reds = ctx.send.mock.calls.map((call) => call[1][2])
      expect(reds).toEqual([10, 20])
    })

    it('leaves no timer armed once the queue drains', () => {
      ctx.publish(rgbio({ red: 255, intensity: 255 }))
      ctx.timing.advance(LAG_MS)

      expect(ctx.timing.armed).toBe(0)
    })
  })

  describe('controls the operator expects to act now', () => {
    beforeEach(() => {
      ctx.setLag(LAG_MS)
    })

    it('blacks out immediately and drops what was held', () => {
      ctx.publish(rgbio({ red: 255, intensity: 255 }))
      expect(ctx.send).not.toHaveBeenCalled()

      ctx.masterOutput.setBlackout(true)
      ctx.publisher.refreshOutput()

      // The blackout lands in the same tick, and the lit frame behind it never arrives.
      expect(ctx.send).toHaveBeenCalledTimes(1)
      const blackedOut = ctx.send.mock.calls[0]![1]
      expect(blackedOut[2]).toBe(0)

      ctx.timing.advance(LAG_MS * 5)
      expect(ctx.send).toHaveBeenCalledTimes(1)
    })

    it('applies a master dimmer change without waiting out the delay', () => {
      ctx.publish(rgbio({ red: 255, intensity: 255 }))
      ctx.timing.advance(LAG_MS)
      ctx.send.mockClear()

      ctx.masterOutput.setDimmerPercent(50)
      ctx.publisher.refreshOutput()

      expect(ctx.send).toHaveBeenCalledTimes(1)
    })
  })

  describe('shutdown', () => {
    it('blacks out even with frames still held, and leaves no timer armed', () => {
      ctx.setLag(LAG_MS)
      ctx.publish(rgbio({ red: 255, intensity: 255 }))
      expect(ctx.send).not.toHaveBeenCalled()

      ctx.publisher.shutdown()

      expect(ctx.send).toHaveBeenCalledTimes(1)
      const buffer = ctx.send.mock.calls[0]![1]
      expect(Object.values(buffer).every((value) => value === 0)).toBe(true)

      ctx.timing.advance(LAG_MS * 5)
      expect(ctx.send).toHaveBeenCalledTimes(1)
      expect(ctx.timing.armed).toBe(0)
    })
  })

  it('reports a failed send back to the governor once the held frame goes out', async () => {
    const failing = setup({ sendResult: false })
    failing.setLag(LAG_MS)

    failing.publish(rgbio({ red: 255, intensity: 255 }))
    failing.timing.advance(LAG_MS)

    // The governor drops its dirty-skip cache on a failure, so an unchanged scene sends again.
    await Promise.resolve()
    failing.send.mockClear()
    failing.publish(rgbio({ red: 255, intensity: 255 }))
    failing.timing.advance(LAG_MS)

    expect(failing.send).toHaveBeenCalledTimes(1)
  })
})
