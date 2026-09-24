import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import {
  closesLikeAPage,
  createFakeBrowserWindow as mockCreateFakeBrowserWindow,
  type FakeBrowserWindow,
} from './fakeBrowserWindow'

/** Answers the open prompt. Replaced by each prompt the manager opens. */
let answerPrompt: (choice: number) => void = () => {}

const mockShowMessageBox = jest.fn<(...args: unknown[]) => Promise<{ response: number }>>(
  () =>
    new Promise((resolve) => {
      answerPrompt = (choice) => resolve({ response: choice })
    }),
)

jest.mock('electron', () => ({
  BrowserWindow: jest.fn((options: Record<string, unknown>) =>
    mockCreateFakeBrowserWindow(options),
  ),
  dialog: { showMessageBox: (...args: unknown[]) => mockShowMessageBox(...args) },
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

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

/** Fires an unload the page refused and reports whether main let the page go. */
function unloadRefusedByPage(window: FakeBrowserWindow): boolean {
  const event = { preventDefault: jest.fn() }
  window.webContents.emit('will-prevent-unload', event)
  return event.preventDefault.mock.calls.length > 0
}

/** A main window and a Cue Editor, each page reporting whether it holds unsaved changes. */
function managerWithMainAndEditor(dirty: { main: boolean; editor: boolean }) {
  const wm = new WindowManager()
  wm.createMainWindow()
  const main = lastBuiltWindow()
  wm.openCueEditorWindow()
  const editor = lastBuiltWindow()
  closesLikeAPage(main, dirty.main)
  closesLikeAPage(editor, dirty.editor)
  wm.setUnsavedChanges(main.webContents as never, dirty.main)
  wm.setUnsavedChanges(editor.webContents as never, dirty.editor)
  return { wm, main, editor }
}

describe('WindowManager unsaved-changes prompt', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('closes the page once the user chooses to leave', async () => {
    const wm = new WindowManager()
    wm.createMainWindow()
    const window = lastBuiltWindow()
    closesLikeAPage(window, true)

    window.close()
    await flush()
    expect(mockShowMessageBox).toHaveBeenCalledWith(window, expect.anything())
    expect(window.destroyed).toBe(false)

    answerPrompt(LEAVE)
    await flush()

    expect(window.destroyed).toBe(true)
    expect(mockShowMessageBox).toHaveBeenCalledTimes(1)
  })

  it('keeps the page when the user chooses to stay', async () => {
    const wm = new WindowManager()
    wm.createMainWindow()
    const window = lastBuiltWindow()
    closesLikeAPage(window, true)

    window.close()
    await flush()
    answerPrompt(STAY)
    await flush()

    expect(window.destroyed).toBe(false)
    expect(window.close).toHaveBeenCalledTimes(1)
  })

  it('asks before the Cue Editor window closes over unsaved changes', async () => {
    const wm = new WindowManager()
    wm.openCueEditorWindow()
    const editor = lastBuiltWindow()
    closesLikeAPage(editor, true)

    editor.close()
    await flush()

    expect(mockShowMessageBox).toHaveBeenCalledWith(editor, expect.anything())
  })

  it('reloads a page the user leaves on a reload', async () => {
    const wm = new WindowManager()
    wm.createMainWindow()
    const window = lastBuiltWindow()

    expect(unloadRefusedByPage(window)).toBe(false)
    answerPrompt(LEAVE)
    await flush()

    expect(window.webContents.reload).toHaveBeenCalledTimes(1)
    expect(unloadRefusedByPage(window)).toBe(true)
  })

  it('forgets the unsaved changes of a page the user leaves on a reload', async () => {
    const { wm, main } = managerWithMainAndEditor({ main: true, editor: false })

    unloadRefusedByPage(main)
    answerPrompt(LEAVE)
    await flush()
    main.webContents.emit('did-navigate', {}, 'app://index.html')

    await expect(wm.closeWindowsForQuit()).resolves.toBe(true)
    expect(mockShowMessageBox).toHaveBeenCalledTimes(1)
  })

  it('keeps the unsaved changes of a page the user stays on', async () => {
    const { wm, main } = managerWithMainAndEditor({ main: true, editor: false })

    unloadRefusedByPage(main)
    answerPrompt(STAY)
    await flush()

    const quit = wm.closeWindowsForQuit()
    await flush()
    expect(mockShowMessageBox).toHaveBeenCalledTimes(2)
    answerPrompt(STAY)
    await expect(quit).resolves.toBe(false)
  })

  it('opens one prompt for a page closed again while it asks', async () => {
    const wm = new WindowManager()
    wm.createMainWindow()
    const window = lastBuiltWindow()
    closesLikeAPage(window, true)

    window.close()
    await flush()
    window.close()
    await flush()

    expect(mockShowMessageBox).toHaveBeenCalledTimes(1)
  })

  it('keeps Node timers running while the prompt waits for an answer', async () => {
    jest.useFakeTimers()
    const wm = new WindowManager()
    wm.createMainWindow()
    const window = lastBuiltWindow()
    closesLikeAPage(window, true)
    const tick = jest.fn()
    setInterval(tick, 100)

    window.close()
    await jest.advanceTimersByTimeAsync(1000)

    expect(tick).toHaveBeenCalledTimes(10)
    expect(window.destroyed).toBe(false)
    answerPrompt(STAY)
  })
})

describe('WindowManager windows closed for a Quit', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('asks a page with unsaved changes and keeps the app when the user stays', async () => {
    const { wm, main, editor } = managerWithMainAndEditor({ main: false, editor: true })

    const quit = wm.closeWindowsForQuit()
    await flush()
    answerPrompt(STAY)

    await expect(quit).resolves.toBe(false)
    expect(mockShowMessageBox).toHaveBeenCalledWith(editor, expect.anything())
    expect(editor.destroyed).toBe(false)
    expect(main.close).not.toHaveBeenCalled()
    expect(wm.getMainWindow()).not.toBeNull()
  })

  it('closes every window once the user leaves the page with unsaved changes', async () => {
    const { wm, main, editor } = managerWithMainAndEditor({ main: false, editor: true })

    const quit = wm.closeWindowsForQuit()
    await flush()
    answerPrompt(LEAVE)

    await expect(quit).resolves.toBe(true)
    expect(editor.destroyed).toBe(true)
    expect(main.destroyed).toBe(true)
  })

  it('closes no window when the user stays on any page it asks about', async () => {
    const { wm, main, editor } = managerWithMainAndEditor({ main: true, editor: true })

    const quit = wm.closeWindowsForQuit()
    await flush()
    answerPrompt(LEAVE)
    await flush()
    expect(mockShowMessageBox).toHaveBeenCalledTimes(2)
    answerPrompt(STAY)

    await expect(quit).resolves.toBe(false)
    expect(editor.close).not.toHaveBeenCalled()
    expect(main.close).not.toHaveBeenCalled()
  })

  it('asks each page once and then closes them all', async () => {
    const { wm, main, editor } = managerWithMainAndEditor({ main: true, editor: true })

    const quit = wm.closeWindowsForQuit()
    await flush()
    answerPrompt(LEAVE)
    await flush()
    answerPrompt(LEAVE)

    await expect(quit).resolves.toBe(true)
    expect(mockShowMessageBox).toHaveBeenCalledTimes(2)
    expect(editor.destroyed).toBe(true)
    expect(main.destroyed).toBe(true)
  })

  it('waits for the answer however long the prompt stays open', async () => {
    jest.useFakeTimers()
    const { wm, main } = managerWithMainAndEditor({ main: false, editor: true })
    let settled = false

    const quit = wm.closeWindowsForQuit().then((closed) => {
      settled = true
      return closed
    })
    await jest.advanceTimersByTimeAsync(30_000)
    expect(settled).toBe(false)
    expect(main.close).not.toHaveBeenCalled()

    answerPrompt(LEAVE)
    await jest.advanceTimersByTimeAsync(0)

    await expect(quit).resolves.toBe(true)
  })

  it('carries on without a page that never answers the close', async () => {
    jest.useFakeTimers()
    const { wm, main, editor } = managerWithMainAndEditor({ main: false, editor: false })
    editor.close.mockImplementation(() => {})

    const quit = wm.closeWindowsForQuit()
    await jest.advanceTimersByTimeAsync(5000)

    await expect(quit).resolves.toBe(true)
    expect(main.destroyed).toBe(true)
  })

  it('gives every page that never answers the close one shared wait', async () => {
    jest.useFakeTimers()
    const { wm, main, editor } = managerWithMainAndEditor({ main: false, editor: false })
    editor.close.mockImplementation(() => {})
    main.close.mockImplementation(() => {})
    let settled = false

    const quit = wm.closeWindowsForQuit().then((closed) => {
      settled = true
      return closed
    })
    await jest.advanceTimersByTimeAsync(5000)

    expect(settled).toBe(true)
    await expect(quit).resolves.toBe(true)
  })

  it('asks nothing when no page holds unsaved changes', async () => {
    const { wm, main, editor } = managerWithMainAndEditor({ main: false, editor: false })

    await expect(wm.closeWindowsForQuit()).resolves.toBe(true)

    expect(mockShowMessageBox).not.toHaveBeenCalled()
    expect(editor.destroyed).toBe(true)
    expect(main.destroyed).toBe(true)
  })

  it('lets every page go without asking once the app closes its windows to shut down', async () => {
    const { wm, main } = managerWithMainAndEditor({ main: true, editor: true })

    await wm.closeAllWindows()

    expect(unloadRefusedByPage(main)).toBe(true)
    expect(mockShowMessageBox).not.toHaveBeenCalled()
  })
})
