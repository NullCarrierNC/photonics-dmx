import { IpcMain } from 'electron'
import { ControllerManager } from '../controllers/ControllerManager'
import {
  YargCueRegistry,
  CueStateUpdate,
} from '../../photonics-dmx/cues/registries/YargCueRegistry'
import { sendToAllWindows } from '../utils/windowUtils'
import { setupSenderHandlers } from './sender-handlers'
import { setupSimulationHandlers } from './simulation-handlers'
import { setupCueGroupHandlers } from './cue-group-handlers'
import { RENDERER_RECEIVE } from '../../shared/ipcChannels'

/**
 * Set up light-related IPC handlers.
 * Composes sender, simulation, and cue-group handlers and registers the cue state update callback.
 */
export function setupLightHandlers(ipcMain: IpcMain, controllerManager: ControllerManager): void {
  const sendCueStateUpdate = (cueState: CueStateUpdate) => {
    const registry = YargCueRegistry.getInstance()
    const group = registry.getGroup(cueState.groupId)
    const groupName = group ? group.name : null
    sendToAllWindows(RENDERER_RECEIVE.CUE_STATE_UPDATE, {
      cueType: cueState.cueType,
      groupId: cueState.groupId,
      groupName,
      isFallback: cueState.isFallback,
      cueStyle: cueState.cueStyle,
      counter: cueState.counter,
      limit: cueState.limit,
    })
  }

  const registry = YargCueRegistry.getInstance()
  registry.setCueStateUpdateCallback(sendCueStateUpdate)

  setupSenderHandlers(ipcMain, controllerManager)
  setupSimulationHandlers(ipcMain, controllerManager)
  setupCueGroupHandlers(ipcMain, controllerManager)
}
