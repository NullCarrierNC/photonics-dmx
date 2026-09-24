import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import {
  createFakeBrowserWindow as mockCreateFakeBrowserWindow,
  type FakeBrowserWindow,
} from './fakeBrowserWindow'

const PRIMARY = { x: 0, y: 25, width: 1920, height: 1055 }
const SECOND = { x: 1920, y: 0, width: 2560, height: 1440 }

jest.mock('electron', () => ({
  BrowserWindow: jest.fn((options: Record<string, unknown>) =>
    mockCreateFakeBrowserWindow(options),
  ),
  shell: { openExternal: jest.fn() },
  screen: {
    getAllDisplays: jest.fn(() => [{ workArea: PRIMARY }, { workArea: SECOND }]),
    getPrimaryDisplay: jest.fn(() => ({ workArea: PRIMARY })),
  },
}))
jest.mock('@electron-toolkit/utils', () => ({ is: { dev: false } }))
jest.mock('../rendererSessionSecurity', () => ({ denyWebContentsWillNavigate: jest.fn() }))

import { BrowserWindow } from 'electron'
import { WindowManager } from '../WindowManager'

function lastWindow(): FakeBrowserWindow {
  const results = (BrowserWindow as unknown as jest.Mock).mock.results
  return results[results.length - 1].value as FakeBrowserWindow
}

/** The geometry the manager built its last window with. */
function lastWindowBounds(): Record<string, unknown> {
  const { options } = lastWindow()
  return { x: options.x, y: options.y, width: options.width, height: options.height }
}

function managerWithSaved(prefs: Record<string, unknown>): WindowManager {
  const wm = new WindowManager()
  wm.setControllerManager({
    getConfig: () => ({ getPreference: (key: string) => prefs[key] }),
  } as never)
  return wm
}

describe('WindowManager restored bounds', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('reopens a window straddling two displays where it was', () => {
    const saved = { x: 1500, y: 200, width: 1000, height: 700 }

    managerWithSaved({ windowState: saved }).createMainWindow()

    expect(lastWindowBounds()).toEqual(saved)
  })

  it('reopens a window left on a display that is gone centred in the primary work area', () => {
    managerWithSaved({
      windowState: { x: 9000, y: 200, width: 800, height: 600 },
    }).createMainWindow()

    expect(lastWindowBounds()).toEqual({ x: 560, y: 252, width: 800, height: 600 })
  })

  it('opens the audio preview at its own default size over a stored size with no position', () => {
    managerWithSaved({
      audioPreviewWindowState: { width: 560, height: 480 },
    }).openAudioPreviewWindow()

    expect(lastWindowBounds()).toMatchObject({ width: 560, height: 584 })
  })

  it('opens the main window centred in the primary work area on a first launch', () => {
    managerWithSaved({}).createMainWindow()

    expect(lastWindowBounds()).toEqual({ x: 320, y: 52, width: 1280, height: 1000 })
  })

  it('reopens a window the user sized and placed at that size', () => {
    managerWithSaved({
      audioPreviewWindowState: { x: 40, y: 60, width: 700, height: 480 },
    }).openAudioPreviewWindow()

    expect(lastWindowBounds()).toEqual({ x: 40, y: 60, width: 700, height: 480 })
  })
})

describe('WindowManager saved bounds', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('saves the size and place a maximised window returns to', async () => {
    const saved: Array<Record<string, unknown>> = []
    const wm = new WindowManager()
    wm.setControllerManager({
      getConfig: () => ({
        getPreference: () => undefined,
        updatePreferences: async (updates: Record<string, unknown>) => {
          saved.push(updates)
        },
      }),
    } as never)
    wm.createMainWindow()
    const window = lastWindow()
    window.bounds = { ...PRIMARY }
    window.normalBounds = { x: 100, y: 120, width: 900, height: 700 }

    await wm.closeAllWindows()

    expect(saved).toContainEqual({ windowState: { x: 100, y: 120, width: 900, height: 700 } })
  })
})

describe('WindowManager saving geometry as the window moves', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it.each(['move', 'resize', 'moved', 'resized'])(
    'saves the geometry once the window settles after %s',
    async (event) => {
      const saved: Array<Record<string, unknown>> = []
      const wm = new WindowManager()
      wm.setControllerManager({
        getConfig: () => ({
          getPreference: () => undefined,
          updatePreferences: async (updates: Record<string, unknown>) => {
            saved.push(updates)
          },
        }),
      } as never)
      wm.createMainWindow()
      const window = lastWindow()
      window.bounds = { x: 300, y: 200, width: 1000, height: 800 }

      window.emit(event)
      await jest.advanceTimersByTimeAsync(600)

      expect(saved).toEqual([{ windowState: { x: 300, y: 200, width: 1000, height: 800 } }])
    },
  )

  it('saves geometry still settling when the window closes', async () => {
    const saved: Array<Record<string, unknown>> = []
    const wm = new WindowManager()
    wm.setControllerManager({
      getConfig: () => ({
        getPreference: () => undefined,
        updatePreferences: async (updates: Record<string, unknown>) => {
          saved.push(updates)
        },
      }),
    } as never)
    wm.openCueEditorWindow()
    const editor = lastWindow()
    editor.bounds = { x: 300, y: 200, width: 1200, height: 900 }

    editor.emit('moved')
    await jest.advanceTimersByTimeAsync(100)
    editor.emit('close')
    editor.destroyed = true
    editor.emit('closed')
    await jest.advanceTimersByTimeAsync(1000)

    expect(saved).toEqual([{ cueEditorWindowState: { x: 300, y: 200, width: 1200, height: 900 } }])
  })
})

describe('WindowManager DevTools', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('keeps DevTools shut on every window of a packaged build', () => {
    const wm = managerWithSaved({})
    wm.createMainWindow()
    wm.openCueEditorWindow()
    wm.openAudioPreviewWindow()

    const results = (BrowserWindow as unknown as jest.Mock).mock.results
    for (const { value } of results) {
      const { webPreferences } = (value as FakeBrowserWindow).options as {
        webPreferences: { devTools?: boolean }
      }
      expect(webPreferences.devTools).toBe(false)
    }
    expect(results).toHaveLength(3)
  })
})
