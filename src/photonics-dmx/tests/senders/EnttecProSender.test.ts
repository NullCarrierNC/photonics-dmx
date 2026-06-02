import { EnttecProSender } from '../../senders/EnttecProSender'
import { SenderError } from '../../senders/BaseSender'

// Shared update spy (must be `mock`-prefixed to be referenceable inside the hoisted factory).
const mockUpdate = jest.fn()
const mockClose = jest.fn().mockResolvedValue(undefined)

jest.mock('dmx-ts', () => ({
  DMX: jest.fn().mockImplementation(() => ({
    addUniverse: jest.fn().mockResolvedValue({
      update: mockUpdate,
      close: mockClose,
    }),
    removeAllListeners: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
  })),
  EnttecUSBDMXProDriver: jest.fn().mockImplementation(() => ({
    init: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
  })),
  IUniverseDriver: jest.fn(),
}))

describe('EnttecProSender', () => {
  let sender: EnttecProSender

  beforeEach(() => {
    mockUpdate.mockReset()
    sender = new EnttecProSender('COM1', { dmxSpeed: 40 }, 'uni1', 0)
  })

  afterEach(async () => {
    await sender.stop().catch(() => {})
  })

  describe('constructor', () => {
    it('creates an EnttecProSender', () => {
      expect(sender).toBeInstanceOf(EnttecProSender)
    })

    it('reports the configured universe', () => {
      expect(new EnttecProSender('COM1', { dmxSpeed: 40 }, 'uni1', 3).getUniverse()).toBe(3)
    })
  })

  describe('stop', () => {
    it('blacks out the full 512-channel universe, not just 255', async () => {
      await sender.start()
      mockUpdate.mockClear()
      await sender.stop()

      expect(mockUpdate).toHaveBeenCalledTimes(1)
      const payload = mockUpdate.mock.calls[0][0] as Record<number, number>
      // The Enttec Pro serial driver is 1-based (channel N -> universe buffer index N).
      expect(Object.keys(payload)).toHaveLength(512)
      expect(payload[1]).toBe(0)
      expect(payload[256]).toBe(0)
      expect(payload[512]).toBe(0)
    })
  })

  describe('error handling', () => {
    it('emits a SenderError with shouldDisable when a send fails (USB auto-disable)', async () => {
      await sender.start()
      mockUpdate.mockImplementationOnce(() => {
        throw new Error('serial write failed')
      })
      const listener = jest.fn()
      sender.onSendError(listener)

      await sender.send({ 1: 255 })

      expect(listener).toHaveBeenCalledWith(expect.any(SenderError))
      const err = listener.mock.calls[0][0] as SenderError
      expect(err.senderId).toBe('enttecpro')
      expect(err.shouldDisable).toBe(true)
    })
  })
})
