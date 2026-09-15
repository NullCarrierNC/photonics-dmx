import { EventEmitter } from 'events'

// Replace the real UDP socket so bind outcomes can be scripted without touching the network.
jest.mock('dgram', () => ({
  createSocket: jest.fn(),
}))

import * as dgram from 'dgram'
import { Rb3eNetworkListener } from '../../listeners/RB3/Rb3eNetworkListener'

class FakeSocket extends EventEmitter {
  bind = jest.fn()
  close = jest.fn((cb?: () => void) => cb?.())
  address = jest.fn(() => ({ address: '0.0.0.0', port: 21070 }))
}

const mockedCreateSocket = dgram.createSocket as jest.Mock

describe('Rb3eNetworkListener.start', () => {
  beforeEach(() => jest.clearAllMocks())

  it('resolves once the socket is listening', async () => {
    const sock = new FakeSocket()
    mockedCreateSocket.mockReturnValue(sock)
    sock.bind.mockImplementation(() => sock.emit('listening'))

    const listener = new Rb3eNetworkListener()
    await expect(listener.start()).resolves.toBeUndefined()
  })

  it('rejects on a bind failure (port in use) instead of reporting success', async () => {
    const sock = new FakeSocket()
    mockedCreateSocket.mockReturnValue(sock)
    const inUse = Object.assign(new Error('bind EADDRINUSE'), { code: 'EADDRINUSE' })
    sock.bind.mockImplementation(() => sock.emit('error', inUse))

    const listener = new Rb3eNetworkListener()
    await expect(listener.start()).rejects.toMatchObject({ code: 'EADDRINUSE' })
  })

  it('can retry start after a failed bind', async () => {
    const bad = new FakeSocket()
    bad.bind.mockImplementation(() => bad.emit('error', new Error('bind failed')))
    const good = new FakeSocket()
    good.bind.mockImplementation(() => good.emit('listening'))
    mockedCreateSocket.mockReturnValueOnce(bad).mockReturnValueOnce(good)

    const listener = new Rb3eNetworkListener()
    await expect(listener.start()).rejects.toThrow('bind failed')
    await expect(listener.start()).resolves.toBeUndefined()
  })

  it('a runtime socket error after a successful bind does not reject the settled start', async () => {
    const sock = new FakeSocket()
    mockedCreateSocket.mockReturnValue(sock)
    sock.bind.mockImplementation(() => sock.emit('listening'))

    const listener = new Rb3eNetworkListener()
    await listener.start()
    // Routed through the runtime handler; the promise is already settled, so no rejection surfaces.
    expect(() => sock.emit('error', new Error('runtime failure'))).not.toThrow()
  })

  it('does not emit rb3-error on a bind failure', async () => {
    const sock = new FakeSocket()
    mockedCreateSocket.mockReturnValue(sock)
    sock.bind.mockImplementation(() => sock.emit('error', new Error('bind failed')))

    const listener = new Rb3eNetworkListener()
    const errors: unknown[] = []
    listener.on('rb3-error', (payload) => errors.push(payload))

    await expect(listener.start()).rejects.toThrow('bind failed')
    expect(errors).toEqual([])
  })

  it('can emit a runtime error again after stop and a successful restart', async () => {
    const sock = new FakeSocket()
    mockedCreateSocket.mockReturnValue(sock)
    sock.bind.mockImplementation(() => sock.emit('listening'))

    const listener = new Rb3eNetworkListener()
    const errors: unknown[] = []
    listener.on('rb3-error', (payload) => errors.push(payload))

    await listener.start()
    sock.emit('error', new Error('first runtime failure'))
    await listener.stop()

    sock.bind.mockImplementation(() => sock.emit('listening'))
    await listener.start()
    sock.emit('error', new Error('second runtime failure'))

    expect(errors).toEqual([
      { type: 'runtime-error', message: 'first runtime failure' },
      { type: 'runtime-error', message: 'second runtime failure' },
    ])
  })

  it('emits a runtime-error event exactly once after a post-bind socket failure', async () => {
    const sock = new FakeSocket()
    mockedCreateSocket.mockReturnValue(sock)
    sock.bind.mockImplementation(() => sock.emit('listening'))

    const listener = new Rb3eNetworkListener()
    const errors: unknown[] = []
    listener.on('rb3-error', (payload) => errors.push(payload))

    await listener.start()
    sock.emit('error', new Error('runtime failure'))
    sock.emit('error', new Error('second failure'))

    expect(errors).toEqual([{ type: 'runtime-error', message: 'runtime failure' }])
  })
})
