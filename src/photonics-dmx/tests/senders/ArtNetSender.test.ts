import { ArtNetSender } from '../../senders/ArtNetSender'

// Shared update spy so tests can assert on the channel payload (must be `mock`-prefixed
// to be referenceable inside the hoisted jest.mock factory). It simulates dmxnet's
// prepChannel bounds check, so a payload using 1-based keys (which include the out-of-range
// channel 512) is rejected here rather than silently passing.
const mockUpdate = jest.fn((channels: Record<number, number>) => {
  for (const key of Object.keys(channels)) {
    const ch = Number(key)
    if (ch < 0 || ch > 511) {
      throw new Error('Channel must be between 0 and 512')
    }
  }
})

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

  describe('stop', () => {
    it('blacks out the full 512-channel universe using 0-based Art-Net keys (does not throw at channel 512)', async () => {
      await artNetSender.start()
      mockUpdate.mockClear()
      await artNetSender.stop()

      expect(mockUpdate).toHaveBeenCalledTimes(1)
      const payload = mockUpdate.mock.calls[0][0] as Record<number, number>
      // DMX channels 1..512 are converted to 0-based Art-Net keys 0..511; a 1-based key of 512
      // would be rejected by the bounds-checking mock.
      expect(Object.keys(payload)).toHaveLength(512)
      expect(payload[0]).toBe(0)
      expect(payload[255]).toBe(0)
      expect(payload[511]).toBe(0)
      expect(payload[512]).toBeUndefined()
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

  describe('rate limiting', () => {
    it('flushes the last throttled frame on the trailing edge', async () => {
      jest.useFakeTimers()
      try {
        const throttled = new ArtNetSender('127.0.0.1', { universe: 1, maxOutputRate: 40 }) // 25ms interval
        await throttled.start()
        mockUpdate.mockClear()
        jest.advanceTimersByTime(1000) // move the mocked clock off 0 (0 doubles as "never sent")

        await throttled.send({ 1: 10 }) // leading frame goes out immediately
        await throttled.send({ 1: 20 }) // within the interval: withheld, not dropped
        expect(mockUpdate).toHaveBeenCalledTimes(1)
        expect(mockUpdate).toHaveBeenCalledWith({ 0: 10 })

        jest.advanceTimersByTime(30) // past the interval: the trailing flush sends the kept frame
        await Promise.resolve()
        expect(mockUpdate).toHaveBeenCalledWith({ 0: 20 })
      } finally {
        jest.useRealTimers()
      }
    })

    it('stop() drops a pending trailing frame so the blackout is the final frame', async () => {
      jest.useFakeTimers()
      try {
        const throttled = new ArtNetSender('127.0.0.1', { universe: 1, maxOutputRate: 40 })
        await throttled.start()
        mockUpdate.mockClear()
        jest.advanceTimersByTime(1000) // move the mocked clock off 0 (0 doubles as "never sent")

        await throttled.send({ 1: 10 })
        await throttled.send({ 1: 20 }) // withheld
        const stopping = throttled.stop()
        await jest.advanceTimersByTimeAsync(500) // run stop's internal delays + any stray flush timer
        await stopping

        // The withheld cue frame never reaches the wire; the last payload is the blackout.
        expect(mockUpdate).not.toHaveBeenCalledWith({ 0: 20 })
        const lastPayload = mockUpdate.mock.calls[mockUpdate.mock.calls.length - 1][0] as Record<
          number,
          number
        >
        expect(lastPayload[0]).toBe(0)
        expect(lastPayload[511]).toBe(0)
      } finally {
        jest.useRealTimers()
      }
    })
  })

  describe('driver options', () => {
    it('passes the keepalive to the driver as unchangedDataInterval', async () => {
      const { ArtnetDriver } = jest.requireMock('dmx-ts') as { ArtnetDriver: jest.Mock }
      ArtnetDriver.mockClear()
      const sender = new ArtNetSender('127.0.0.1', { universe: 1, base_refresh_interval: 250 })
      await sender.start()
      const optionsArg = ArtnetDriver.mock.calls[0][1] as { unchangedDataInterval?: number }
      expect(optionsArg.unchangedDataInterval).toBe(250)
      await sender.stop().catch(() => {})
    })
  })
})
