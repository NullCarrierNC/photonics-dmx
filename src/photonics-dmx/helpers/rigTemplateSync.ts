import equal from 'fast-deep-equal'
import { clampDerivedDmxChannel, DMX_CHANNEL_MAX, FixtureTypes } from '../types'
import type {
  DmxFixture,
  DmxLight,
  DmxRig,
  DmxRigsConfig,
  ExtraChannel,
  FixtureChannelLayout,
  LightingConfiguration,
  RgbDmxChannels,
  RgbMovingHeadDmxChannels,
} from '../types'

/**
 * Reconciles rig-stored light snapshots with their source fixture templates from MyLights.
 *
 * Rig lights are stored as snapshot copies of the template they were created from, plus per-light
 * state (DMX position, calibration, etc.). When the user edits a template — adds a strobe channel,
 * adds an amber channel, renames, tunes default strobe values — the rig's snapshot doesn't pick up the
 * change automatically. This module owns the reconciliation rules.
 *
 * A rig is an *implementation* of its template: a change to the root template propagates down.
 *
 * **Template-owned** fields are recomputed from the template every time sync runs:
 *  - `fixture`, `label`, `name`
 *  - The entire channel layout. Every channel except `masterDimmer` is derived as
 *    `rigMasterDimmer + (templateChannel - templateMasterDimmer)` — the same offset model
 *    {@link createDmxLightInstance} and LightChannelsConfig use. Re-laying-out channel offsets in
 *    a template therefore propagates to every rig light using it. An unassigned (0) template
 *    channel stays 0, and a rig light with no usable master address derives every channel as 0.
 *  - Default `strobeValues` (when the rig has no per-light override)
 *  - `extraChannels`: user-added channels beyond the archetype map. `type`/`value`/`scale` are
 *    copied verbatim; each `channel` is offset-derived from the template the same way the base
 *    channels are (see {@link deriveExtraChannelsForMaster}).
 *  - `brightnessScaling`: the colour trim. No per-rig override, so the template's value replaces
 *    whatever the snapshot held.
 *  - `config` defaults when the rig has none and the template provides them (e.g. fixture-type
 *    change RGB→RGBMH adds moving-head defaults). Existing rig calibration is preserved.
 *
 * **Rig-owned** fields are preserved across template edits:
 *  - `id`, `fixtureId`, `position`, `group`, `universe`, `mount`
 *  - `masterDimmer` — the light's per-rig DMX start address (the one value the rig owns; all
 *    other channels derive from it plus the template offsets)
 *  - `config` overrides — once a moving-head is calibrated per-light, those stick
 *  - `strobeValues` overrides — when explicitly set per-light
 *  - `isStrobeEnabled` — this is a layout-level toggle (LightChannelsConfig's "Use as strobe"),
 *    not a template property after creation
 *
 * Orphaned rig lights (whose `fixtureId` no longer resolves to a template) are returned unchanged.
 */

/**
 * Places a template channel on a rig light addressed at `master`, by its offset from the template's
 * own master. A template channel of 0 is unassigned and stays 0. A master that is not an address
 * (0, or outside 1-512) gives every channel 0, since the light has no place in the universe. A
 * result outside 1-512 collapses to 0 through {@link clampDerivedDmxChannel}.
 */
function channelAtOffset(templateMaster: number, master: number): (channel: number) => number {
  const address = clampDerivedDmxChannel(master)
  return (channel) =>
    channel === 0 || address === 0
      ? 0
      : clampDerivedDmxChannel(address + (channel - templateMaster))
}

/**
 * Derives a rig light's `extraChannels` from its template. `type`, `value` and `scale` are
 * template-owned and copied verbatim, and `channel` follows the base channels' offset model
 * ({@link channelAtOffset}). Returns `undefined` for a nullish *or empty* input, never `[]`, so
 * callers can use the set/delete pattern and deep-equality never trips on `[]` vs absent.
 */
export function deriveExtraChannelsForMaster(
  templateExtras: ExtraChannel[] | undefined,
  templateMaster: number,
  master: number,
): ExtraChannel[] | undefined {
  if (!templateExtras?.length) return undefined
  const at = channelAtOffset(templateMaster, master)
  return templateExtras.map((ec) => ({ ...ec, channel: at(ec.channel) }))
}

/**
 * Widest offset above the master dimmer that a template occupies, counting base channels and added
 * channels alike. An unassigned (0) extra occupies nothing.
 */
