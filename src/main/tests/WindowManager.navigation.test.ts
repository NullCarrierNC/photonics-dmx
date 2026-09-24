import { describe, expect, it, jest, beforeEach } from '@jest/globals'
import {
  createFakeBrowserWindow as mockCreateFakeBrowserWindow,
  type FakeBrowserWindow,
} from './fakeBrowserWindow'

jest.mock('electron', () => ({
  BrowserWindow: jest.fn((options: Record<string, unknown>) =>
    mockCreateFakeBrowserWindow(options),
  ),
  shell: { openExternal: jest.fn(() => Promise.resolve()) },
  screen: {
    getAllDisplays: jest.fn(() => [{ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }]),
    getPrimaryDisplay: jest.fn(() => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } })),
  },
}))
jest.mock('@electron-toolkit/utils', () => ({ is: { dev: false } }))

import { BrowserWindow, shell } from 'electron'
import { WindowManager } from '../WindowManager'

type WindowOpenHandler = (details: { url: string }) => { action: string }

const OPENERS = [
  ['main', (manager: WindowManager) => manager.createMainWindow()],
  ['cue editor', (manager: WindowManager) => manager.openCueEditorWindow()],
  ['audio preview', (manager: WindowManager) => manager.openAudioPreviewWindow()],
] as const

function builtWindow(open: (manager: WindowManager) => unknown): FakeBrowserWindow {
  open(new WindowManager())
  const results = (BrowserWindow as unknown as jest.Mock).mock.results
  return results[results.length - 1].value as FakeBrowserWindow
}

function windowOpenHandler(window: FakeBrowserWindow): WindowOpenHandler {
  return window.webContents.setWindowOpenHandler.mock.calls[0][0] as WindowOpenHandler
}

describe('WindowManager keeps each page where it loaded', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it.each(OPENERS)('the %s window hands an http(s) link to the system browser', (_, open) => {
    const handler = windowOpenHandler(builtWindow(open))

    expect(handler({ url: 'https://example.com/docs' })).toEqual({ action: 'deny' })
    expect(shell.openExternal).toHaveBeenCalledWith('https://example.com/docs')
  })

  it.each(OPENERS)('the %s window opens nothing for a file link', (_, open) => {
    const handler = windowOpenHandler(builtWindow(open))

    expect(handler({ url: 'file:///etc/passwd' })).toEqual({ action: 'deny' })
    expect(shell.openExternal).not.toHaveBeenCalled()
  })

  it.each(OPENERS)('the %s window refuses to navigate away', (_, open) => {
    const window = builtWindow(open)
    const event = { preventDefault: jest.fn() }

    window.webContents.emit('will-navigate', event, 'https://example.com/')

    expect(event.preventDefault).toHaveBeenCalledTimes(1)
  })
})
