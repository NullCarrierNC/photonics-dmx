import equal from 'fast-deep-equal'
import { clampDerivedDmxChannel, DMX_CHANNEL_MAX } from '../types'
import type {
  DmxFixture,
  DmxLight,
  DmxRig,
  DmxRigsConfig,
  ExtraChannel,
  LightingConfiguration,
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
 *    a template therefore propagates to every rig light using it.
 *  - Default `strobeValues` (when the rig has no per-light override)
 *  - `extraChannels` — user-added channels beyond the archetype map. `type`/`value` are copied
 *    verbatim; each `channel` is offset-derived from the template the same way the base channels
 *    are (see {@link deriveExtraChannelsForMaster}).
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

type ChannelRecord = Record<string, number>

function channelsAsRecord(channels: DmxFixture['channels']): ChannelRecord {
  return channels as unknown as ChannelRecord
}

/**
 * Derives a rig light's `extraChannels` from its template. `type` and `value` are template-owned and
 * copied verbatim; `channel` follows the same offset model as the base channels —
 * `master + (templateChannel - templateMaster)`. A template channel of 0 means "unassigned" and
 * stays 0 (never offset); a derived result outside 1–512 — off either end — collapses to 0 via
 * {@link clampDerivedDmxChannel} so it can't fail the 0–512 validators. Returns `undefined` for a
 * nullish *or empty* input — never `[]` — so callers can use the set/delete pattern and
 * deep-equality never trips on `[]` vs absent.
 */
export function deriveExtraChannelsForMaster(
  templateExtras: ExtraChannel[] | undefined,
  templateMaster: number,
  master: number,
): ExtraChannel[] | undefined {
  if (!templateExtras?.length) return undefined
  return templateExtras.map((ec) => ({
    ...ec,
    channel: ec.channel === 0 ? 0 : clampDerivedDmxChannel(master + (ec.channel - templateMaster)),
  }))
}

/**
 * Widest offset above the master dimmer that a template occupies, counting base channels and added
 * channels alike. An unassigned (0) extra occupies nothing.
 */
export function templateChannelSpan(template: DmxFixture): number {
  const templateChannels = channelsAsRecord(template.channels)
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
 * Derives every base channel from a master dimmer using the template's own offsets — the offset
 * model this module documents. Results are normalised to the persisted 0/1–512 domain via
 * {@link clampDerivedDmxChannel}.
 */
export function deriveBaseChannelsForMaster(
  template: DmxFixture,
  master: number,
): Record<string, number> {
  const templateChannels = channelsAsRecord(template.channels)
  const templateMaster = templateChannels.masterDimmer ?? 0
  const derived: Record<string, number> = {}
  for (const [channelName, value] of Object.entries(templateChannels)) {
    derived[channelName] =
      channelName === 'masterDimmer'
        ? clampDerivedDmxChannel(master)
        : clampDerivedDmxChannel(master + (value - templateMaster))
  }
  return derived
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

  const rigChannels = channelsAsRecord(light.channels)
  const templateChannels = channelsAsRecord(template.channels)
  const templateMaster = templateChannels.masterDimmer ?? 0
  const rigMaster = rigChannels.masterDimmer ?? templateMaster

  // Channel layout is template-owned. Every channel except masterDimmer is derived from the
  // template's offset relative to its own master dimmer, applied to this rig light's master
  // dimmer. This makes template channel re-layouts propagate to existing rig lights. There is no
  // UI that persists an independent per-light channel number (LightChannelsConfig only edits
  // masterDimmer and recomputes the rest), so nothing legitimate is lost by always deriving.
  // Results land in the persisted 0/1–512 domain, so a fixture addressed near the top of the
  // universe stays saveable; out-of-range channels read as unassigned rather than saturating onto
  // one address (see {@link clampDerivedDmxChannel}).
  const nextChannels: ChannelRecord = deriveBaseChannelsForMaster(template, rigMaster)

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

  // Build the synced light without explicit `undefined` values for optional fields, so deep
  // equality against the (potentially key-less) input doesn't trip on `{key: undefined}` vs absent.
  const synced: DmxLight = {
    ...light,
    fixture: template.fixture,
    label: template.label,
    name: template.name,
    channels: nextChannels as unknown as DmxLight['channels'],
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
