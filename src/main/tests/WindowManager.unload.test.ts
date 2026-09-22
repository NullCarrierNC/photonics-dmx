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

function openMainWindow(): { wm: WindowManager; window: FakeBrowserWindow } {
  const wm = new WindowManager()
  wm.createMainWindow()
  const results = (BrowserWindow as unknown as jest.Mock).mock.results
  return { wm, window: results[results.length - 1].value as FakeBrowserWindow }
}

/** Fires the unload a dirty page refused and reports whether main let the page go. */
function unloadRefusedByPage(window: FakeBrowserWindow): boolean {
  const event = { preventDefault: jest.fn() }
  window.webContents.emit('will-prevent-unload', event)
  return event.preventDefault.mock.calls.length > 0
}

describe('WindowManager unsaved-changes prompt', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('lets the page go when the user chooses to leave', () => {
    mockShowMessageBoxSync.mockReturnValue(LEAVE)
    const { window } = openMainWindow()

    expect(unloadRefusedByPage(window)).toBe(true)
    expect(mockShowMessageBoxSync).toHaveBeenCalledWith(window, expect.anything())
  })

  it('keeps the page when the user chooses to stay', () => {
    mockShowMessageBoxSync.mockReturnValue(STAY)
    const { window } = openMainWindow()

    expect(unloadRefusedByPage(window)).toBe(false)
  })

  it('lets every page go without asking once the app closes its windows to quit', async () => {
    const { wm, window } = openMainWindow()

    await wm.closeAllWindows()

    expect(unloadRefusedByPage(window)).toBe(true)
    expect(mockShowMessageBoxSync).not.toHaveBeenCalled()
  })
})
