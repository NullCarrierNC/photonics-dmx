/**
 * Compile-time assertions: every validator standardised in `inputValidation.ts` returns a value
 * assignable to its channel's `IpcInvokeMap[Channel]['request']`. The tuple type below exists
 * purely to fail the TypeScript compile if a validator narrows looser (or wider) than the map.
 * The runtime `expect(true)` keeps Jest happy.
 *
 * If you change a request type in `ipcTypes.ts`, update the matching validator (and the tuple
 * here) so the contract stays narrow.
 */

import { describe, expect, it } from '@jest/globals'
import {
  validateAudioConfigPayload,
  validateAudioCueType,
  validateAudioGameModePayload,
  validateCueGroupSelectionMode,
  validateCueRefPayload,
  validateCueType,
  validateDisabledCuesMap,
  validateDmxFixturesArray,
  validateDmxRigPayload,
  validateLightingConfiguration,
  validateMotionSelectionMode,
  validateNumberInRange,
  validateOptionalStringArray,
  validatePathUnderAllowedRoots,
  validatePreferencesPayload,
  validateSenderEnablePayload,
  validateStageKitPriority,
} from '../../ipc/inputValidation'
import type { IpcInvokeMap } from '../../../shared/ipcTypes'
import { CONFIG, LIGHT, SHELL } from '../../../shared/ipcChannels'

type ValidatorOk<F> = F extends (
  ...args: never[]
) => { ok: true; value: infer V } | { ok: false; error: string }
  ? V
  : never

type Assignable<A, B> = [A] extends [B] ? true : false
type AssertTrue<T extends true> = T

