/**
 * OpenDmxSender tests: construction, start/stop lifecycle, send, getUniverse, error callback.
 * Uses an injected device factory so no real hardware or npm mock is required.
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { OpenDmxSender } from '../../senders/OpenDmxSender'
import { SenderError } from '../../senders/BaseSender'

const mockStart = jest.fn().mockImplementation(() => Promise.resolve())
const mockWriteChannels = jest.fn()
const mockStop = jest.fn().mockImplementation(() => Promise.resolve())

function createMockDeviceFactory(): (
  _path: string,
  _options: unknown,
) => {
  start(): Promise<void>
  writeChannels(b: Record<number, number>): void
  stop(): Promise<void>
} {
  return () => ({
    start: mockStart as () => Promise<void>,
    writeChannels: mockWriteChannels,
    stop: mockStop as () => Promise<void>,
  })
}

describe('OpenDmxSender', () => {
  let sender: OpenDmxSender

  beforeEach(() => {
    jest.clearAllMocks()
    sender = new OpenDmxSender(
      '/dev/ttyUSB0',
      { dmxSpeed: 40 },
      'uni1',
      0,
      createMockDeviceFactory(),
    )
  })

  afterEach(async () => {
    await sender.stop().catch(() => {})
  })

  it('constructs with port and options', () => {
    expect(sender.getUniverse()).toBe(0)
  })

  it('constructs with custom universe', () => {
    const customSender = new OpenDmxSender('/dev/ttyUSB1', { dmxSpeed: 44 }, 'uni1', 1)
    expect(customSender.getUniverse()).toBe(1)
  })

  it('start initializes device adapter', async () => {
    await sender.start()
    expect(mockStart).toHaveBeenCalled()
  })

  it('send passes buffer to device after start', async () => {
    await sender.start()
    await sender.send({ 1: 255, 2: 128 })
    expect(mockWriteChannels).toHaveBeenCalledWith({ 1: 255, 2: 128 })
  })

  it('send before start throws and does not call writeChannels', async () => {
    await sender.send({ 1: 0 }).catch(() => {})
    expect(mockWriteChannels).not.toHaveBeenCalled()
  })

  it('stop calls device stop', async () => {
    await sender.start()
    await sender.stop()
    expect(mockStop).toHaveBeenCalled()
  })

  it('stop when not started is a no-op', async () => {
    await sender.stop()
    expect(mockStop).not.toHaveBeenCalled()
  })

  it('getUniverse returns configured universe', () => {
    expect(sender.getUniverse()).toBe(0)
  })

  it('onSendError registers listener and send error is emitted', async () => {
    const listener = jest.fn()
    sender.onSendError(listener)
    await sender.start()
    mockWriteChannels.mockImplementationOnce(() => {
      throw new Error('Device write failed')
    })
    await sender.send({ 1: 0 }).catch(() => {})
    expect(listener).toHaveBeenCalledWith(expect.any(SenderError))
    expect((listener.mock.calls[0][0] as SenderError).senderId).toBe('opendmx')
  })
})
