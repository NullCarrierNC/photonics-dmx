/**
 * Audio configuration, the audio cue registries, and the renderer's audio data stream.
 */
import type {
  AudioConfig,
  AudioCueType,
  AudioGameModeConfig,
  AudioLightingData,
} from '../../../shared/ipcTypes'
import { CONFIG, LIGHT, RENDERER_SEND } from '../../../shared/ipcChannels'
import { orThrow } from './ipcResult'

// ---------------------------------------------------------------------------
// Audio configuration
// ---------------------------------------------------------------------------

export const getAudioConfig = () =>
  window.api.invoke(CONFIG.GET_AUDIO_CONFIG, undefined).then(orThrow)

export const saveAudioConfig = (updates: Partial<AudioConfig>) =>
  window.api.invoke(CONFIG.SAVE_AUDIO_CONFIG, updates)

export const getAudioEnabled = () =>
  window.api.invoke(CONFIG.GET_AUDIO_ENABLED, undefined).then(orThrow)

export const setAudioEnabled = (enabled: boolean) =>
  window.api.invoke(CONFIG.SET_AUDIO_ENABLED, enabled)

export const getEnabledAudioCueGroups = () =>
  window.api.invoke(CONFIG.GET_ENABLED_AUDIO_CUE_GROUPS, undefined).then(orThrow)

export const setEnabledAudioCueGroups = (groupIds: string[]) =>
  window.api.invoke(CONFIG.SET_ENABLED_AUDIO_CUE_GROUPS, groupIds)

export const getDisabledYargCues = () =>
  window.api.invoke(CONFIG.GET_DISABLED_YARG_CUES, undefined).then(orThrow)

export const setDisabledYargCues = (disabled: Record<string, string[]>) =>
  window.api.invoke(CONFIG.SET_DISABLED_YARG_CUES, disabled)

export const getDisabledAudioCues = () =>
  window.api.invoke(CONFIG.GET_DISABLED_AUDIO_CUES, undefined).then(orThrow)

export const setDisabledAudioCues = (disabled: Record<string, string[]>) =>
  window.api.invoke(CONFIG.SET_DISABLED_AUDIO_CUES, disabled)

export const getEnabledYargMotionCueGroups = () =>
  window.api.invoke(CONFIG.GET_ENABLED_YARG_MOTION_CUE_GROUPS, undefined).then(orThrow)

export const setEnabledYargMotionCueGroups = (groupIds: string[]) =>
  window.api.invoke(CONFIG.SET_ENABLED_YARG_MOTION_CUE_GROUPS, groupIds)

export const getDisabledYargMotionCues = () =>
  window.api.invoke(CONFIG.GET_DISABLED_YARG_MOTION_CUES, undefined).then(orThrow)

export const setDisabledYargMotionCues = (disabled: Record<string, string[]>) =>
  window.api.invoke(CONFIG.SET_DISABLED_YARG_MOTION_CUES, disabled)

export const getEnabledAudioMotionCueGroups = () =>
  window.api.invoke(CONFIG.GET_ENABLED_AUDIO_MOTION_CUE_GROUPS, undefined).then(orThrow)

export const setEnabledAudioMotionCueGroups = (groupIds: string[]) =>
  window.api.invoke(CONFIG.SET_ENABLED_AUDIO_MOTION_CUE_GROUPS, groupIds)

export const getDisabledAudioMotionCues = () =>
  window.api.invoke(CONFIG.GET_DISABLED_AUDIO_MOTION_CUES, undefined).then(orThrow)

export const setDisabledAudioMotionCues = (disabled: Record<string, string[]>) =>
  window.api.invoke(CONFIG.SET_DISABLED_AUDIO_MOTION_CUES, disabled)

export const getRb3CueGroups = () =>
  window.api.invoke(LIGHT.GET_RB3_CUE_GROUPS, undefined).then(orThrow)

