import { ArtNetSender } from '../../senders/ArtNetSender'

// Shared update spy so tests can assert on the channel payload (must be `mock`-prefixed
// to be referenceable inside the hoisted jest.mock factory).
const mockUpdate = jest.fn()

// Mock the dmx-ts library
jest.mock('dmx-ts', () => ({
  DMX: jest.fn().mockImplementation(() => ({
    addUniverse: jest.fn().mockResolvedValue({
      update: mockUpdate,
      close: jest.fn(),
    }),
    on: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
  })),
  ArtnetDriver: jest.fn().mockImplementation(() => ({
    init: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
  })),
  IUniverseDriver: jest.fn(),
}))

describe('ArtNetSender', () => {
  let artNetSender: ArtNetSender

  beforeEach(() => {
    artNetSender = new ArtNetSender('127.0.0.1', {
      universe: 1,
      net: 0,
      subnet: 0,
      subuni: 0,
      port: 6454,
      base_refresh_interval: 1000,
    })
  })

  afterEach(async () => {
    try {
      await artNetSender.stop()
    } catch {
      // Ignore errors during cleanup
    }
  })

  describe('constructor', () => {
    it('should create an ArtNetSender with default values', () => {
      const sender = new ArtNetSender()
      expect(sender).toBeInstanceOf(ArtNetSender)
    })

    it('should create an ArtNetSender with custom values', () => {
      const sender = new ArtNetSender('192.168.1.100', {
        universe: 2,
        net: 1,
        subnet: 1,
        subuni: 1,
        port: 6455,
        base_refresh_interval: 1000,
      })
      expect(sender).toBeInstanceOf(ArtNetSender)
    })
  })

  describe('send', () => {
    it('should handle error when not started', async () => {
      const universeBuffer: Record<number, number> = {
        1: 255,
      }

      // The send method catches errors and emits them, so we expect it to not throw
      await expect(artNetSender.send(universeBuffer)).resolves.not.toThrow()
    })
  })

  describe('stop (Bug #11 regression)', () => {
    it('blacks out the full 512-channel universe, not just 255', async () => {
      await artNetSender.start()
      mockUpdate.mockClear()
      await artNetSender.stop()

      expect(mockUpdate).toHaveBeenCalledTimes(1)
      const payload = mockUpdate.mock.calls[0][0] as Record<number, number>
      expect(Object.keys(payload)).toHaveLength(512)
      expect(payload[1]).toBe(0)
      expect(payload[256]).toBe(0)
      expect(payload[512]).toBe(0)
    })
  })

  describe('error handling', () => {
    it('should emit error events', (done) => {
      artNetSender.onSendError((error) => {
        expect(error).toBeDefined()
        done()
      })

      // Trigger an error by trying to send without starting
      artNetSender.send({ 1: 255 }).catch(() => {
        // Expected error - this is caught by the send method
      })
    })
  })
})
