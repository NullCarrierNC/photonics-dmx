import { describe, expect, it, jest } from '@jest/globals'

jest.mock('../../utils/windowUtils', () => ({ sendToAllWindows: jest.fn() }))

import {
  PERSIST_ONLY,
  PREFERENCE_LIVE_APPLY,
  applySavedPreferences,
  type LiveApplyTargets,
} from '../../ipc/config/preferenceLiveApply'
import { validatePreferencesSave } from '../../ipc/inputValidation'
import { DEFAULT_PREFERENCES } from '../../../services/configuration/configurationDefaults'

function fakeControllerManager() {
  const master = { setDimmerPercent: jest.fn(), setStrobeOutputEnabled: jest.fn() }
  const publisher = {
    setOutputRateHz: jest.fn(),
    setWhiteChannelMixMode: jest.fn(),
    refreshOutput: jest.fn(),
  }
  const venue = { setVenuePostProcessingEnabled: jest.fn() }
  const getAllPreferences = jest.fn(() => DEFAULT_PREFERENCES)
  const controllerManager: LiveApplyTargets = {
    getMasterOutput: () => master,
    getDmxPublisher: () => publisher,
    getVenueFrameProcessor: () => venue,
    getConfig: () => ({ getAllPreferences }),
  }
  const touched = (): number =>
    [...Object.values(master), ...Object.values(publisher), ...Object.values(venue)].reduce(
      (n, fn) => n + fn.mock.calls.length,
      0,
    ) + getAllPreferences.mock.calls.length
  return {
    controllerManager,
    master,
    publisher,
    touched,
  }
}

describe('preference live apply', () => {
  it('declares every preference the save validator admits', () => {
    const result = validatePreferencesSave({ ...DEFAULT_PREFERENCES })
    if (!result.ok) throw new Error(result.error)

    const admitted = Object.keys(result.value)
    expect(admitted.sort()).toEqual(Object.keys(DEFAULT_PREFERENCES).sort())
    for (const key of admitted) {
      expect(PREFERENCE_LIVE_APPLY).toHaveProperty(key)
    }
  })

  it('refreshes the output once for a save carrying both master controls', () => {
    const { controllerManager, master, publisher } = fakeControllerManager()

    applySavedPreferences(
      { masterDimmerPercent: 40, strobeOutputEnabled: false },
      { controllerManager, onBlackoutShortcutChanged: jest.fn() },
    )

    expect(master.setDimmerPercent).toHaveBeenCalledWith(40)
    expect(master.setStrobeOutputEnabled).toHaveBeenCalledWith(false)
    expect(publisher.refreshOutput).toHaveBeenCalledTimes(1)
  })

  it('rebinds the blackout shortcut once for a save carrying key and scope', () => {
    const { controllerManager } = fakeControllerManager()
    const onBlackoutShortcutChanged = jest.fn()

    applySavedPreferences(
      { blackoutShortcutKey: 'backquote', blackoutShortcutScope: 'focused' },
      { controllerManager, onBlackoutShortcutChanged },
    )

    expect(onBlackoutShortcutChanged).toHaveBeenCalledTimes(1)
  })

  it('applies nothing for a save of persist-only preferences', () => {
    const { controllerManager, touched } = fakeControllerManager()
    const persistOnly = Object.fromEntries(
      Object.entries(DEFAULT_PREFERENCES).filter(
        ([key]) => PREFERENCE_LIVE_APPLY[key as keyof typeof DEFAULT_PREFERENCES] === PERSIST_ONLY,
      ),
    )

    applySavedPreferences(persistOnly, { controllerManager, onBlackoutShortcutChanged: jest.fn() })

    expect(Object.keys(persistOnly).length).toBeGreaterThan(0)
    expect(touched()).toBe(0)
  })
})
