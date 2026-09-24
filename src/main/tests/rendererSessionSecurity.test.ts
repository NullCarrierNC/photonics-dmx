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

type HeadersListener = (
  details: { responseHeaders?: Record<string, string[]> },
  callback: (response: { responseHeaders: Record<string, string | string[]> }) => void,
) => void

const setPermissionRequestHandler = jest.fn<(h: RequestHandler) => void>()
const setPermissionCheckHandler = jest.fn<(h: CheckHandler) => void>()
const onHeadersReceived = jest.fn<(listener: HeadersListener) => void>()

jest.mock('electron', () => ({
  session: {
    defaultSession: {
      setPermissionRequestHandler: (h: RequestHandler) => setPermissionRequestHandler(h),
      setPermissionCheckHandler: (h: CheckHandler) => setPermissionCheckHandler(h),
      webRequest: { onHeadersReceived: (l: HeadersListener) => onHeadersReceived(l) },
    },
  },
}))

jest.mock('@electron-toolkit/utils', () => ({ is: { dev: false } }))

import {
  installDefaultSessionContentSecurityPolicy,
  installDefaultSessionPermissionHandlers,
} from '../rendererSessionSecurity'

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

describe('renderer content security policy', () => {
  /** The response headers the installed listener hands back for a response carrying `prior`. */
  function answered(prior: Record<string, string[]>): Record<string, string | string[]> {
    onHeadersReceived.mockReset()
    installDefaultSessionContentSecurityPolicy()
    const listener = onHeadersReceived.mock.calls[0][0]
    let headers: Record<string, string | string[]> = {}
    listener({ responseHeaders: prior }, (response) => {
      headers = response.responseHeaders
    })
    return headers
  }

  /** Each directive of a policy by name, with its sources. */
  function directives(policy: string): Map<string, string[]> {
    return new Map(
      policy
        .split(';')
        .map((part) => part.trim().split(/\s+/))
        .filter((words) => words[0] !== '')
        .map(([name, ...sources]) => [name, sources]),
    )
  }

  it('sets the production policy on every response', () => {
    const policy = answered({})['content-security-policy']

    expect(policy).toEqual([expect.any(String)])
    const byName = directives((policy as string[])[0])
    expect(byName.get('default-src')).toEqual(["'self'"])
    expect(byName.get('script-src')).toEqual(["'self'"])
    expect(byName.get('connect-src')).toEqual(["'self'"])
    expect(byName.get('worker-src')).toEqual(["'self'", 'blob:'])
  })

  it('keeps the headers a response already carries', () => {
    expect(answered({ 'x-frame-options': ['DENY'] })['x-frame-options']).toEqual(['DENY'])
  })
})
