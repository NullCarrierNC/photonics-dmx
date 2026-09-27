/** @jest-environment jsdom */
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { installWindowApiAnswering } from '@renderer/tests/helpers/windowApiStub'

const invoke = jest.fn<(channel: string, payload?: unknown) => Promise<unknown>>()
installWindowApiAnswering(invoke)

import {
  getActiveRigs,
  getDmxRig,
  getDmxRigs,
  getLightLayout,
  getLightLibrary,
  getMyLights,
  getPrefs,
} from './config'
import {
  getAppVersion,
  getCorruptRecoveryEvents,
  getLifecyclePhase,
  getValidationErrors,
} from './appShell'
import {
  getActiveAudioMotionCue,
  getActiveRb3MotionCue,
  getActiveYargMotionCue,
  getAudioConfig,
  getAudioEnabled,
  getAudioGameMode,
  getDisabledAudioCues,
  getDisabledAudioMotionCues,
  getDisabledRb3Cues,
  getDisabledRb3MotionCues,
  getDisabledYargCues,
  getDisabledYargMotionCues,
  getEnabledAudioCueGroups,
  getEnabledAudioMotionCueGroups,
  getEnabledRb3CueGroups,
  getEnabledRb3MotionCueGroups,
  getEnabledYargMotionCueGroups,
  getMotionEnabled,
  getRb3CueGroups,
  getRb3MotionCueGroups,
} from './audio'
import {
  getAudioCueGroups,
  getAudioMotionCueGroups,
  getAvailableAudioCues,
  getAvailableAudioMotionCues,
  getAvailableCues,
  getAvailableRb3Cues,
  getAvailableRb3MotionCues,
  getAvailableYargMotionCues,
  getCueGroups,
  getEnabledCueGroups,
  getYargMotionCueGroups,
} from './cueSelection'
import { getMasterOutput, getStageKitPriority } from './lighting'
import { getRb3Mode, getRb3Stats } from './listeners'

const getters: Array<[string, () => Promise<unknown>]> = [
  ['getPrefs', getPrefs],
  ['getLightLibrary', getLightLibrary],
  ['getMyLights', getMyLights],
  ['getLightLayout', getLightLayout],
  ['getDmxRigs', getDmxRigs],
  ['getDmxRig', () => getDmxRig('rig-1')],
  ['getActiveRigs', getActiveRigs],
  ['getLifecyclePhase', getLifecyclePhase],
  ['getActiveAudioMotionCue', getActiveAudioMotionCue],
  ['getActiveRb3MotionCue', getActiveRb3MotionCue],
  ['getActiveYargMotionCue', getActiveYargMotionCue],
  ['getAppVersion', getAppVersion],
  ['getAudioConfig', getAudioConfig],
  ['getAudioCueGroups', getAudioCueGroups],
  ['getAudioEnabled', getAudioEnabled],
  ['getAudioGameMode', getAudioGameMode],
  ['getAudioMotionCueGroups', getAudioMotionCueGroups],
  ['getAvailableAudioCues', () => getAvailableAudioCues('group-1')],
  ['getAvailableAudioMotionCues', () => getAvailableAudioMotionCues('group-1')],
  ['getAvailableCues', () => getAvailableCues('group-1')],
  ['getAvailableRb3Cues', () => getAvailableRb3Cues('group-1')],
  ['getAvailableRb3MotionCues', () => getAvailableRb3MotionCues('group-1')],
  ['getAvailableYargMotionCues', () => getAvailableYargMotionCues('group-1')],
  ['getCorruptRecoveryEvents', getCorruptRecoveryEvents],
  ['getCueGroups', getCueGroups],
  ['getDisabledAudioCues', getDisabledAudioCues],
  ['getDisabledAudioMotionCues', getDisabledAudioMotionCues],
  ['getDisabledRb3Cues', getDisabledRb3Cues],
  ['getDisabledRb3MotionCues', getDisabledRb3MotionCues],
  ['getDisabledYargCues', getDisabledYargCues],
  ['getDisabledYargMotionCues', getDisabledYargMotionCues],
  ['getEnabledAudioCueGroups', getEnabledAudioCueGroups],
  ['getEnabledAudioMotionCueGroups', getEnabledAudioMotionCueGroups],
  ['getEnabledCueGroups', getEnabledCueGroups],
  ['getEnabledRb3CueGroups', getEnabledRb3CueGroups],
  ['getEnabledRb3MotionCueGroups', getEnabledRb3MotionCueGroups],
  ['getEnabledYargMotionCueGroups', getEnabledYargMotionCueGroups],
  ['getMasterOutput', getMasterOutput],
  ['getMotionEnabled', getMotionEnabled],
  ['getRb3CueGroups', getRb3CueGroups],
  ['getRb3Mode', getRb3Mode],
  ['getRb3MotionCueGroups', getRb3MotionCueGroups],
  ['getRb3Stats', getRb3Stats],
  ['getStageKitPriority', getStageKitPriority],
  ['getValidationErrors', getValidationErrors],
  ['getYargMotionCueGroups', getYargMotionCueGroups],
]

describe.each(getters)('%s', (_name, get) => {
  beforeEach(() => {
    invoke.mockReset()
  })

  it('throws the reason main gave when it refuses', async () => {
    invoke.mockResolvedValue({ success: false, error: 'config not loaded' })

    await expect(get()).rejects.toThrow('config not loaded')
  })

  it('returns the value main answers with', async () => {
    const value = { anything: true }
    invoke.mockResolvedValue(value)

    await expect(get()).resolves.toBe(value)
  })
})
