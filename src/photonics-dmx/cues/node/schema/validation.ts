import type { DefinedError, ValidateFunction } from 'ajv'
import { validateAudioSchema, validateRb3Schema, validateYargSchema } from './cueFiles'
import { validateAudioEffectSchema, validateYargEffectSchema } from './effectFiles'
import {
  checkConditionalValidValues,
  detectCycles,
  extractStructuredErrors,
  formatErrors,
} from './helpers'
import {
  migrateEasingInEffectFile,
  migrateEasingInNodeCueFile,
  prepareAudioNodeCueFileForValidation,
} from './migrations'
import type {
  AudioNodeCueFile,
  AudioEffectFile,
  EffectDefinition,
  EffectFile,
  NodeCueFile,
  NodeCueMode,
  NetNodeCueFile,
  VariableDefinition,
  YargEffectFile,
} from '../../types/nodeCueTypes'
import type { EffectMode } from '../../types/nodeCueTypes'
import type { StructuredValidationError } from './helpers'
import { getCueDomain } from '../../domains'

export type { StructuredValidationError } from './helpers'

export interface NodeCueValidationSuccess<T extends NodeCueFile> {
  valid: true
  data: T
  errors: []
  /**
   * Non-fatal findings: the file loads and runs, but something in it will not do what it looks like
   * it does. Kept apart from `errors` so a warning never stops an existing file from loading.
   */
  warnings: string[]
  mode: NodeCueMode
}

export interface NodeCueValidationFailure {
  valid: false
  errors: string[]
  structuredErrors?: StructuredValidationError[]
}

export type NodeCueValidationResult<T extends NodeCueFile = NodeCueFile> =
  | NodeCueValidationSuccess<T>
  | NodeCueValidationFailure

/**
 * The per-mode parts of cue-file validation. Everything else (group and cue variable names, cycle
 * detection, conditional valid-values, duplicate keys) is identical across modes and lives in
 * {@link validateCueFileForMode}.
 */
interface CueFileValidationSpec<T extends NodeCueFile> {
  mode: NodeCueMode
  /** Migrations and defaulting applied before the envelope is checked. */
  prepare: (value: unknown) => unknown
  /** Resolved per call so the mode's validator compiles on first use, not at import. */
  validate: () => ValidateFunction
  /** How a lighting cue of this mode is keyed, and how a clash reads. */
  lightingKey: (cue: T['cues'][number]) => string
  duplicateLightingMessage: (key: string, groupName: string) => string
  duplicateMotionMessage: (id: string, groupName: string) => string
}

/**
 * A check over a whole cue file, run after the envelope passes.
 *
 * Anything pushed to `errors` fails the file; anything pushed to `warnings` is reported while the
 * file still loads. Registered rather than called directly so a build shipping its own cue kind can
 * add its rules without editing this module.
 */
type CueSemanticCheck = (file: NodeCueFile, errors: string[], warnings: string[]) => void
const semanticChecks: CueSemanticCheck[] = []

export function registerCueSemanticCheck(check: CueSemanticCheck): void {
  semanticChecks.push(check)
}

/** Drops every registered check. Tests only, so each case starts from the built-in set. */
export function __resetCueSemanticChecksForTests(): void {
  semanticChecks.length = 0
  registerCueSemanticCheck(checkEventVocabulary)
}

/**
 * Warn about event nodes naming an event the file's mode can never receive.
 *
 * The envelope accepts the whole net superset on purpose, so an existing file keeps loading whatever
 * it carries. That leaves one silent failure: an RB3 cue authored with `beat`, or a YARG cue with
 * `led-3`, validates and saves and then simply never fires. The editor's own dropdown cannot produce
 * one, but the JSON view and hand-edited files can.
 */
function checkEventVocabulary(file: NodeCueFile, _errors: string[], warnings: string[]): void {
  const allowed = new Set(getCueDomain(file.mode).eventTypes)
  for (const cue of file.cues) {
    for (const event of cue.nodes.events ?? []) {
      const eventType = (event as { eventType?: string }).eventType
      if (eventType && !allowed.has(eventType)) {
        warnings.push(
          `cue '${cue.name}': event '${eventType}' is never raised in ${file.mode} mode, so this node will not fire.`,
        )
      }
    }
  }
}

registerCueSemanticCheck(checkEventVocabulary)

