import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import {
  createFakeBrowserWindow as mockCreateFakeBrowserWindow,
  type FakeBrowserWindow,
} from './fakeBrowserWindow'

const mockShowMessageBoxSync = jest.fn<(...args: unknown[]) => number>()

jest.mock('electron', () => ({
  BrowserWindow: jest.fn((options: Record<string, unknown>) =>
    mockCreateFakeBrowserWindow(options),
  ),
  dialog: { showMessageBoxSync: (...args: unknown[]) => mockShowMessageBoxSync(...args) },
  shell: { openExternal: jest.fn() },
  screen: {
    getAllDisplays: jest.fn(() => [{ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }]),
    getPrimaryDisplay: jest.fn(() => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } })),
  },
}))
jest.mock('@electron-toolkit/utils', () => ({ is: { dev: false } }))
jest.mock('../rendererSessionSecurity', () => ({ denyWebContentsWillNavigate: jest.fn() }))

import { BrowserWindow } from 'electron'
import { WindowManager } from '../WindowManager'

const LEAVE = 0
const STAY = 1

function lastBuiltWindow(): FakeBrowserWindow {
  const results = (BrowserWindow as unknown as jest.Mock).mock.results
  return results[results.length - 1].value as FakeBrowserWindow
}

/** Fires the unload a dirty page refused and reports whether main let the page go. */
function unloadRefusedByPage(window: FakeBrowserWindow): boolean {
  const event = { preventDefault: jest.fn() }
  window.webContents.emit('will-prevent-unload', event)
  return event.preventDefault.mock.calls.length > 0
}

/**
 * Makes `close()` behave as Electron does for a page with or without unsaved changes: a clean page
 * closes, and a dirty one refuses to unload and closes only if main lets it go.
 */
function closesLikeAPage(window: FakeBrowserWindow, dirty: boolean): void {
  window.close.mockImplementation(() => {
    if (!dirty || unloadRefusedByPage(window)) {
      window.destroyed = true
      window.emit('closed')
    }
  })
}

function managerWithMainAndEditor(dirty: { main: boolean; editor: boolean }) {
  const wm = new WindowManager()
  wm.createMainWindow()
  const main = lastBuiltWindow()
  wm.openCueEditorWindow()
  const editor = lastBuiltWindow()
  closesLikeAPage(main, dirty.main)
  closesLikeAPage(editor, dirty.editor)
  return { wm, main, editor }
}

describe('WindowManager unsaved-changes prompt', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('lets the page go when the user chooses to leave', () => {
    mockShowMessageBoxSync.mockReturnValue(LEAVE)
    const wm = new WindowManager()
    wm.createMainWindow()
    const window = lastBuiltWindow()

    expect(unloadRefusedByPage(window)).toBe(true)
    expect(mockShowMessageBoxSync).toHaveBeenCalledWith(window, expect.anything())
  })

  it('keeps the page when the user chooses to stay', () => {
    mockShowMessageBoxSync.mockReturnValue(STAY)
    const wm = new WindowManager()
    wm.createMainWindow()

    expect(unloadRefusedByPage(lastBuiltWindow())).toBe(false)
  })

  it('asks before the Cue Editor window closes over unsaved changes', () => {
    mockShowMessageBoxSync.mockReturnValue(STAY)
    const wm = new WindowManager()
    wm.openCueEditorWindow()
    const editor = lastBuiltWindow()

    expect(unloadRefusedByPage(editor)).toBe(false)
    expect(mockShowMessageBoxSync).toHaveBeenCalledWith(editor, expect.anything())
  })
})

describe('WindowManager windows closed for a Quit', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('asks a page with unsaved changes and keeps the app when the user stays', async () => {
    mockShowMessageBoxSync.mockReturnValue(STAY)
    const { wm, main, editor } = managerWithMainAndEditor({ main: false, editor: true })

    await expect(wm.closeWindowsForQuit()).resolves.toBe(false)

    expect(mockShowMessageBoxSync).toHaveBeenCalledWith(editor, expect.anything())
    expect(editor.destroyed).toBe(false)
    expect(main.close).not.toHaveBeenCalled()
    expect(wm.getMainWindow()).not.toBeNull()
  })

  it('closes every window once the user leaves the page with unsaved changes', async () => {
    mockShowMessageBoxSync.mockReturnValue(LEAVE)
    const { wm, main, editor } = managerWithMainAndEditor({ main: false, editor: true })

    await expect(wm.closeWindowsForQuit()).resolves.toBe(true)

    expect(editor.destroyed).toBe(true)
    expect(main.destroyed).toBe(true)
  })

  it('asks nothing when no page holds unsaved changes', async () => {
    const { wm, main, editor } = managerWithMainAndEditor({ main: false, editor: false })

    await expect(wm.closeWindowsForQuit()).resolves.toBe(true)

    expect(mockShowMessageBoxSync).not.toHaveBeenCalled()
    expect(editor.destroyed).toBe(true)
    expect(main.destroyed).toBe(true)
  })

  it('lets every page go without asking once the app closes its windows to shut down', async () => {
    const { wm, main } = managerWithMainAndEditor({ main: true, editor: true })

    await wm.closeAllWindows()

    expect(unloadRefusedByPage(main)).toBe(true)
    expect(mockShowMessageBoxSync).not.toHaveBeenCalled()
  })
})
