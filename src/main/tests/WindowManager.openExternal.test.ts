import { describe, expect, it, jest, beforeEach } from '@jest/globals'

jest.mock('electron', () => ({
  BrowserWindow: jest.fn(),
  shell: { openExternal: jest.fn(() => Promise.resolve()) },
  screen: { getAllDisplays: jest.fn(() => []), getPrimaryDisplay: jest.fn() },
}))
jest.mock('@electron-toolkit/utils', () => ({ is: { dev: false } }))

import { shell } from 'electron'
import {
  setLogSink,
  setMinLogLevel,
  resetLogConfiguration,
  type LogEntry,
} from '../../shared/logger'
import { WindowManager } from '../WindowManager'

function openExternalSafely(url: string): void {
  const wm = new WindowManager()
  ;(wm as unknown as { openExternalSafely(u: string): void }).openExternalSafely(url)
}

describe('WindowManager.openExternalSafely', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('opens http and https URLs', () => {
    openExternalSafely('https://example.com/docs')
    openExternalSafely('http://example.com')
    expect(shell.openExternal).toHaveBeenCalledTimes(2)
  })

  it('logs a refusal from the system handler', async () => {
    const entries: LogEntry[] = []
    setMinLogLevel('debug')
    setLogSink((entry) => entries.push(entry))
    try {
      ;(shell.openExternal as jest.Mock<typeof shell.openExternal>).mockReturnValueOnce(
        Promise.reject(new Error('no handler')),
      )
      openExternalSafely('https://example.com/docs')
      await Promise.resolve()
      await Promise.resolve()
    } finally {
      resetLogConfiguration()
    }

    expect(entries.find((entry) => entry.level === 'error')?.data[0]).toEqual(
      new Error('no handler'),
    )
  })

  it.each(['file:///etc/passwd', 'smb://host/share', 'javascript:alert(1)', 'not a url'])(
    'drops %s without reaching the system handler',
    (url) => {
      openExternalSafely(url)
      expect(shell.openExternal).not.toHaveBeenCalled()
    },
  )
})
