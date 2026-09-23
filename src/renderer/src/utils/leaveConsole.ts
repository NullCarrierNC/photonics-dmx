import { disableConsole } from '../ipcApi'
import { createLogger } from '../../../shared/logger'
const log = createLogger('leaveConsole')

/**
 * Hands DMX output back from console mode. The cleanups that call this cannot wait on it, so it
 * logs a refusal or a rejection itself.
 */
export function leaveConsole(): void {
  disableConsole()
    .then((result) => {
      if (!result.success) {
        log.error('Main refused to leave DMX console mode:', result.error)
      }
    })
    .catch((error) => log.error('Failed to leave DMX console mode:', error))
}
