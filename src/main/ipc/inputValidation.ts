import * as os from 'os'
import * as path from 'path'
import * as net from 'net'
import type {
  ArtNetSenderConfig,
  DmxRig,
  IpcSenderConfig,
  LightingConfiguration,
  SacnSenderConfig,
  SenderConfig,
  SerialSenderConfig,
} from '../../photonics-dmx/types'
import { ConfigStrobeType } from '../../photonics-dmx/types'
import type { AppPreferences } from '../../services/configuration/ConfigurationManager'
import {
  CUE_DOMAINS,
  type CueDomain,
  type CueDomainPrefs,
} from '../../services/configuration/cueDomainTypes'
import {
  AUDIO_BAND_GAIN_MAX,
  AUDIO_BAND_GAIN_MIN,
  type AudioGameModeConfig,
} from '../../photonics-dmx/listeners/Audio/AudioTypes'
import type { Brightness, Color, DmxFixture } from '../../photonics-dmx/types'
import { FixtureTypes } from '../../photonics-dmx/types'
import { CueType } from '../../photonics-dmx/cues/types/cueTypes'
import type { AudioCueType } from '../../photonics-dmx/cues/types/audioCueTypes'
import { AudioCueRegistry } from '../../photonics-dmx/cues/registries/AudioCueRegistry'
import {
  artNetBaseRefreshIntervalMs,
  clampDmxOutputRefreshRateHz,
  dmxOutputRefreshRateHzFromUnknownPayload,
} from '../../shared/dmxOutputRefresh'

/**
 * Renderer-supplied IPC payloads MUST be treated as `unknown`. Validators in this module return a
 * `ValidationResult<T>` whose success value is assignable to the corresponding
 * `IpcInvokeMap[Channel]['request']` for the channel that uses them. When you change a request type
 * in `ipcTypes.ts`, update the matching validator's return type here so the contract stays narrow.
 */
export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string }

const SENDER_IDS = new Set(['sacn', 'ipc', 'enttecpro', 'artnet', 'opendmx'])

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export function validateSenderId(value: unknown): ValidationResult<string> {
  if (!isNonEmptyString(value)) {
    return { ok: false, error: 'Sender name is required' }
  }
  if (!SENDER_IDS.has(value)) {
    return { ok: false, error: `Invalid sender: ${value}` }
  }
  return { ok: true, value }
}

export function validateNumberInRange(
  value: unknown,
  min: number,
  max: number,
  fieldName: string,
): ValidationResult<number> {
  const num = Number(value)
  if (!Number.isFinite(num)) {
    return { ok: false, error: `${fieldName} must be a number` }
  }
  if (num < min || num > max) {
    return { ok: false, error: `${fieldName} must be between ${min} and ${max}` }
  }
  return { ok: true, value: num }
}

/**
 * Validates that `value` is one of the literal strings in `allowed`.
 * Accepts a `field` label for the error message.
 */
export function validateStringUnion<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string,
): ValidationResult<T> {
  if (typeof value !== 'string') {
    return { ok: false, error: `${field} must be a string` }
  }
  if (!(allowed as readonly string[]).includes(value)) {
    return { ok: false, error: `${field} must be one of: ${allowed.join(', ')}` }
  }
  return { ok: true, value: value as T }
}

const YARG_AUDIO_MOTION_SELECTION_MODES = ['oncePerSong', 'perCueChange', 'none'] as const
const CUE_GROUP_SELECTION_MODES = ['oncePerSong', 'withinSong'] as const
const STAGE_KIT_PRIORITIES = ['prefer-for-tracked', 'random', 'never'] as const

export type YargAudioMotionSelectionMode = (typeof YARG_AUDIO_MOTION_SELECTION_MODES)[number]
export type CueGroupSelectionMode = (typeof CUE_GROUP_SELECTION_MODES)[number]
export type StageKitPriority = (typeof STAGE_KIT_PRIORITIES)[number]

export function validateMotionSelectionMode(
  value: unknown,
): ValidationResult<YargAudioMotionSelectionMode> {
  return validateStringUnion(value, YARG_AUDIO_MOTION_SELECTION_MODES, 'selection mode')
}

export function validateCueGroupSelectionMode(
  value: unknown,
): ValidationResult<CueGroupSelectionMode> {
  return validateStringUnion(value, CUE_GROUP_SELECTION_MODES, 'cue group selection mode')
}

export function validateStageKitPriority(value: unknown): ValidationResult<StageKitPriority> {
  return validateStringUnion(value, STAGE_KIT_PRIORITIES, 'stage kit priority')
}

const CUE_TYPE_VALUES = new Set<string>(Object.values(CueType))

