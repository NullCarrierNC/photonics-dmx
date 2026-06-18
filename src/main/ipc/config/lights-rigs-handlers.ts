import { IpcMain, dialog } from 'electron'
import * as fs from 'fs/promises'
import * as path from 'path'
import { ControllerManager } from '../../controllers/ControllerManager'
import { sendToAllWindows } from '../../utils/windowUtils'
import { ipcError, ipcSuccess } from '../ipcResult'
import { CONFIG, RENDERER_RECEIVE, RIGS } from '../../../shared/ipcChannels'
import {
  validateLightingConfiguration,
  validateDmxFixturesArray,
  validateDmxRigPayload,
} from '../inputValidation'
import {
  buildRigExportFile,
  validateRigExportFile,
} from '../../../photonics-dmx/helpers/rigImportExport'
import { createLogger } from '../../../shared/logger'

const log = createLogger('Ipc.LightsRigs')

/** Strip path separators and characters illegal in filenames so a rig name is a safe default path. */
function sanitizeRigFilename(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[/\\:*?"<>|]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned.length > 0 ? cleaned : 'rig'
}

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

  // Export a rig to a portable file (rig + the MyLights templates its lights reference). Built from
  // the canonical saved rig (getDmxRig applies migration + template sync) so the snapshot is
  // self-consistent; the editor's unsaved edits are not included.
  ipcMain.handle(RIGS.EXPORT, async (_, rigId: unknown) => {
    try {
      if (typeof rigId !== 'string' || rigId.trim().length === 0) {
        return { success: false, error: 'A rig id is required to export.' }
      }
      const config = controllerManager.getConfig()
      const rig = config.getDmxRig(rigId)
      if (!rig) {
        return { success: false, error: 'Rig not found.' }
      }
      const payload = buildRigExportFile(rig, config.getUserLights())

      const result = await dialog.showSaveDialog({
        title: 'Export Layout',
        defaultPath: `${sanitizeRigFilename(rig.name)}.json`,
        filters: [{ name: 'Photonics Rig Files', extensions: ['json'] }],
      })
      if (result.canceled || !result.filePath) {
        return { success: false, error: 'User cancelled export.' }
      }

      await fs.writeFile(result.filePath, JSON.stringify(payload, null, 2), 'utf-8')
      return { success: true, path: result.filePath }
    } catch (error) {
      log.error('Error exporting rig:', error)
      return ipcError(error)
    }
  })

  // Pick + parse + validate a rig export file. Does NOT commit — the renderer resolves template
  // de-duplication and the new rig name in a modal, then persists via SAVE_MY_LIGHTS / SAVE_DMX_RIG.
  ipcMain.handle(RIGS.IMPORT_PICK, async () => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'Photonics Rig Files', extensions: ['json'] }],
      })
      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, error: 'User cancelled import.' }
      }

      const sourcePath = result.filePaths[0]
      const raw = await fs.readFile(sourcePath, 'utf-8')
      let parsed: unknown
      try {
        parsed = JSON.parse(raw)
      } catch {
        return { success: false, error: 'That file is not valid JSON.' }
      }

      const envelope = validateRigExportFile(parsed)
      if (!envelope.ok) {
        return { success: false, error: envelope.error }
      }
      const rigValidation = validateDmxRigPayload(envelope.value.rig)
      if (!rigValidation.ok) {
        return { success: false, error: `Rig: ${rigValidation.error}` }
      }
      const templatesValidation = validateDmxFixturesArray(envelope.value.templates, 'templates')
      if (!templatesValidation.ok) {
        return { success: false, error: `Templates: ${templatesValidation.error}` }
      }

      return {
        success: true,
        sourceBasename: path.basename(sourcePath),
        rig: rigValidation.value,
        templates: templatesValidation.value,
      }
    } catch (error) {
      log.error('Error importing rig:', error)
      return ipcError(error)
    }
  })
}
