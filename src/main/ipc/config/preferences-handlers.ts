import { app, IpcMain } from 'electron'
import { ControllerManager } from '../../controllers/ControllerManager'
import { setGlobalBrightnessConfig } from '../../../photonics-dmx/helpers/dmxHelpers'
import { ipcError } from '../ipcResult'
import { CONFIG } from '../../../shared/ipcChannels'
import { validatePreferencesPayload } from '../inputValidation'
import { createLogger } from '../../../shared/logger'
import { handleInvoke } from '../handleInvoke'
const log = createLogger('preferences-handlers')

export function registerPreferencesDiagnosticsConfigHandlers(
  ipcMain: IpcMain,
  controllerManager: ControllerManager,
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

      // Same hot-swap treatment as the rate above.
      if (typeof validation.value.whiteChannelMixMode === 'string') {
        const publisher = controllerManager.getDmxPublisher()
        if (publisher) {
          publisher.setWhiteChannelMixMode(validation.value.whiteChannelMixMode)
        }
      }

      if (typeof validation.value.venuePostProcessingEnabled === 'boolean') {
        controllerManager
          .getVenueFrameProcessor()
          .setVenuePostProcessingEnabled(validation.value.venuePostProcessingEnabled)
      }

      return { success: true }
    } catch (error) {
      log.error('Error saving preferences:', error)
      return ipcError(error)
    }
  })
}
