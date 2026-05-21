import { app, IpcMain } from 'electron'
import { ControllerManager } from '../../controllers/ControllerManager'
import { setGlobalBrightnessConfig } from '../../../photonics-dmx/helpers/dmxHelpers'
import { ipcError } from '../ipcResult'
import { CONFIG } from '../../../shared/ipcChannels'
import { validatePreferencesPayload } from '../inputValidation'
import { createLogger } from '../../../shared/logger'
const log = createLogger('preferences-handlers')

export function registerPreferencesDiagnosticsConfigHandlers(
  ipcMain: IpcMain,
  controllerManager: ControllerManager,
): void {
  ipcMain.handle(CONFIG.GET_APP_VERSION, () => {
    return app.getVersion()
  })

  ipcMain.handle(CONFIG.GET_VALIDATION_ERRORS, () => {
    return controllerManager.flushValidationErrors()
  })

  ipcMain.handle(CONFIG.GET_CORRUPT_RECOVERY_EVENTS, () => {
    return { files: controllerManager.getConfig().drainConfigCorruptRecovery() }
  })

  ipcMain.handle(CONFIG.GET_PREFS, async () => {
    return controllerManager.getConfig().getAllPreferences()
  })

  ipcMain.handle(CONFIG.SAVE_PREFS, async (_, updates: unknown) => {
    try {
      const validation = validatePreferencesPayload(updates)
      if (!validation.ok) {
        return { success: false, error: validation.error }
      }
      await controllerManager.getConfig().updatePreferences(validation.value)

      if (validation.value.brightness) {
        const brightnessConfig = controllerManager.getConfig().getAllPreferences().brightness
        if (brightnessConfig) {
          setGlobalBrightnessConfig(brightnessConfig)
        }
      }

      // Hot-swap the publisher's output-rate governor — no need to restart controllers
      // (which would tear down senders / interrupt DMX output) just to change a single number.
      if (typeof validation.value.globalDmxPublishingRateHz === 'number') {
        const publisher = controllerManager.getDmxPublisher()
        if (publisher) {
          publisher.setOutputRateHz(validation.value.globalDmxPublishingRateHz)
        }
      }

      return { success: true }
    } catch (error) {
      log.error('Error saving preferences:', error)
      return ipcError(error)
    }
  })
}
