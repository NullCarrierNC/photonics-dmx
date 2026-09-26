import type { DmxFixture, DmxLight, DmxRigsConfig, LightingConfiguration } from '../types'
import {
  DEFAULT_STROBE_CHANNEL_VALUES,
  FixtureTypes,
  LEGACY_FIXTURE_RGB_STROBE,
  LEGACY_FIXTURE_RGBW,
  LEGACY_FIXTURE_RGBW_MH,
  LEGACY_FIXTURE_RGBW_STROBE,
  normalizeFixtureConfig,
} from '../types'

const TWO_ROWS_LAYOUT = { id: 'two-rows', label: 'Two Rows (one in front of the other)' } as const

/**
 * Written to `DmxRigsConfig.schemaVersion`. Bumped past each one-time migration:
 *  v1 — legacy `front-back` → `two-rows` rename and initial mount backfill.
 *  v2 — `rgb/s`/`rgbw/s` collapsed onto plain `rgb`/`rgbw` with `channels.strobeChannel` and
 *       per-fixture `strobeValues`; legacy `channels.strobeSpeed` renamed to `strobeChannel`.
 *  v3 — rig lights are aligned to their fixture templates on every load (see
 *       {@link syncRigsConfigWithUserLights}); the schema bump simply marks that one-time pass
 *       has run and the stored data is template-aligned at rest.
 *  v4 — `DmxRig.outputs` field added (optional `WireSenderId[]`; undefined = publish to all
 *       enabled wire senders). No data transformation needed — the bump is a marker that this
 *       code understands the new field.
 *  v5 — `DmxRig.mirrorHoriz` / `DmxRig.mirrorVert` flags added (optional booleans; absence =
 *       false). `mirrorHoriz` reverses left/right within each row; `mirrorVert` swaps the
 *       front and back rows. No data transformation needed — the bump is a marker that this
 *       code understands the new fields.
 *  v6 — rig lights may carry `extraChannels` (user-added channels beyond the archetype map),
 *       synced from their templates via the master-dimmer offset model. No data transformation —
 *       the field materialises onto rig snapshots on the first template sync; the bump is a marker
 *       that this code understands it.
 *  v7 — `rgbw`/`rgbw/mh` collapsed onto `rgb`/`rgb/mh` with the white channel moved into an
 *       `extraChannels` entry. The substitution mixer drives a white extra exactly as it drove the
 *       named white channel, so migrated fixtures publish identical DMX.
 *  v8 adds per-colour-channel brightness scaling to rig lights (`brightnessScaling` on the
 *       fixture, `scale` on a colour `extraChannels` entry), synced from their templates. No data
 *       transformation is needed, since an absent field means 100%, so the bump is a marker that
 *       this code understands the fields.
 */
export const CURRENT_RIGS_SCHEMA_VERSION = 8

/**
 * A fixture as any build may have stored it, before the migrations below and the parser in
 * `fixtureParsing` have run. Its type and channel keys are whatever that build wrote.
 */
export type LegacyDmxFixture = { fixture: string; [field: string]: unknown }

function channelsOf(fixture: LegacyDmxFixture): Record<string, unknown> {
  const channels = fixture.channels
  // A fixture read from an older or hand-edited file may carry no channel map at all.
  return typeof channels === 'object' && channels !== null && !Array.isArray(channels)
    ? { ...channels }
    : {}
}

/**
 * Converts a single fixture/light from the pre-v2 strobe model. Only RGB-family fixtures move onto
 * `channels.strobeChannel` plus `strobeValues`. Dedicated {@link FixtureTypes.STROBE} fixtures are
 * a different device class (colour-less hardware strobe) and don't consume `strobeValues`, so for
 * those only the legacy channel-key name is corrected.
 *
 * Specifically:
 *   - `fixture: 'rgb/s'` becomes `'rgb'` with `channels.strobeChannel` preserved from the legacy
 *     `channels.strobeSpeed` (default 0 if missing) and `strobeValues` seeded with defaults.
 *   - `fixture: 'rgbw/s'` becomes `'rgbw'` the same way.
 *   - `fixture: 'strobe'` keeps its type, and the channel key `strobeSpeed` is renamed
 *     `strobeChannel`. `strobeValues` is **not** seeded for these fixtures (it isn't part of the
 *     dedicated-strobe model).
 *
 * Returns the input unchanged when no migration is needed.
 */
