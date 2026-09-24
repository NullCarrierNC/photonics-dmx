import type { WebContents } from 'electron'
import { createLogger } from '../../shared/logger'

const log = createLogger('consoleRendererBinding')

/**
 * Tie console mode to the page that opened it.
 *
 * The console holds the publisher in manual output until something disables it, and only the page
 * does. A page that reloads, navigates or stops running leaves the rig on its last manual frame
 * with cue output locked out, so leave console mode when the page that opened it goes away.
 *
 * Binding twice for one console session is harmless: the first signal releases and the rest are
 * ignored, and `disableConsoleMode` is a no-op when the console is already closed.
 */
export function bindConsoleModeToRenderer(
  webContents: WebContents,
  disableConsoleMode: () => Promise<unknown>,
): void {
  let released = false

  const onNavigate = (details: { isMainFrame: boolean; isSameDocument: boolean }): void => {
    // A same-document navigation is the in-app router moving between pages, which the page itself
    // handles. Only a real document load takes the console's renderer state with it.
    if (details.isMainFrame && !details.isSameDocument) {
      release('navigated')
    }
  }

  const onDestroyed = (): void => release('closed')
  const onGone = (): void => release('stopped')

  const release = (reason: string): void => {
    if (released) {
      return
    }
    released = true
    webContents.off('did-start-navigation', onNavigate)
    webContents.off('destroyed', onDestroyed)
    webContents.off('render-process-gone', onGone)
    log.info(`Leaving console mode: the page ${reason}`)
    disableConsoleMode().catch((err) => {
      log.error('Error leaving console mode:', err)
    })
  }

  webContents.once('destroyed', onDestroyed)
  webContents.once('render-process-gone', onGone)
  webContents.on('did-start-navigation', onNavigate)
}
