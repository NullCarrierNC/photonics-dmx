import { DefinedError } from 'ajv'
import { validateAudioSchema, validateYargSchema } from './cueFiles'
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
  VariableDefinition,
  YargEffectFile,
  YargNodeCueFile,
} from '../../types/nodeCueTypes'
import type { EffectMode } from '../../types/nodeCueTypes'
import type { StructuredValidationError } from './helpers'

// Re-export public schema surface for call sites that need compiled validators
export { validateYargSchema, validateAudioSchema } from './cueFiles'
export { validateYargEffectSchema, validateAudioEffectSchema } from './effectFiles'
export type { StructuredValidationError } from './helpers'

export interface NodeCueValidationSuccess<T extends NodeCueFile> {
  valid: true
  data: T
  errors: []
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

export const validateYargNodeCueFile = (
  value: unknown,
): NodeCueValidationResult<YargNodeCueFile> => {
  const migrated = migrateEasingInNodeCueFile(value)
  if (!validateYargSchema(migrated)) {
    return {
      valid: false,
      errors: formatErrors(validateYargSchema.errors as DefinedError[]),
      structuredErrors: extractStructuredErrors(validateYargSchema.errors as DefinedError[]),
    }
  }

  const semanticErrors: string[] = []
  const fileData = migrated as YargNodeCueFile

  // Check for duplicate group-level variable names
  const groupVariables = fileData.group.variables ?? []
  const groupVarNames = new Set<string>()
  for (const varDef of groupVariables) {
    if (groupVarNames.has(varDef.name)) {
      semanticErrors.push(`Duplicate group-level variable name: '${varDef.name}'`)
    }
    groupVarNames.add(varDef.name)
  }

  const seenLightingCueTypes = new Set<string>()
  const seenMotionCueIds = new Set<string>()
  for (const cue of fileData.cues) {
    if (cue.kind === 'lighting') {
      if (seenLightingCueTypes.has(cue.cueType)) {
        semanticErrors.push(`Duplicate cueType '${cue.cueType}' in group '${fileData.group.name}'.`)
      }
      seenLightingCueTypes.add(cue.cueType)
    } else {
      if (seenMotionCueIds.has(cue.id)) {
        semanticErrors.push(
          `Duplicate motion cue id '${cue.id}' in motion group '${fileData.group.name}'.`,
        )
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
    checkConditionalValidValues(cue.name, cue.nodes.logic ?? [], cueVarDefs, semanticErrors)
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
    mode: 'yarg',
  }
}

export const validateAudioNodeCueFile = (
  value: unknown,
): NodeCueValidationResult<AudioNodeCueFile> => {
  const migrated = prepareAudioNodeCueFileForValidation(value)
  if (!validateAudioSchema(migrated)) {
    return {
      valid: false,
      errors: formatErrors(validateAudioSchema.errors as DefinedError[]),
      structuredErrors: extractStructuredErrors(validateAudioSchema.errors as DefinedError[]),
    }
  }

  const semanticErrors: string[] = []
  const data = migrated as AudioNodeCueFile

  // Check for duplicate group-level variable names
  const groupVariables = data.group.variables ?? []
  const groupVarNames = new Set<string>()
  for (const varDef of groupVariables) {
    if (groupVarNames.has(varDef.name)) {
      semanticErrors.push(`Duplicate group-level variable name: '${varDef.name}'`)
    }
    groupVarNames.add(varDef.name)
  }

  const seenAudioCueTypeIds = new Set<string>()
  const seenAudioMotionIds = new Set<string>()
  for (const cue of data.cues) {
    if (cue.kind === 'lighting') {
      if (seenAudioCueTypeIds.has(cue.cueTypeId)) {
        semanticErrors.push(
          `Duplicate audio cue id '${cue.cueTypeId}' in group '${data.group.name}'.`,
        )
      }
      seenAudioCueTypeIds.add(cue.cueTypeId)
    } else {
      if (seenAudioMotionIds.has(cue.id)) {
        semanticErrors.push(`Duplicate motion cue id '${cue.id}' in group '${data.group.name}'.`)
      }
      seenAudioMotionIds.add(cue.id)
    }
  }

  for (const cue of data.cues) {
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
    checkConditionalValidValues(cue.name, cue.nodes.logic ?? [], cueVarDefs, semanticErrors)
  }

  if (semanticErrors.length > 0) {
    return {
      valid: false,
      errors: semanticErrors,
    }
  }

  return {
    valid: true,
    data,
    errors: [],
    mode: 'audio',
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

  return {
    valid: false,
    errors: ['mode must be "yarg" or "audio"'],
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
  checkConditionalValidValues(effect.name, logicNodes, effectVarDefs, semanticErrors)
}

/**
 * Validate YARG Effect File (schema + semantic, parity with cue validation).
 */
export const validateYargEffectFile = (value: unknown): EffectValidationResult<YargEffectFile> => {
  if (!value || typeof value !== 'object') {
    return {
      valid: false,
      errors: ['Effect file must be a JSON object'],
    }
  }

  const migrated = migrateEasingInEffectFile(value)
  if (!validateYargEffectSchema(migrated)) {
    return {
      valid: false,
      errors: formatErrors(validateYargEffectSchema.errors as DefinedError[]),
      mode: 'yarg',
    }
  }

  const file = migrated as YargEffectFile
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
      mode: 'yarg',
    }
  }

  return {
    valid: true,
    data: file,
    errors: [],
    mode: 'yarg',
  }
}

/**
 * Validate Audio Effect File (schema + semantic, parity with YARG effect validation).
 */
export const validateAudioEffectFile = (
  value: unknown,
): EffectValidationResult<AudioEffectFile> => {
  if (!value || typeof value !== 'object') {
    return {
      valid: false,
      errors: ['Effect file must be a JSON object'],
    }
  }

  const migrated = migrateEasingInEffectFile(value)
  if (!validateAudioEffectSchema(migrated)) {
    return {
      valid: false,
      errors: formatErrors(validateAudioEffectSchema.errors as DefinedError[]),
      mode: 'audio',
    }
  }

  const file = migrated as AudioEffectFile
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
      mode: 'audio',
    }
  }

  return {
    valid: true,
    data: file,
    errors: [],
    mode: 'audio',
  }
}

/**
 * Validate Effect File (auto-detects mode)
 */
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
