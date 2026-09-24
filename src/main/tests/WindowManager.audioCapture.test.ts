import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import {
  createFakeBrowserWindow as mockCreateFakeBrowserWindow,
  type FakeBrowserWindow,
} from './fakeBrowserWindow'

jest.mock('electron', () => ({
  BrowserWindow: jest.fn((options: Record<string, unknown>) =>
    mockCreateFakeBrowserWindow(options),
  ),
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

function lastBuiltWindow(): FakeBrowserWindow {
  const results = (BrowserWindow as unknown as jest.Mock).mock.results
  return results[results.length - 1].value as FakeBrowserWindow
}

function managerWithAudio() {
  const disableAudio = jest.fn(async () => {})
  const wm = new WindowManager()
  wm.setControllerManager({
    getConfig: () => ({ getPreference: () => undefined, updatePreferences: async () => {} }),
    disableAudio,
  } as never)
  return { wm, disableAudio }
}

describe('audio follows the main window', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('stops audio when the main window closes', () => {
    const { wm, disableAudio } = managerWithAudio()
    wm.createMainWindow()

    lastBuiltWindow().emit('closed')

    expect(disableAudio).toHaveBeenCalledTimes(1)
  })

  it("stops audio when the main window's page stops running", () => {
    const { wm, disableAudio } = managerWithAudio()
    wm.createMainWindow()

    lastBuiltWindow().webContents.emit('render-process-gone', {}, { reason: 'crashed' })

    expect(disableAudio).toHaveBeenCalledTimes(1)
  })

  it('leaves audio running when another window closes or stops', () => {
    const { wm, disableAudio } = managerWithAudio()
    wm.createMainWindow()
    wm.openCueEditorWindow()
    const editor = lastBuiltWindow()
    wm.openAudioPreviewWindow()
    const preview = lastBuiltWindow()

    editor.emit('closed')
    preview.webContents.emit('render-process-gone', {}, { reason: 'crashed' })

    expect(disableAudio).not.toHaveBeenCalled()
  })
})