export const getRb3MotionCueGroups = () =>
  window.api.invoke(LIGHT.GET_RB3_MOTION_CUE_GROUPS, undefined).then(orThrow)

export const getEnabledRb3CueGroups = () =>
  window.api.invoke(CONFIG.GET_ENABLED_RB3_CUE_GROUPS, undefined).then(orThrow)

export const setEnabledRb3CueGroups = (groupIds: string[]) =>
  window.api.invoke(CONFIG.SET_ENABLED_RB3_CUE_GROUPS, groupIds)

export const getDisabledRb3Cues = () =>
  window.api.invoke(CONFIG.GET_DISABLED_RB3_CUES, undefined).then(orThrow)

export const setDisabledRb3Cues = (disabled: Record<string, string[]>) =>
  window.api.invoke(CONFIG.SET_DISABLED_RB3_CUES, disabled)

export const getEnabledRb3MotionCueGroups = () =>
  window.api.invoke(CONFIG.GET_ENABLED_RB3_MOTION_CUE_GROUPS, undefined).then(orThrow)

export const setEnabledRb3MotionCueGroups = (groupIds: string[]) =>
  window.api.invoke(CONFIG.SET_ENABLED_RB3_MOTION_CUE_GROUPS, groupIds)

export const getDisabledRb3MotionCues = () =>
  window.api.invoke(CONFIG.GET_DISABLED_RB3_MOTION_CUES, undefined).then(orThrow)

export const setDisabledRb3MotionCues = (disabled: Record<string, string[]>) =>
  window.api.invoke(CONFIG.SET_DISABLED_RB3_MOTION_CUES, disabled)

export const getAudioReactiveCues = () =>
  window.api.invoke(CONFIG.GET_AUDIO_REACTIVE_CUES, undefined)

export const setActiveAudioCue = (cueType: AudioCueType) =>
  window.api.invoke(CONFIG.SET_ACTIVE_AUDIO_CUE, cueType)

export const getAudioGameMode = () =>
  window.api.invoke(CONFIG.GET_AUDIO_GAME_MODE, undefined).then(orThrow)

export const setAudioGameMode = (updates: Partial<AudioGameModeConfig>) =>
  window.api.invoke(CONFIG.SET_AUDIO_GAME_MODE, updates)

export const getMotionEnabled = () =>
  window.api.invoke(CONFIG.GET_MOTION_ENABLED, undefined).then(orThrow)

export const setMotionEnabled = (enabled: boolean) =>
  window.api.invoke(CONFIG.SET_MOTION_ENABLED, enabled)

export const getActiveAudioMotionCue = () =>
  window.api.invoke(CONFIG.GET_ACTIVE_AUDIO_MOTION_CUE, undefined).then(orThrow)

export const setActiveAudioMotionCue = (ref: { groupId: string; cueId: string } | null) =>
  window.api.invoke(CONFIG.SET_ACTIVE_AUDIO_MOTION_CUE, ref)

export const getActiveYargMotionCue = () =>
  window.api.invoke(CONFIG.GET_ACTIVE_YARG_MOTION_CUE, undefined).then(orThrow)

export const setActiveYargMotionCue = (ref: { groupId: string; cueId: string } | null) =>
  window.api.invoke(CONFIG.SET_ACTIVE_YARG_MOTION_CUE, ref)

export const getActiveRb3MotionCue = () =>
  window.api.invoke(CONFIG.GET_ACTIVE_RB3_MOTION_CUE, undefined).then(orThrow)

export const setActiveRb3MotionCue = (ref: { groupId: string; cueId: string } | null) =>
  window.api.invoke(CONFIG.SET_ACTIVE_RB3_MOTION_CUE, ref)

// ---------------------------------------------------------------------------
// Audio data streaming (renderer → main)
// ---------------------------------------------------------------------------

export const sendAudioData = (data: AudioLightingData) =>
  window.api.sendToMain(RENDERER_SEND.AUDIO_DATA, data)
