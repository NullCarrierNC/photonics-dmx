import { IpcMain, BrowserWindow } from 'electron'
import { ControllerManager } from '../controllers/ControllerManager'
import type { SacnSenderConfig } from '../../photonics-dmx/types'
import { ipcError } from './ipcResult'
import { LIGHT, RENDERER_RECEIVE } from '../../shared/ipcChannels'
import {
  isPlainObject,
  validateNumberInRange,
  validateSenderEnablePayload,
  validateSenderId,
} from './inputValidation'

/**
 * Set up sender-related IPC handlers (enable/disable, sACN config, network interfaces).
 */
export function setupSenderHandlers(ipcMain: IpcMain, controllerManager: ControllerManager): void {
  ipcMain.on(LIGHT.SENDER_ENABLE, async (_, data: unknown) => {
    try {
      const payloadValidation = validateSenderEnablePayload(data)
      if (!payloadValidation.ok) {
        console.error(payloadValidation.error)
        return
      }
      const config = payloadValidation.value
      const sender = config.sender
      const senderManager = controllerManager.getSenderManager()

      if (senderManager.isSenderEnabled(sender)) {
        console.log(`Sender "${sender}" is already enabled`)
        return
      }

      console.log(`Enabling ${sender} sender with config:`, config)
      try {
        await senderManager.enableSender(sender, sender, config)
        console.log(`Successfully enabled ${sender} sender`)
      } catch (error) {
        console.error(`Failed to enable ${sender} sender:`, error)
        const mainWindow = BrowserWindow.getFocusedWindow()
        if (mainWindow) {
          mainWindow.webContents.send(RENDERER_RECEIVE.SENDER_START_FAILED, {
            sender: sender,
            error: ipcError(error).error,
          })
        }
        throw error
      }
    } catch (error) {
      console.error('Error enabling sender:', error)
    }
  })

  ipcMain.on(LIGHT.SENDER_DISABLE, (_, data: { sender: unknown }) => {
    try {
      const senderValidation = validateSenderId(data?.sender)
      if (!senderValidation.ok) {
        console.error(senderValidation.error)
        return
      }
      controllerManager.getSenderManager().disableSender(senderValidation.value)
    } catch (error) {
      console.error('Error disabling sender:', error)
    }
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
      }
      const senderManager = controllerManager.getSenderManager()
      if (senderManager.getEnabledSenders().includes('sacn')) {
        await senderManager.restartSender('sacn', sacnConfig)
        console.log('sACN configuration updated and sender restarted')
      } else {
        console.log('sACN not currently enabled, configuration saved for next enable')
      }
      return { success: true }
    } catch (error) {
      console.error('Error updating sACN configuration:', error)
      throw error
    }
  })

  ipcMain.handle(LIGHT.GET_NETWORK_INTERFACES, async () => {
    try {
      const os = require('os')
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
      console.error('Error getting network interfaces:', error)
      return {
        ...ipcError(error),
        interfaces: [],
      }
    }
  })
}
