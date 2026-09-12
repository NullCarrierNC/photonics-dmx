import { describe, expect, it, jest, beforeEach } from '@jest/globals'

jest.mock('electron', () => ({
  BrowserWindow: Object.assign(jest.fn(), { getAllWindows: jest.fn(() => []) }),
  shell: { openExternal: jest.fn() },
  screen: { getAllDisplays: jest.fn(() => []), getPrimaryDisplay: jest.fn() },
}))
jest.mock('@electron-toolkit/utils', () => ({ is: { dev: false } }))

import { WindowManager } from '../WindowManager'

/**
 * Where a second launch of the app ends up. The lock in the entry point turns it into a request to
 * front the window this instance already has, which is only useful if a minimised or hidden one
 * comes back rather than nothing visible happening.
 */
type Internals = Record<string, unknown>

function fakeWindow(state: { destroyed?: boolean; minimized?: boolean } = {}) {
  return {
    isDestroyed: jest.fn(() => state.destroyed === true),
    isMinimized: jest.fn(() => state.minimized === true),
    restore: jest.fn(),
    show: jest.fn(),
    focus: jest.fn(),
  }
}

describe('WindowManager.focusMainWindow', () => {
  let manager: WindowManager
  let createMainWindow: jest.Mock

  beforeEach(() => {
    manager = new WindowManager()
    createMainWindow = jest.fn()
    ;(manager as unknown as Internals).createMainWindow = createMainWindow
  })

  it('shows and focuses the window that is already open', () => {
    const window = fakeWindow()
    ;(manager as unknown as Internals).mainWindow = window

    manager.focusMainWindow()

    expect(window.show).toHaveBeenCalledTimes(1)
    expect(window.focus).toHaveBeenCalledTimes(1)
    expect(window.restore).not.toHaveBeenCalled()
    expect(createMainWindow).not.toHaveBeenCalled()
  })

  it('brings a minimised window back before focusing it', () => {
    const window = fakeWindow({ minimized: true })
    ;(manager as unknown as Internals).mainWindow = window

    manager.focusMainWindow()

    expect(window.restore).toHaveBeenCalledTimes(1)
    expect(window.focus).toHaveBeenCalledTimes(1)
  })

  it('builds a window when there is none to front', () => {
    ;(manager as unknown as Internals).mainWindow = null

    manager.focusMainWindow()

    expect(createMainWindow).toHaveBeenCalledTimes(1)
  })

  it('builds a window when the one it holds has been destroyed', () => {
    const window = fakeWindow({ destroyed: true })
    ;(manager as unknown as Internals).mainWindow = window

    manager.focusMainWindow()

    expect(createMainWindow).toHaveBeenCalledTimes(1)
    expect(window.focus).not.toHaveBeenCalled()
  })
})