/**
 * Structural validation for a YARG `CueType`. Returns the narrowed enum value on success.
 */
export function validateCueType(value: unknown): ValidationResult<CueType> {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return { ok: false, error: 'cueType is required' }
  }
  if (!CUE_TYPE_VALUES.has(value)) {
    return { ok: false, error: `cueType '${value}' is not a known CueType` }
  }
  return { ok: true, value: value as CueType }
}

/**
 * Validates an audio cue type against the runtime AudioCueRegistry. Optionally restricts to
 * currently-enabled cues; defaults to the full registered set so handlers can decide.
 */
export function validateAudioCueType(
  value: unknown,
  options: { onlyEnabled?: boolean } = {},
): ValidationResult<AudioCueType> {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return { ok: false, error: 'cueType is required' }
  }
  const registry = AudioCueRegistry.getInstance()
  const known = registry.getAvailableCueTypes(!options.onlyEnabled)
  if (!known.includes(value)) {
    return { ok: false, error: `audio cueType '${value}' is not registered` }
  }
  return { ok: true, value }
}

/**
 * Validates a `{ groupId, cueId }` cue-ref payload (or null). Used by the audio/YARG motion
 * "active cue ref" channels.
 */
export function validateCueRefPayload(
  value: unknown,
): ValidationResult<{ groupId: string; cueId: string } | null> {
  if (value === null || value === undefined) {
    return { ok: true, value: null }
  }
  if (!isPlainObject(value)) {
    return { ok: false, error: 'cue ref must be an object with groupId and cueId' }
  }
  const groupId = typeof value.groupId === 'string' ? value.groupId.trim() : ''
  const cueId = typeof value.cueId === 'string' ? value.cueId.trim() : ''
  if (!groupId || !cueId) {
    return { ok: false, error: 'groupId and cueId are required' }
  }
  return { ok: true, value: { groupId, cueId } }
}

export function validateOptionalStringArray(
  value: unknown,
  fieldName: string,
): ValidationResult<string[]> {
  if (!Array.isArray(value)) {
    return { ok: false, error: `${fieldName} must be an array of strings` }
  }
  for (const entry of value) {
    if (!isNonEmptyString(entry)) {
      return { ok: false, error: `${fieldName} must contain only non-empty strings` }
    }
  }
  return { ok: true, value }
}

/**
 * Validates per-group disabled cue id maps (Preferences → registry).
 */
export function validateDisabledCuesMap(
  value: unknown,
  fieldName: string,
): ValidationResult<Record<string, string[]>> {
  if (!isPlainObject(value)) {
    return { ok: false, error: `${fieldName} must be an object` }
  }
  const out: Record<string, string[]> = {}
  for (const [groupId, arr] of Object.entries(value)) {
    if (!isNonEmptyString(groupId)) {
      return { ok: false, error: `${fieldName} keys must be non-empty strings` }
    }
    if (!Array.isArray(arr)) {
      return { ok: false, error: `${fieldName}.${groupId} must be an array` }
    }
    const ids: string[] = []
    for (const entry of arr) {
      if (!isNonEmptyString(entry)) {
        return { ok: false, error: `${fieldName}.${groupId} must contain only non-empty strings` }
      }
      ids.push(entry.trim())
    }
    out[groupId] = ids
  }
  return { ok: true, value: out }
}

export function validateHost(value: unknown): ValidationResult<string> {
  if (!isNonEmptyString(value)) {
    return { ok: false, error: 'Host must be a non-empty string' }
  }

  const host = value.trim()
  if (net.isIP(host) !== 0) {
    return { ok: true, value: host }
  }

  // Allow DNS-style hostnames only.
  const hostnameRegex = /^(?=.{1,253}$)(?!-)(?:[a-zA-Z0-9-]{1,63}\.)*[a-zA-Z0-9-]{1,63}$/
  if (!hostnameRegex.test(host)) {
    return { ok: false, error: 'Host must be a valid IP address or hostname' }
  }

  return { ok: true, value: host }
}

