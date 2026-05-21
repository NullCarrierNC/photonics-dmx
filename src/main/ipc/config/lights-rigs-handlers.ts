import { IpcMain } from 'electron'
import { ControllerManager } from '../../controllers/ControllerManager'
import { sendToAllWindows } from '../../utils/windowUtils'
import { ipcError, ipcSuccess } from '../ipcResult'
import { CONFIG, RENDERER_RECEIVE } from '../../../shared/ipcChannels'
import {
  validateLightingConfiguration,
  validateDmxFixturesArray,
  validateDmxRigPayload,
} from '../inputValidation'
import { createLogger } from '../../../shared/logger'

const log = createLogger('Ipc.LightsRigs')

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

  ipcMain.handle(CONFIG.SAVE_MY_LIGHTS, async (_, data: unknown) => {
    const v = validateDmxFixturesArray(data, 'myLights')
    if (!v.ok) {
      return { success: false, error: v.error }
    }
    try {
      const config = controllerManager.getConfig()
      await config.updateUserLights(v.value)
      // Template edits in MyLights cascade to rig snapshots so changes like adding a Strobe Channel
      // reach the rig — and therefore the runtime publisher — without the user having to re-pick
      // the fixture in LightsLayout. Restart controllers when at least one rig actually changed.
      const rigsChanged = await config.syncRigsWithUserLights()
      if (rigsChanged) {
        await controllerManager.restartControllers()
        sendToAllWindows(RENDERER_RECEIVE.CONTROLLERS_RESTARTED, undefined)
      }
      return ipcSuccess()
    } catch (err) {
      log.error('SAVE_MY_LIGHTS failed:', err)
      return ipcError(err)
    }
  })

  ipcMain.handle(CONFIG.GET_LIGHT_LAYOUT, async (_, filename: string) => {
    try {
      return controllerManager.getConfig().getLightingLayout()
    } catch (error) {
      log.error(`Error fetching light layout for ${filename}:`, error)
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
      log.error('Error saving light layout:', error)
      return ipcError(error)
    }
  })

  ipcMain.handle(CONFIG.GET_DMX_RIGS, async () => {
    try {
      return controllerManager.getConfig().getDmxRigs()
    } catch (error) {
      log.error('Error fetching DMX rigs:', error)
      throw error
    }
  })

  ipcMain.handle(CONFIG.GET_DMX_RIG, async (_, id: string) => {
    try {
      return controllerManager.getConfig().getDmxRig(id)
    } catch (error) {
      log.error(`Error fetching DMX rig ${id}:`, error)
      throw error
    }
  })

  ipcMain.handle(CONFIG.GET_ACTIVE_RIGS, async () => {
    try {
      return controllerManager.getConfig().getActiveRigs()
    } catch (error) {
      log.error('Error fetching active DMX rigs:', error)
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
      log.error('Error saving DMX rig:', error)
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
      log.error(`Error deleting DMX rig ${id}:`, error)
      return ipcError(error)
    }
  })
}
