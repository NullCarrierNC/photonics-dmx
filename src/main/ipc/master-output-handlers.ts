import { IpcMain } from 'electron'
import { ControllerManager } from '../controllers/ControllerManager'
import { LIGHT } from '../../shared/ipcChannels'
import { ipcError } from './ipcResult'
import { validateMasterOutputPayload } from './inputValidation'
import { createLogger } from '../../shared/logger'
const log = createLogger('master-output-handlers')

/**
 * The global output controls: master dimmer, blackout latch and strobe output gate.
 *
 * These write to {@link ControllerManager.getMasterOutput}, which the publisher reads once per
 * frame, then ask the publisher to re-emit. The re-emit is what makes a blackout immediate: cue
 * output is frame-driven, but a rig sitting idle between songs publishes nothing on its own.
 *
 * Persistence is deliberately not handled here. The dimmer level and the strobe gate ride
 * SAVE_PREFS from the renderer so a fader drag does not write prefs.json once per pixel; blackout
 * is session-only and never persists.
 */
export function setupMasterOutputHandlers(
  ipcMain: IpcMain,
  controllerManager: ControllerManager,
): void {
  ipcMain.handle(LIGHT.GET_MASTER_OUTPUT, () => {
    return controllerManager.getMasterOutput().getSnapshot()
  })

  ipcMain.handle(LIGHT.SET_MASTER_OUTPUT, (_, data: unknown) => {
    try {
      const validation = validateMasterOutputPayload(data)
      if (!validation.ok) {
        return { success: false as const, error: validation.error }
      }

      const master = controllerManager.getMasterOutput()
      if (validation.value.dimmerPercent !== undefined) {
        master.setDimmerPercent(validation.value.dimmerPercent)
      }
      if (validation.value.blackout !== undefined) {
        master.setBlackout(validation.value.blackout)
      }
      if (validation.value.strobeOutputEnabled !== undefined) {
        master.setStrobeOutputEnabled(validation.value.strobeOutputEnabled)
      }

      controllerManager.getDmxPublisher()?.refreshOutput()

      return { success: true as const, state: master.getSnapshot() }
    } catch (error) {
      log.error('Error updating master output:', error)
      return ipcError(error)
    }
  })
}
