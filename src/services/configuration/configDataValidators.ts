import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv'
import addFormats from 'ajv-formats'
import { CUE_DOMAINS } from './cueDomainTypes'
import type { AppPreferences } from './configurationDefaults'
import {
  ConfigStrobeType,
  type DmxRigsConfig,
  type DmxFixture,
  type LightingConfiguration,
} from '../../photonics-dmx/types'

function makeAjv(): Ajv {
  const ajv = new Ajv({ allErrors: true, allowUnionTypes: true, strict: false })
  addFormats(ajv)
  return ajv
}

const ajv = makeAjv()

const cueDomainEntrySchema = {
  type: 'object',
  required: ['enabledGroups', 'knownGroups', 'disabledCues'],
  properties: {
    enabledGroups: { type: 'array', items: { type: 'string' } },
    knownGroups: { type: 'array', items: { type: 'string' } },
    disabledCues: {
      type: 'object',
      additionalProperties: { type: 'array', items: { type: 'string' } },
    },
    // Constrained to the valid CueDomainSelectionMode values so a corrupt value fails validation
    // and routes through corruption-recovery rather than being coerced to a default by the
    // getters. Shared across all cue domains (lighting reads oncePerSong|withinSong; motion reads
    // oncePerSong|perCueChange|none). Optional; additionalProperties stays true so newer config
    // versions still validate.
    selectionMode: { type: 'string', enum: ['oncePerSong', 'perCueChange', 'withinSong', 'none'] },
    activeCueRef: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          required: ['groupId', 'cueId'],
          properties: { groupId: { type: 'string' }, cueId: { type: 'string' } },
          additionalProperties: true,
        },
      ],
    },
    probabilityPercent: { type: 'number' },
    minimumHoldMs: { type: 'number' },
  },
  additionalProperties: true,
} as const

const cueDomainsSchema = (() => {
  const perDomain: Record<string, unknown> = {}
  for (const d of CUE_DOMAINS) {
    perDomain[d] = cueDomainEntrySchema
  }
  return {
    type: 'object' as const,
    required: [...CUE_DOMAINS],
    properties: perDomain,
    additionalProperties: true,
  }
})()

const appPreferencesDataSchema = {
  type: 'object',
  required: ['effectDebounce', 'complex', 'cueDomains', 'cueConsistencyWindow', 'clockRate'],
  properties: {
    effectDebounce: { type: 'number' },
    complex: { type: 'boolean' },
    cueDomains: cueDomainsSchema,
    cueConsistencyWindow: { type: 'number' },
    clockRate: { type: 'number' },
    // Optional (not required) so prefs.json from installs predating this field still validate;
    // ConfigurationManager reads default to 20000 when absent.
    yargFallbackCueTimeMs: { type: 'number' },
  },
  additionalProperties: true,
}

const validateAppPreferencesCompiled = ajv.compile(appPreferencesDataSchema)

const userLightsDataSchema = {
  type: 'object',
  required: ['lights'],
  properties: {
    lights: {
      type: 'array',
      items: { type: 'object', additionalProperties: true },
    },
  },
  additionalProperties: true,
}

const validateUserLightsCompiled = ajv.compile(userLightsDataSchema)

const lightingStrobe = new Set<string>(Object.values(ConfigStrobeType) as string[])

const layoutDataSchema = {
  type: 'object',
  required: ['numLights', 'lightLayout', 'strobeType', 'frontLights', 'backLights', 'strobeLights'],
  properties: {
    numLights: { type: 'number' },
    lightLayout: {
      type: 'object',
      required: ['id', 'label'],
      properties: {
        id: { type: 'string' },
        label: { type: 'string' },
      },
      additionalProperties: true,
    },
    strobeType: { type: 'string' },
    frontLights: { type: 'array' },
    backLights: { type: 'array' },
    strobeLights: { type: 'array' },
  },
  additionalProperties: true,
}

const validateLayoutCompiled = ajv.compile(layoutDataSchema)

const rigEntrySchema = {
  type: 'object',
  required: ['id', 'name', 'active', 'config'],
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    active: { type: 'boolean' },
    config: { type: 'object', additionalProperties: true },
  },
  additionalProperties: true,
} as const

const dmxRigsDataSchema = {
  type: 'object',
  required: ['rigs'],
  properties: {
    rigs: { type: 'array', items: rigEntrySchema },
    schemaVersion: { type: 'number' },
  },
  additionalProperties: true,
}

const validateDmxRigsCompiled = ajv.compile(dmxRigsDataSchema)

function formatAjvErrors(errs: ErrorObject[] | null | undefined, dataVar = 'value'): string[] {
  if (!errs?.length) {
    return ['Validation failed (no details)']
  }
  return errs.map(
    (e) =>
      `${dataVar}${e.instancePath || ''} ${e.message || 'invalid'}`.trim() +
      (e.params && Object.keys(e.params).length ? ` (${JSON.stringify(e.params)})` : ''),
  )
}

export type ConfigValidationOutcome = { valid: true } | { valid: false; errors: string[] }

function runValidate(
  validate: ValidateFunction,
  data: unknown,
  dataVar: string,
): ConfigValidationOutcome {
  if (validate(data)) {
    return { valid: true }
  }
  return { valid: false, errors: formatAjvErrors(validate.errors, dataVar) }
}

function validateLightingStrobeType(layout: LightingConfiguration): ConfigValidationOutcome {
  if (!lightingStrobe.has(layout.strobeType as string)) {
    return {
      valid: false,
      errors: [`lighting: strobeType not a valid enum, got ${String(layout.strobeType)}`],
    }
  }
  return { valid: true }
}

function validateRigConfigMatchesLayoutShape(data: DmxRigsConfig): ConfigValidationOutcome {
  for (let i = 0; i < data.rigs.length; i++) {
    const inner = runValidate(validateLayoutCompiled, data.rigs[i].config, `rigs[${i}].config`)
    if (!inner.valid) {
      return inner
    }
    const st = validateLightingStrobeType(data.rigs[i].config)
    if (!st.valid) {
      return { valid: false, errors: st.errors.map((e) => `rigs[${i}].config: ${e}`) }
    }
  }
  return { valid: true }
}

export function validateAppPreferencesData(data: AppPreferences): ConfigValidationOutcome {
  return runValidate(validateAppPreferencesCompiled, data, 'prefs')
}

export function validateUserLightsData(data: { lights: DmxFixture[] }): ConfigValidationOutcome {
  return runValidate(validateUserLightsCompiled, data, 'lights')
}

export function validateLightingLayoutData(data: LightingConfiguration): ConfigValidationOutcome {
  const a = runValidate(validateLayoutCompiled, data, 'lightsLayout')
  if (!a.valid) {
    return a
  }
  return validateLightingStrobeType(data)
}

export function validateDmxRigsData(data: DmxRigsConfig): ConfigValidationOutcome {
  const base = runValidate(validateDmxRigsCompiled, data, 'dmxRigs')
  if (!base.valid) {
    return base
  }
  return validateRigConfigMatchesLayoutShape(data)
}