// Each tuple entry asserts that the validator's success value is assignable to the corresponding
// `IpcInvokeMap[Channel]['request']`. A new mismatch will fail typecheck (not just lint).
type ValidatorMapAlignment = [
  AssertTrue<
    Assignable<
      ValidatorOk<typeof validateMotionSelectionMode>,
      IpcInvokeMap[typeof LIGHT.SET_YARG_MOTION_GROUP_SELECTION_MODE]['request']
    >
  >,
  AssertTrue<
    Assignable<
      ValidatorOk<typeof validateMotionSelectionMode>,
      IpcInvokeMap[typeof LIGHT.SET_AUDIO_MOTION_GROUP_SELECTION_MODE]['request']
    >
  >,
  AssertTrue<
    Assignable<
      ValidatorOk<typeof validateCueGroupSelectionMode>,
      IpcInvokeMap[typeof LIGHT.SET_CUE_GROUP_SELECTION_MODE]['request']
    >
  >,
  AssertTrue<
    Assignable<
      ValidatorOk<typeof validateCueGroupSelectionMode>,
      IpcInvokeMap[typeof LIGHT.SET_RB3_CUE_GROUP_SELECTION_MODE]['request']
    >
  >,
  AssertTrue<
    Assignable<
      ValidatorOk<typeof validateStageKitPriority>,
      IpcInvokeMap[typeof CONFIG.SET_STAGE_KIT_PRIORITY]['request']
    >
  >,
  AssertTrue<
    Assignable<
      ValidatorOk<typeof validateAudioCueType>,
      IpcInvokeMap[typeof CONFIG.SET_ACTIVE_AUDIO_CUE]['request']
    >
  >,
  AssertTrue<
    Assignable<
      ValidatorOk<typeof validateCueType>,
      IpcInvokeMap[typeof LIGHT.GET_CUE_SOURCE_GROUP]['request']
    >
  >,
  AssertTrue<
    Assignable<
      ValidatorOk<typeof validateCueRefPayload>,
      IpcInvokeMap[typeof CONFIG.SET_ACTIVE_AUDIO_MOTION_CUE]['request']
    >
  >,
  AssertTrue<
    Assignable<
      ValidatorOk<typeof validateCueRefPayload>,
      IpcInvokeMap[typeof CONFIG.SET_ACTIVE_YARG_MOTION_CUE]['request']
    >
  >,
  AssertTrue<
    Assignable<
      ValidatorOk<typeof validateCueRefPayload>,
      IpcInvokeMap[typeof CONFIG.SET_ACTIVE_RB3_MOTION_CUE]['request']
    >
  >,
  AssertTrue<
    Assignable<
      ValidatorOk<typeof validateNumberInRange>,
      IpcInvokeMap[typeof LIGHT.SET_CUE_CONSISTENCY_WINDOW]['request']
    >
  >,
  AssertTrue<
    Assignable<
      ValidatorOk<typeof validateNumberInRange>,
      IpcInvokeMap[typeof LIGHT.SET_MOTION_CUE_MIN_HOLD_MS]['request']
    >
  >,
  AssertTrue<
    Assignable<
      ValidatorOk<typeof validateNumberInRange>,
      IpcInvokeMap[typeof LIGHT.SET_MOTION_CUE_PROBABILITY_PERCENT]['request']
    >
  >,
  AssertTrue<
    Assignable<
      ValidatorOk<typeof validateNumberInRange>,
      IpcInvokeMap[typeof LIGHT.SET_AUDIO_MOTION_CUE_PROBABILITY_PERCENT]['request']
    >
  >,
  AssertTrue<
    Assignable<
      ValidatorOk<typeof validatePreferencesPayload>,
      IpcInvokeMap[typeof CONFIG.SAVE_PREFS]['request']
    >
  >,
  AssertTrue<
    Assignable<
      ValidatorOk<typeof validateLightingConfiguration>,
      IpcInvokeMap[typeof CONFIG.SAVE_LIGHT_LAYOUT]['request']
    >
  >,
  AssertTrue<
    Assignable<
      ValidatorOk<typeof validateDmxRigPayload>,
      IpcInvokeMap[typeof CONFIG.SAVE_DMX_RIG]['request']
    >
  >,
  AssertTrue<
    Assignable<
      ValidatorOk<typeof validateDmxFixturesArray>,
      IpcInvokeMap[typeof CONFIG.SAVE_MY_LIGHTS]['request']
    >
  >,
  AssertTrue<
    Assignable<
      ValidatorOk<typeof validateSenderEnablePayload>,
      IpcInvokeMap[typeof LIGHT.SENDER_ENABLE]['request']
    >
  >,
  AssertTrue<
    Assignable<
      ValidatorOk<typeof validateDisabledCuesMap>,
      IpcInvokeMap[typeof CONFIG.SET_DISABLED_YARG_CUES]['request']
    >
  >,
  AssertTrue<
    Assignable<
      ValidatorOk<typeof validateOptionalStringArray>,
      IpcInvokeMap[typeof CONFIG.SET_ENABLED_CUE_GROUPS]['request']
    >
  >,
  AssertTrue<
    Assignable<
      ValidatorOk<typeof validateAudioConfigPayload>,
      IpcInvokeMap[typeof CONFIG.SAVE_AUDIO_CONFIG]['request']
    >
  >,
  AssertTrue<
    Assignable<
      ValidatorOk<typeof validateAudioGameModePayload>,
      IpcInvokeMap[typeof CONFIG.SET_AUDIO_GAME_MODE]['request']
    >
  >,
  AssertTrue<
    Assignable<
      ValidatorOk<typeof validatePathUnderAllowedRoots>,
      IpcInvokeMap[typeof SHELL.SHOW_ITEM_IN_FOLDER]['request']
    >
  >,
  AssertTrue<
    Assignable<
      ValidatorOk<typeof validatePathUnderAllowedRoots>,
      IpcInvokeMap[typeof SHELL.OPEN_PATH]['request']
    >
  >,
]

describe('IpcInvokeMap ↔ inputValidation contract', () => {
  it('compiles when validator success values are assignable to the matching IpcInvokeMap request types', () => {
    // Reference the tuple so noUnusedLocals doesn't strip the assertion type. Any drift in a
    // validator's narrowed return type vs. the map will fail typecheck above.
    const _alignmentProof: ValidatorMapAlignment = [
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
    ]
    expect(_alignmentProof).toHaveLength(25)
  })
})
