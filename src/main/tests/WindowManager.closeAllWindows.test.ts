import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
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

/** Every window the manager has built, in the order it built them. */
function builtWindows(): FakeBrowserWindow[] {
  return (BrowserWindow as unknown as jest.Mock).mock.results.map(
    (result) => result.value as FakeBrowserWindow,
  )
}

/** A manager with every window open, with preference writes captured. */
function managerWithAllWindowsOpen() {
  const wm = new WindowManager()
  const saved: string[] = []
  wm.setControllerManager({
    getConfig: () => ({
      getPreference: () => undefined,
      updatePreferences: async (updates: Record<string, unknown>) => {
        saved.push(...Object.keys(updates))
      },
    }),
  } as never)

  wm.createMainWindow()
  wm.openCueEditorWindow()
  wm.openAudioPreviewWindow()
  return { wm, saved, windows: builtWindows() }
}

describe('WindowManager.closeAllWindows', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('closes every window it opened', async () => {
    const { wm, windows } = managerWithAllWindowsOpen()

    await wm.closeAllWindows()

    expect(windows).toHaveLength(3)
    for (const window of windows) {
      expect(window.close).toHaveBeenCalledTimes(1)
    }
  })

  it('saves the geometry of every window before closing it', async () => {
    const { wm, saved } = managerWithAllWindowsOpen()

    await wm.closeAllWindows()

    expect(saved.sort()).toEqual(['audioPreviewWindowState', 'cueEditorWindowState', 'windowState'])
  })

  it('drops pending geometry saves, so nothing is written after teardown', async () => {
    jest.useFakeTimers()
    const { wm, saved, windows } = managerWithAllWindowsOpen()
    for (const window of windows) {
      window.emit('moved')
    }

    await wm.closeAllWindows()
    saved.length = 0
    jest.advanceTimersByTime(1000)

    expect(saved).toEqual([])
  })

  it('forgets every window, so the next open builds a new one', async () => {
    const { wm } = managerWithAllWindowsOpen()

    await wm.closeAllWindows()
    wm.openCueEditorWindow()

    expect(wm.getMainWindow()).toBeNull()
    expect(builtWindows()).toHaveLength(4)
  })

  it('leaves a destroyed window alone', async () => {
    const { wm, windows } = managerWithAllWindowsOpen()
    windows[1].destroyed = true

    await wm.closeAllWindows()

    expect(windows[1].close).not.toHaveBeenCalled()
  })

  it('is safe to call when no window was ever opened', async () => {
    const wm = new WindowManager()

    await expect(wm.closeAllWindows()).resolves.toBeUndefined()
    expect(wm.hasWindows()).toBe(false)
  })
})

describe('WindowManager geometry saves', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('saves once after moves and resizes settle', () => {
    const { saved, windows } = managerWithAllWindowsOpen()
    const editor = windows[1]

    editor.emit('moved')
    jest.advanceTimersByTime(300)
    editor.emit('resized')
    jest.advanceTimersByTime(499)
    expect(saved).toEqual([])

    jest.advanceTimersByTime(1)
    expect(saved).toEqual(['cueEditorWindowState'])
  })

  it('saves each window under its own preference', () => {
    const { saved, windows } = managerWithAllWindowsOpen()

    for (const window of windows) {
      window.emit('resized')
    }
    jest.advanceTimersByTime(500)

    expect(saved.sort()).toEqual(['audioPreviewWindowState', 'cueEditorWindowState', 'windowState'])
  })
})
