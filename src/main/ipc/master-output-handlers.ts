import { IpcMain } from 'electron'
import { ControllerManager } from '../controllers/ControllerManager'
import { LIGHT, RENDERER_RECEIVE } from '../../shared/ipcChannels'
import { handleInvoke } from './handleInvoke'
import { validateMasterOutputPayload } from './inputValidation'
import { sendToAllWindows } from '../utils/windowUtils'
import type { MasterOutputSnapshot } from '../../photonics-dmx/controllers/MasterOutputState'
import { createLogger } from '../../shared/logger'
const log = createLogger('master-output-handlers')

/** The fields a caller may change in one go. Anything absent is left as it is. */
export interface MasterOutputUpdate {
  dimmerPercent?: number
  blackout?: boolean
  strobeOutputEnabled?: boolean
}

/**
 * Applies a master output change and tells the publisher to re-emit, returning the state main
 * holds after it. Shared by the IPC handler and the blackout shortcut, so both reach the rig the
 * same way.
 *
 * A blackout change is broadcast to every window, because the writer is often not the sidebar that
 * shows the state: the shortcut writes from any window, and from the main process while the app is
 * in the background. Dimmer and strobe changes are not broadcast. Those come only from the sidebar's
 * own controls, and the fader writes on every `onChange`, so announcing them would push a message
 * per frame of a drag to every window for nobody's benefit.
 */
export function applyMasterOutput(
  controllerManager: ControllerManager,
  update: MasterOutputUpdate,
): MasterOutputSnapshot {
  const master = controllerManager.getMasterOutput()
  const blackoutChanged =
    update.blackout !== undefined && update.blackout !== master.isBlackoutActive()

  if (update.dimmerPercent !== undefined) {
    master.setDimmerPercent(update.dimmerPercent)
  }
  if (update.blackout !== undefined) {
    master.setBlackout(update.blackout)
  }
  if (update.strobeOutputEnabled !== undefined) {
    master.setStrobeOutputEnabled(update.strobeOutputEnabled)
  }

  controllerManager.getDmxPublisher()?.refreshOutput()

  const snapshot = master.getSnapshot()
  if (blackoutChanged) {
    sendToAllWindows(RENDERER_RECEIVE.MASTER_OUTPUT_CHANGED, snapshot)
  }
  return snapshot
}

/** Latches or releases blackout from whatever main currently holds. Used by the OS-level hook. */
export function toggleMasterBlackout(controllerManager: ControllerManager): MasterOutputSnapshot {
  const blackout = !controllerManager.getMasterOutput().isBlackoutActive()
  return applyMasterOutput(controllerManager, { blackout })
}

/**
 * The global output controls: master dimmer, blackout latch and strobe output gate.
 *
 * These write to {@link ControllerManager.getMasterOutput}, which the publisher reads once per
 * frame, then ask the publisher to re-emit. The re-emit is what makes a blackout immediate: cue
 * output is frame-driven, but a rig sitting idle between songs publishes nothing on its own.
 *
 * Persistence is deliberately not handled here. The dimmer level and the strobe gate ride
 * SAVE_PREFS from the renderer, which saves once a fader drag ends. Blackout is session-only and
 * never persists.
 */
export function setupMasterOutputHandlers(
  ipcMain: IpcMain,
  controllerManager: ControllerManager,
): void {
  handleInvoke(ipcMain, LIGHT.GET_MASTER_OUTPUT, log, () => {
    return controllerManager.getMasterOutput().getSnapshot()
  })

  handleInvoke(ipcMain, LIGHT.SET_MASTER_OUTPUT, log, (_, data: unknown) => {
    const validation = validateMasterOutputPayload(data)
    if (!validation.ok) {
      return { success: false as const, error: validation.error }
    }

    return {
      success: true as const,
      state: applyMasterOutput(controllerManager, validation.value),
    }
  })
}