export function migrateFixtureToStrobeChannelSchema(fixture: LegacyDmxFixture): {
  fixture: LegacyDmxFixture
  changed: boolean
} {
  const isLegacyRgbStrobe = fixture.fixture === LEGACY_FIXTURE_RGB_STROBE
  const isLegacyRgbwStrobe = fixture.fixture === LEGACY_FIXTURE_RGBW_STROBE
  const nextChannels = channelsOf(fixture)
  const hasLegacyStrobeSpeed = Object.prototype.hasOwnProperty.call(nextChannels, 'strobeSpeed')
  const hasStrobeChannel = Object.prototype.hasOwnProperty.call(nextChannels, 'strobeChannel')
  const needsStrobeValuesSeed =
    (isLegacyRgbStrobe || isLegacyRgbwStrobe) && fixture.strobeValues == null

  if (
    !isLegacyRgbStrobe &&
    !isLegacyRgbwStrobe &&
    !hasLegacyStrobeSpeed &&
    !needsStrobeValuesSeed
  ) {
    return { fixture, changed: false }
  }

  if (hasLegacyStrobeSpeed) {
    const legacyValue = nextChannels.strobeSpeed
    delete nextChannels.strobeSpeed
    if (!hasStrobeChannel) {
      nextChannels.strobeChannel = legacyValue ?? 0
    }
  } else if ((isLegacyRgbStrobe || isLegacyRgbwStrobe) && !hasStrobeChannel) {
    // Legacy template with no explicit channel offset: default to 0 so the user fills it in.
    nextChannels.strobeChannel = 0
  }

  const next: LegacyDmxFixture = { ...fixture, channels: nextChannels }
  if (isLegacyRgbStrobe) {
    next.fixture = FixtureTypes.RGB
  } else if (isLegacyRgbwStrobe) {
    // Lands on the (now legacy) `rgbw` identifier, which the white-channel migration below then
    // collapses to `rgb` + a white extra. Two hops so each migration owns one concern.
    next.fixture = LEGACY_FIXTURE_RGBW
  }
  if (needsStrobeValuesSeed) {
    next.strobeValues = { ...DEFAULT_STROBE_CHANNEL_VALUES }
  }
  return { fixture: next, changed: true }
}

/**
 * Collapses the discrete RGBW archetypes onto RGB(+MH) carrying a `white` {@link ExtraChannel}:
 *   - `fixture: 'rgbw'` becomes `'rgb'`
 *   - `fixture: 'rgbw/mh'` becomes `'rgb/mh'`
 * with `channels.white` removed and re-expressed as `{ type: 'white', channel: <the old number> }`
 * prepended to `extraChannels`, so it still renders directly after the base channels and ahead of
 * anything the user added. The publisher's substitution mixer feeds a white extra into the same
 * white stage the named channel used to seed, so the DMX a migrated fixture publishes is unchanged.
 *
 * A white channel of 0 (unassigned) migrates to an extra of 0, which the validity rules already
 * flag exactly as the unassigned base channel did. Returns the input unchanged when no migration
 * is needed, so this is idempotent and cheap to run on every load.
 */
export function migrateFixtureWhiteToExtraChannel(fixture: LegacyDmxFixture): {
  fixture: LegacyDmxFixture
  changed: boolean
} {
  const isLegacyRgbw = fixture.fixture === LEGACY_FIXTURE_RGBW
  const isLegacyRgbwMh = fixture.fixture === LEGACY_FIXTURE_RGBW_MH
  if (!isLegacyRgbw && !isLegacyRgbwMh) {
    return { fixture, changed: false }
  }

  const nextChannels = channelsOf(fixture)
  const whiteChannel = nextChannels.white
  delete nextChannels.white

  const next: LegacyDmxFixture = {
    ...fixture,
    fixture: isLegacyRgbw ? FixtureTypes.RGB : FixtureTypes.RGBMH,
    channels: nextChannels,
  }
  // A template without a white key keeps its extras untouched. There is no channel number to
  // carry over, and inventing an unassigned row would fail the fixture's validity check.
  if (typeof whiteChannel === 'number') {
    const extras = Array.isArray(fixture.extraChannels) ? fixture.extraChannels : []
    next.extraChannels = [{ type: 'white', channel: whiteChannel }, ...extras]
  }
  return { fixture: next, changed: true }
}

/**
 * Fixture keys older builds wrote that nothing reads. The layout editor added `strobeMode` to every
 * light on a rig with strobe type None.
 */
const RETIRED_FIXTURE_KEYS = ['strobeMode'] as const

/** Removes the {@link RETIRED_FIXTURE_KEYS}, which carry no setting to keep. */
function dropRetiredFixtureKeys(fixture: LegacyDmxFixture): {
  fixture: LegacyDmxFixture
  changed: boolean
} {
  if (!RETIRED_FIXTURE_KEYS.some((key) => key in fixture)) {
    return { fixture, changed: false }
  }
  const next: LegacyDmxFixture = { ...fixture }
  for (const key of RETIRED_FIXTURE_KEYS) delete next[key]
  return { fixture: next, changed: true }
}

