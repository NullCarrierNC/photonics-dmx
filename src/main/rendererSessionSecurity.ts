import { session, type WebContents } from 'electron'
import { is } from '@electron-toolkit/utils'

const PRODUCTION_RENDERER_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; worker-src 'self' blob:"

const DEVELOPMENT_RENDERER_CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws:; worker-src 'self' blob:"

/**
 * Applies a Content-Security-Policy to all responses in the default session.
 * Development allows the Vite React refresh preamble and websocket HMR.
 */
export function installDefaultSessionContentSecurityPolicy(): void {
  const rendererCsp = is.dev ? DEVELOPMENT_RENDERER_CSP : PRODUCTION_RENDERER_CSP

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const prior = (details.responseHeaders ?? {}) as Record<string, string | string[] | undefined>
    const responseHeaders: Record<string, string | string[]> = Object.fromEntries(
      Object.entries(prior).filter((e): e is [string, string | string[]] => e[1] !== undefined),
    )
    responseHeaders['content-security-policy'] = [rendererCsp]
    callback({ responseHeaders })
  })
}

/**
 * Disallow top-level navigation away from the loaded page (e.g. `window.location` to an external URL).
 */
export function denyWebContentsWillNavigate(webContents: WebContents): void {
  webContents.on('will-navigate', (event) => {
    event.preventDefault()
  })
}

/**
 * Whether the renderer is allowed to hold `permission`.
 *
 * Audio capture drives the audio-reactive cues, so the microphone is asked for in normal use. It is
 * the only one: nothing here captures video, reads a location or talks to a HID or serial device
 * through the web APIs, and DMX hardware is reached from the main process instead.
 */
function isGrantablePermission(permission: string, mediaTypes: readonly string[]): boolean {
  if (permission !== 'media') {
    return false
  }
  return mediaTypes.length > 0 && mediaTypes.every((type) => type === 'audio')
}

/**
 * Answers permission requests and checks for the default session.
 *
 * Electron grants every request when no handler is installed, so this is what stands between a
 * compromised renderer and the camera, the location and the device APIs.
 */
export function installDefaultSessionPermissionHandlers(): void {
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, permission, callback, details) => {
      const mediaTypes = (details as { mediaTypes?: string[] }).mediaTypes ?? []
      callback(isGrantablePermission(permission, mediaTypes))
    },
  )

  session.defaultSession.setPermissionCheckHandler((_webContents, permission, _origin, details) => {
    const mediaType = (details as { mediaType?: string }).mediaType
    return isGrantablePermission(permission, mediaType === undefined ? [] : [mediaType])
  })
}
