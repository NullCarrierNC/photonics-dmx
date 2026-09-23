import { app, IpcMain } from 'electron'
import { ControllerManager } from '../../controllers/ControllerManager'
import { setGlobalBrightnessConfig } from '../../../photonics-dmx/helpers/dmxHelpers'
import { ipcError } from '../ipcResult'
import { CONFIG, RENDERER_RECEIVE } from '../../../shared/ipcChannels'
import { sendToAllWindows } from '../../utils/windowUtils'
import type { BlackoutShortcutBinding } from '../../../shared/blackoutShortcut'
import {
  normalizeBlackoutShortcutKey,
  normalizeBlackoutShortcutScope,
} from '../../../services/configuration/configurationDefaults'
import { validatePreferencesSave } from '../inputValidation'
import { createLogger } from '../../../shared/logger'
import { handleInvoke } from '../handleInvoke'
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

      // The persisted half of the master output controls. The sidebar drives SET_MASTER_OUTPUT for
      // the live change and saves here separately, so these two normally arrive already applied.
      // Mirroring them anyway keeps any other writer of these prefs (an import, a future settings
      // page) from needing a restart to take effect.
      const master = controllerManager.getMasterOutput()
      let masterChanged = false
      if (typeof validation.value.masterDimmerPercent === 'number') {
        master.setDimmerPercent(validation.value.masterDimmerPercent)
        masterChanged = true
      }
      if (typeof validation.value.strobeOutputEnabled === 'boolean') {
        master.setStrobeOutputEnabled(validation.value.strobeOutputEnabled)
        masterChanged = true
      }
      if (masterChanged) {
        controllerManager.getDmxPublisher()?.refreshOutput()
      }

      // Both halves of the blackout shortcut rebind from here: the OS hook in this process, and the
      // renderer listener in every window, including the one that just saved. The pair is read back
      // from the merged preferences rather than taken from the payload, because this payload is a
      // partial: a save carrying only the key would otherwise announce no scope at all.
      if (
        validation.value.blackoutShortcutKey !== undefined ||
        validation.value.blackoutShortcutScope !== undefined
      ) {
        const saved = controllerManager.getConfig().getAllPreferences()
        const binding = {
          key: normalizeBlackoutShortcutKey(saved.blackoutShortcutKey),
          scope: normalizeBlackoutShortcutScope(saved.blackoutShortcutScope),
        }
        onBlackoutShortcutChanged(binding)
        sendToAllWindows(RENDERER_RECEIVE.BLACKOUT_SHORTCUT_CHANGED, binding)
      }

      return { success: true }
    } catch (error) {
      log.error('Error saving preferences:', error)
      return ipcError(error)
    }
  })
}
