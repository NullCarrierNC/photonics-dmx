/**
 * The saved DMX output config and the rate fields that feed it.
 *
 * A write always names all four sender flags, so a config saved before a sender existed comes back
 * complete rather than carrying an absent flag forward. The two rate fields share the DMX-512
 * ceiling but not a floor: the network senders hold to 10 Hz, while OpenDMX is timed by the PC and
 * runs down to 1 Hz.
 */
import {
  clampDmxOutputRefreshRateHz,
  DMX_OUTPUT_REFRESH_RATE_HZ_DEFAULT,
  DMX_OUTPUT_REFRESH_RATE_HZ_MAX,
  OPEN_DMX_DEFAULT_REFRESH_RATE_HZ,
} from '../../../../shared/dmxOutputRefresh'
import type { LightingPreferences } from '../../atoms'

export type DmxOutputConfig = NonNullable<LightingPreferences['dmxOutputConfig']>
export type DmxOutputFlag = keyof DmxOutputConfig

const OUTPUT_FLAGS: DmxOutputFlag[] = [
  'sacnEnabled',
  'artNetEnabled',
  'enttecProEnabled',
  'openDmxEnabled',
]

/** The saved config with one sender's flag set and the other three carried through. */
export function nextOutputConfig(
  current: DmxOutputConfig | undefined,
  flag: DmxOutputFlag,
  enabled: boolean,
): DmxOutputConfig {
  const next = { ...current } as DmxOutputConfig
  for (const name of OUTPUT_FLAGS) {
    next[name] = current?.[name] ?? false
  }
  next[flag] = enabled
  return next
}

/** The config to save on first run, taken from the senders the backend reports running. */
export function outputConfigFromRunningSenders(running: {
  sacn: boolean
  artnet: boolean
  enttecpro: boolean
  opendmx: boolean
}): DmxOutputConfig {
  return {
    sacnEnabled: running.sacn,
    artNetEnabled: running.artnet,
    enttecProEnabled: running.enttecpro,
    openDmxEnabled: running.opendmx,
  }
}

/** The global publishing rate a field carries, held inside the range the DMX-512 wire allows. */
export function parseGlobalPublishingRate(input: string): number {
  const parsed = parseInt(input, 10)
  return clampDmxOutputRefreshRateHz(
    Number.isFinite(parsed) ? parsed : DMX_OUTPUT_REFRESH_RATE_HZ_MAX,
  )
}

/** The OpenDMX send rate a field carries, which reaches below the floor the network senders keep. */
export function parseOpenDmxSpeed(input: string): number {
  const parsed = parseInt(input, 10)
  return Number.isFinite(parsed) && parsed > 0
    ? Math.min(DMX_OUTPUT_REFRESH_RATE_HZ_MAX, Math.max(1, parsed))
    : OPEN_DMX_DEFAULT_REFRESH_RATE_HZ
}

/** A sender's refresh rate, held inside the range the network senders accept. */
export function clampRefreshRateValue(value: string | number | boolean): number {
  return clampDmxOutputRefreshRateHz(
    typeof value === 'number' && Number.isFinite(value)
      ? value
      : DMX_OUTPUT_REFRESH_RATE_HZ_DEFAULT,
  )
}
