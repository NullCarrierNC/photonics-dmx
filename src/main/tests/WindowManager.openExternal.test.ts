import { describe, expect, it, jest, beforeEach } from '@jest/globals'

jest.mock('electron', () => ({
  BrowserWindow: jest.fn(),
  shell: { openExternal: jest.fn() },
  screen: { getAllDisplays: jest.fn(() => []), getPrimaryDisplay: jest.fn() },
}))
jest.mock('@electron-toolkit/utils', () => ({ is: { dev: false } }))

import { shell } from 'electron'
import { WindowManager } from '../WindowManager'

function openExternalSafely(url: string): void {
  const wm = new WindowManager()
  ;(wm as unknown as { openExternalSafely(u: string): void }).openExternalSafely(url)
}

describe('WindowManager.openExternalSafely', () => {
  beforeEach(() => jest.clearAllMocks())

  it('opens http and https URLs', () => {
    openExternalSafely('https://example.com/docs')
    openExternalSafely('http://example.com')
    expect(shell.openExternal).toHaveBeenCalledTimes(2)
  })

  it.each(['file:///etc/passwd', 'smb://host/share', 'javascript:alert(1)', 'not a url'])(
    'drops %s without reaching the system handler',
    (url) => {
      openExternalSafely(url)
      expect(shell.openExternal).not.toHaveBeenCalled()
    },
  )
})
