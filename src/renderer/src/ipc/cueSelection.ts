/**
 * How cues are chosen: the consistency window, selection modes, and the cue groups.
 */
import type { CueType } from '../../../shared/ipcTypes'
import { CONFIG, LIGHT } from '../../../shared/ipcChannels'
import { orThrow } from './ipcResult'

// ---------------------------------------------------------------------------
// Cue consistency window
// ---------------------------------------------------------------------------

export const setCueConsistencyWindow = (windowMs: number) =>
  window.api.invoke(LIGHT.SET_CUE_CONSISTENCY_WINDOW, windowMs)

export const getCueConsistencyWindow = () =>
  window.api.invoke(LIGHT.GET_CUE_CONSISTENCY_WINDOW, undefined)

export const getMotionCueMinHoldMs = () =>
  window.api.invoke(LIGHT.GET_MOTION_CUE_MIN_HOLD_MS, undefined)

export const setMotionCueMinHoldMs = (minHoldMs: number) =>
  window.api.invoke(LIGHT.SET_MOTION_CUE_MIN_HOLD_MS, minHoldMs)

export const getYargFallbackCueTimeMs = () =>
  window.api.invoke(LIGHT.GET_YARG_FALLBACK_CUE_TIME_MS, undefined)

export const setYargFallbackCueTimeMs = (fallbackMs: number) =>
  window.api.invoke(LIGHT.SET_YARG_FALLBACK_CUE_TIME_MS, fallbackMs)

export const getMotionCueProbabilityPercent = () =>
  window.api.invoke(LIGHT.GET_MOTION_CUE_PROBABILITY_PERCENT, undefined)

export const setMotionCueProbabilityPercent = (percent: number) =>
  window.api.invoke(LIGHT.SET_MOTION_CUE_PROBABILITY_PERCENT, percent)

export const getAudioMotionCueProbabilityPercent = () =>
  window.api.invoke(LIGHT.GET_AUDIO_MOTION_CUE_PROBABILITY_PERCENT, undefined)

export const setAudioMotionCueProbabilityPercent = (percent: number) =>
  window.api.invoke(LIGHT.SET_AUDIO_MOTION_CUE_PROBABILITY_PERCENT, percent)

export const getRb3MotionCueProbabilityPercent = () =>
  window.api.invoke(LIGHT.GET_RB3_MOTION_CUE_PROBABILITY_PERCENT, undefined)

export const setRb3MotionCueProbabilityPercent = (percent: number) =>
  window.api.invoke(LIGHT.SET_RB3_MOTION_CUE_PROBABILITY_PERCENT, percent)

export const getRb3MotionCueMinHoldMs = () =>
  window.api.invoke(LIGHT.GET_RB3_MOTION_CUE_MIN_HOLD_MS, undefined)

export const setRb3MotionCueMinHoldMs = (minHoldMs: number) =>
  window.api.invoke(LIGHT.SET_RB3_MOTION_CUE_MIN_HOLD_MS, minHoldMs)

export const getRb3MotionCueDuration = () =>
  window.api.invoke(LIGHT.GET_RB3_MOTION_CUE_DURATION, undefined)

export const setRb3MotionCueDuration = (range: { min: number; max: number }) =>
  window.api.invoke(LIGHT.SET_RB3_MOTION_CUE_DURATION, range)

export const getCueGroupSelectionMode = () =>
  window.api.invoke(LIGHT.GET_CUE_GROUP_SELECTION_MODE, undefined)

export const setCueGroupSelectionMode = (mode: 'oncePerSong' | 'withinSong') =>
  window.api.invoke(LIGHT.SET_CUE_GROUP_SELECTION_MODE, mode)

export const getRb3CueGroupSelectionMode = () =>
  window.api.invoke(LIGHT.GET_RB3_CUE_GROUP_SELECTION_MODE, undefined)

export const setRb3CueGroupSelectionMode = (mode: 'oncePerSong' | 'withinSong') =>
  window.api.invoke(LIGHT.SET_RB3_CUE_GROUP_SELECTION_MODE, mode)

export const getYargMotionGroupSelectionMode = () =>
  window.api.invoke(LIGHT.GET_YARG_MOTION_GROUP_SELECTION_MODE, undefined)