/**
 * Every one-time fixture-shape migration, in order: retired keys dropped, the strobe-channel schema
 * (which can land a `rgbw/s` template on the legacy `rgbw` identifier), then the RGBW white-channel
 * collapse. Loading a template or a rig light runs these before parsing it (see `fixtureParsing`).
 */
export function migrateFixtureSchema(fixture: LegacyDmxFixture): {
  fixture: LegacyDmxFixture
  changed: boolean
} {
  const retired = dropRetiredFixtureKeys(fixture)
  const strobe = migrateFixtureToStrobeChannelSchema(retired.fixture)
  const white = migrateFixtureWhiteToExtraChannel(strobe.fixture)
  return {
    fixture: white.fixture,
    changed: retired.changed || strobe.changed || white.changed,
  }
}

function isMovingHeadFixture(light: DmxFixture): boolean {
  return light.fixture === FixtureTypes.RGBMH
}

function deriveMountFromConfig(light: DmxFixture): 'floor' | 'ceiling' {
  if (!isMovingHeadFixture(light)) {
    return 'floor'
  }
  const c = normalizeFixtureConfig(light.config)
  return c.invertPan === true && c.invertTilt === true ? 'ceiling' : 'floor'
}

function migrateLights(lights: DmxLight[]): { lights: DmxLight[]; changed: boolean } {
  let changed = false
  const next = lights.map((light) => {
    if (light.mount === 'floor' || light.mount === 'ceiling') {
      return light
    }
    changed = true
    return { ...light, mount: deriveMountFromConfig(light) }
  })
  return { lights: next, changed }
}

export type MigrateLightingConfigurationOptions = {
  /** When true, do not rename legacy `front-back` to `two-rows` (new semantic `front-back` is preserved). */
  skipLegacyRename?: boolean
}

/**
 * Normalizes persisted rig lighting config: optionally renames legacy `front-back` to `two-rows`,
 * sets `mount` on each fixture when missing, and brings a `numLights` above the front and back
 * light count down to that count.
 *
 * The Lights Layout editor writes `numLights` as the front and back light count, and on open adds
 * lights until the rig has that many. A rig with no lights keeps its count, which the editor builds
 * that many lights from.
 */
export function migrateLightingConfiguration(
  config: LightingConfiguration,
  options?: MigrateLightingConfigurationOptions,
): {
  config: LightingConfiguration
  changed: boolean
} {
  let changed = false
  let lightLayout = config.lightLayout
  if (!options?.skipLegacyRename && lightLayout?.id === 'front-back') {
    lightLayout = { id: TWO_ROWS_LAYOUT.id, label: TWO_ROWS_LAYOUT.label }
    changed = true
  }

  const front = migrateLights(config.frontLights)
  const back = migrateLights(config.backLights)
  const strobe = migrateLights(config.strobeLights)
  if (front.changed || back.changed || strobe.changed) {
    changed = true
  }

  const primaryCount = config.frontLights.length + config.backLights.length
  const numLights =
    primaryCount > 0 && config.numLights > primaryCount ? primaryCount : config.numLights
  if (numLights !== config.numLights) {
    changed = true
  }

  if (!changed) {
    return { config, changed: false }
  }

  return {
    config: {
      ...config,
      numLights,
      lightLayout,
      frontLights: front.lights,
      backLights: back.lights,
      strobeLights: strobe.lights,
    },
    changed: true,
  }
}

export function migrateDmxRigsConfig(input: DmxRigsConfig): {
  config: DmxRigsConfig
  changed: boolean
} {
  // The legacy `front-back` → `two-rows` rename was the v1 migration. Any config that has been
  // stamped at v1 or beyond has already had it applied — anything still named `front-back` at
  // that point is intentional user-authored data and must be preserved across future schema bumps.
  const renameMigrationApplied = (input.schemaVersion ?? 0) >= 1
  const atCurrentVersion = input.schemaVersion === CURRENT_RIGS_SCHEMA_VERSION

  const nextRigs = input.rigs.map((rig) => {
    const { config, changed } = migrateLightingConfiguration(rig.config, {
      skipLegacyRename: renameMigrationApplied,
    })
    return changed ? { ...rig, config } : rig
  })

  const rigsMutated = nextRigs.some((rig, i) => rig !== input.rigs[i])
  const needSchemaStamp = !atCurrentVersion

  if (!rigsMutated && !needSchemaStamp) {
    return { config: input, changed: false }
  }

  return {
    config: {
      ...input,
      rigs: nextRigs,
      schemaVersion: CURRENT_RIGS_SCHEMA_VERSION,
    },
    changed: true,
  }
}
