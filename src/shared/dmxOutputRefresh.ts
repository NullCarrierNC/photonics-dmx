/**
 * Unified DMX output timing constants (Hz).
 * Network refresh caps live alongside OpenDMX USB `dmxSpeed` default used across prefs and senders.
 */

export const DMX_OUTPUT_REFRESH_RATE_HZ_MIN = 10
export const DMX_OUTPUT_REFRESH_RATE_HZ_MAX = 44
export const DMX_OUTPUT_REFRESH_RATE_HZ_DEFAULT = 40

/** Default OpenDMX USB send rate (Hz); used as `dmxSpeed` default for OpenDMX serial output. */
export const OPEN_DMX_DEFAULT_REFRESH_RATE_HZ = 40

export function clampDmxOutputRefreshRateHz(hz: number): number {
  const rounded = Math.round(hz)
  return Math.min(DMX_OUTPUT_REFRESH_RATE_HZ_MAX, Math.max(DMX_OUTPUT_REFRESH_RATE_HZ_MIN, rounded))
}

/**
 * Normalizes refresh rate from persisted payloads or IPC sender-enable shapes.
 * Prefer `refreshRateHz`; fall back to legacy `maxOutputRate` when it was used as Hz.
 */
export function dmxOutputRefreshRateHzFromUnknownPayload(data: {
  refreshRateHz?: unknown
  maxOutputRate?: unknown
}): number {
  if (typeof data.refreshRateHz === 'number' && Number.isFinite(data.refreshRateHz)) {
    return clampDmxOutputRefreshRateHz(data.refreshRateHz)
  }
  if (
    typeof data.maxOutputRate === 'number' &&
    Number.isFinite(data.maxOutputRate) &&
    data.maxOutputRate > 0
  ) {
    return clampDmxOutputRefreshRateHz(data.maxOutputRate)
  }
  return DMX_OUTPUT_REFRESH_RATE_HZ_DEFAULT
}

/** Maps Hz to dmxnet `base_refresh_interval` (ms); rounds per product choice. */
export function artNetBaseRefreshIntervalMs(refreshRateHz: number): number {
  return Math.round(1000 / refreshRateHz)
}
