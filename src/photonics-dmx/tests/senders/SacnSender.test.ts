/**
 * SacnSender tests: construction, start/stop lifecycle, send, getUniverse, error callback.
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { Sender } from 'sacn'
import { SacnSender } from '../../senders/SacnSender'
import { SenderError } from '../../senders/BaseSender'

const mockSend = jest.fn().mockImplementation(() => Promise.resolve())
const mockClose = jest.fn()

jest.mock('sacn', () => ({
  Sender: jest.fn().mockImplementation(() => ({
    send: mockSend,
    close: mockClose,
  })),
}))

describe('SacnSender', () => {
  let sender: SacnSender

  beforeEach(() => {
    jest.clearAllMocks()
    sender = new SacnSender({ universe: 5 })
  })

  afterEach(async () => {
    await sender.stop().catch(() => {})
  })

  it('constructs with default config', () => {
    const defaultSender = new SacnSender()
    expect(defaultSender.getUniverse()).toBe(1)
  })

  it('constructs with custom universe', () => {
    expect(sender.getUniverse()).toBe(5)
  })

  it('start initializes sender', async () => {
    await sender.start()
    expect(sender.getUniverse()).toBe(5)
  })

  it('send passes buffer to sACN sender after start', async () => {
    await sender.start()
    await sender.send({ 1: 255, 2: 128 })
    expect(mockSend).toHaveBeenCalledWith({ payload: { 1: 255, 2: 128 } })
  })

  it('flushes the last throttled frame on the trailing edge', async () => {
    jest.useFakeTimers()
    try {
      // 50 Hz => 20 ms minimum interval between sends.
      const throttled = new SacnSender({ universe: 7, maxOutputRate: 50 })
      await throttled.start()
      mockSend.mockClear()
      jest.advanceTimersByTime(1000) // move the mocked clock off 0 (0 doubles as "never sent")

      await throttled.send({ 1: 10 }) // leading frame goes out immediately
      await throttled.send({ 1: 20 }) // within the interval: withheld, not dropped

      expect(mockSend).toHaveBeenCalledTimes(1)
      expect(mockSend).not.toHaveBeenCalledWith({ payload: { 1: 20 } })

      // Advance past the interval so the trailing-edge flush timer fires (deterministic, no real wait).
      jest.advanceTimersByTime(30)
      await Promise.resolve()

      expect(mockSend).toHaveBeenCalledWith({ payload: { 1: 20 } })
      await throttled.stop().catch(() => {})
    } finally {
      jest.useRealTimers()
    }
  })

  it('stop closes sender', async () => {
    await sender.start()
    await sender.stop()
    expect(mockClose).toHaveBeenCalled()
  })

  it('getUniverse returns configured universe', () => {
    expect(sender.getUniverse()).toBe(5)
  })

  it('onSendError registers listener and send error is emitted', async () => {
    const listener = jest.fn()
    sender.onSendError(listener)
    await sender.start()
    mockSend.mockRejectedValueOnce(
      new Error('Network error') as Parameters<jest.Mock['mockRejectedValueOnce']>[0],
    )
    await sender.send({ 1: 0 }).catch(() => {})
    expect(listener).toHaveBeenCalledWith(expect.any(SenderError))
  })

  describe('resending the last frame', () => {
    const payloads = (): Array<Record<number, number>> =>
      mockSend.mock.calls.map((call) => (call[0] as { payload: Record<number, number> }).payload)

    /** Started, with the mocked clock moved off 0, which doubles as "never sent". */
    const startedAt = async (
      maxOutputRate: number,
      minRefreshRate: number,
    ): Promise<SacnSender> => {
      const started = new SacnSender({ universe: 7, maxOutputRate, minRefreshRate })
      await started.start()
      jest.advanceTimersByTime(1000)
      mockSend.mockClear()
      return started
    }

    beforeEach(() => {
      jest.useFakeTimers()
    })

    afterEach(() => {
      jest.useRealTimers()
    })

    it('leaves the sacn library resend off', async () => {
      const started = await startedAt(44, 44)
      const options = jest.mocked(Sender).mock.calls.at(-1)?.[0]
      expect(options).not.toHaveProperty('minRefreshRate')
      await started.stop()
    })

    it('resends a held look once per interval', async () => {
      // 50 Hz => 20 ms.
      const started = await startedAt(50, 50)
      await started.send({ 1: 10 })
      jest.advanceTimersByTime(20)
      expect(payloads()).toEqual([{ 1: 10 }, { 1: 10 }])
      jest.advanceTimersByTime(20)
      expect(payloads()).toHaveLength(3)
      await started.stop()
    })

    it('stays within the output rate while the look changes', async () => {
      const started = await startedAt(50, 50)
      for (let frame = 1; frame <= 20; frame++) {
        await started.send({ 1: frame })
        jest.advanceTimersByTime(10)
      }
      const sent = payloads()
      expect(sent.length).toBeLessThanOrEqual(11)
      sent.slice(1).forEach((payload, i) => expect(payload).not.toEqual(sent[i]))
      await started.stop()
    })

    it('resends the frame as sent, not the buffer the caller reuses', async () => {
      const started = await startedAt(50, 50)
      const buffer: Record<number, number> = { 1: 10 }
      await started.send(buffer)
      buffer[1] = 99
      jest.advanceTimersByTime(20)
      expect(payloads()).toHaveLength(2)
      expect(payloads()[1]).toEqual({ 1: 10 })
      await started.stop()
    })

    it('never repeats an older frame over a newer one the throttle holds', async () => {
      // Resends every 10 ms against a 20 ms output interval.
      const started = await startedAt(50, 100)
      await started.send({ 1: 1 })
      jest.advanceTimersByTime(5)
      await started.send({ 1: 2 })
      jest.advanceTimersByTime(100)
      const sent = payloads()
      expect(sent[0]).toEqual({ 1: 1 })
      expect(sent.slice(1).length).toBeGreaterThan(0)
      sent.slice(1).forEach((payload) => expect(payload).toEqual({ 1: 2 }))
      await started.stop()
    })

    it('stops resending once stopped', async () => {
      const started = await startedAt(50, 50)
      await started.send({ 1: 10 })
      await started.stop()
      const count = mockSend.mock.calls.length
      jest.advanceTimersByTime(200)
      expect(mockSend).toHaveBeenCalledTimes(count)
    })

    it('does not resend at a refresh rate of 0', async () => {
      const started = await startedAt(0, 0)
      await started.send({ 1: 10 })
      jest.advanceTimersByTime(1000)
      expect(payloads()).toEqual([{ 1: 10 }])
      await started.stop()
    })
  })
})