export const setYargMotionGroupSelectionMode = (mode: 'oncePerSong' | 'perCueChange' | 'none') =>
  window.api.invoke(LIGHT.SET_YARG_MOTION_GROUP_SELECTION_MODE, mode)

export const getAudioMotionGroupSelectionMode = () =>
  window.api.invoke(LIGHT.GET_AUDIO_MOTION_GROUP_SELECTION_MODE, undefined)

export const setAudioMotionGroupSelectionMode = (mode: 'oncePerSong' | 'perCueChange' | 'none') =>
  window.api.invoke(LIGHT.SET_AUDIO_MOTION_GROUP_SELECTION_MODE, mode)

export const getRb3MotionGroupSelectionMode = () =>
  window.api.invoke(LIGHT.GET_RB3_MOTION_GROUP_SELECTION_MODE, undefined)

export const setRb3MotionGroupSelectionMode = (mode: 'oncePerSong' | 'perCueChange' | 'none') =>
  window.api.invoke(LIGHT.SET_RB3_MOTION_GROUP_SELECTION_MODE, mode)

export const getYargMotionCueGroups = () =>
  window.api.invoke(LIGHT.GET_YARG_MOTION_CUE_GROUPS, undefined).then(orThrow)

export const getAudioMotionCueGroups = () =>
  window.api.invoke(LIGHT.GET_AUDIO_MOTION_CUE_GROUPS, undefined).then(orThrow)

export const getAvailableYargMotionCues = (groupId?: string) =>
  window.api.invoke(LIGHT.GET_AVAILABLE_YARG_MOTION_CUES, groupId).then(orThrow)

export const getAvailableAudioMotionCues = (groupId?: string) =>
  window.api.invoke(LIGHT.GET_AVAILABLE_AUDIO_MOTION_CUES, groupId).then(orThrow)

export const getAvailableRb3MotionCues = (groupId?: string) =>
  window.api.invoke(LIGHT.GET_AVAILABLE_RB3_MOTION_CUES, groupId).then(orThrow)

export const startYargMotionCueSimulation = (groupId: string, cueId: string) =>
  window.api.invoke(LIGHT.START_YARG_MOTION_CUE_SIMULATION, { groupId, cueId })

export const startAudioMotionCueSimulation = (groupId: string, cueId: string) =>
  window.api.invoke(LIGHT.START_AUDIO_MOTION_CUE_SIMULATION, { groupId, cueId })

export const startRb3MotionCueSimulation = (groupId: string, cueId: string) =>
  window.api.invoke(LIGHT.START_RB3_MOTION_CUE_SIMULATION, { groupId, cueId })

export const stopMotionCueSimulation = () =>
  window.api.invoke(LIGHT.STOP_MOTION_CUE_SIMULATION, undefined)

export const getConsistencyStatus = () => window.api.invoke(LIGHT.GET_CONSISTENCY_STATUS, undefined)

// ---------------------------------------------------------------------------
// Cue groups
// ---------------------------------------------------------------------------

export const getCueGroups = () => window.api.invoke(LIGHT.GET_CUE_GROUPS, undefined).then(orThrow)

export const getEnabledCueGroups = () =>
  window.api.invoke(CONFIG.GET_ENABLED_CUE_GROUPS, undefined).then(orThrow)

export const setEnabledCueGroups = (groupIds: string[]) =>
  window.api.invoke(CONFIG.SET_ENABLED_CUE_GROUPS, groupIds)

export const getCueSourceGroup = (cueType: CueType) =>
  window.api.invoke(LIGHT.GET_CUE_SOURCE_GROUP, cueType)

export const getAvailableCues = (groupId: string | undefined) =>
  window.api.invoke(LIGHT.GET_AVAILABLE_CUES, groupId).then(orThrow)

export const getAudioCueGroups = () =>
  window.api.invoke(LIGHT.GET_AUDIO_CUE_GROUPS, undefined).then(orThrow)

export const getAvailableAudioCues = (groupId?: string) =>
  window.api.invoke(LIGHT.GET_AVAILABLE_AUDIO_CUES, groupId).then(orThrow)

export const getAvailableRb3Cues = (groupId?: string) =>
  window.api.invoke(LIGHT.GET_AVAILABLE_RB3_CUES, groupId).then(orThrow)
