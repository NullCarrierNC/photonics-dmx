import { describe, expect, it, jest, beforeEach } from '@jest/globals'
import {
  createFakeBrowserWindow as mockCreateFakeBrowserWindow,
  type FakeBrowserWindow,
} from './fakeBrowserWindow'

jest.mock('electron', () => ({
  BrowserWindow: Object.assign(
    jest.fn((options: Record<string, unknown>) => mockCreateFakeBrowserWindow(options)),
    { getAllWindows: jest.fn(() => []) },
  ),
  shell: { openExternal: jest.fn() },
  screen: {
    getAllDisplays: jest.fn(() => [{ bounds: { x: 0, y: 0, width: 1920, height: 1080 } }]),
    getPrimaryDisplay: jest.fn(() => ({ workAreaSize: { width: 1920, height: 1080 } })),
  },
}))
jest.mock('@electron-toolkit/utils', () => ({ is: { dev: false } }))
jest.mock('../rendererSessionSecurity', () => ({ denyWebContentsWillNavigate: jest.fn() }))

import { BrowserWindow } from 'electron'
import { WindowManager } from '../WindowManager'

/**
 * Where a second launch of the app ends up. The lock in the entry point turns it into a request to
 * front the window this instance already has, which is only useful if a minimised or hidden one
 * comes back rather than nothing visible happening.
 */
function builtWindows(): FakeBrowserWindow[] {
  return (BrowserWindow as unknown as jest.Mock).mock.results.map(
    (result) => result.value as FakeBrowserWindow,
  )
}

describe('WindowManager.focusMainWindow', () => {
  let manager: WindowManager

  beforeEach(() => {
    jest.clearAllMocks()
    manager = new WindowManager()
  })

  it('shows and focuses the window that is already open', () => {
    manager.createMainWindow()
    const [window] = builtWindows()

    manager.focusMainWindow()

    expect(window.show).toHaveBeenCalledTimes(1)
    expect(window.focus).toHaveBeenCalledTimes(1)
    expect(window.restore).not.toHaveBeenCalled()
    expect(builtWindows()).toHaveLength(1)
  })

  it('brings a minimised window back before focusing it', () => {
    manager.createMainWindow()
    const [window] = builtWindows()
    window.minimized = true

    manager.focusMainWindow()

    expect(window.restore).toHaveBeenCalledTimes(1)
    expect(window.focus).toHaveBeenCalledTimes(1)
  })

  it('builds a window when there is none to front', () => {
    manager.focusMainWindow()

    expect(builtWindows()).toHaveLength(1)
  })

  it('builds a window when the one it holds has been destroyed', () => {
    manager.createMainWindow()
    const [window] = builtWindows()
    window.destroyed = true

    manager.focusMainWindow()

    expect(builtWindows()).toHaveLength(2)
    expect(window.focus).not.toHaveBeenCalled()
  })
})
