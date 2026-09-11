/**
 * The trailing-edge throttle the network senders share: the first frame of a burst goes out, later
 * ones inside the interval are held, and one timer flushes the newest held frame.
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { BaseSender } from '../../senders/BaseSender'

const INTERVAL_MS = 25

/** Records every frame that gets past the throttle, copied at the moment it goes out. */
class RecordingSender extends BaseSender {
  readonly sent: Array<Record<number, number>> = []

  constructor(minIntervalMs: number) {
    super()
    this.minIntervalMs = minIntervalMs
  }

  public async start(): Promise<void> {
    return Promise.resolve()
  }

  public async stop(): Promise<void> {
    this.cancelThrottledSend()
    return Promise.resolve()
  }

  public async send(universeBuffer: Record<number, number>): Promise<boolean> {
    if (!this.throttleSend(universeBuffer)) {
      this.sent.push({ ...universeBuffer })
    }
    return true
  }

  public getUniverse(): number {
    return 1
  }

  protected verifySenderStarted(): void {
    return
  }
}

// The throttle reads performance.now, so the clock moves by hand and the flush timer runs on its
// own. That lets the clock pass the interval before the timer has fired.
let now = 0

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['performance'] })
  // The throttle reads 0 as never sent, so the clock starts elsewhere.
  now = 1000
  jest.spyOn(performance, 'now').mockImplementation(() => now)
})

afterEach(() => {
  jest.restoreAllMocks()
  jest.useRealTimers()
})

describe('BaseSender send throttle', () => {
  it('never holds a frame when no interval is set', async () => {
    const sender = new RecordingSender(0)
    await sender.send({ 1: 10 })
    await sender.send({ 1: 20 })
    expect(sender.sent).toEqual([{ 1: 10 }, { 1: 20 }])
    expect(jest.getTimerCount()).toBe(0)
  })

  it('sends the first frame and holds the next one inside the interval', async () => {
    const sender = new RecordingSender(INTERVAL_MS)
    await sender.send({ 1: 10 })
    now += 10
    await sender.send({ 1: 20 })
    expect(sender.sent).toEqual([{ 1: 10 }])
  })

  it('flushes only the newest held frame, once, when the interval ends', async () => {
    const sender = new RecordingSender(INTERVAL_MS)
    await sender.send({ 1: 10 })
    now += 10
    await sender.send({ 1: 20 })
    await sender.send({ 1: 30 })
    now += 15
    jest.advanceTimersByTime(15)
    expect(sender.sent).toEqual([{ 1: 10 }, { 1: 30 }])

    now += 100
    jest.advanceTimersByTime(100)
    expect(sender.sent).toHaveLength(2)
  })

  it('flushes a held frame as it was when held, not as the caller later changed it', async () => {
    const sender = new RecordingSender(INTERVAL_MS)
    await sender.send({ 1: 10 })
    now += 10
    const frame = { 1: 20 }
    await sender.send(frame)
    frame[1] = 99
    now += 15
    jest.advanceTimersByTime(15)
    expect(sender.sent).toEqual([{ 1: 10 }, { 1: 20 }])
  })

  it('drops a held frame once a newer one goes out after the interval', async () => {
    const sender = new RecordingSender(INTERVAL_MS)
    await sender.send({ 1: 10 })
    now += 10
    await sender.send({ 1: 20 })
    // Past the interval, with the flush timer still pending.
    now += 30
    await sender.send({ 1: 40 })
    jest.advanceTimersByTime(15)
    expect(sender.sent).toEqual([{ 1: 10 }, { 1: 40 }])
  })

  it('forgets the held frame and the last send time on stop', async () => {
    const sender = new RecordingSender(INTERVAL_MS)
    await sender.send({ 1: 10 })
    now += 10
    await sender.send({ 1: 20 })
    await sender.stop()
    expect(jest.getTimerCount()).toBe(0)

    now += 1
    await sender.send({ 1: 30 })
    expect(sender.sent).toEqual([{ 1: 10 }, { 1: 30 }])
  })
})