export function validateSenderEnablePayload(data: unknown): ValidationResult<SenderConfig> {
  if (!isPlainObject(data)) {
    return { ok: false, error: 'Invalid sender payload' }
  }

  const senderValidation = validateSenderId(data.sender)
  if (!senderValidation.ok) {
    return senderValidation
  }

  const sender = senderValidation.value

  switch (sender) {
    case 'ipc': {
      const config: IpcSenderConfig = { sender: 'ipc' }
      return { ok: true, value: config }
    }

    case 'sacn': {
      const universeNum =
        data.universe !== undefined && data.universe !== null ? Number(data.universe) : 1
      const universeValidation = validateNumberInRange(universeNum, 0, 63999, 'SACN universe')
      if (!universeValidation.ok) {
        return universeValidation
      }
      const hz = dmxOutputRefreshRateHzFromUnknownPayload(data as Record<string, unknown>)
      const config: SacnSenderConfig = {
        sender: 'sacn',
        universe: universeValidation.value,
        networkInterface:
          typeof data.networkInterface === 'string' && data.networkInterface.trim() !== ''
            ? data.networkInterface
            : undefined,
        useUnicast: Boolean(data.useUnicast),
        unicastDestination:
          typeof data.unicastDestination === 'string' ? data.unicastDestination : undefined,
        maxOutputRate: hz,
        minRefreshRate: hz,
      }
      return { ok: true, value: config }
    }

    case 'enttecpro': {
      const port = data.devicePath
      if (!isNonEmptyString(port)) {
        return { ok: false, error: 'Port (device path) is required for EnttecPro sender' }
      }
      // We're treating USB adapters as single-universe; always use universe 0
      const config: SerialSenderConfig = {
        sender: 'enttecpro',
        devicePath: port,
        universe: 0,
      }
      return { ok: true, value: config }
    }

    case 'opendmx': {
      const port = data.devicePath
      if (!isNonEmptyString(port)) {
        return { ok: false, error: 'Port (device path) is required for OpenDMX sender' }
      }
      const dmxSpeed =
        typeof data.dmxSpeed === 'number' && data.dmxSpeed > 0 ? data.dmxSpeed : undefined
      // We're treating USB adapters as single-universe; always use universe 0
      const config: SerialSenderConfig = {
        sender: 'opendmx',
        devicePath: port,
        universe: 0,
        dmxSpeed,
      }
      return { ok: true, value: config }
    }

    case 'artnet': {
      const hostValidation = validateHost(
        typeof data.host === 'string' && data.host.trim() !== '' ? data.host : '127.0.0.1',
      )
      if (!hostValidation.ok) {
        return hostValidation
      }
      const universeValidation = validateNumberInRange(
        data.universe !== undefined && data.universe !== null ? Number(data.universe) : 0,
        0,
        32767,
        'ArtNet universe',
      )
      if (!universeValidation.ok) {
        return universeValidation
      }
      const netValidation = validateNumberInRange(
        data.net !== undefined && data.net !== null ? Number(data.net) : 0,
        0,
        127,
        'ArtNet net',
      )
      if (!netValidation.ok) {
        return netValidation
      }
      const subnetValidation = validateNumberInRange(
        data.subnet !== undefined && data.subnet !== null ? Number(data.subnet) : 0,
        0,
        15,
        'ArtNet subnet',
      )
      if (!subnetValidation.ok) {
        return subnetValidation
      }
      const subuniValidation = validateNumberInRange(
        data.subuni !== undefined && data.subuni !== null ? Number(data.subuni) : 0,
        0,
        15,
        'ArtNet subuni',
      )
      if (!subuniValidation.ok) {
        return subuniValidation
      }
      const portNum =
        data.port !== undefined && data.port !== null
          ? Number(data.port)
          : data.artNetPort !== undefined && data.artNetPort !== null
            ? Number(data.artNetPort)
            : 6454
      const portValidation = validateNumberInRange(portNum, 1, 65535, 'ArtNet port')
      if (!portValidation.ok) {
        return portValidation
      }
      const hz = dmxOutputRefreshRateHzFromUnknownPayload(data as Record<string, unknown>)
      const config: ArtNetSenderConfig = {
        sender: 'artnet',
        host: hostValidation.value,
        universe: universeValidation.value,
        net: netValidation.value,
        subnet: subnetValidation.value,
        subuni: subuniValidation.value,
        port: portValidation.value,
        base_refresh_interval: artNetBaseRefreshIntervalMs(hz),
        maxOutputRate: hz,
      }
      return { ok: true, value: config }
    }

    default:
      return { ok: false, error: `Invalid sender: ${sender}` }
  }
}

const VALID_STROBE_TYPES = new Set<string>([
  ConfigStrobeType.None,
  ConfigStrobeType.Dedicated,
  ConfigStrobeType.AllCapable,
])

