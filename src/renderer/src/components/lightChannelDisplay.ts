import type { DmxFixture, ExtraChannelType } from '../../../photonics-dmx/types'

/**
 * Shared display helpers for a fixture's channel list — the base (archetype) channels plus any
 * user-added `extraChannels`. DmxChannels, LightChannelsPreview and LightChannelsConfig all sort
 * and label channels from here, so a fixture reads the same way on every screen it appears on.
 */

/** Canonical display order for the archetype channels. Unknown keys sort after, alphabetically. */
export const BASE_CHANNEL_ORDER = [
  'masterDimmer',
  'red',
  'green',
  'blue',
  'white',
  'strobeChannel',
  'pan',
  'tilt',
] as const

/** Sorts `Object.entries(channels)` by {@link BASE_CHANNEL_ORDER}; unknown keys go last, A→Z. */
export function sortBaseChannelEntries<T>(entries: Array<[string, T]>): Array<[string, T]> {
  return [...entries].sort(([a], [b]) => {
    const ia = BASE_CHANNEL_ORDER.indexOf(a as (typeof BASE_CHANNEL_ORDER)[number])
    const ib = BASE_CHANNEL_ORDER.indexOf(b as (typeof BASE_CHANNEL_ORDER)[number])
    if (ia !== -1 && ib !== -1) return ia - ib
    if (ia !== -1) return -1
    if (ib !== -1) return 1
    return a.localeCompare(b)
  })
}

/** User-facing labels for each extra-channel type — the single source for these strings. */
export const EXTRA_CHANNEL_TYPE_LABELS: Record<ExtraChannelType, string> = {
  red: 'Red',
  green: 'Green',
  blue: 'Blue',
  white: 'White',
  warmWhite: 'Warm White',
  coolWhite: 'Cool White',
  amber: 'Amber',
  orange: 'Orange',
  uv: 'UV',
  lime: 'Lime',
  fixed: 'Fixed value',
}

/** The base channel key names that share a type with an extra channel (for numbering). */
const BASE_COLOR_KEYS = new Set<ExtraChannelType>(['red', 'green', 'blue', 'white'])

function baseChannelCountForType(fixture: DmxFixture, type: ExtraChannelType): number {
  if (!BASE_COLOR_KEYS.has(type)) return 0
  return Object.prototype.hasOwnProperty.call(fixture.channels, type) ? 1 : 0
}

/**
 * Numbered display label for `fixture.extraChannels[index]`, e.g. "Red 2". Counting includes the
 * archetype's base channel of that type (so a red added to an RGB fixture is "Red 2"), and rows of
 * a type that has no base channel start at 1 ("Amber", then "Amber 2"). The numeric suffix is
 * omitted when there is only one channel of that type across base + extras.
 */
export function extraChannelDisplayLabel(fixture: DmxFixture, index: number): string {
  const extras = fixture.extraChannels ?? []
  const entry = extras[index]
  if (!entry) return ''
  const label = EXTRA_CHANNEL_TYPE_LABELS[entry.type]
  const base = baseChannelCountForType(fixture, entry.type)

  let ordinalAmongExtras = 0
  extras.forEach((ec, i) => {
    if (ec.type !== entry.type) return
    if (i <= index) ordinalAmongExtras += 1
  })

  // Number = base channels of this type + position among same-type extras. The suffix is omitted
  // only for the very first channel of a type that has no base channel (a lone amber is "Amber",
  // a second is "Amber 2"; a red added to RGB is "Red 2" since the base red is #1).
  const number = base + ordinalAmongExtras
  return number === 1 ? label : `${label} ${number}`
}

/**
 * A fixture is invalid (rendered red) when any base channel number is 0, or any extra channel
 * number is 0 (unassigned). A fixed channel's *value* of 0 is valid — only its channel number
 * counts here.
 */
export function fixtureHasZeroChannel(fixture: DmxFixture): boolean {
  const baseZero = Object.values(fixture.channels).some((v) => v === 0)
  const extraZero = (fixture.extraChannels ?? []).some((ec) => ec.channel === 0)
  return baseZero || extraZero
}

/**
 * DMX channel numbers ( >0 ) assigned more than once across the base channels and extra channels,
 * ascending. Powers a non-blocking "assigned more than once" warning; 0 (unassigned) is ignored.
 */
export function findDuplicateChannelNumbers(fixture: DmxFixture): number[] {
  const counts = new Map<number, number>()
  const add = (n: number): void => {
    if (typeof n === 'number' && n > 0) counts.set(n, (counts.get(n) ?? 0) + 1)
  }
  for (const v of Object.values(fixture.channels)) add(v as number)
  for (const ec of fixture.extraChannels ?? []) add(ec.channel)
  return [...counts.entries()]
    .filter(([, c]) => c > 1)
    .map(([n]) => n)
    .sort((a, b) => a - b)
}