export function templateChannelSpan(template: DmxFixture): number {
  const templateChannels = template.channels
  const templateMaster = templateChannels.masterDimmer ?? 0
  let span = 0
  for (const [channelName, value] of Object.entries(templateChannels)) {
    if (channelName === 'masterDimmer') continue
    span = Math.max(span, value - templateMaster)
  }
  for (const extra of template.extraChannels ?? []) {
    if (extra.channel === 0) continue
    span = Math.max(span, extra.channel - templateMaster)
  }
  return Math.max(0, span)
}

/**
 * Highest DMX address a fixture actually occupies, across its base channels and its added channels.
 * Unassigned (0) channels occupy nothing, so a fixture with none returns 0.
 */
export function highestChannelUsed(fixture: DmxFixture): number {
  const channels = fixture.channels
  let highest = 0
  for (const value of Object.values(channels)) highest = Math.max(highest, value)
  for (const extra of fixture.extraChannels ?? []) highest = Math.max(highest, extra.channel)
  return Math.max(0, highest)
}

/**
 * Highest master dimmer that still leaves room for the whole fixture inside the universe.
 *
 * The master dimmer is the one address a rig owns; every other channel derives from it, so this is
 * the value editors bound. Above it the fixture's upper channels fall outside 1–512, where the IPC
 * validators reject the rig save citing a channel the user never typed directly.
 */
export function maxMasterDimmerForTemplate(template: DmxFixture): number {
  return Math.max(1, DMX_CHANNEL_MAX - templateChannelSpan(template))
}

/**
 * The template's fixture type with every base channel derived from a master dimmer using the
 * template's own offsets ({@link channelAtOffset}). Results land in the persisted 0/1-512 domain,
 * with an unassigned template channel at 0 and every channel at 0 for a master that is not an
 * address.
 */
export function deriveChannelLayoutForMaster(
  template: DmxFixture,
  master: number,
): FixtureChannelLayout {
  const at = channelAtOffset(template.channels.masterDimmer, master)
  const masterDimmer = clampDerivedDmxChannel(master)
  switch (template.fixture) {
    case FixtureTypes.STROBE:
      return {
        fixture: template.fixture,
        channels: { masterDimmer, strobeChannel: at(template.channels.strobeChannel) },
      }
    case FixtureTypes.RGB: {
      const { red, green, blue, strobeChannel } = template.channels
      const channels: RgbDmxChannels = {
        masterDimmer,
        red: at(red),
        green: at(green),
        blue: at(blue),
      }
      if (strobeChannel !== undefined) channels.strobeChannel = at(strobeChannel)
      return { fixture: template.fixture, channels }
    }
    case FixtureTypes.RGBMH: {
      const { red, green, blue, pan, tilt, strobeChannel } = template.channels
      const channels: RgbMovingHeadDmxChannels = {
        masterDimmer,
        red: at(red),
        green: at(green),
        blue: at(blue),
        pan: at(pan),
        tilt: at(tilt),
      }
      if (strobeChannel !== undefined) channels.strobeChannel = at(strobeChannel)
      return { fixture: template.fixture, channels }
    }
  }
}

/**
 * Aligns a single rig light to its current template. Returns the input unchanged (same reference,
 * `changed: false`) when the rig already matches the template OR when no template is found.
 */
