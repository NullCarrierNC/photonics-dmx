import { IpcMain } from 'electron'
import { ControllerManager } from '../controllers/ControllerManager'
import '../../photonics-dmx/cues'
import { registerAudioMotionConfigHandlers } from './config/audio-motion-handlers'
import { registerCueSelectionConfigHandlers } from './config/cue-selection-handlers'
import { registerLightsRigsConfigHandlers } from './config/lights-rigs-handlers'
import { registerPreferencesDiagnosticsConfigHandlers } from './config/preferences-handlers'

/**
 * Set up configuration-related IPC handlers
 * @param ipcMain The Electron IPC main instance
 * @param controllerManager The controller manager instance
 */
export function setupConfigHandlers(ipcMain: IpcMain, controllerManager: ControllerManager): void {
  registerLightsRigsConfigHandlers(ipcMain, controllerManager)
  registerPreferencesDiagnosticsConfigHandlers(ipcMain, controllerManager)
  registerCueSelectionConfigHandlers(ipcMain, controllerManager)
  registerAudioMotionConfigHandlers(ipcMain, controllerManager)
}
