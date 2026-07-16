import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { shell } from 'electron'
import { SHELL } from '../../../shared/ipcChannels'
import { setupShellHandlers } from '../../ipc/shell-handlers'
import { validatePathUnderAllowedRoots } from '../../ipc/inputValidation'

/**
 * Shell handlers must run every path through validatePathUnderAllowedRoots before touching the OS,
 * so a rejected path never reaches shell.showItemInFolder / shell.openPath.
 */

jest.mock('electron', () => ({
  shell: {
    showItemInFolder: jest.fn(),
    openPath: jest.fn(),
  },
}))
jest.mock('../../ipc/inputValidation', () => ({
  validatePathUnderAllowedRoots: jest.fn(),
}))

const showItemInFolder = jest.mocked(shell.showItemInFolder)
const openPath = jest.mocked(shell.openPath)
const validate = jest.mocked(validatePathUnderAllowedRoots)

type Handler = (event: unknown, filePath: string) => Promise<{ success: boolean; error?: string }>

function registerAndGetHandlers(): Record<string, Handler> {
  const handlers: Record<string, Handler> = {}
  const ipcMain = {
    handle: jest.fn((channel: string, handler: Handler) => {
      handlers[channel] = handler
    }),
  }
  setupShellHandlers(ipcMain as unknown as Parameters<typeof setupShellHandlers>[0])
  return handlers
}

describe('shell handlers', () => {
  beforeEach(() => {
    validate.mockReset()
    showItemInFolder.mockReset()
    openPath.mockReset()
    openPath.mockResolvedValue('')
  })

  it('rejects an invalid path without reaching the OS (showItemInFolder)', async () => {
    validate.mockReturnValue({ ok: false, error: 'outside allowed roots' })
    const handlers = registerAndGetHandlers()
    const result = await handlers[SHELL.SHOW_ITEM_IN_FOLDER]({}, '/etc/passwd')
    expect(result).toEqual({ success: false, error: 'outside allowed roots' })
    expect(showItemInFolder).not.toHaveBeenCalled()
  })

  it('reveals a validated path', async () => {
    validate.mockReturnValue({ ok: true, value: '/safe/cue.json' })
    const handlers = registerAndGetHandlers()
    const result = await handlers[SHELL.SHOW_ITEM_IN_FOLDER]({}, '/safe/cue.json')
    expect(result).toEqual({ success: true })
    expect(showItemInFolder).toHaveBeenCalledWith('/safe/cue.json')
  })

  it('rejects an invalid path without reaching the OS (openPath)', async () => {
    validate.mockReturnValue({ ok: false, error: 'nope' })
    const handlers = registerAndGetHandlers()
    const result = await handlers[SHELL.OPEN_PATH]({}, '../../secret')
    expect(result).toEqual({ success: false, error: 'nope' })
    expect(openPath).not.toHaveBeenCalled()
  })

  it('surfaces an OS open failure as an error', async () => {
    validate.mockReturnValue({ ok: true, value: '/safe/file' })
    openPath.mockResolvedValue('No app to open this')
    const handlers = registerAndGetHandlers()
    const result = await handlers[SHELL.OPEN_PATH]({}, '/safe/file')
    expect(result).toEqual({ success: false, error: 'No app to open this' })
  })

  it('reports success when the OS opens the path', async () => {
    validate.mockReturnValue({ ok: true, value: '/safe/file' })
    openPath.mockResolvedValue('')
    const handlers = registerAndGetHandlers()
    const result = await handlers[SHELL.OPEN_PATH]({}, '/safe/file')
    expect(result).toEqual({ success: true })
    expect(openPath).toHaveBeenCalledWith('/safe/file')
  })
})