export function validateLightingConfiguration(
  data: unknown,
): ValidationResult<LightingConfiguration> {
  if (!isPlainObject(data)) {
    return { ok: false, error: 'Light layout payload must be a plain object' }
  }

  const numLights = Number(data.numLights)
  if (!Number.isFinite(numLights) || numLights < 0) {
    return { ok: false, error: 'LightingConfiguration.numLights must be a non-negative number' }
  }

  if (!isPlainObject(data.lightLayout)) {
    return { ok: false, error: 'LightingConfiguration.lightLayout must be a plain object' }
  }
  const lightLayout = data.lightLayout as Record<string, unknown>
  if (typeof lightLayout.id !== 'string' || typeof lightLayout.label !== 'string') {
    return { ok: false, error: 'LightingConfiguration.lightLayout must have id and label strings' }
  }

  if (typeof data.strobeType !== 'string' || !VALID_STROBE_TYPES.has(data.strobeType)) {
    return {
      ok: false,
      error: `LightingConfiguration.strobeType must be one of: ${[...VALID_STROBE_TYPES].join(', ')}`,
    }
  }

  if (!Array.isArray(data.frontLights)) {
    return { ok: false, error: 'LightingConfiguration.frontLights must be an array' }
  }
  if (!Array.isArray(data.backLights)) {
    return { ok: false, error: 'LightingConfiguration.backLights must be an array' }
  }
  if (!Array.isArray(data.strobeLights)) {
    return { ok: false, error: 'LightingConfiguration.strobeLights must be an array' }
  }

  const value: LightingConfiguration = {
    numLights,
    lightLayout: { id: lightLayout.id, label: lightLayout.label },
    strobeType: data.strobeType as ConfigStrobeType,
    frontLights: data.frontLights as LightingConfiguration['frontLights'],
    backLights: data.backLights as LightingConfiguration['backLights'],
    strobeLights: data.strobeLights as LightingConfiguration['strobeLights'],
  }
  return { ok: true, value }
}

export function validateDmxRigPayload(data: unknown): ValidationResult<DmxRig> {
  if (!isPlainObject(data)) {
    return { ok: false, error: 'DmxRig must be a plain object' }
  }
  if (typeof data.id !== 'string' || data.id.trim().length === 0) {
    return { ok: false, error: 'DmxRig.id must be a non-empty string' }
  }
  if (typeof data.name !== 'string' || data.name.trim().length === 0) {
    return { ok: false, error: 'DmxRig.name must be a non-empty string' }
  }
  if (typeof data.active !== 'boolean') {
    return { ok: false, error: 'DmxRig.active must be a boolean' }
  }
  const cfg = validateLightingConfiguration(data.config)
  if (!cfg.ok) {
    return { ok: false, error: `DmxRig.config: ${cfg.error}` }
  }
  return {
    ok: true,
    value: {
      id: data.id.trim(),
      name: data.name.trim(),
      active: data.active,
      config: cfg.value,
    },
  }
}

export function validatePathUnderAllowedRoots(
  targetPath: unknown,
  allowedRoots: string[] = [process.cwd(), os.homedir(), os.tmpdir()],
): ValidationResult<string> {
  if (!isNonEmptyString(targetPath)) {
    return { ok: false, error: 'Path must be a non-empty string' }
  }

  if (targetPath.includes('\0')) {
    return { ok: false, error: 'Path must not contain null bytes' }
  }

  const resolvedTarget = path.resolve(path.normalize(targetPath))
  const resolvedRoots = allowedRoots.map((root) => path.resolve(root))

  const isWithinAllowedRoot = resolvedRoots.some((root) => {
    const relative = path.relative(root, resolvedTarget)
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
  })

  if (!isWithinAllowedRoot) {
    return { ok: false, error: 'Path is outside allowed directories' }
  }

  return { ok: true, value: resolvedTarget }
}

/**
 * Resolves a script name to an absolute path under `appPath/scripts`.
 * `scriptName` must be a single file segment (no path separators, `..`, or NUL).
 */
export function validateNodeScriptPath(
  appPath: string,
  scriptName: string,
): ValidationResult<string> {
  if (typeof scriptName !== 'string' || scriptName.length === 0) {
    return { ok: false, error: 'Script name is required' }
  }
  if (scriptName.includes('\0')) {
    return { ok: false, error: 'Script name must not contain null bytes' }
  }
  if (scriptName === '.' || scriptName === '..') {
    return { ok: false, error: 'Script name must be a base filename' }
  }
  if (scriptName.includes('/') || scriptName.includes('\\')) {
    return { ok: false, error: 'Script name must not contain path separators' }
  }
  if (scriptName !== path.basename(scriptName)) {
    return { ok: false, error: 'Script name must not include path segments' }
  }

  const scriptsRoot = path.resolve(path.join(appPath, 'scripts'))
  const scriptPath = path.join(scriptsRoot, scriptName)
  const resolved = path.resolve(scriptPath)
  const rel = path.relative(scriptsRoot, resolved)
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return { ok: false, error: 'Script must resolve under the app scripts directory' }
  }

  return { ok: true, value: resolved }
}

function isStringArray(x: unknown): x is string[] {
  return Array.isArray(x) && x.every((e) => typeof e === 'string')
}

