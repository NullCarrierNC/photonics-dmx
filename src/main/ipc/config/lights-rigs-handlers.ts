import { IpcMain } from 'electron'
import { ControllerManager } from '../../controllers/ControllerManager'
import { sendToAllWindows } from '../../utils/windowUtils'
import { ipcError } from '../ipcResult'
import { CONFIG, RENDERER_RECEIVE } from '../../../shared/ipcChannels'
import {
  validateLightingConfiguration,
  validateDmxFixturesArray,
  validateDmxRigPayload,
} from '../inputValidation'

export function registerLightsRigsConfigHandlers(
  ipcMain: IpcMain,
  controllerManager: ControllerManager,
): void {
  ipcMain.handle(CONFIG.GET_LIGHT_LIBRARY, async () => {
    return controllerManager.getConfig().getLightLibrary()
  })

  ipcMain.handle(CONFIG.GET_MY_LIGHTS, async () => {
    return controllerManager.getConfig().getUserLights()
  })

  ipcMain.on(CONFIG.SAVE_MY_LIGHTS, (_, data: unknown) => {
    const v = validateDmxFixturesArray(data, 'myLights')
    if (!v.ok) {
      console.error('SAVE_MY_LIGHTS: invalid payload:', v.error)
      return
    }
    controllerManager
      .getConfig()
      .updateUserLights(v.value)
      .catch((err) => {
        console.error('SAVE_MY_LIGHTS failed:', err)
      })
  })

  ipcMain.handle(CONFIG.GET_LIGHT_LAYOUT, async (_, filename: string) => {
    try {
      return controllerManager.getConfig().getLightingLayout()
    } catch (error) {
      console.error(`Error fetching light layout for ${filename}:`, error)
      throw error
    }
  })

  ipcMain.handle(CONFIG.SAVE_LIGHT_LAYOUT, async (_, data: unknown) => {
    try {
      const validation = validateLightingConfiguration(data)
      if (!validation.ok) {
        return { success: false, error: validation.error }
      }
      await controllerManager.getConfig().updateLightingLayout(validation.value)

      await controllerManager.restartControllers()

      sendToAllWindows(RENDERER_RECEIVE.CONTROLLERS_RESTARTED, undefined)

      return { success: true }
    } catch (error) {
      console.error('Error saving light layout:', error)
      return ipcError(error)
    }
  })

  ipcMain.handle(CONFIG.GET_DMX_RIGS, async () => {
    try {
      return controllerManager.getConfig().getDmxRigs()
    } catch (error) {
      console.error('Error fetching DMX rigs:', error)
      throw error
    }
  })

  ipcMain.handle(CONFIG.GET_DMX_RIG, async (_, id: string) => {
    try {
      return controllerManager.getConfig().getDmxRig(id)
    } catch (error) {
      console.error(`Error fetching DMX rig ${id}:`, error)
      throw error
    }
  })

  ipcMain.handle(CONFIG.GET_ACTIVE_RIGS, async () => {
    try {
      return controllerManager.getConfig().getActiveRigs()
    } catch (error) {
      console.error('Error fetching active DMX rigs:', error)
      throw error
    }
  })

  ipcMain.handle(CONFIG.SAVE_DMX_RIG, async (_, payload: unknown) => {
    try {
      const validation = validateDmxRigPayload(payload)
      if (!validation.ok) {
        return { success: false, error: validation.error }
      }
      const rig = validation.value
      const config = controllerManager.getConfig()
      const existingRig = config.getDmxRig(rig.id)
      const previousActiveState = existingRig?.active ?? false

      await config.saveDmxRig(rig)

      const isNowOrWasActive = rig.active || previousActiveState
      if (isNowOrWasActive) {
        await controllerManager.restartControllers()
        sendToAllWindows(RENDERER_RECEIVE.CONTROLLERS_RESTARTED, undefined)
      }

      return { success: true }
    } catch (error) {
      console.error('Error saving DMX rig:', error)
      return ipcError(error)
    }
  })

  ipcMain.handle(CONFIG.DELETE_DMX_RIG, async (_, id: string) => {
    try {
      const config = controllerManager.getConfig()
      const rig = config.getDmxRig(id)
      const wasActive = rig?.active ?? false

      await config.deleteDmxRig(id)

      if (wasActive) {
        await controllerManager.restartControllers()
        sendToAllWindows(RENDERER_RECEIVE.CONTROLLERS_RESTARTED, undefined)
      }

      return { success: true }
    } catch (error) {
      console.error(`Error deleting DMX rig ${id}:`, error)
      return ipcError(error)
    }
  })
}