function runCueFileValidation<T extends NodeCueFile>(
  spec: CueFileValidationSpec<T>,
  value: unknown,
): NodeCueValidationResult<T> {
  const migrated = spec.prepare(value)
  const validate = spec.validate()
  if (!validate(migrated)) {
    return {
      valid: false,
      errors: formatErrors(validate.errors as DefinedError[]),
      structuredErrors: extractStructuredErrors(validate.errors as DefinedError[]),
    }
  }

  const semanticErrors: string[] = []
  const fileData = migrated as T

  // Check for duplicate group-level variable names
  const groupVariables = fileData.group.variables ?? []
  const groupVarNames = new Set<string>()
  for (const varDef of groupVariables) {
    if (groupVarNames.has(varDef.name)) {
      semanticErrors.push(`Duplicate group-level variable name: '${varDef.name}'`)
    }
    groupVarNames.add(varDef.name)
  }

  const seenLightingKeys = new Set<string>()
  const seenMotionCueIds = new Set<string>()
  for (const cue of fileData.cues) {
    if (cue.kind === 'lighting') {
      const key = spec.lightingKey(cue as T['cues'][number])
      if (seenLightingKeys.has(key)) {
        semanticErrors.push(spec.duplicateLightingMessage(key, fileData.group.name))
      }
      seenLightingKeys.add(key)
    } else {
      if (seenMotionCueIds.has(cue.id)) {
        semanticErrors.push(spec.duplicateMotionMessage(cue.id, fileData.group.name))
      }
      seenMotionCueIds.add(cue.id)
    }
  }

  for (const cue of fileData.cues) {
    // Check for duplicate cue-level variable names
    const cueVariables = cue.variables ?? []
    const cueVarNames = new Set<string>()
    for (const varDef of cueVariables) {
      if (cueVarNames.has(varDef.name)) {
        semanticErrors.push(
          `cue '${cue.name}': Duplicate cue-level variable name: '${varDef.name}'`,
        )
      }
      cueVarNames.add(varDef.name)
    }

    // Check for circular dependencies (only logic-only cycles are invalid)
    const logicIds = new Set((cue.nodes.logic ?? []).map((node) => node.id))
    const actionIds = new Set(cue.nodes.actions.map((a) => a.id))
    const nonEventIds = new Set<string>([...logicIds, ...actionIds])
    const cycleErrors = detectCycles(cue.connections, nonEventIds, actionIds)
    semanticErrors.push(...cycleErrors.map((e) => `cue '${cue.name}': ${e}`))

    // Check conditional nodes: literal vs variable validValues
    const cueVarDefs: VariableDefinition[] = [...groupVariables, ...cueVariables]
    checkConditionalValidValues(cue.name, 'cue', cue.nodes.logic ?? [], cueVarDefs, semanticErrors)
  }

  const warnings: string[] = []
  for (const check of semanticChecks) {
    check(fileData, semanticErrors, warnings)
  }

  if (semanticErrors.length > 0) {
    return {
      valid: false,
      errors: semanticErrors,
    }
  }

  return {
    valid: true,
    data: fileData,
    errors: [],
    warnings,
    mode: spec.mode,
  }
}

/** A net lighting cue is keyed by its CueType, an audio one by its own cue-type id. */
const netLightingKey = (cue: NetNodeCueFile['cues'][number]): string =>
  cue.kind === 'lighting' ? cue.cueType : cue.id
const audioLightingKey = (cue: AudioNodeCueFile['cues'][number]): string =>
  cue.kind === 'lighting' ? cue.cueTypeId : cue.id

export const validateYargNodeCueFile = (value: unknown): NodeCueValidationResult<NetNodeCueFile> =>
  runCueFileValidation<NetNodeCueFile>(
    {
      mode: 'yarg',
      prepare: migrateEasingInNodeCueFile,
      validate: validateYargSchema,
      lightingKey: netLightingKey,
      duplicateLightingMessage: (key, group) => `Duplicate cueType '${key}' in group '${group}'.`,
      duplicateMotionMessage: (id, group) =>
        `Duplicate motion cue id '${id}' in motion group '${group}'.`,
    },
    value,
  )

export const validateRb3NodeCueFile = (value: unknown): NodeCueValidationResult<NetNodeCueFile> =>
  runCueFileValidation<NetNodeCueFile>(
    {
      mode: 'rb3',
      prepare: migrateEasingInNodeCueFile,
      validate: validateRb3Schema,
      lightingKey: netLightingKey,
      duplicateLightingMessage: (key, group) => `Duplicate cueType '${key}' in group '${group}'.`,
      duplicateMotionMessage: (id, group) =>
        `Duplicate motion cue id '${id}' in motion group '${group}'.`,
    },
    value,
  )

export const validateAudioNodeCueFile = (
  value: unknown,
): NodeCueValidationResult<AudioNodeCueFile> =>
  runCueFileValidation<AudioNodeCueFile>(
    {
      mode: 'audio',
      prepare: prepareAudioNodeCueFileForValidation,
      validate: validateAudioSchema,
      lightingKey: audioLightingKey,
      duplicateLightingMessage: (key, group) =>
        `Duplicate audio cue id '${key}' in group '${group}'.`,
      duplicateMotionMessage: (id, group) => `Duplicate motion cue id '${id}' in group '${group}'.`,
    },
    value,
  )

/**
 * Validate against one mode's rules, for a caller that already knows the mode. The loader takes the
 * mode from the file's directory, which is the authority, so a file declaring a different mode is
 * rejected by that mode's envelope rather than being validated as whatever it claims to be.
 */
