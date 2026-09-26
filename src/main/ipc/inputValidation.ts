/**
 * Renderer-supplied IPC payloads MUST be treated as `unknown`. Validators return a
 * `ValidationResult<T>` whose success value is assignable to the corresponding
 * `IpcInvokeMap[Channel]['request']` for the channel that uses them. When you change a request type
 * in `ipcTypes.ts`, update the matching validator's return type so the contract stays narrow.
 *
 * The validators live in one module per payload family under `ipc/validation/`. This barrel is the
 * import surface for handlers, so a handler pulls every validator it needs from one place.
 */

export type { ValidationResult } from './validation/primitives'
export {
  isPlainObject,
  isNonEmptyString,
  validateNumberInRange,
  validateStringUnion,
  validateOptionalStringArray,
} from './validation/primitives'

export type {
  YargAudioMotionSelectionMode,
  CueGroupSelectionMode,
  StageKitPriority,
} from './validation/cueValidation'
export {
  validateMotionSelectionMode,
  validateCueGroupSelectionMode,
  validateStageKitPriority,
  validateCueType,
  validateTestEffectPayload,
  validateSimulationContextPayload,
  validateInstrumentNotePayload,
  validateAudioCueType,
  validateCueRefPayload,
  validateDisabledCuesMap,
} from './validation/cueValidation'

export type { MasterOutputUpdate } from './validation/senderValidation'
export {
  validateSenderId,
  validateRigMirrorFlag,
  validateRigOutputs,
  validateHost,
  validateSerialDevicePath,
  validateSenderEnablePayload,
  validateMasterOutputPayload,
} from './validation/senderValidation'

export {
  validateLightingConfiguration,
  validateDmxRigPayload,
  validateDmxFixturesArray,
  validateRigId,
} from './validation/fixtureValidation'

export {
  validateNodeCueSavePayload,
  validateEffectSavePayload,
  validateCueTypesPayload,
  validateImportPickMode,
} from './validation/cueFileValidation'

export { validateOpenablePath, validatePathUnderAllowedRoots } from './validation/pathValidation'

export {
  validatePreferencesPayload,
  validateStoredArtNetConfig,
  validateStoredSacnConfig,
} from './validation/prefsValidation'
export { validatePreferencesSave } from './validation/prefsSaveValidation'

export {
  validateAudioConfigPayload,
  validateAudioGameModePayload,
} from './validation/audioValidation'