export function syncDmxLightWithTemplate(
  light: DmxLight,
  template: DmxFixture | undefined,
): { light: DmxLight; changed: boolean } {
  if (!template) {
    return { light, changed: false }
  }

  const rigChannels = light.channels
  const templateChannels = template.channels
  const templateMaster = templateChannels.masterDimmer
  const rigMaster = rigChannels.masterDimmer

  // Channel layout is template-owned. Every channel except masterDimmer is derived from the
  // template's offset relative to its own master dimmer, applied to this rig light's master
  // dimmer. This makes template channel re-layouts propagate to existing rig lights. There is no
  // UI that persists an independent per-light channel number (LightChannelsConfig only edits
  // masterDimmer and recomputes the rest), so nothing legitimate is lost by always deriving.
  // Results land in the persisted 0/1–512 domain, so a fixture addressed near the top of the
  // universe stays saveable; out-of-range channels read as unassigned rather than saturating onto
  // one address (see {@link clampDerivedDmxChannel}).
  const layout = deriveChannelLayoutForMaster(template, rigMaster)

  // Track whether `strobeChannel` was dropped, so we can clear `strobeValues` accordingly. The
  // template either has a strobeChannel (RGB+S model) or doesn't; the rig's previous state may have
  // had one. If the template no longer has it, any rig-side strobeValues are now meaningless.
  const templateHasStrobeChannel = typeof templateChannels.strobeChannel === 'number'

  // strobeValues: per-light override is preserved when present; otherwise materialize the template's
  // defaults onto the rig light so the publisher reads a self-contained snapshot.
  let nextStrobeValues: DmxLight['strobeValues'] = light.strobeValues
  if (!templateHasStrobeChannel) {
    nextStrobeValues = undefined
  } else if (light.strobeValues == null && template.strobeValues != null) {
    nextStrobeValues = { ...template.strobeValues }
  }

  // config: existing rig calibration always wins. Adopt template's defaults only when the rig has
  // none (e.g. fixture-type changed from non-MH to MH). If the template no longer has a config
  // (e.g. RGBMH → RGB), drop the rig's stale calibration since it's no longer meaningful.
  let nextConfig = light.config
  if (template.config == null) {
    nextConfig = undefined
  } else if (light.config == null) {
    nextConfig = { ...template.config }
  }

  // extraChannels: template-owned. Re-derive the channel numbers from this rig light's master
  // dimmer every sync, so template edits (add/remove/renumber an extra) propagate to rig snapshots.
  const nextExtraChannels = deriveExtraChannelsForMaster(
    template.extraChannels,
    templateMaster,
    rigMaster,
  )

  // brightnessScaling: template-owned outright. It describes the emitters, which every rig using
  // the template shares, so there is no per-light override to preserve.
  const nextBrightnessScaling = template.brightnessScaling
    ? { ...template.brightnessScaling }
    : undefined

  // Build the synced light without explicit `undefined` values for optional fields, so deep
  // equality against the (potentially key-less) input doesn't trip on `{key: undefined}` vs absent.
  const synced: DmxLight = {
    ...light,
    ...layout,
    label: template.label,
    name: template.name,
  }
  if (nextStrobeValues !== undefined) {
    synced.strobeValues = nextStrobeValues
  } else {
    delete synced.strobeValues
  }
  if (nextConfig !== undefined) {
    synced.config = nextConfig
  } else {
    delete synced.config
  }
  if (nextExtraChannels !== undefined) {
    synced.extraChannels = nextExtraChannels
  } else {
    delete synced.extraChannels
  }
  if (nextBrightnessScaling !== undefined) {
    synced.brightnessScaling = nextBrightnessScaling
  } else {
    delete synced.brightnessScaling
  }

  return equal(light, synced) ? { light, changed: false } : { light: synced, changed: true }
}

/**
 * Runs {@link syncDmxLightWithTemplate} across every light in a {@link LightingConfiguration}'s
 * front/back/strobe arrays. Returns the same config reference when nothing changed.
 */
export function syncLightingConfigurationWithUserLights(
  config: LightingConfiguration,
  userLights: DmxFixture[],
): { config: LightingConfiguration; changed: boolean } {
  const findTemplate = (light: DmxLight): DmxFixture | undefined =>
    userLights.find((t) => t.id === light.fixtureId)

  let changed = false
  const syncList = (lights: DmxLight[]): DmxLight[] => {
    const next = lights.map((light) => {
      const r = syncDmxLightWithTemplate(light, findTemplate(light))
      if (r.changed) {
        changed = true
      }
      return r.light
    })
    return changed ? next : lights
  }

  const front = syncList(config.frontLights)
  const back = syncList(config.backLights)
  const strobe = syncList(config.strobeLights)

  if (!changed) {
    return { config, changed: false }
  }

  return {
    config: {
      ...config,
      frontLights: front,
      backLights: back,
      strobeLights: strobe,
    },
    changed: true,
  }
}

/**
 * Walks every rig in a {@link DmxRigsConfig} and reconciles each rig's lights with the current
 * fixture library. Returns the same config reference when nothing changed.
 */
export function syncRigsConfigWithUserLights(
  rigsConfig: DmxRigsConfig,
  userLights: DmxFixture[],
): { config: DmxRigsConfig; changed: boolean } {
  let changed = false
  const nextRigs: DmxRig[] = rigsConfig.rigs.map((rig) => {
    const r = syncLightingConfigurationWithUserLights(rig.config, userLights)
    if (!r.changed) {
      return rig
    }
    changed = true
    return { ...rig, config: r.config }
  })

  if (!changed) {
    return { config: rigsConfig, changed: false }
  }
  return { config: { ...rigsConfig, rigs: nextRigs }, changed: true }
}
