import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import {
  createFakeBrowserWindow as mockCreateFakeBrowserWindow,
  type FakeBrowserWindow,
} from './fakeBrowserWindow'

const PRIMARY = { x: 0, y: 25, width: 1920, height: 1055 }
const SECOND = { x: 1920, y: 0, width: 2560, height: 1440 }

jest.mock('electron', () => ({
  BrowserWindow: Object.assign(
    jest.fn((options: Record<string, unknown>) => mockCreateFakeBrowserWindow(options)),
    { getAllWindows: jest.fn(() => []) },
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

/** The geometry the manager built its last window with. */
function lastWindowBounds(): Record<string, unknown> {
  const results = (BrowserWindow as unknown as jest.Mock).mock.results
  const { options } = results[results.length - 1].value as FakeBrowserWindow
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
})