/**
 * Accepts a partial per-domain update for SAVE_PREFS (merged server-side with stored cueDomains).
 */
function validateCueDomainsPayload(
  data: unknown,
): ValidationResult<Partial<Record<CueDomain, Partial<CueDomainPrefs>>>> {
  if (!isPlainObject(data)) {
    return { ok: false, error: 'cueDomains must be a plain object' }
  }
  const src = data
  const out: Partial<Record<CueDomain, Partial<CueDomainPrefs>>> = {}
  for (const d of CUE_DOMAINS) {
    if (!(d in src) || src[d] == null) {
      continue
    }
    if (!isPlainObject(src[d])) {
      return { ok: false, error: `cueDomains.${d} must be an object` }
    }
    const o = src[d] as Record<string, unknown>
    const partial: Partial<CueDomainPrefs> = {}
    if (o.enabledGroups != null) {
      if (!isStringArray(o.enabledGroups)) {
        return { ok: false, error: `cueDomains.${d}.enabledGroups must be a string[]` }
      }
      partial.enabledGroups = o.enabledGroups
    }
    if (o.knownGroups != null) {
      if (!isStringArray(o.knownGroups)) {
        return { ok: false, error: `cueDomains.${d}.knownGroups must be a string[]` }
      }
      partial.knownGroups = o.knownGroups
    }
    if (o.disabledCues != null) {
      if (!isPlainObject(o.disabledCues)) {
        return { ok: false, error: `cueDomains.${d}.disabledCues must be an object` }
      }
      for (const v of Object.values(o.disabledCues)) {
        if (!isStringArray(v)) {
          return { ok: false, error: `cueDomains.${d}.disabledCues values must be string[]` }
        }
      }

      partial.disabledCues = o.disabledCues as Record<string, string[]>
    }
    if (o.selectionMode != null) {
      if (
        o.selectionMode !== 'oncePerSong' &&
        o.selectionMode !== 'perCueChange' &&
        o.selectionMode !== 'withinSong' &&
        o.selectionMode !== 'none'
      ) {
        return { ok: false, error: `cueDomains.${d}.selectionMode is invalid` }
      }
      partial.selectionMode = o.selectionMode
    }
    if ('activeCueRef' in o) {
      const ar = o.activeCueRef
      if (ar === null) {
        partial.activeCueRef = null
      } else if (
        isPlainObject(ar) &&
        typeof ar.groupId === 'string' &&
        typeof ar.cueId === 'string'
      ) {
        partial.activeCueRef = { groupId: ar.groupId, cueId: ar.cueId }
      } else {
        return { ok: false, error: `cueDomains.${d}.activeCueRef is invalid` }
      }
    }
    if (o.probabilityPercent != null) {
      if (typeof o.probabilityPercent !== 'number' || Number.isNaN(o.probabilityPercent)) {
        return { ok: false, error: `cueDomains.${d}.probabilityPercent must be a number` }
      }
      const r = validateNumberInRange(
        o.probabilityPercent,
        0,
        100,
        `cueDomains.${d}.probabilityPercent`,
      )
      if (!r.ok) {
        return r
      }
      partial.probabilityPercent = Math.round(r.value)
    }
    if (o.minimumHoldMs != null) {
      if (typeof o.minimumHoldMs !== 'number' || Number.isNaN(o.minimumHoldMs)) {
        return { ok: false, error: `cueDomains.${d}.minimumHoldMs must be a number` }
      }
      const r = validateNumberInRange(o.minimumHoldMs, 0, 600000, `cueDomains.${d}.minimumHoldMs`)
      if (!r.ok) {
        return r
      }
      partial.minimumHoldMs = Math.round(r.value)
    }
    if (Object.keys(partial).length > 0) {
      out[d] = partial
    }
  }
  return { ok: true, value: out }
}

const APP_PREFERENCES_KEYS = new Set<keyof AppPreferences>([
  'effectDebounce',
  'complex',
  'enttecProConfig',
  'openDmxConfig',
  'artNetConfig',
  'sacnConfig',
  'brightness',
  'cueDomains',
  'cueConsistencyWindow',
  'clockRate',
  'globalDmxPublishingRateHz',
  'dmxOutputConfig',
  'stageKitPrefs',
  'dmxSettingsPrefs',
  'allowMultipleActiveRigs',
  'advancedModeEnabled',
  'audioConfig',
  'activeAudioCueType',
  'audioGameMode',
  'motionEnabled',
  'simulationSettings',
  'leftMenuCollapsed',
  'windowState',
  'cueEditorWindowState',
  'audioPreviewWindowState',
])

/**
 * Validates a preferences update payload, stripping any keys that are not
 * part of AppPreferences so unexpected data is never persisted.
 */
