/**
 * The registration wrapper every invoke handler goes through.
 *
 * A handler that throws must answer the renderer with a failure rather than rejecting its invoke,
 * because a rejected invoke reaches the renderer as an unhandled rejection and the UI sees nothing.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { handleInvoke } from '../../ipc/handleInvoke'
import type { Logger } from '../../../shared/logger'

type Registered = (event: unknown, ...args: unknown[]) => Promise<unknown>

function registrar(): { ipcMain: { handle: jest.Mock }; handlers: Record<string, Registered> } {
  const handlers: Record<string, Registered> = {}
  const handle = jest.fn((channel: string, handler: Registered) => {
    handlers[channel] = handler
  })
  return { ipcMain: { handle } as unknown as { handle: jest.Mock }, handlers }
}

const silentLog = (): Logger => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
})

describe('handleInvoke', () => {
  let log: Logger

  beforeEach(() => {
    log = silentLog()
  })

  it('passes the event and every argument through to the handler', async () => {
    const { ipcMain, handlers } = registrar()
    const body = jest.fn((..._args: unknown[]) => 'answered')
    handleInvoke(ipcMain as never, 'test:channel', log, body as never)

    const event = { sender: 'renderer' }
    await expect(handlers['test:channel'](event, 'a', 2)).resolves.toBe('answered')
    expect(body).toHaveBeenCalledWith(event, 'a', 2)
  })

  it('answers with a failure when the handler throws', async () => {
    const { ipcMain, handlers } = registrar()
    handleInvoke(ipcMain as never, 'test:channel', log, () => {
      throw new Error('loader is not initialized')
    })

    await expect(handlers['test:channel']({})).resolves.toEqual({
      success: false,
      error: 'loader is not initialized',
    })
  })

  it('answers with a failure when the handler rejects', async () => {
    const { ipcMain, handlers } = registrar()
    handleInvoke(ipcMain as never, 'test:channel', log, async () => {
      throw new Error('the file went away')
    })

    await expect(handlers['test:channel']({})).resolves.toEqual({
      success: false,
      error: 'the file went away',
    })
  })

  it('names the channel when it reports the failure', async () => {
    const { ipcMain, handlers } = registrar()
    handleInvoke(ipcMain as never, 'effects:read', log, () => {
      throw new Error('boom')
    })

    await handlers['effects:read']({})

    expect(log.error).toHaveBeenCalledWith('effects:read failed:', expect.any(Error))
  })

  it('leaves an expected failure the handler returned alone', async () => {
    const { ipcMain, handlers } = registrar()
    handleInvoke(ipcMain as never, 'test:channel', log, () => ({
      success: false,
      error: 'Invalid payload',
    }))

    await expect(handlers['test:channel']({})).resolves.toEqual({
      success: false,
      error: 'Invalid payload',
    })
    expect(log.error).not.toHaveBeenCalled()
  })
})
