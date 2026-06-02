import { SenderError } from '../../photonics-dmx/senders/BaseSender'
import type { SenderManager } from '../../photonics-dmx/controllers/SenderManager'
import { RENDERER_RECEIVE } from '../../shared/ipcChannels'
import { createLogger } from '../../shared/logger'

const log = createLogger('SenderErrorHandler')

/**
 * Creates a handler for sender errors that notifies the renderer and optionally auto-disables the sender.
 * Extracted from ControllerManager to keep sender error logic in one place.
 */
export function createSenderErrorHandler(
  getSenderManager: () => SenderManager,
  sendToAllWindows: (channel: string, payload: unknown) => void,
): (error: SenderError) => void {
  return (error: SenderError): void => {
    log.error('Sender error:', error)

    const senderId = error.senderId ?? null
    const shouldDisable = error.shouldDisable

    if (shouldDisable && senderId) {
      log.info(`Automatically disabling ${senderId} sender due to a sender error`)
      try {
        const senderManager = getSenderManager()
        if (senderManager.isSenderEnabled(senderId)) {
          senderManager.disableSender(senderId).catch((disableErr: unknown) => {
            log.error(`Failed to disable ${senderId} sender:`, disableErr)
          })
        }
        sendToAllWindows(RENDERER_RECEIVE.SENDER_NETWORK_ERROR, {
          sender: senderId,
          error: error.message,
          autoDisabled: true,
        })
        return
      } catch (err) {
        log.error('Error disabling sender:', err)
      }
    }

    sendToAllWindows(RENDERER_RECEIVE.SENDER_ERROR, error.message)
  }
}