export function validatePreferencesPayload(
  data: unknown,
): ValidationResult<Partial<AppPreferences>> {
  if (!isPlainObject(data)) {
    return { ok: false, error: 'Preferences payload must be an object' }
  }

  const cleaned: Record<string, unknown> = {}
  for (const key of Object.keys(data)) {
    if (APP_PREFERENCES_KEYS.has(key as keyof AppPreferences)) {
      cleaned[key] = data[key]
    }
  }

  if (Object.keys(cleaned).length === 0) {
    return { ok: false, error: 'Preferences payload contains no valid preference keys' }
  }

  if ('cueConsistencyWindow' in cleaned) {
    const v = validateNumberInRange(cleaned.cueConsistencyWindow, 0, 600000, 'cueConsistencyWindow')
    if (!v.ok) return v
    cleaned.cueConsistencyWindow = Math.round(v.value)
  }

  if ('cueDomains' in cleaned) {
    const d = validateCueDomainsPayload(cleaned.cueDomains)
    if (!d.ok) {
      return d
    }
    cleaned.cueDomains = d.value
  }

  if ('advancedModeEnabled' in cleaned && typeof cleaned.advancedModeEnabled !== 'boolean') {
    return { ok: false, error: 'advancedModeEnabled must be a boolean' }
  }

  if ('globalDmxPublishingRateHz' in cleaned) {
    const hz = cleaned.globalDmxPublishingRateHz
    if (typeof hz !== 'number' || !Number.isFinite(hz)) {
      return { ok: false, error: 'globalDmxPublishingRateHz must be a finite number' }
    }
    cleaned.globalDmxPublishingRateHz = clampDmxOutputRefreshRateHz(hz)
  }

  if ('sacnConfig' in cleaned) {
    const sc = cleaned.sacnConfig
    if (!isPlainObject(sc)) {
      return { ok: false, error: 'sacnConfig must be an object' }
    }
    const next: Record<string, unknown> = { ...sc }
    if ('refreshRateHz' in next) {
      const hz = next.refreshRateHz
      if (typeof hz !== 'number' || Number.isNaN(hz)) {
        return { ok: false, error: 'sacnConfig.refreshRateHz must be a finite number' }
      }
      next.refreshRateHz = clampDmxOutputRefreshRateHz(hz)
    }
    cleaned.sacnConfig = next
  }

  if ('artNetConfig' in cleaned) {
    const ac = cleaned.artNetConfig
    if (!isPlainObject(ac)) {
      return { ok: false, error: 'artNetConfig must be an object' }
    }
    const next: Record<string, unknown> = { ...ac }
    if ('refreshRateHz' in next) {
      const hz = next.refreshRateHz
      if (typeof hz !== 'number' || Number.isNaN(hz)) {
        return { ok: false, error: 'artNetConfig.refreshRateHz must be a finite number' }
      }
      next.refreshRateHz = clampDmxOutputRefreshRateHz(hz)
    }
    cleaned.artNetConfig = next
  }

  return { ok: true, value: cleaned as Partial<AppPreferences> }
}

const AUDIO_CONFIG_KEYS = new Set([
  'deviceId',
  'fftSize',
  'sensitivity',
  'noiseFloor',
  'bands',
  'beatDetection',
  'smoothing',
  'enabled',
  'linearResponse',
  'strobeEnabled',
  'strobeTriggerThreshold',
  'strobeProbability',
  'idleDetection',
])

const VALID_AUDIO_IDLE_COLORS = new Set<Color>([
  'red',
  'blue',
  'yellow',
  'green',
  'cyan',
  'orange',
  'purple',
  'chartreuse',
  'teal',
  'violet',
  'magenta',
  'vermilion',
  'amber',
  'white',
  'black',
  'transparent',
])

const VALID_AUDIO_IDLE_BRIGHTNESS = new Set<Brightness>(['low', 'medium', 'high', 'max', 'linear'])

