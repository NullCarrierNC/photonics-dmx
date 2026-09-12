/**
 * The Open DMX device writes to the port from its own send loop, so the last frame the port sees
 * when the sender stops is whatever that loop wrote last. The device double here models the loop:
 * setChannels mutates a buffer, the loop snapshots it on every pass, and stopSending ends the loop.
 */
import { afterEach, describe, expect, it, jest } from '@jest/globals'
import { OpenDmxSender } from '../../senders/OpenDmxSender'

/** One snapshot of the 513 byte buffer, in the order the port received it. */
const mockWrites: number[][] = []
/** How many frames had reached the port by the time it was closed. */
let mockWritesAtClose = -1

jest.mock('enttec-open-dmx-usb', () => {
  // The factory runs before the ES imports, so EventEmitter is required here.
  const { EventEmitter } = require('events') // eslint-disable-line @typescript-eslint/no-require-imports
  return {
    EnttecOpenDMXUSBDevice: jest.fn().mockImplementation(() => {
      let buffer = new Array<number>(513).fill(0)
      let shouldBeSending = false
      let sendTimeout: ReturnType<typeof setTimeout> | null = null
      const dev = Object.assign(new EventEmitter(), {
        setChannels: (channels: Record<number, number>, clear = false): void => {
          if (clear) {
            buffer = new Array<number>(513).fill(0)
          }
          for (const [channel, value] of Object.entries(channels)) {
            buffer[Number(channel)] = value
          }
        },
        _sendUniverse: (): Promise<void> => {
          mockWrites.push([...buffer])
          return Promise.resolve()
        },
        startSending: (interval: number): void => {
          shouldBeSending = true
          const send = (): void => {
            void dev._sendUniverse().then(() => {
              if (shouldBeSending) {
                sendTimeout = setTimeout(send, interval)
              }
            })
          }
          send()
        },
        stopSending: (): void => {
          shouldBeSending = false
          if (sendTimeout !== null) {
            clearTimeout(sendTimeout)
          }
        },
        port: {
          isOpen: true,
          close: (cb: (err?: Error | null) => void) => {
            mockWritesAtClose = mockWrites.length
            cb()
          },
          drain: (cb: (err?: Error | null) => void) => cb(),
        },
      })
      void Promise.resolve().then(() => dev.emit('ready'))
      return dev
    }),
  }
})

/** Waits for the device loop to put at least `count` frames on the port. */
async function writesToReach(count: number): Promise<void> {
  const deadline = Date.now() + 1000
  while (mockWrites.length < count && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

const isDark = (frame: number[]): boolean => frame.every((value) => value === 0)

describe('OpenDmxSender frame on the wire at stop', () => {
  afterEach(() => {
    mockWrites.length = 0
    mockWritesAtClose = -1
  })

  it('leaves a dark frame on the port when it stops', async () => {
    const sender = new OpenDmxSender('/dev/ttyUSB0', { dmxSpeed: 40 })
    await sender.start()
    await sender.send({ 1: 255, 2: 128 })
    await writesToReach(mockWrites.length + 1)
    expect(isDark(mockWrites[mockWrites.length - 1])).toBe(false)

    await sender.stop()

    expect(mockWrites.length).toBeGreaterThan(0)
    expect(isDark(mockWrites[mockWrites.length - 1])).toBe(true)
  })

  it('puts the dark frame on the port before closing it', async () => {
    const sender = new OpenDmxSender('/dev/ttyUSB0', { dmxSpeed: 40 })
    await sender.start()
    await sender.send({ 1: 255 })
    await writesToReach(mockWrites.length + 1)

    await sender.stop()

    expect(mockWritesAtClose).toBe(mockWrites.length)
    expect(isDark(mockWrites[mockWritesAtClose - 1])).toBe(true)
  })
})
