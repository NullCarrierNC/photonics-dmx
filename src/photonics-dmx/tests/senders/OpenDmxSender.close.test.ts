/**
 * OpenDMX adapter stop() explicitly closes the underlying serial port.
 * Uses mocked enttec-open-dmx-usb so the real OpenDmxDeviceAdapter runs and we assert port.close().
 */
import { afterEach, describe, expect, it, jest } from '@jest/globals'
import { OpenDmxSender } from '../../senders/OpenDmxSender'

const closeMock = jest.fn<(cb: (err?: Error | null) => void) => void>((cb) => cb())
const drainMock = jest.fn<(cb: (err?: Error | null) => void) => void>((cb) => cb())

jest.mock('enttec-open-dmx-usb', () => {
  // Mock factory runs before ES imports; EventEmitter must be required here
  const { EventEmitter } = require('events') // eslint-disable-line @typescript-eslint/no-require-imports
  return {
    EnttecOpenDMXUSBDevice: jest.fn().mockImplementation(() => {
      const dev = Object.assign(new EventEmitter(), {
        setChannels: jest.fn(),
        startSending: jest.fn(),
        stopSending: jest.fn(),
        port: { isOpen: true, close: closeMock, drain: drainMock },
      })
      // Use Promise microtask (not setImmediate) so this fires even with jest.useFakeTimers()
      Promise.resolve().then(() => dev.emit('ready'))
      return dev
    }),
  }
})

describe('OpenDmxSender port close on stop', () => {
  afterEach(() => {
    closeMock.mockClear()
    drainMock.mockClear()
  })

  it('stop() closes underlying serial port and resolves', async () => {
    const sender = new OpenDmxSender('/dev/ttyUSB0', { dmxSpeed: 40 })
    await sender.start()
    closeMock.mockClear()
    drainMock.mockClear()
    await sender.stop()
    expect(closeMock).toHaveBeenCalled()
  })

  it('repeated stop() is safe (idempotent)', async () => {
    const sender = new OpenDmxSender('/dev/ttyUSB0', { dmxSpeed: 40 })
    await sender.start()
    await sender.stop()
    closeMock.mockClear()
    await sender.stop()
    await sender.stop()
    expect(closeMock).not.toHaveBeenCalled()
  })
})