export const validateCueFileForMode = (
  mode: NodeCueMode,
  value: unknown,
): NodeCueValidationResult => {
  switch (mode) {
    case 'yarg':
      return validateYargNodeCueFile(value)
    case 'rb3':
      return validateRb3NodeCueFile(value)
    case 'audio':
      return validateAudioNodeCueFile(value)
  }
}

export const validateNodeCueFile = (value: unknown): NodeCueValidationResult => {
  if (!value || typeof value !== 'object') {
    return {
      valid: false,
      errors: ['File must be a JSON object'],
    }
  }

  const mode = (value as Partial<NodeCueFile>).mode
  if (mode === 'audio') {
    return validateAudioNodeCueFile(value)
  }

  if (mode === 'yarg') {
    return validateYargNodeCueFile(value)
  }

  if (mode === 'rb3') {
    return validateRb3NodeCueFile(value)
  }

  return {
    valid: false,
    errors: ['mode must be "yarg", "audio", or "rb3"'],
  }
}

// ============================================================================
// Effect File Validation (schema + semantic parity with cue validation)
// ============================================================================

export interface EffectValidationResult<T = EffectFile> {
  valid: boolean
  data?: T
  errors: string[]
  mode?: EffectMode
}

/**
 * Runs the same graph-level semantic checks on a single effect definition that
 * the YARG/Audio cue validators run per-cue: logic-only cycle detection and
 * conditional literal-vs-variable validValues checks. Reuses the shared
 * {@link detectCycles} and {@link checkConditionalValidValues} helpers so effect
 * files reach parity with cue files (errors prefixed with the effect name via
 * the helpers' `cueName` parameter).
 */
const checkEffectSemantics = (effect: EffectDefinition, semanticErrors: string[]): void => {
  // `nodes`/`connections` are schema-nullable on effect definitions, so guard.
  const logicNodes = effect.nodes?.logic ?? []
  const actionNodes = effect.nodes?.actions ?? []
  const connections = effect.connections ?? []

  // Check for circular dependencies (only logic-only cycles are invalid)
  const logicIds = new Set(logicNodes.map((node) => node.id))
  const actionIds = new Set(actionNodes.map((a) => a.id))
  const nonEventIds = new Set<string>([...logicIds, ...actionIds])
  const cycleErrors = detectCycles(connections, nonEventIds, actionIds)
  semanticErrors.push(...cycleErrors.map((e) => `effect '${effect.name}': ${e}`))

  // Check conditional nodes: literal vs variable validValues
  const effectVarDefs: VariableDefinition[] = effect.variables ?? []
  checkConditionalValidValues(effect.name, 'effect', logicNodes, effectVarDefs, semanticErrors)
}

/**
 * Validate YARG Effect File (schema + semantic, parity with cue validation).
 */
/**
 * Effect-file validation, shared by the two effect trees. They differ only by which schema checks the
 * envelope and which mode the result reports.
 */
function validateEffectFileForMode<T extends EffectFile>(
  mode: EffectMode,
  validate: ValidateFunction,
  value: unknown,
): EffectValidationResult<T> {
  if (!value || typeof value !== 'object') {
    return {
      valid: false,
      errors: ['Effect file must be a JSON object'],
    }
  }

  const migrated = migrateEasingInEffectFile(value)
  if (!validate(migrated)) {
    return {
      valid: false,
      errors: formatErrors(validate.errors as DefinedError[]),
      mode,
    }
  }

  const file = migrated as T
  const semanticErrors: string[] = []

  const effectIds = new Set<string>()
  for (const effect of file.effects) {
    if (effectIds.has(effect.id)) {
      semanticErrors.push(`Duplicate effect id: '${effect.id}'`)
    }
    effectIds.add(effect.id)
  }

  for (const effect of file.effects) {
    checkEffectSemantics(effect, semanticErrors)
  }

  if (semanticErrors.length > 0) {
    return {
      valid: false,
      errors: semanticErrors,
      mode,
    }
  }

  return {
    valid: true,
    data: file,
    errors: [],
    mode,
  }
}

export const validateYargEffectFile = (value: unknown): EffectValidationResult<YargEffectFile> =>
  validateEffectFileForMode<YargEffectFile>('yarg', validateYargEffectSchema, value)

export const validateAudioEffectFile = (value: unknown): EffectValidationResult<AudioEffectFile> =>
  validateEffectFileForMode<AudioEffectFile>('audio', validateAudioEffectSchema, value)

export const validateEffectFile = (value: unknown): EffectValidationResult => {
  if (!value || typeof value !== 'object') {
    return {
      valid: false,
      errors: ['File must be a JSON object'],
    }
  }

  const mode = (value as Partial<EffectFile>).mode
  if (mode === 'audio') {
    return validateAudioEffectFile(value)
  }

  if (mode === 'yarg') {
    return validateYargEffectFile(value)
  }

  return {
    valid: false,
    errors: ['mode must be either "yarg" or "audio"'],
  }
}
