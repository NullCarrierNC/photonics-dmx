import { handleInvoke } from '../handleInvoke'
import { IpcMain, dialog } from 'electron'
import * as fs from 'fs/promises'
import * as path from 'path'
import { ControllerManager } from '../../controllers/ControllerManager'
import { ipcSuccess, restartAfterSave } from '../ipcResult'
import { CONFIG, RIGS } from '../../../shared/ipcChannels'
import {
  validateLightingConfiguration,
  validateDmxFixturesArray,
  validateDmxRigPayload,
  validateRigId,
} from '../inputValidation'
import {
  buildRigExportFile,
  migrateRigExportFixtures,
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
  handleInvoke(ipcMain, CONFIG.GET_LIGHT_LIBRARY, log, async () => {
    return controllerManager.getConfig().getLightLibrary()
  })

  handleInvoke(ipcMain, CONFIG.GET_MY_LIGHTS, log, async () => {
    return controllerManager.getConfig().getUserLights()
  })

  handleInvoke(ipcMain, CONFIG.SAVE_MY_LIGHTS, log, async (_, data: unknown) => {
    const v = validateDmxFixturesArray(data, 'myLights')
    if (!v.ok) {
      return { success: false, error: v.error }
    }
    const config = controllerManager.getConfig()
    await config.updateUserLights(v.value)
    // Template edits in MyLights cascade to rig snapshots so changes like adding a Strobe Channel
    // reach the rig — and therefore the runtime publisher — without the user having to re-pick
    // the fixture in LightsLayout. Restart controllers when at least one rig actually changed.
    const rigsChanged = await config.syncRigsWithUserLights()
    if (rigsChanged) {
      return restartAfterSave(() => controllerManager.restartControllers())
    }
    return ipcSuccess()
  })

  handleInvoke(ipcMain, CONFIG.GET_LIGHT_LAYOUT, log, async () => {
    try {
      return controllerManager.getConfig().getLightingLayout()
    } catch (error) {
      log.error('Error fetching light layout:', error)
      throw error
    }
  })

  handleInvoke(ipcMain, CONFIG.SAVE_LIGHT_LAYOUT, log, async (_, data: unknown) => {
    const validation = validateLightingConfiguration(data)
    if (!validation.ok) {
      return { success: false, error: validation.error }
    }
    // The standalone layout only seeds the first rig at startup. No running controller reads it.
    await controllerManager.getConfig().updateLightingLayout(validation.value)
    return { success: true }
  })

  handleInvoke(ipcMain, CONFIG.GET_DMX_RIGS, log, async () => {
    try {
      return controllerManager.getConfig().getDmxRigs()
    } catch (error) {
      log.error('Error fetching DMX rigs:', error)
      throw error
    }
  })

  handleInvoke(ipcMain, CONFIG.GET_DMX_RIG, log, async (_, data: unknown) => {
    const validation = validateRigId(data)
    if (!validation.ok) {
      return { success: false, error: validation.error }
    }
    const id = validation.value
    try {
      return controllerManager.getConfig().getDmxRig(id)
    } catch (error) {
      log.error(`Error fetching DMX rig ${id}:`, error)
      throw error
    }
  })

  handleInvoke(ipcMain, CONFIG.GET_ACTIVE_RIGS, log, async () => {
    try {
      return controllerManager.getConfig().getActiveRigs()
    } catch (error) {
      log.error('Error fetching active DMX rigs:', error)
      throw error
    }
  })

  handleInvoke(ipcMain, CONFIG.SAVE_DMX_RIG, log, async (_, payload: unknown) => {
    const validation = validateDmxRigPayload(payload)
    if (!validation.ok) {
      return { success: false, error: validation.error }
    }
    const rig = validation.value
    const config = controllerManager.getConfig()
    const existingRig = config.getDmxRig(rig.id)
    const previousActiveState = existingRig?.active ?? false

    // With multiple active rigs disallowed, activating one deactivates the rest. New Rig, import,
    // duplicate and the settings screen all save through this handler, so the invariant holds
    // whichever path created the rig.
    await config.saveDmxRig(rig, {
      deactivateOthers: config.getPreference('allowMultipleActiveRigs') !== true,
    })

    const isNowOrWasActive = rig.active || previousActiveState
    if (isNowOrWasActive) {
      return restartAfterSave(() => controllerManager.restartControllers())
    }
    return { success: true }
  })

  handleInvoke(ipcMain, CONFIG.DELETE_DMX_RIG, log, async (_, data: unknown) => {
    const validation = validateRigId(data)
    if (!validation.ok) {
      return { success: false, error: validation.error }
    }
    const id = validation.value
    const config = controllerManager.getConfig()
    const rig = config.getDmxRig(id)
    const wasActive = rig?.active ?? false

    await config.deleteDmxRig(id)

    if (wasActive) {
      return restartAfterSave(() => controllerManager.restartControllers())
    }
    return { success: true }
  })

  // Export a rig to a portable file (rig + the MyLights templates its lights reference). Built from
  // the canonical saved rig (getDmxRig applies migration + template sync) so the snapshot is
  // self-consistent; the editor's unsaved edits are not included.
  handleInvoke(ipcMain, RIGS.EXPORT, log, async (_, rigId: unknown) => {
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
      return { success: false, error: 'User cancelled export.', cancelled: true }
    }

    await fs.writeFile(result.filePath, JSON.stringify(payload, null, 2), 'utf-8')
    return { success: true, path: result.filePath }
  })

  // Pick + parse + validate a rig export file. Does NOT commit — the renderer resolves template
  // de-duplication and the new rig name in a modal, then persists via SAVE_MY_LIGHTS / SAVE_DMX_RIG.
  handleInvoke(ipcMain, RIGS.IMPORT_PICK, log, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Photonics Rig Files', extensions: ['json'] }],
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, error: 'User cancelled import.', cancelled: true }
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
    // A rig file exported by an older build can name fixture types this build has since collapsed
    // (`rgbw`, `rgb/s`). Migrate before validation, which checks against the current type list.
    const migrated = migrateRigExportFixtures(envelope.value)
    const rigValidation = validateDmxRigPayload(migrated.rig)
    if (!rigValidation.ok) {
      return { success: false, error: `Rig: ${rigValidation.error}` }
    }
    const templatesValidation = validateDmxFixturesArray(migrated.templates, 'templates')
    if (!templatesValidation.ok) {
      return { success: false, error: `Templates: ${templatesValidation.error}` }
    }

    return {
      success: true,
      sourceBasename: path.basename(sourcePath),
      rig: rigValidation.value,
      templates: templatesValidation.value,
    }
  })
}
