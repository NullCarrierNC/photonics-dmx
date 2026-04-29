import { IpcMain } from 'electron'
import * as os from 'os'
import { ControllerManager } from '../controllers/ControllerManager'
import { sendToAllWindows } from '../utils/windowUtils'
import type { SacnSenderConfig } from '../../photonics-dmx/types'
import { ipcError, ipcSuccess } from './ipcResult'
import { LIGHT, RENDERER_RECEIVE } from '../../shared/ipcChannels'
import {
  isPlainObject,
  validateNumberInRange,
  validateSenderEnablePayload,
  validateSenderId,
} from './inputValidation'
import { createLogger } from '../../shared/logger'

const log = createLogger('Ipc.Sender')

/**
 * Set up sender-related IPC handlers (enable/disable, sACN config, network interfaces).
 */
export function setupSenderHandlers(ipcMain: IpcMain, controllerManager: ControllerManager): void {
  ipcMain.handle(LIGHT.SENDER_ENABLE, async (_, data: unknown) => {
    const payloadValidation = validateSenderEnablePayload(data)
    if (!payloadValidation.ok) {
      sendToAllWindows(RENDERER_RECEIVE.SENDER_ERROR, payloadValidation.error)
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

  ipcMain.handle(LIGHT.SENDER_DISABLE, async (_, data: unknown) => {
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
    try {
      await controllerManager.getSenderManager().disableSender(senderValidation.value)
      return ipcSuccess()
    } catch (error) {
      log.error('Error disabling sender:', error)
      return ipcError(error)
    }
  })

  ipcMain.handle(LIGHT.SENDER_DISABLE_ALL, async () => {
    const senderManager = controllerManager.getSenderManager()
    const disabled = senderManager.getEnabledSenders()
    await senderManager.disableAllSenders()
    return { disabled }
  })

  ipcMain.handle(LIGHT.UPDATE_SACN_CONFIG, async (_, config: unknown) => {
    try {
      if (!isPlainObject(config)) {
        return { success: false, error: 'Invalid sACN config payload' }
      }
      let universe: number | undefined
      if (config.universe !== undefined) {
        const universeValidation = validateNumberInRange(config.universe, 0, 63999, 'SACN universe')
        if (!universeValidation.ok) {
          return { success: false, error: universeValidation.error }
        }
        universe = universeValidation.value
      }
      const maxOutputRate =
        typeof config.maxOutputRate === 'number' && config.maxOutputRate >= 0
          ? Math.min(200, config.maxOutputRate)
          : undefined
      const sacnConfig: SacnSenderConfig = {
        sender: 'sacn',
        universe,
        networkInterface:
          typeof config.networkInterface === 'string' && config.networkInterface.trim() !== ''
            ? config.networkInterface
            : undefined,
        useUnicast: Boolean(config.useUnicast),
        unicastDestination:
          typeof config.unicastDestination === 'string' ? config.unicastDestination : undefined,
        maxOutputRate,
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
      throw error
    }
  })

  ipcMain.handle(LIGHT.GET_NETWORK_INTERFACES, async () => {
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
