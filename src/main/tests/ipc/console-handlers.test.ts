/**
 * IPC tests for setupConsoleHandlers: enabling the console ties it to the page that asked for it.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { EventEmitter } from 'node:events'
import { LIGHT } from '../../../shared/ipcChannels'

const mockIpcMain = {
  handle: jest.fn() as jest.MockedFunction<(...args: unknown[]) => void>,
  on: jest.fn() as jest.MockedFunction<(...args: unknown[]) => void>,
}

jest.mock('electron', () => ({
  ipcMain: mockIpcMain,
}))

import { setupConsoleHandlers } from '../../ipc/console-handlers'
import type { ControllerManager } from '../../controllers/ControllerManager'

function getHandler(channel: string): (e: unknown, d: unknown) => Promise<unknown> {
  const calls = mockIpcMain.handle.mock.calls
  for (let i = calls.length - 1; i >= 0; i--) {
    if (calls[i][0] === channel) {
      return calls[i][1] as (e: unknown, d: unknown) => Promise<unknown>
    }
  }
  throw new Error(`no handler for ${channel}`)
}

function stubManager(enableResult: { success: boolean; error?: string }): {
  manager: ControllerManager
  disableConsoleMode: jest.Mock
} {
  const disableConsoleMode = jest.fn().mockImplementation(() => Promise.resolve({ success: true }))
  const manager = {
    enableConsoleMode: jest.fn().mockImplementation(() => Promise.resolve(enableResult)),
    disableConsoleMode,
  } as unknown as ControllerManager
  return { manager, disableConsoleMode }
}

describe('setupConsoleHandlers', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('leaves console mode when the page that opened it goes away', async () => {
    const { manager, disableConsoleMode } = stubManager({ success: true })
    setupConsoleHandlers(mockIpcMain as never, manager)
    const page = new EventEmitter()

    await getHandler(LIGHT.CONSOLE_ENABLE)({ sender: page }, { rigId: 'rig-1' })
    page.emit('destroyed')

    expect(disableConsoleMode).toHaveBeenCalledTimes(1)
  })

  it('does not follow a page whose console never opened', async () => {
    const { manager, disableConsoleMode } = stubManager({ success: false, error: 'Rig not found' })
    setupConsoleHandlers(mockIpcMain as never, manager)
    const page = new EventEmitter()

    await getHandler(LIGHT.CONSOLE_ENABLE)({ sender: page }, { rigId: 'missing' })
    page.emit('destroyed')

    expect(disableConsoleMode).not.toHaveBeenCalled()
  })

  it('binds one set of listeners however often the same page enables the console', async () => {
    const { manager, disableConsoleMode } = stubManager({ success: true })
    setupConsoleHandlers(mockIpcMain as never, manager)
    const page = new EventEmitter()
    const enable = getHandler(LIGHT.CONSOLE_ENABLE)

    await enable({ sender: page }, { rigId: 'rig-1' })
    await enable({ sender: page }, { rigId: 'rig-1' })

    expect(page.listenerCount('destroyed')).toBe(1)
    expect(disableConsoleMode).not.toHaveBeenCalled()
  })

  it('follows the page again when it reopens the console after a reload', async () => {
    const { manager, disableConsoleMode } = stubManager({ success: true })
    setupConsoleHandlers(mockIpcMain as never, manager)
    const page = new EventEmitter()
    const enable = getHandler(LIGHT.CONSOLE_ENABLE)
    const reload = () =>
      page.emit('did-start-navigation', { isMainFrame: true, isSameDocument: false })

    await enable({ sender: page }, { rigId: 'rig-1' })
    reload()
    await enable({ sender: page }, { rigId: 'rig-1' })
    expect(page.listenerCount('destroyed')).toBe(1)
    expect(page.listenerCount('render-process-gone')).toBe(1)
    reload()

    expect(disableConsoleMode).toHaveBeenCalledTimes(2)
  })
})
