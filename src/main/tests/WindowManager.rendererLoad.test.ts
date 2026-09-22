import { describe, expect, it, jest, beforeEach } from '@jest/globals'

const mockLoadFile = jest.fn(() => Promise.resolve())
const mockLoadURL = jest.fn(() => Promise.resolve())

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
    mockLoadFile.mockReturnValue(Promise.resolve())
  })

  it('names the window that failed to load', async () => {
    mockLoadFile.mockReturnValueOnce(Promise.reject(new Error('boom')))

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
})
