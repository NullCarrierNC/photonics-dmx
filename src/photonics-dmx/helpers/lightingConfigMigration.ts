import type { DmxFixture, DmxLight, DmxRigsConfig, LightingConfiguration } from '../types'
import {
  DEFAULT_STROBE_CHANNEL_VALUES,
  FixtureTypes,
  LEGACY_FIXTURE_RGB_STROBE,
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
 */
export const CURRENT_RIGS_SCHEMA_VERSION = 4

/**
 * Converts a single fixture/light from the pre-v2 strobe model. Only RGB-family fixtures are
 * promoted onto the new `hasStrobeChannel + strobeValues` model — dedicated {@link FixtureTypes.STROBE}
 * fixtures are a different device class (colour-less hardware strobe) and don't consume
 * `strobeValues`; for those we only correct the legacy channel-key name.
 *
 * Specifically:
 *   - `fixture: 'rgb/s'` → `'rgb'` with `channels.strobeChannel` preserved from the legacy
 *     `channels.strobeSpeed` (default 0 if missing) and `strobeValues` seeded with defaults.
 *   - `fixture: 'rgbw/s'` → same for `'rgbw'`.
 *   - `fixture: 'strobe'` keeps its type; the channel key is renamed `strobeSpeed`→`strobeChannel`.
 *     `strobeValues` is **not** seeded for these fixtures (it isn't part of the dedicated-strobe
 *     model).
 *
 * Returns the input unchanged when no migration is needed. Operates on a generic shape so it can
 * be reused for both rig fixtures (`DmxLight`) and the fixture library (`DmxFixture`).
 */
export function migrateFixtureToStrobeChannelSchema<T extends DmxFixture>(
  fixture: T,
): { fixture: T; changed: boolean } {
  const legacyFixtureKey = String(fixture.fixture)
  const isLegacyRgbStrobe = legacyFixtureKey === LEGACY_FIXTURE_RGB_STROBE
  const isLegacyRgbwStrobe = legacyFixtureKey === LEGACY_FIXTURE_RGBW_STROBE
  const channels = (fixture.channels ?? {}) as unknown as Record<string, number>
  const hasLegacyStrobeSpeed = Object.prototype.hasOwnProperty.call(channels, 'strobeSpeed')
  const hasStrobeChannel = Object.prototype.hasOwnProperty.call(channels, 'strobeChannel')
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

  const nextChannels: Record<string, number> = { ...channels }
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

  const next: T = {
    ...fixture,
    channels: nextChannels as unknown as T['channels'],
  }
  if (isLegacyRgbStrobe) {
    next.fixture = FixtureTypes.RGB
  } else if (isLegacyRgbwStrobe) {
    next.fixture = FixtureTypes.RGBW
  }
  if (needsStrobeValuesSeed) {
    next.strobeValues = { ...DEFAULT_STROBE_CHANNEL_VALUES }
  }
  return { fixture: next, changed: true }
}

/**
 * Migrates a list of user-defined fixture templates (the `MyLights` library) for the strobe-channel
 * schema. Returns the original array reference unchanged when no entry needed migration so callers
 * can do a cheap identity check.
 */
export function migrateUserLightsForStrobeChannel(lights: DmxFixture[]): {
  lights: DmxFixture[]
  changed: boolean
} {
  let changed = false
  const next = lights.map((light) => {
    const result = migrateFixtureToStrobeChannelSchema(light)
    if (result.changed) {
      changed = true
    }
    return result.fixture
  })
  return changed ? { lights: next, changed: true } : { lights, changed: false }
}

function isMovingHeadFixture(light: DmxFixture): boolean {
  return light.fixture === FixtureTypes.RGBMH || light.fixture === FixtureTypes.RGBWMH
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
    let current: DmxLight = light
    const strobeResult = migrateFixtureToStrobeChannelSchema(current)
    if (strobeResult.changed) {
      changed = true
      current = strobeResult.fixture
    }
    if (current.mount !== 'floor' && current.mount !== 'ceiling') {
      changed = true
      current = { ...current, mount: deriveMountFromConfig(current) }
    }
    return current
  })
  return { lights: next, changed }
}

export type MigrateLightingConfigurationOptions = {
  /** When true, do not rename legacy `front-back` to `two-rows` (new semantic `front-back` is preserved). */
  skipLegacyRename?: boolean
}

/**
 * Normalizes persisted rig lighting config: optionally renames legacy `front-back` to `two-rows`,
 * and sets `mount` on each fixture when missing.
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

  if (!changed) {
    return { config, changed: false }
  }

  return {
    config: {
      ...config,
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
