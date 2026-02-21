import * as os from 'os'
import * as path from 'path'
import * as net from 'net'
import type {
  ArtNetSenderConfig,
  IpcSenderConfig,
  LightingConfiguration,
  SacnSenderConfig,
  SenderConfig,
  SerialSenderConfig,
} from '../../photonics-dmx/types'
import { ConfigStrobeType } from '../../photonics-dmx/types'
import type { AppPreferences } from '../../services/configuration/ConfigurationManager'

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
      }
      return { ok: true, value: config }
    }

    case 'enttecpro': {
      const port = data.port
      if (!isNonEmptyString(port)) {
        return { ok: false, error: 'Port (device path) is required for EnttecPro sender' }
      }
      const universeNum =
        data.universe !== undefined && data.universe !== null ? Number(data.universe) : 0
      const universeValidation = validateNumberInRange(universeNum, 0, 63999, 'EnttecPro universe')
      if (!universeValidation.ok) {
        return universeValidation
      }
      const config: SerialSenderConfig = {
        sender: 'enttecpro',
        devicePath: port,
        universe: universeValidation.value,
      }
      return { ok: true, value: config }
    }

    case 'opendmx': {
      const port = data.port
      if (!isNonEmptyString(port)) {
        return { ok: false, error: 'Port (device path) is required for OpenDMX sender' }
      }
      const universeNum =
        data.universe !== undefined && data.universe !== null ? Number(data.universe) : 0
      const universeValidation = validateNumberInRange(universeNum, 0, 63999, 'OpenDMX universe')
      if (!universeValidation.ok) {
        return universeValidation
      }
      const dmxSpeed =
        typeof data.dmxSpeed === 'number' && data.dmxSpeed > 0 ? data.dmxSpeed : undefined
      const config: SerialSenderConfig = {
        sender: 'opendmx',
        devicePath: port,
        universe: universeValidation.value,
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
      const config: ArtNetSenderConfig = {
        sender: 'artnet',
        host: hostValidation.value,
        universe: universeValidation.value,
        net: netValidation.value,
        subnet: subnetValidation.value,
        subuni: subuniValidation.value,
        port: portValidation.value,
        base_refresh_interval: 1000,
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

const APP_PREFERENCES_KEYS = new Set<keyof AppPreferences>([
  'effectDebounce',
  'complex',
  'enttecProConfig',
  'openDmxConfig',
  'artNetConfig',
  'sacnConfig',
  'brightness',
  'enabledCueGroups',
  'enabledAudioCueGroups',
  'cueConsistencyWindow',
  'clockRate',
  'dmxOutputConfig',
  'stageKitPrefs',
  'dmxSettingsPrefs',
  'allowMultipleActiveRigs',
  'audioConfig',
  'activeAudioCueType',
  'simulationSettings',
  'leftMenuCollapsed',
  'windowState',
  'cueEditorWindowState',
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

  return { ok: true, value: cleaned as Partial<AppPreferences> }
}

const AUDIO_CONFIG_KEYS = new Set([
  'deviceId',
  'fftSize',
  'sensitivity',
  'beatDetection',
  'smoothing',
  'frequencyBands',
  'enabled',
])

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
      cleaned[key] = data[key]
    }
  }

  if (Object.keys(cleaned).length === 0) {
    return { ok: false, error: 'Audio configuration payload contains no valid config keys' }
  }

  return { ok: true, value: cleaned }
}
