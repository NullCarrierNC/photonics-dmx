import { IpcMain } from 'electron'
import { ControllerManager } from '../../controllers/ControllerManager'
import { sendToAllWindows } from '../../utils/windowUtils'
import { YargCueRegistry } from '../../../photonics-dmx/cues/registries/YargCueRegistry'
import { AudioCueRegistry } from '../../../photonics-dmx/cues/registries/AudioCueRegistry'
import { ipcError } from '../ipcResult'
import { CONFIG, RENDERER_RECEIVE } from '../../../shared/ipcChannels'
import { validateOptionalStringArray, validateDisabledCuesMap } from '../inputValidation'
import { createLogger } from '../../../shared/logger'
const log = createLogger('cue-selection-handlers')

export function registerCueSelectionConfigHandlers(
  ipcMain: IpcMain,
  controllerManager: ControllerManager,
): void {
  ipcMain.handle(CONFIG.GET_ENABLED_CUE_GROUPS, async () => {
    const registry = YargCueRegistry.getInstance()
    const config = controllerManager.getConfig()
    const prefs = config.getAllPreferences()
    let enabled = prefs.cueDomains.yarg.enabledGroups
    const allGroups = registry.getAllGroups()
    const knownYargCueGroups = prefs.cueDomains.yarg.knownGroups ?? []

    {
      const newGroups = allGroups.filter((id) => !knownYargCueGroups.includes(id))
      if (newGroups.length > 0) {
        enabled = [...enabled, ...newGroups]
        await config.updateCueDomain('yarg', { enabledGroups: enabled })
      }
      await config.updateCueDomain('yarg', { knownGroups: allGroups })
      registry.setEnabledGroups(enabled)
    }

    const currentPriority = registry.getStageKitPriority()
    const configPriority = prefs.stageKitPrefs?.yargPriority || 'random'

    if (currentPriority !== configPriority) {
      registry.setStageKitPriority(configPriority)
    }

    const disabledYarg = prefs.cueDomains.yarg.disabledCues
    registry.setDisabledCues(disabledYarg)

    return enabled!
  })

  ipcMain.handle(CONFIG.SET_ENABLED_CUE_GROUPS, async (_, groupIds: unknown) => {
    try {
      const validation = validateOptionalStringArray(groupIds, 'groupIds')
      if (!validation.ok) {
        return { success: false, error: validation.error }
      }
      const validatedIds = validation.value
      await controllerManager.getConfig().updateCueDomain('yarg', { enabledGroups: validatedIds })

      const registry = YargCueRegistry.getInstance()

      registry.setEnabledGroups(validatedIds)
      // Selection reads the active set; setEnabledGroups only trims it and never adds. Activate the
      // enabled groups so a group enabled at runtime is immediately selectable without a restart.
      registry.setActiveGroups(registry.getEnabledGroups())
      const disabledYarg = controllerManager.getConfig().getPreference('cueDomains')
        .yarg.disabledCues
      registry.setDisabledCues(disabledYarg)

      log.info('Updated CueRegistry enabled groups:', validatedIds)

      return { success: true }
    } catch (error) {
      log.error('Error setting enabled cue groups:', error)
      return ipcError(error)
    }
  })

  ipcMain.handle(CONFIG.GET_ENABLED_AUDIO_CUE_GROUPS, async () => {
    const registry = AudioCueRegistry.getInstance()
    const config = controllerManager.getConfig()
    const prefs = config.getAllPreferences()
    let enabled = prefs.cueDomains.audio.enabledGroups
    const allGroups = registry.getRegisteredGroups()
    const knownAudioCueGroups = prefs.cueDomains.audio.knownGroups ?? []

    if (!enabled || enabled.length === 0) {
      enabled = allGroups
      if (allGroups.length > 0) {
        await config.updateCueDomain('audio', { enabledGroups: enabled })
      }
      await config.updateCueDomain('audio', { knownGroups: allGroups })
      registry.setEnabledGroups(enabled)
    } else {
      const newGroups = allGroups.filter((id) => !knownAudioCueGroups.includes(id))
      if (newGroups.length > 0) {
        enabled = [...enabled, ...newGroups]
        await config.updateCueDomain('audio', { enabledGroups: enabled })
      }
      await config.updateCueDomain('audio', { knownGroups: allGroups })
      registry.setEnabledGroups(enabled)
    }

    const disabledAudio = prefs.cueDomains.audio.disabledCues
    registry.setDisabledCues(disabledAudio)
    return enabled
  })

  ipcMain.handle(CONFIG.SET_ENABLED_AUDIO_CUE_GROUPS, async (_, groupIds: unknown) => {
    try {
      const validation = validateOptionalStringArray(groupIds, 'groupIds')
      if (!validation.ok) {
        return { success: false, error: validation.error }
      }
      const validatedIds = validation.value
      await controllerManager.getConfig().updateCueDomain('audio', { enabledGroups: validatedIds })
      const registry = AudioCueRegistry.getInstance()
      registry.setEnabledGroups(validatedIds)
      const disabledAudio = controllerManager.getConfig().getPreference('cueDomains')
        .audio.disabledCues
      registry.setDisabledCues(disabledAudio)
      controllerManager.refreshAudioCueSelection()
      sendToAllWindows(RENDERER_RECEIVE.AUDIO_CUE_GROUPS_CHANGED, undefined)
      log.info('Updated AudioCueRegistry enabled groups:', validatedIds)
      return { success: true }
    } catch (error) {
      log.error('Error setting enabled audio cue groups:', error)
      return ipcError(error)
    }
  })

  ipcMain.handle(CONFIG.GET_DISABLED_YARG_CUES, async () => {
    const disabled = controllerManager.getConfig().getPreference('cueDomains').yarg.disabledCues
    YargCueRegistry.getInstance().setDisabledCues(disabled)
    return disabled
  })

  ipcMain.handle(CONFIG.SET_DISABLED_YARG_CUES, async (_, payload: unknown) => {
    try {
      const validation = validateDisabledCuesMap(payload, 'disabledYargCues')
      if (!validation.ok) {
        return { success: false, error: validation.error }
      }
      await controllerManager
        .getConfig()
        .updateCueDomain('yarg', { disabledCues: validation.value })
      YargCueRegistry.getInstance().setDisabledCues(validation.value)
      return { success: true }
    } catch (error) {
      log.error('Error setting disabled YARG cues:', error)
      return ipcError(error)
    }
  })

  ipcMain.handle(CONFIG.GET_DISABLED_AUDIO_CUES, async () => {
    const disabled = controllerManager.getConfig().getPreference('cueDomains').audio.disabledCues
    AudioCueRegistry.getInstance().setDisabledCues(disabled)
    return disabled
  })

  ipcMain.handle(CONFIG.SET_DISABLED_AUDIO_CUES, async (_, payload: unknown) => {
    try {
      const validation = validateDisabledCuesMap(payload, 'disabledAudioCues')
      if (!validation.ok) {
        return { success: false, error: validation.error }
      }
      await controllerManager
        .getConfig()
        .updateCueDomain('audio', { disabledCues: validation.value })
      AudioCueRegistry.getInstance().setDisabledCues(validation.value)
      controllerManager.refreshAudioCueSelection()
      sendToAllWindows(RENDERER_RECEIVE.AUDIO_CUE_GROUPS_CHANGED, undefined)
      return { success: true }
    } catch (error) {
      log.error('Error setting disabled audio cues:', error)
      return ipcError(error)
    }
  })

  ipcMain.handle(CONFIG.GET_ENABLED_YARG_MOTION_CUE_GROUPS, async () => {
    const registry = YargCueRegistry.getInstance()
    const config = controllerManager.getConfig()
    const prefs = config.getAllPreferences()
    let enabled = prefs.cueDomains.yargMotion.enabledGroups
    const allGroups = registry.getRegisteredMotionGroupIds()
    const knownMotionCueGroups = prefs.cueDomains.yargMotion.knownGroups ?? []

    if (!enabled || enabled.length === 0) {
      enabled = allGroups
      if (allGroups.length > 0) {
        await config.updateCueDomain('yargMotion', { enabledGroups: enabled })
      }
      await config.updateCueDomain('yargMotion', { knownGroups: allGroups })
      registry.setEnabledMotionGroups(enabled)
    } else {
      const newGroups = allGroups.filter((id) => !knownMotionCueGroups.includes(id))
      if (newGroups.length > 0) {
        enabled = [...enabled, ...newGroups]
        await config.updateCueDomain('yargMotion', { enabledGroups: enabled })
      }
      await config.updateCueDomain('yargMotion', { knownGroups: allGroups })
      registry.setEnabledMotionGroups(enabled)
    }

    const disabledMotion = prefs.cueDomains.yargMotion.disabledCues
    registry.setDisabledMotionCues(disabledMotion)
    return enabled
  })

  ipcMain.handle(CONFIG.SET_ENABLED_YARG_MOTION_CUE_GROUPS, async (_, groupIds: unknown) => {
    try {
      const validation = validateOptionalStringArray(groupIds, 'groupIds')
      if (!validation.ok) {
        return { success: false, error: validation.error }
      }
      const validatedIds = validation.value
      await controllerManager
        .getConfig()
        .updateCueDomain('yargMotion', { enabledGroups: validatedIds })
      const registry = YargCueRegistry.getInstance()
      registry.setEnabledMotionGroups(validatedIds)
      const disabledMotion = controllerManager.getConfig().getPreference('cueDomains')
        .yargMotion.disabledCues
      registry.setDisabledMotionCues(disabledMotion)
      sendToAllWindows(RENDERER_RECEIVE.YARG_MOTION_CUE_GROUPS_CHANGED, undefined)
      log.info('Updated YARG motion enabled groups:', validatedIds)
      return { success: true }
    } catch (error) {
      log.error('Error setting enabled YARG motion cue groups:', error)
      return ipcError(error)
    }
  })

  ipcMain.handle(CONFIG.GET_DISABLED_YARG_MOTION_CUES, async () => {
    const disabled = controllerManager.getConfig().getPreference('cueDomains')
      .yargMotion.disabledCues
    YargCueRegistry.getInstance().setDisabledMotionCues(disabled)
    return disabled
  })

  ipcMain.handle(CONFIG.SET_DISABLED_YARG_MOTION_CUES, async (_, payload: unknown) => {
    try {
      const validation = validateDisabledCuesMap(payload, 'disabledYargMotionCues')
      if (!validation.ok) {
        return { success: false, error: validation.error }
      }
      await controllerManager
        .getConfig()
        .updateCueDomain('yargMotion', { disabledCues: validation.value })
      YargCueRegistry.getInstance().setDisabledMotionCues(validation.value)
      sendToAllWindows(RENDERER_RECEIVE.YARG_MOTION_CUE_GROUPS_CHANGED, undefined)
      return { success: true }
    } catch (error) {
      log.error('Error setting disabled YARG motion cues:', error)
      return ipcError(error)
    }
  })

  ipcMain.handle(CONFIG.GET_ENABLED_AUDIO_MOTION_CUE_GROUPS, async () => {
    const registry = AudioCueRegistry.getInstance()
    const config = controllerManager.getConfig()
    const prefs = config.getAllPreferences()
    let enabled = prefs.cueDomains.audioMotion.enabledGroups
    const allGroups = registry.getRegisteredMotionGroupIds()
    const knownGroups = prefs.cueDomains.audioMotion.knownGroups ?? []

    if (!enabled || enabled.length === 0) {
      enabled = allGroups
      if (allGroups.length > 0) {
        await config.updateCueDomain('audioMotion', { enabledGroups: enabled })
      }
      await config.updateCueDomain('audioMotion', { knownGroups: allGroups })
      registry.setEnabledMotionGroups(enabled)
    } else {
      const newGroups = allGroups.filter((id) => !knownGroups.includes(id))
      if (newGroups.length > 0) {
        enabled = [...enabled, ...newGroups]
        await config.updateCueDomain('audioMotion', { enabledGroups: enabled })
      }
      await config.updateCueDomain('audioMotion', { knownGroups: allGroups })
      registry.setEnabledMotionGroups(enabled)
    }

    const disabledMotion = prefs.cueDomains.audioMotion.disabledCues
    registry.setDisabledMotionCues(disabledMotion)
    return enabled
  })

  ipcMain.handle(CONFIG.SET_ENABLED_AUDIO_MOTION_CUE_GROUPS, async (_, groupIds: unknown) => {
    try {
      const validation = validateOptionalStringArray(groupIds, 'groupIds')
      if (!validation.ok) {
        return { success: false, error: validation.error }
      }
      const validatedIds = validation.value
      await controllerManager
        .getConfig()
        .updateCueDomain('audioMotion', { enabledGroups: validatedIds })
      const registry = AudioCueRegistry.getInstance()
      registry.setEnabledMotionGroups(validatedIds)
      const disabledMotion = controllerManager.getConfig().getPreference('cueDomains')
        .audioMotion.disabledCues
      registry.setDisabledMotionCues(disabledMotion)
      sendToAllWindows(RENDERER_RECEIVE.AUDIO_MOTION_CUE_GROUPS_CHANGED, undefined)
      log.info('Updated audio motion enabled groups:', validatedIds)
      return { success: true }
    } catch (error) {
      log.error('Error setting enabled audio motion cue groups:', error)
      return ipcError(error)
    }
  })

  ipcMain.handle(CONFIG.GET_DISABLED_AUDIO_MOTION_CUES, async () => {
    const disabled = controllerManager.getConfig().getPreference('cueDomains')
      .audioMotion.disabledCues
    AudioCueRegistry.getInstance().setDisabledMotionCues(disabled)
    return disabled
  })

  ipcMain.handle(CONFIG.SET_DISABLED_AUDIO_MOTION_CUES, async (_, payload: unknown) => {
    try {
      const validation = validateDisabledCuesMap(payload, 'disabledAudioMotionCues')
      if (!validation.ok) {
        return { success: false, error: validation.error }
      }
      await controllerManager
        .getConfig()
        .updateCueDomain('audioMotion', { disabledCues: validation.value })
      AudioCueRegistry.getInstance().setDisabledMotionCues(validation.value)
      sendToAllWindows(RENDERER_RECEIVE.AUDIO_MOTION_CUE_GROUPS_CHANGED, undefined)
      return { success: true }
    } catch (error) {
      log.error('Error setting disabled audio motion cues:', error)
      return ipcError(error)
    }
  })
}
