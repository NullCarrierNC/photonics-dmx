/**
 * Permission answers for the renderer session.
 *
 * Electron grants every request when no handler is installed, so these two handlers are the whole
 * of what the renderer is allowed to reach.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals'

type RequestHandler = (
  webContents: unknown,
  permission: string,
  callback: (granted: boolean) => void,
  details: Record<string, unknown>,
) => void

type CheckHandler = (
  webContents: unknown,
  permission: string,
  origin: string,
  details: Record<string, unknown>,
) => boolean

const setPermissionRequestHandler = jest.fn<(h: RequestHandler) => void>()
const setPermissionCheckHandler = jest.fn<(h: CheckHandler) => void>()

jest.mock('electron', () => ({
  session: {
    defaultSession: {
      setPermissionRequestHandler: (h: RequestHandler) => setPermissionRequestHandler(h),
      setPermissionCheckHandler: (h: CheckHandler) => setPermissionCheckHandler(h),
      webRequest: { onHeadersReceived: jest.fn() },
    },
  },
}))

jest.mock('@electron-toolkit/utils', () => ({ is: { dev: false } }))

import { installDefaultSessionPermissionHandlers } from '../rendererSessionSecurity'

/** Install the handlers and return them in a form a test can call directly. */
function installed(): {
  request: (permission: string, details?: Record<string, unknown>) => boolean
  check: (permission: string, details?: Record<string, unknown>) => boolean
} {
  installDefaultSessionPermissionHandlers()
  const requestHandler = setPermissionRequestHandler.mock.calls[0][0]
  const checkHandler = setPermissionCheckHandler.mock.calls[0][0]
  return {
    request: (permission, details = {}) => {
      let granted: boolean | undefined
      requestHandler(
        {},
        permission,
        (value) => {
          granted = value
        },
        details,
      )
      return granted === true
    },
    check: (permission, details = {}) => checkHandler({}, permission, 'file://', details),
  }
}

describe('renderer session permissions', () => {
  beforeEach(() => {
    setPermissionRequestHandler.mockReset()
    setPermissionCheckHandler.mockReset()
  })

  it('grants the microphone, which the audio-reactive cues run on', () => {
    const { request, check } = installed()

    expect(request('media', { mediaTypes: ['audio'] })).toBe(true)
    expect(check('media', { mediaType: 'audio' })).toBe(true)
  })

  it('refuses the camera even alongside the microphone', () => {
    const { request } = installed()

    expect(request('media', { mediaTypes: ['video'] })).toBe(false)
    expect(request('media', { mediaTypes: ['audio', 'video'] })).toBe(false)
  })

  it('refuses a media request that names no type', () => {
    const { request, check } = installed()

    expect(request('media', {})).toBe(false)
    expect(check('media', {})).toBe(false)
  })

  it('refuses everything else the renderer could ask for', () => {
    const { request, check } = installed()

    for (const permission of [
      'geolocation',
      'notifications',
      'midiSysex',
      'display-capture',
      'hid',
      'serial',
      'usb',
      'openExternal',
      'clipboard-read',
      'idle-detection',
    ]) {
      expect(request(permission)).toBe(false)
      expect(check(permission)).toBe(false)
    }
  })
})
