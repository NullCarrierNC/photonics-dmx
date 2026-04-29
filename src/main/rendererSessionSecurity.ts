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