function validateIdleDetectionPayload(data: unknown): ValidationResult<Record<string, unknown>> {
  if (!isPlainObject(data)) {
    return { ok: false, error: 'idleDetection must be an object' }
  }
  const o = data as Record<string, unknown>
  const out: Record<string, unknown> = {}

  if ('enabled' in o) {
    if (typeof o.enabled !== 'boolean') {
      return { ok: false, error: 'idleDetection.enabled must be a boolean' }
    }
    out.enabled = o.enabled
  }
  if ('thresholdPct' in o) {
    const t = validateNumberInRange(o.thresholdPct, 0, 100, 'idleDetection.thresholdPct')
    if (!t.ok) return t
    out.thresholdPct = t.value
  }
  if ('minIdleSeconds' in o) {
    const t = validateNumberInRange(o.minIdleSeconds, 0, 600, 'idleDetection.minIdleSeconds')
    if (!t.ok) return t
    out.minIdleSeconds = t.value
  }
  if ('resumeSeconds' in o) {
    const t = validateNumberInRange(o.resumeSeconds, 0, 60, 'idleDetection.resumeSeconds')
    if (!t.ok) return t
    out.resumeSeconds = t.value
  }
  if ('idleColor' in o) {
    if (!VALID_AUDIO_IDLE_COLORS.has(o.idleColor as Color)) {
      return { ok: false, error: 'idleDetection.idleColor is not a valid color' }
    }
    out.idleColor = o.idleColor
  }
  if ('idleBrightness' in o) {
    if (!VALID_AUDIO_IDLE_BRIGHTNESS.has(o.idleBrightness as Brightness)) {
      return { ok: false, error: 'idleDetection.idleBrightness is not a valid brightness' }
    }
    out.idleBrightness = o.idleBrightness
  }

  if (Object.keys(out).length === 0) {
    return { ok: false, error: 'idleDetection contains no valid keys' }
  }

  return { ok: true, value: out }
}

/**
 * Validates a single audio band definition
 */
function validateAudioBand(band: unknown): ValidationResult<Record<string, unknown>> {
  if (!isPlainObject(band)) {
    return { ok: false, error: 'Audio band must be an object' }
  }

  const bandObj = band as Record<string, unknown>

  // Validate id
  if (!isNonEmptyString(bandObj.id)) {
    return { ok: false, error: 'Audio band id must be a non-empty string' }
  }

  // Validate name
  if (!isNonEmptyString(bandObj.name)) {
    return { ok: false, error: 'Audio band name must be a non-empty string' }
  }

  // Validate minHz
  const minHzResult = validateNumberInRange(bandObj.minHz, 20, 20000, 'Audio band minHz')
  if (!minHzResult.ok) return minHzResult

  // Validate maxHz
  const maxHzResult = validateNumberInRange(bandObj.maxHz, 20, 20000, 'Audio band maxHz')
  if (!maxHzResult.ok) return maxHzResult

  // Validate minHz < maxHz
  if (minHzResult.value >= maxHzResult.value) {
    return { ok: false, error: 'Audio band minHz must be less than maxHz' }
  }

  // Validate gain
  const gainResult = validateNumberInRange(
    bandObj.gain,
    AUDIO_BAND_GAIN_MIN,
    AUDIO_BAND_GAIN_MAX,
    'Audio band gain',
  )
  if (!gainResult.ok) return gainResult

  return {
    ok: true,
    value: {
      id: bandObj.id,
      name: bandObj.name,
      minHz: minHzResult.value,
      maxHz: maxHzResult.value,
      gain: gainResult.value,
    },
  }
}

/**
 * Validates an audio configuration update payload, stripping unknown keys.
 */
export function validateAudioConfigPayload(
  data: unknown,
): ValidationResult<Record<string, unknown>> {
  if (!isPlainObject(data)) {
    return { ok: false, error: 'Audio configuration payload must be an object' }
  }

  const cleaned: Record<string, unknown> = {}
  for (const key of Object.keys(data)) {
    if (AUDIO_CONFIG_KEYS.has(key)) {
      // Special validation for bands array
      if (key === 'bands') {
        if (!Array.isArray(data[key])) {
          return { ok: false, error: 'Audio bands must be an array' }
        }
        const bandsArray = data[key] as unknown[]
        if (bandsArray.length !== 8) {
          return { ok: false, error: 'Audio bands must contain exactly 8 bands' }
        }
        const validatedBands: Record<string, unknown>[] = []
        for (let i = 0; i < bandsArray.length; i++) {
          const bandResult = validateAudioBand(bandsArray[i])
          if (!bandResult.ok) {
            return { ok: false, error: `Audio band ${i + 1}: ${bandResult.error}` }
          }
          validatedBands.push(bandResult.value)
        }
        cleaned[key] = validatedBands
      } else if (key === 'strobeEnabled') {
        const v = data[key]
        if (typeof v !== 'boolean') {
          return { ok: false, error: 'strobeEnabled must be a boolean' }
        }
        cleaned[key] = v
      } else if (key === 'strobeTriggerThreshold') {
        const t = validateNumberInRange(data[key], 0, 1, 'strobeTriggerThreshold')
        if (!t.ok) {
          return t
        }
        cleaned[key] = t.value
      } else if (key === 'strobeProbability') {
        const t = validateNumberInRange(data[key], 0, 100, 'strobeProbability')
        if (!t.ok) {
          return t
        }
        cleaned[key] = t.value
      } else if (key === 'idleDetection') {
        const idResult = validateIdleDetectionPayload(data[key])
        if (!idResult.ok) {
          return idResult
        }
        cleaned[key] = idResult.value
      } else {
        cleaned[key] = data[key]
      }
    }
  }

  if (Object.keys(cleaned).length === 0) {
    return { ok: false, error: 'Audio configuration payload contains no valid config keys' }
  }

  return { ok: true, value: cleaned }
}

