import { IpcMain } from 'electron'
import { ControllerManager } from '../controllers/ControllerManager'
import { YargCueRegistry } from '../../photonics-dmx/cues/registries/YargCueRegistry'
import { ipcError } from './ipcResult'
import { LIGHT } from '../../shared/ipcChannels'
import { validateNumberInRange } from './inputValidation'

/**
 * IPC handlers for cue selection preferences (consistency window, motion min-hold, group selection mode).
 * Persists via ConfigurationManager and propagates to YargCueRegistry where applicable.
 */
export function setupCueSelectionPrefsHandlers(
  ipcMain: IpcMain,
  controllerManager: ControllerManager,
): void {
  ipcMain.handle(LIGHT.SET_CUE_CONSISTENCY_WINDOW, async (_, windowMs: number) => {
    try {
      const validated = validateNumberInRange(windowMs, 0, 600000, 'cueConsistencyWindow')
      if (!validated.ok) {
        return ipcError(new Error(validated.error))
      }
      const rounded = Math.round(validated.value)
      await controllerManager.getConfig().setCueConsistencyWindow(rounded)
      const registry = YargCueRegistry.getInstance()
      registry.setCueConsistencyWindow(rounded)
      return { success: true, windowMs: rounded }
    } catch (error) {
      console.error('Error setting cue consistency window:', error)
      return ipcError(error)
    }
  })

  ipcMain.handle(LIGHT.GET_CUE_CONSISTENCY_WINDOW, async () => {
    try {
      const windowMs = controllerManager.getConfig().getCueConsistencyWindow()
      return { success: true, windowMs }
    } catch (error) {
      console.error('Error getting cue consistency window:', error)
      return ipcError(error)
    }
  })

  ipcMain.handle(LIGHT.GET_MOTION_CUE_MIN_HOLD_MS, async () => {
    try {
      const minHoldMs = controllerManager.getConfig().getMotionCueMinimumHoldMs()
      return { success: true, minHoldMs }
    } catch (error) {
      console.error('Error getting motion cue min hold:', error)
      return ipcError(error)
    }
  })

  ipcMain.handle(LIGHT.SET_MOTION_CUE_MIN_HOLD_MS, async (_, ms: number) => {
    try {
      const validated = validateNumberInRange(ms, 0, 600000, 'motionCueMinimumHoldMs')
      if (!validated.ok) {
        return ipcError(new Error(validated.error))
      }
      await controllerManager.getConfig().setMotionCueMinimumHoldMs(validated.value)
      const minHoldMs = controllerManager.getConfig().getMotionCueMinimumHoldMs()
      return { success: true, minHoldMs }
    } catch (error) {
      console.error('Error setting motion cue min hold:', error)
      return ipcError(error)
    }
  })

  ipcMain.handle(LIGHT.GET_MOTION_CUE_PROBABILITY_PERCENT, async () => {
    try {
      const percent = controllerManager.getConfig().getMotionCueProbabilityPercent()
      return { success: true, percent }
    } catch (error) {
      console.error('Error getting motion cue probability percent:', error)
      return ipcError(error)
    }
  })

  ipcMain.handle(LIGHT.SET_MOTION_CUE_PROBABILITY_PERCENT, async (_, percent: number) => {
    try {
      const validated = validateNumberInRange(percent, 0, 100, 'motionCueProbabilityPercent')
      if (!validated.ok) {
        return ipcError(new Error(validated.error))
      }
      await controllerManager.getConfig().setMotionCueProbabilityPercent(validated.value)
      const stored = controllerManager.getConfig().getMotionCueProbabilityPercent()
      return { success: true, percent: stored }
    } catch (error) {
      console.error('Error setting motion cue probability percent:', error)
      return ipcError(error)
    }
  })

  ipcMain.handle(LIGHT.GET_AUDIO_MOTION_CUE_PROBABILITY_PERCENT, async () => {
    try {
      const percent = controllerManager.getConfig().getAudioMotionCueProbabilityPercent()
      return { success: true, percent }
    } catch (error) {
      console.error('Error getting audio motion cue probability percent:', error)
      return ipcError(error)
    }
  })

  ipcMain.handle(LIGHT.SET_AUDIO_MOTION_CUE_PROBABILITY_PERCENT, async (_, percent: number) => {
    try {
      const validated = validateNumberInRange(percent, 0, 100, 'audioMotionCueProbabilityPercent')
      if (!validated.ok) {
        return ipcError(new Error(validated.error))
      }
      await controllerManager.getConfig().setAudioMotionCueProbabilityPercent(validated.value)
      const stored = controllerManager.getConfig().getAudioMotionCueProbabilityPercent()
      return { success: true, percent: stored }
    } catch (error) {
      console.error('Error setting audio motion cue probability percent:', error)
      return ipcError(error)
    }
  })

  ipcMain.handle(
    LIGHT.SET_CUE_GROUP_SELECTION_MODE,
    async (_, mode: 'oncePerSong' | 'withinSong') => {
      try {
        if (mode !== 'oncePerSong' && mode !== 'withinSong') {
          return ipcError(new Error('Invalid mode: must be "oncePerSong" or "withinSong"'))
        }
        await controllerManager.getConfig().setCueGroupSelectionMode(mode)
        const registry = YargCueRegistry.getInstance()
        registry.setCueGroupSelectionMode(mode)
        return { success: true, mode }
      } catch (error) {
        console.error('Error setting cue group selection mode:', error)
        return ipcError(error)
      }
    },
  )

  ipcMain.handle(LIGHT.GET_CUE_GROUP_SELECTION_MODE, async () => {
    try {
      const mode = controllerManager.getConfig().getCueGroupSelectionMode()
      return { success: true, mode }
    } catch (error) {
      console.error('Error getting cue group selection mode:', error)
      return ipcError(error)
    }
  })
}
