import { describe, expect, it, jest, beforeEach } from '@jest/globals'

const mockLoadFile = jest.fn(() => Promise.resolve())
const mockLoadURL = jest.fn((_url: string) => Promise.resolve())

jest.mock('electron', () => ({
  BrowserWindow: jest.fn(() => ({
    on: jest.fn(),
    webContents: { setWindowOpenHandler: jest.fn(), on: jest.fn() },
    loadFile: mockLoadFile,
    loadURL: mockLoadURL,
  })),
  shell: { openExternal: jest.fn(() => Promise.resolve()) },
  screen: {
    getAllDisplays: jest.fn(() => [{ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }]),
    getPrimaryDisplay: jest.fn(() => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } })),
  },
}))
jest.mock('@electron-toolkit/utils', () => ({ is: { dev: false } }))
jest.mock('../rendererSessionSecurity', () => ({ denyWebContentsWillNavigate: jest.fn() }))

import { BrowserWindow } from 'electron'
import {
  setLogSink,
  setMinLogLevel,
  resetLogConfiguration,
  type LogEntry,
} from '../../shared/logger'
import { WindowManager } from '../WindowManager'

/** Records log entries while `fn` runs and settles. */
async function withCapturedEntries(fn: () => void): Promise<LogEntry[]> {
  const entries: LogEntry[] = []
  setMinLogLevel('debug')
  setLogSink((entry) => entries.push(entry))
  try {
    fn()
    await Promise.resolve()
    await Promise.resolve()
    return entries
  } finally {
    resetLogConfiguration()
  }
}

describe('WindowManager renderer loads', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockLoadURL.mockReturnValue(Promise.resolve())
  })

  it('loads the built renderer from its own scheme', async () => {
    await withCapturedEntries(() => {
      new WindowManager().createMainWindow()
    })

    expect(mockLoadURL).toHaveBeenCalledWith('photonics://renderer/index.html')
    expect(mockLoadFile).not.toHaveBeenCalled()
  })

  it('names the window that failed to load', async () => {
    mockLoadURL.mockReturnValueOnce(Promise.reject(new Error('boom')))

    const entries = await withCapturedEntries(() => {
      new WindowManager().createMainWindow()
    })

    const failure = entries.find((entry) => entry.level === 'error')
    expect(failure?.message).toContain('main')
    expect(failure?.data[0]).toEqual(new Error('boom'))
  })

  it('says nothing when the load resolves', async () => {
    const entries = await withCapturedEntries(() => {
      new WindowManager().createMainWindow()
    })

    expect(entries.filter((entry) => entry.level === 'error')).toEqual([])
  })

  it.each([
    [
      'main',
      (manager: WindowManager) => manager.createMainWindow(),
      { backgroundThrottling: false },
    ],
    ['cue editor', (manager: WindowManager) => manager.openCueEditorWindow(), {}],
    ['audio preview', (manager: WindowManager) => manager.openAudioPreviewWindow(), {}],
  ])(
    'opens the %s page with only its sandboxed, isolated, Node-free preferences',
    async (_role, open, extra) => {
      await withCapturedEntries(() => {
        open(new WindowManager())
      })

      const options = jest.mocked(BrowserWindow).mock.calls[0]?.[0]
      expect(options?.webPreferences).toEqual({
        preload: expect.stringMatching(/[\\/]preload[\\/]index\.js$/),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        devTools: false,
        ...extra,
      })
    },
  )
})