const AUDIO_GAME_MODE_KEYS = new Set(['enabled', 'cueDurationMin', 'cueDurationMax'])

/**
 * Validates a partial game mode update, merges onto `base`, returns full config.
 */
export function validateAudioGameModePayload(
  data: unknown,
  base: AudioGameModeConfig,
): ValidationResult<AudioGameModeConfig> {
  if (!isPlainObject(data)) {
    return { ok: false, error: 'Game mode payload must be an object' }
  }

  const merged: AudioGameModeConfig = { ...base }

  let hadValidKey = false
  for (const key of Object.keys(data)) {
    if (!AUDIO_GAME_MODE_KEYS.has(key)) {
      continue
    }
    hadValidKey = true
    const v = data[key]
    switch (key) {
      case 'enabled':
        if (typeof v !== 'boolean') {
          return { ok: false, error: `${key} must be a boolean` }
        }
        merged[key] = v
        break
      case 'cueDurationMin':
      case 'cueDurationMax': {
        const n = Number(v)
        if (!Number.isFinite(n) || n <= 0) {
          return { ok: false, error: `${key} must be a positive number` }
        }
        merged[key] = n
        break
      }
      default:
        break
    }
  }

  if (!hadValidKey) {
    return { ok: false, error: 'Game mode payload contains no valid keys' }
  }

  if (merged.cueDurationMin > merged.cueDurationMax) {
    return {
      ok: false,
      error: 'cueDurationMin must be less than or equal to cueDurationMax',
    }
  }

  return { ok: true, value: merged }
}

const FIXTURE_TYPE_VALUES = new Set<string>(Object.values(FixtureTypes))

/**
 * Structural validation for CONFIG.SAVE_MY_LIGHTS (user-edited DMX fixture list from the renderer).
 */
export function validateDmxFixturesArray(
  value: unknown,
  fieldName: string = 'lights',
): ValidationResult<DmxFixture[]> {
  if (!Array.isArray(value)) {
    return { ok: false, error: `${fieldName} must be an array` }
  }
  for (let i = 0; i < value.length; i++) {
    const el = value[i]
    if (!isPlainObject(el)) {
      return { ok: false, error: `${fieldName}[${i}] must be an object` }
    }
    if (el.id != null && typeof el.id !== 'string') {
      return { ok: false, error: `${fieldName}[${i}].id must be string or null` }
    }
    if (typeof el.position !== 'number' || !Number.isFinite(el.position)) {
      return { ok: false, error: `${fieldName}[${i}].position must be a number` }
    }
    if (el.fixture == null || !FIXTURE_TYPE_VALUES.has(String(el.fixture))) {
      return { ok: false, error: `${fieldName}[${i}].fixture must be a valid fixture type` }
    }
    if (typeof el.label !== 'string' || typeof el.name !== 'string') {
      return { ok: false, error: `${fieldName}[${i}].label and name must be strings` }
    }
    if (typeof el.isStrobeEnabled !== 'boolean') {
      return { ok: false, error: `${fieldName}[${i}].isStrobeEnabled must be a boolean` }
    }
    if (!isPlainObject(el.channels)) {
      return { ok: false, error: `${fieldName}[${i}].channels must be an object` }
    }
    if (el.strobeValues != null) {
      const strobeValuesError = validateStrobeChannelValues(
        el.strobeValues,
        `${fieldName}[${i}].strobeValues`,
      )
      if (strobeValuesError) {
        return { ok: false, error: strobeValuesError }
      }
    }
  }
  return { ok: true, value: value as DmxFixture[] }
}

const STROBE_VALUE_KEYS = ['slow', 'medium', 'fast', 'fastest'] as const

/**
 * Validates a {@link StrobeChannelValues} record (each slot must be a DMX 0–255 integer).
 * Returns null when valid, or an error message string when not.
 */
function validateStrobeChannelValues(value: unknown, fieldName: string): string | null {
  if (!isPlainObject(value)) {
    return `${fieldName} must be a plain object`
  }
  for (const key of STROBE_VALUE_KEYS) {
    const v = (value as Record<string, unknown>)[key]
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 255) {
      return `${fieldName}.${key} must be an integer between 0 and 255`
    }
  }
  return null
}
