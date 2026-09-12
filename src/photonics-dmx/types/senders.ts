/**
 * Per-sender configuration shapes.
 */

export type Senders = 'sacn' | 'ipc' | 'enttecpro' | 'artnet' | 'opendmx'

interface BaseSenderConfig {
  sender: Senders
}

export interface ArtNetSenderConfig extends BaseSenderConfig {
  sender: 'artnet'
  host?: string
  universe?: number
  net?: number
  subnet?: number
  subuni?: number
  port?: number
  base_refresh_interval?: number
  /** Max output rate in Hz (0 = no limit). */
  maxOutputRate?: number
  /**
   * Unified preference field (Hz), normalized on IPC enable into `maxOutputRate` and
   * `base_refresh_interval`.
   */
  refreshRateHz?: number
}

export interface SacnSenderConfig extends BaseSenderConfig {
  sender: 'sacn'
  universe?: number
  networkInterface?: string
  useUnicast?: boolean
  unicastDestination?: string
  /** Max output rate in Hz (0 = no limit) */
  maxOutputRate?: number
  /** sACN library min refresh when payload unchanged (Hz), aligns with `maxOutputRate` when set from prefs. */
  minRefreshRate?: number
  /** Unified preference field (Hz), normalized on IPC enable into `maxOutputRate` and `minRefreshRate`. */
  refreshRateHz?: number
}

export interface SerialSenderConfig extends BaseSenderConfig {
  sender: 'enttecpro' | 'opendmx'
  devicePath?: string
  universe?: number
  dmxSpeed?: number
}

export interface IpcSenderConfig extends BaseSenderConfig {
  sender: 'ipc'
}

export type SenderConfig =
  | ArtNetSenderConfig
  | SacnSenderConfig
  | SerialSenderConfig
  | IpcSenderConfig
