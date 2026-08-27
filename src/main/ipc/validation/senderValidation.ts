/**
 * Wire sender payloads: sender ids, rig output routing, hosts and sender enable configuration.
 */

import * as net from 'net'
import type {
  ArtNetSenderConfig,
  IpcSenderConfig,
  SacnSenderConfig,
  SenderConfig,
  SerialSenderConfig,
  WireSenderId,
} from '../../../photonics-dmx/types'
import type { ValidationResult } from './primitives'
import { WIRE_SENDER_IDS } from '../../../photonics-dmx/types'
import {
  artNetBaseRefreshIntervalMs,
  dmxOutputRefreshRateHzFromUnknownPayload,
} from '../../../shared/dmxOutputRefresh'
import { isPlainObject, isNonEmptyString, validateNumberInRange } from './primitives'

const SENDER_IDS = new Set(['sacn', 'ipc', 'enttecpro', 'artnet', 'opendmx'])
const WIRE_SENDER_ID_SET: ReadonlySet<string> = new Set<string>(WIRE_SENDER_IDS)

export function validateSenderId(value: unknown): ValidationResult<string> {
  if (!isNonEmptyString(value)) {
    return { ok: false, error: 'Sender name is required' }
  }
  if (!SENDER_IDS.has(value)) {
    return { ok: false, error: `Invalid sender: ${value}` }
  }
  return { ok: true, value }
}

/**
 * Validates a per-rig mirror flag (`mirrorHoriz` / `mirrorVert`). The field is optional on the
 * wire payload — undefined, missing, or explicit `false` all normalize to `undefined`, which
 * the caller drops from the saved rig so we don't persist the no-op default. Anything other
 * than a boolean is rejected.
 */
export function validateRigMirrorFlag(
  value: unknown,
  field: 'mirrorHoriz' | 'mirrorVert',
): ValidationResult<boolean | undefined> {
  if (value === undefined || value === null) {
    return { ok: true, value: undefined }
  }
  if (typeof value !== 'boolean') {
    return { ok: false, error: `DmxRig.${field} must be a boolean` }
  }
  return { ok: true, value: value === true ? true : undefined }
}

/**
 * Validates a per-rig `outputs` field. The field is optional on the wire payload — undefined or
 * missing means "publish to every enabled wire sender" (legacy default). When present it must be
 * an array of {@link WireSenderId} strings; duplicates are collapsed.
 */
export function validateRigOutputs(value: unknown): ValidationResult<WireSenderId[] | undefined> {
  if (value === undefined || value === null) {
    return { ok: true, value: undefined }
  }
  if (!Array.isArray(value)) {
    return { ok: false, error: 'DmxRig.outputs must be an array of wire sender ids' }
  }
  const seen = new Set<WireSenderId>()
  for (const entry of value) {
    if (typeof entry !== 'string' || !WIRE_SENDER_ID_SET.has(entry)) {
      return {
        ok: false,
        error: `DmxRig.outputs contains invalid wire sender id: ${String(entry)}`,
      }
    }
    seen.add(entry as WireSenderId)
  }
  return { ok: true, value: Array.from(seen) }
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
