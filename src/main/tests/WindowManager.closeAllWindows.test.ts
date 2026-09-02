import { describe, expect, it, jest, beforeEach } from '@jest/globals'

jest.mock('electron', () => ({
  BrowserWindow: Object.assign(jest.fn(), { getAllWindows: jest.fn(() => []) }),
  shell: { openExternal: jest.fn() },
  screen: { getAllDisplays: jest.fn(() => []), getPrimaryDisplay: jest.fn() },
}))
jest.mock('@electron-toolkit/utils', () => ({ is: { dev: false } }))

import { WindowManager } from '../WindowManager'

/**
 * Every window the manager owns, with the private field it is held in, the debounce timers it
 * arms, and the preference key its geometry is saved under.
 *
 * The close path enumerates each window three separate times, to save, clear timers and close, so
 * a window can be present in one pass and missing from another.
 */
const WINDOWS = [
  { field: 'mainWindow', prefKey: 'windowState', timers: ['resizeTimeout', 'moveTimeout'] },
  {
    field: 'cueEditorWindow',
    prefKey: 'cueEditorWindowState',
    timers: ['cueEditorResizeTimeout', 'cueEditorMoveTimeout'],
  },
  {
    field: 'audioPreviewWindow',
    prefKey: 'audioPreviewWindowState',
    timers: ['audioPreviewResizeTimeout', 'audioPreviewMoveTimeout'],
  },
] as const

type Internals = Record<string, unknown>

function fakeWindow(destroyed = false) {
  return {
    isDestroyed: jest.fn(() => destroyed),
    close: jest.fn(),
    getBounds: jest.fn(() => ({ width: 1280, height: 800, x: 10, y: 20 })),
    isMaximized: jest.fn(() => false),
    webContents: { send: jest.fn() },
  }
}

/** A manager with every window open, every timer armed, and preference writes captured. */
function managerWithAllWindowsOpen() {
  const wm = new WindowManager()
  const internals = wm as unknown as Internals
  const saved: Array<{ key: string }> = []

  const windows = new Map<string, ReturnType<typeof fakeWindow>>()
  for (const spec of WINDOWS) {
    const win = fakeWindow()
    windows.set(spec.field, win)
    internals[spec.field] = win
    for (const timer of spec.timers) {
      internals[timer] = setTimeout(() => {}, 60_000)
    }
  }

  wm.setControllerManager({
    getConfig: () => ({
      updatePreferences: async (updates: Record<string, unknown>) => {
        for (const key of Object.keys(updates)) {
          saved.push({ key })
        }
      },
    }),
  } as never)

  return { wm, internals, windows, saved }
}

describe('WindowManager.closeAllWindows', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('closes every window it owns', async () => {
    const { wm, windows } = managerWithAllWindowsOpen()

    await wm.closeAllWindows()

    for (const spec of WINDOWS) {
      expect(windows.get(spec.field)!.close).toHaveBeenCalledTimes(1)
    }
  })

  it('drops its reference to every window', async () => {
    const { wm, internals } = managerWithAllWindowsOpen()

    await wm.closeAllWindows()

    for (const spec of WINDOWS) {
      expect(internals[spec.field]).toBeNull()
    }
  })

  it('clears every debounce timer, so nothing fires after teardown', async () => {
    const { wm, internals } = managerWithAllWindowsOpen()

    await wm.closeAllWindows()

    for (const spec of WINDOWS) {
      for (const timer of spec.timers) {
        expect(internals[timer]).toBeNull()
      }
    }
  })

  it('saves the geometry of every window before closing it', async () => {
    const { wm, saved } = managerWithAllWindowsOpen()

    await wm.closeAllWindows()

    expect(saved.map((s) => s.key).sort()).toEqual(WINDOWS.map((w) => w.prefKey).sort())
  })

  it('leaves a destroyed window alone rather than closing it twice', async () => {
    const { wm, internals } = managerWithAllWindowsOpen()
    const destroyed = fakeWindow(true)
    internals.cueEditorWindow = destroyed

    await wm.closeAllWindows()

    expect(destroyed.close).not.toHaveBeenCalled()
    expect(internals.cueEditorWindow).toBeNull()
  })

  it('is safe to call when no window was ever opened', async () => {
    const wm = new WindowManager()

    await expect(wm.closeAllWindows()).resolves.toBeUndefined()
    expect(wm.hasWindows()).toBe(false)
  })

  it('covers every window field the manager declares', () => {
    const wm = new WindowManager()
    const declared = Object.keys(wm as unknown as Internals).filter((k) => k.endsWith('Window'))

    expect(declared.sort()).toEqual(WINDOWS.map((w) => w.field).sort())
  })

  it('covers every debounce timer the manager declares', () => {
    const wm = new WindowManager()
    const declared = Object.keys(wm as unknown as Internals).filter((k) => k.endsWith('Timeout'))

    expect(declared.sort()).toEqual(WINDOWS.flatMap((w) => [...w.timers]).sort())
  })
})
