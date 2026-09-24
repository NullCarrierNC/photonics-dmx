import { app, IpcMain } from 'electron'
import { ControllerManager } from '../../controllers/ControllerManager'
import { ipcError } from '../ipcResult'
import { CONFIG } from '../../../shared/ipcChannels'
import type { BlackoutShortcutBinding } from '../../../shared/blackoutShortcut'
import { validatePreferencesSave } from '../inputValidation'
import { createLogger } from '../../../shared/logger'
import { handleInvoke } from '../handleInvoke'
import { applySavedPreferences } from './preferenceLiveApply'
const log = createLogger('preferences-handlers')

/**
 * @param onBlackoutShortcutChanged Rebinds the application's system-wide blackout shortcut after a
 *   save changes its key or scope.
 */
export function registerPreferencesDiagnosticsConfigHandlers(
  ipcMain: IpcMain,
  controllerManager: ControllerManager,
  onBlackoutShortcutChanged: (binding: BlackoutShortcutBinding) => void,
): void {
  handleInvoke(ipcMain, CONFIG.GET_APP_VERSION, log, () => {
    return app.getVersion()
  })

  handleInvoke(ipcMain, CONFIG.GET_VALIDATION_ERRORS, log, () => {
    return controllerManager.flushValidationErrors()
  })

  handleInvoke(ipcMain, CONFIG.GET_CORRUPT_RECOVERY_EVENTS, log, () => {
    return { files: controllerManager.getConfig().drainConfigCorruptRecovery() }
  })

  handleInvoke(ipcMain, CONFIG.GET_PREFS, log, async () => {
    return controllerManager.getConfig().getAllPreferences()
  })

  handleInvoke(ipcMain, CONFIG.SAVE_PREFS, log, async (_, updates: unknown) => {
    try {
      const validation = validatePreferencesSave(updates)
      if (!validation.ok) {
        return { success: false, error: validation.error }
      }
      await controllerManager.getConfig().updatePreferences(validation.value)
      applySavedPreferences(validation.value, { controllerManager, onBlackoutShortcutChanged })

      return { success: true }
    } catch (error) {
      log.error('Error saving preferences:', error)
      return ipcError(error)
    }
  })
}
