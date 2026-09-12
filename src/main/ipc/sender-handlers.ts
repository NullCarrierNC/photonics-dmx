import { IpcMain } from 'electron'
import * as os from 'os'
import { ControllerManager } from '../controllers/ControllerManager'
import { sendToAllWindows } from '../utils/windowUtils'
import { ipcError, ipcSuccess } from './ipcResult'
import { LIGHT, RENDERER_RECEIVE } from '../../shared/ipcChannels'
import { isPlainObject, validateSenderEnablePayload, validateSenderId } from './inputValidation'
import { createLogger } from '../../shared/logger'
import { handleInvoke } from './handleInvoke'

const log = createLogger('Ipc.Sender')

/**
 * A sender id recoverable from a payload the validator rejected, so the renderer can be told which
 * toggle to put back. Absent when the payload does not name a known sender.
 */
function senderIdFrom(data: unknown): string | null {
  if (data === null || typeof data !== 'object' || !('sender' in data)) {
    return null
  }
  const validated = validateSenderId((data as { sender: unknown }).sender)
  return validated.ok ? validated.value : null
}

/**
 * Set up sender-related IPC handlers (enable/disable, sACN config, network interfaces).
 */
export function setupSenderHandlers(ipcMain: IpcMain, controllerManager: ControllerManager): void {
  handleInvoke(ipcMain, LIGHT.SENDER_ENABLE, log, async (_, data: unknown) => {
    const payloadValidation = validateSenderEnablePayload(data)
    if (!payloadValidation.ok) {
      sendToAllWindows(RENDERER_RECEIVE.SENDER_ERROR, payloadValidation.error)
      const rejected = senderIdFrom(data)
      if (rejected) {
        sendToAllWindows(RENDERER_RECEIVE.SENDER_START_FAILED, {
          sender: rejected,
          error: payloadValidation.error,
        })
      }
      return { success: false as const, error: payloadValidation.error }
    }
    const config = payloadValidation.value
    const sender = config.sender
    const senderManager = controllerManager.getSenderManager()

    if (senderManager.isSenderEnabled(sender)) {
      return ipcSuccess()
    }

    try {
      await senderManager.enableSender(sender, sender, config)
      return ipcSuccess()
    } catch (error) {
      const err = ipcError(error)
      sendToAllWindows(RENDERER_RECEIVE.SENDER_START_FAILED, {
        sender,
        error: err.error,
      })
      return err
    }
  })

  handleInvoke(ipcMain, LIGHT.SENDER_DISABLE, log, async (_, data: unknown) => {
    if (data === null || typeof data !== 'object' || !('sender' in data)) {
      const msg = 'Invalid sender disable payload'
      sendToAllWindows(RENDERER_RECEIVE.SENDER_ERROR, msg)
      return { success: false as const, error: msg }
    }
    const senderValidation = validateSenderId((data as { sender: unknown }).sender)
    if (!senderValidation.ok) {
      sendToAllWindows(RENDERER_RECEIVE.SENDER_ERROR, senderValidation.error)
      return { success: false, error: senderValidation.error }
    }
    await controllerManager.getSenderManager().disableSender(senderValidation.value)
    return ipcSuccess()
  })

  handleInvoke(ipcMain, LIGHT.UPDATE_SACN_CONFIG, log, async (_, config: unknown) => {
    try {
      if (!isPlainObject(config)) {
        return { success: false, error: 'Invalid sACN config payload' }
      }
      const payloadValidation = validateSenderEnablePayload({ sender: 'sacn', ...config })
      if (!payloadValidation.ok) {
        return { success: false as const, error: payloadValidation.error }
      }
      const sacnConfig = payloadValidation.value
      if (sacnConfig.sender !== 'sacn') {
        return { success: false as const, error: 'Internal validation mismatch' }
      }
      const senderManager = controllerManager.getSenderManager()
      if (senderManager.getEnabledSenders().includes('sacn')) {
        await senderManager.restartSender('sacn', sacnConfig)
        log.info('sACN configuration updated and sender restarted')
      } else {
        log.info('sACN not currently enabled, configuration saved for next enable')
      }
      return { success: true }
    } catch (error) {
      log.error('Error updating sACN configuration:', error)
      // A restart disables the running sender before it builds the new one, so a configuration the
      // driver refuses leaves sACN off. The renderer needs that to reach its toggle.
      const failed = ipcError(error)
      sendToAllWindows(RENDERER_RECEIVE.SENDER_START_FAILED, {
        sender: 'sacn',
        error: failed.error,
      })
      return failed
    }
  })

  handleInvoke(ipcMain, LIGHT.UPDATE_ARTNET_CONFIG, log, async (_, config: unknown) => {
    try {
      if (!isPlainObject(config)) {
        return { success: false, error: 'Invalid Art-Net config payload' }
      }
      const payloadValidation = validateSenderEnablePayload({ sender: 'artnet', ...config })
      if (!payloadValidation.ok) {
        return { success: false as const, error: payloadValidation.error }
      }
      const artnetConfig = payloadValidation.value
      if (artnetConfig.sender !== 'artnet') {
        return { success: false as const, error: 'Internal validation mismatch' }
      }
      const senderManager = controllerManager.getSenderManager()
      if (senderManager.getEnabledSenders().includes('artnet')) {
        await senderManager.restartSender('artnet', artnetConfig)
        log.info('Art-Net configuration updated and sender restarted')
      } else {
        log.info('Art-Net not currently enabled, configuration saved for next enable')
      }
      return { success: true }
    } catch (error) {
      log.error('Error updating Art-Net configuration:', error)
      const failed = ipcError(error)
      sendToAllWindows(RENDERER_RECEIVE.SENDER_START_FAILED, {
        sender: 'artnet',
        error: failed.error,
      })
      return failed
    }
  })

  handleInvoke(ipcMain, LIGHT.GET_NETWORK_INTERFACES, log, async () => {
    try {
      const networkInterfaces = os.networkInterfaces()
      const interfaces: Array<{ name: string; value: string; family: string }> = []

      for (const [name, ifaceArray] of Object.entries(networkInterfaces)) {
        const interfaceList = Array.isArray(ifaceArray) ? ifaceArray : []
        for (const iface of interfaceList) {
          if (!iface.internal && !iface.address.startsWith('127.')) {
            interfaces.push({
              name: `${name}: ${iface.address}`,
              value: iface.address,
              family: iface.family,
            })
          }
        }
      }

      return {
        success: true,
        interfaces,
      }
    } catch (error) {
      log.error('Error getting network interfaces:', error)
      return {
        ...ipcError(error),
        interfaces: [],
      }
    }
  })
}
