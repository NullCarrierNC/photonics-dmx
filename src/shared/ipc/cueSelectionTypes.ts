/**
 * Cue and motion selection channels: consistency window, hold and probability settings, motion groups and motion simulation.
 *
 * Part of the IpcInvokeMap contract, recomposed in shared/ipcTypes.ts.
 */

import { LIGHT } from '../ipcChannels'
import type { CueType } from '../../photonics-dmx/cues/types/cueTypes'
import type { IpcErrorResult, IpcSuccessResult } from './common'

export interface CueSelectionInvokeMap {
  [LIGHT.SET_CUE_CONSISTENCY_WINDOW]: {
    request: number
    response: { success: true; windowMs: number } | IpcErrorResult
  }
  [LIGHT.GET_CUE_CONSISTENCY_WINDOW]: {
    request: void
    response: { success: true; windowMs: number } | IpcErrorResult
  }
  [LIGHT.GET_MOTION_CUE_MIN_HOLD_MS]: {
    request: void
    response: { success: true; minHoldMs: number } | IpcErrorResult
  }
  [LIGHT.SET_MOTION_CUE_MIN_HOLD_MS]: {
    request: number
    response: { success: true; minHoldMs: number } | IpcErrorResult
  }
  [LIGHT.GET_YARG_FALLBACK_CUE_TIME_MS]: {
    request: void
    response: { success: true; fallbackMs: number } | IpcErrorResult
  }
  [LIGHT.SET_YARG_FALLBACK_CUE_TIME_MS]: {
    request: number
    response: { success: true; fallbackMs: number } | IpcErrorResult
  }
  [LIGHT.GET_MOTION_CUE_PROBABILITY_PERCENT]: {
    request: void
    response: { success: true; percent: number } | IpcErrorResult
  }
  [LIGHT.SET_MOTION_CUE_PROBABILITY_PERCENT]: {
    request: number
    response: { success: true; percent: number } | IpcErrorResult
  }
  [LIGHT.GET_AUDIO_MOTION_CUE_PROBABILITY_PERCENT]: {
    request: void
    response: { success: true; percent: number } | IpcErrorResult
  }
  [LIGHT.SET_AUDIO_MOTION_CUE_PROBABILITY_PERCENT]: {
    request: number
    response: { success: true; percent: number } | IpcErrorResult
  }
  [LIGHT.GET_RB3_MOTION_CUE_PROBABILITY_PERCENT]: {
    request: void
    response: { success: true; percent: number } | IpcErrorResult
  }
  [LIGHT.SET_RB3_MOTION_CUE_PROBABILITY_PERCENT]: {
    request: number
    response: { success: true; percent: number } | IpcErrorResult
  }
  [LIGHT.GET_RB3_MOTION_CUE_MIN_HOLD_MS]: {
    request: void
    response: { success: true; minHoldMs: number } | IpcErrorResult
  }
  [LIGHT.SET_RB3_MOTION_CUE_MIN_HOLD_MS]: {
    request: number
    response: { success: true; minHoldMs: number } | IpcErrorResult
  }
  [LIGHT.GET_RB3_MOTION_CUE_DURATION]: {
    request: void
    response: { success: true; min: number; max: number } | IpcErrorResult
  }
  [LIGHT.SET_RB3_MOTION_CUE_DURATION]: {
    request: { min: number; max: number }
    response: { success: true; min: number; max: number } | IpcErrorResult
  }
  [LIGHT.SET_CUE_GROUP_SELECTION_MODE]: {
    request: 'oncePerSong' | 'withinSong'
    response: { success: true; mode: 'oncePerSong' | 'withinSong' } | IpcErrorResult
  }
  [LIGHT.GET_CUE_GROUP_SELECTION_MODE]: {
    request: void
    response: { success: true; mode: 'oncePerSong' | 'withinSong' } | IpcErrorResult
  }
  [LIGHT.SET_RB3_CUE_GROUP_SELECTION_MODE]: {
    request: 'oncePerSong' | 'withinSong'
    response: { success: true; mode: 'oncePerSong' | 'withinSong' } | IpcErrorResult
  }
  [LIGHT.GET_RB3_CUE_GROUP_SELECTION_MODE]: {
    request: void
    response: { success: true; mode: 'oncePerSong' | 'withinSong' } | IpcErrorResult
  }
  [LIGHT.GET_CONSISTENCY_STATUS]: {
    request: void
    response: { success: true; status: unknown } | IpcErrorResult
  }
  [LIGHT.GET_YARG_MOTION_CUE_GROUPS]: {
    request: void
    response: Array<{ id: string; name: string; description?: string; cueCount: number }>
  }
  [LIGHT.GET_AUDIO_MOTION_CUE_GROUPS]: {
    request: void
    response: Array<{ id: string; name: string; description?: string; cueCount: number }>
  }
  [LIGHT.GET_RB3_CUE_GROUPS]: {
    request: void
    response: Array<{ id: string; name: string; description: string; cueTypes: CueType[] }>
  }
  [LIGHT.GET_RB3_MOTION_CUE_GROUPS]: {
    request: void
    response: Array<{ id: string; name: string; description?: string; cueCount: number }>
  }
  [LIGHT.GET_AVAILABLE_YARG_MOTION_CUES]: {
    request: string | undefined
    response: Array<{ id: string; name: string; description: string }>
  }
  [LIGHT.GET_AVAILABLE_AUDIO_MOTION_CUES]: {
    request: string | undefined
    response: Array<{ id: string; name: string; description: string }>
  }
  [LIGHT.GET_AVAILABLE_RB3_MOTION_CUES]: {
    request: string | undefined
    response: Array<{ id: string; name: string; description: string }>
  }
  [LIGHT.GET_YARG_MOTION_GROUP_SELECTION_MODE]: {
    request: void
    response: { success: true; mode: 'oncePerSong' | 'perCueChange' | 'none' } | IpcErrorResult
  }
  [LIGHT.SET_YARG_MOTION_GROUP_SELECTION_MODE]: {
    request: 'oncePerSong' | 'perCueChange' | 'none'
    response: { success: true; mode: 'oncePerSong' | 'perCueChange' | 'none' } | IpcErrorResult
  }
  [LIGHT.GET_AUDIO_MOTION_GROUP_SELECTION_MODE]: {
    request: void
    response: { success: true; mode: 'oncePerSong' | 'perCueChange' | 'none' } | IpcErrorResult
  }
  [LIGHT.SET_AUDIO_MOTION_GROUP_SELECTION_MODE]: {
    request: 'oncePerSong' | 'perCueChange' | 'none'
    response: { success: true; mode: 'oncePerSong' | 'perCueChange' | 'none' } | IpcErrorResult
  }
  [LIGHT.GET_RB3_MOTION_GROUP_SELECTION_MODE]: {
    request: void
    response: { success: true; mode: 'oncePerSong' | 'perCueChange' | 'none' } | IpcErrorResult
  }
  [LIGHT.SET_RB3_MOTION_GROUP_SELECTION_MODE]: {
    request: 'oncePerSong' | 'perCueChange' | 'none'
    response: { success: true; mode: 'oncePerSong' | 'perCueChange' | 'none' } | IpcErrorResult
  }
  [LIGHT.START_YARG_MOTION_CUE_SIMULATION]: {
    request: { groupId: string; cueId: string }
    response: IpcSuccessResult | IpcErrorResult
  }
  [LIGHT.START_AUDIO_MOTION_CUE_SIMULATION]: {
    request: { groupId: string; cueId: string }
    response: IpcSuccessResult | IpcErrorResult
  }
  [LIGHT.START_RB3_MOTION_CUE_SIMULATION]: {
    request: { groupId: string; cueId: string }
    response: IpcSuccessResult | IpcErrorResult
  }
  [LIGHT.STOP_MOTION_CUE_SIMULATION]: {
    request: void
    response: IpcSuccessResult | IpcErrorResult
  }
}
