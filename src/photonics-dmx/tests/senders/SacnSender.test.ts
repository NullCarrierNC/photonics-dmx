/**
 * SacnSender tests: construction, start/stop lifecycle, send, getUniverse, error callback.
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
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
    mockSend.mockRejectedValueOnce(new Error('Network error'))
    await sender.send({ 1: 0 }).catch(() => {})
    expect(listener).toHaveBeenCalledWith(expect.any(SenderError))
  })
})
