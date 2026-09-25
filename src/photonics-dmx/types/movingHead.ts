/**
 * Pan/tilt channels and the per-fixture configuration that maps normalised positions onto a
 * moving head's physical range.
 */

export type MovingHeadDmxChannels = {
  pan: number
  tilt: number
}

/** Default physical pan range (degrees) when not specified on a fixture. */
export const DEFAULT_PAN_RANGE_DEG = 540
/** Default physical tilt range (degrees) when not specified on a fixture. */
export const DEFAULT_TILT_RANGE_DEG = 180

export interface FixtureConfig {
  /** Normalised home pan: 0 = panMin, 100 = panMax (see panMin/panMax). */
  panHome: number
  panMin: number
  panMax: number
  /** Physical pan travel in degrees (DMX 0-255 maps across this span). */
  panRangeDeg: number
  /**
   * When true, increasing pan DMX rotates the beam clockwise from above (stage convention).
   * When false, increasing pan DMX rotates counter-clockwise from above.
   */
  panDirectionCW: boolean
  /** Normalised home tilt: 0 = tiltMin, 100 = tiltMax. */
  tiltHome: number
  tiltMin: number
  tiltMax: number
  /** Physical tilt travel in degrees (DMX 0-255 maps across this span). */
  tiltRangeDeg: number
  /** Motor angle (deg, 0..panRangeDeg) where beam points upstage (bearing 0). Stage-direction calibration anchor. */
  panStageDeg: number
  /** Motor angle (deg, 0..tiltRangeDeg) where beam points straight up. Tilt calibration anchor. */
  tiltStageDeg: number
  /** When true, pan DMX mirrors around {@link panHome} (e.g. truss vs floor mount). */
  invertPan: boolean
  /** When true, tilt DMX mirrors around {@link tiltHome}. */
  invertTilt: boolean
}

/** The config fields that hold a flag. */
export type FixtureConfigFlagField = {
  [K in keyof FixtureConfig]: FixtureConfig[K] extends boolean ? K : never
}[keyof FixtureConfig]

/** The config fields that hold a number. */
export type FixtureConfigNumberField = Exclude<keyof FixtureConfig, FixtureConfigFlagField>

/** Every config field, in the order the settings list them. */
export const FIXTURE_CONFIG_FIELDS = [
  'panHome',
  'panMin',
  'panMax',
  'panRangeDeg',
  'panDirectionCW',
  'panStageDeg',
  'tiltHome',
  'tiltMin',
  'tiltMax',
  'tiltRangeDeg',
  'tiltStageDeg',
  'invertPan',
  'invertTilt',
] as const satisfies ReadonlyArray<keyof FixtureConfig>

const FIXTURE_CONFIG_FLAG_FIELDS: ReadonlySet<string> = new Set<FixtureConfigFlagField>([
  'panDirectionCW',
  'invertPan',
  'invertTilt',
])

export function isFixtureConfigFlagField(key: keyof FixtureConfig): key is FixtureConfigFlagField {
  return FIXTURE_CONFIG_FLAG_FIELDS.has(key)
}

/** Legacy persisted field, merged in {@link normalizeFixtureConfig} into invertPan/invertTilt. */
export type LegacyFixtureConfigFields = {
  invert?: boolean
}

/**
 * Editable range for a numeric {@link FixtureConfig} field. These are physical/normalised units -
 * degrees, percentages, raw DMX - and deliberately *not* channel numbers, so they share nothing
 * with the DMX channel maximum. Shared by every editor that renders these fields so the input's
 * `min`/`max` and the value it commits can't disagree.
 *
 * `panStageDeg`/`tiltStageDeg` are calibration anchors bounded by their own travel range, so their
 * ceiling comes from the sibling field rather than a constant.
 */
export function fixtureConfigFieldBounds(
  key: keyof FixtureConfig,
  config: FixtureConfig,
): { min: number; max: number } {
  switch (key) {
    case 'panRangeDeg':
      return { min: 1, max: 720 }
    case 'tiltRangeDeg':
      return { min: 1, max: 360 }
    case 'panHome':
    case 'tiltHome':
      return { min: 0, max: 100 }
    case 'panStageDeg':
      return { min: 0, max: config.panRangeDeg }
    case 'tiltStageDeg':
      return { min: 0, max: config.tiltRangeDeg }
    default:
      // panMin/panMax/tiltMin/tiltMax are raw DMX values.
      return { min: 0, max: 255 }
  }
}

/** Full defaults for moving-head fixture config, use {@link normalizeFixtureConfig} for persisted data. */
export const DEFAULT_MOVING_HEAD_FIXTURE_CONFIG: Readonly<FixtureConfig> = {
  panHome: 50,
  panMin: 0,
  panMax: 255,
  panRangeDeg: DEFAULT_PAN_RANGE_DEG,
  panDirectionCW: true,
  panStageDeg: DEFAULT_PAN_RANGE_DEG / 2,
  tiltHome: 50,
  tiltMin: 0,
  tiltMax: 255,
  tiltRangeDeg: DEFAULT_TILT_RANGE_DEG,
  tiltStageDeg: DEFAULT_TILT_RANGE_DEG / 2,
  invertPan: false,
  invertTilt: false,
}

function migrateLegacyHomeDmxToPercent(
  home: number | undefined,
  min: number,
  max: number,
  defaultPercent: number,
): number {
  if (home === undefined || home === null) {
    return defaultPercent
  }
  if (!Number.isFinite(home)) {
    return defaultPercent
  }
  // Legacy stored raw DMX 0-255, so values above 100 are unambiguous.
  if (home > 100) {
    if (max === min) {
      return 50
    }
    const clamped = Math.max(0, Math.min(255, home))
    const pct = Math.max(0, Math.min(100, ((clamped - min) / (max - min)) * 100))
    return Math.round(pct)
  }
  return Math.round(Math.max(0, Math.min(100, home)))
}

/**
 * Merges partial or legacy saved config with defaults (e.g. missing degree-range fields).
 */
export function normalizeFixtureConfig(
  config: (Partial<FixtureConfig> & LegacyFixtureConfigFields) | null | undefined,
): FixtureConfig {
  const c = config ?? {}
  const panMin = c.panMin ?? DEFAULT_MOVING_HEAD_FIXTURE_CONFIG.panMin
  const panMax = c.panMax ?? DEFAULT_MOVING_HEAD_FIXTURE_CONFIG.panMax
  const tiltMin = c.tiltMin ?? DEFAULT_MOVING_HEAD_FIXTURE_CONFIG.tiltMin
  const tiltMax = c.tiltMax ?? DEFAULT_MOVING_HEAD_FIXTURE_CONFIG.tiltMax

  const legacyInvert = c.invert === true
  const invertPan = c.invertPan ?? legacyInvert
  const invertTilt = c.invertTilt ?? legacyInvert

  return {
    panHome: migrateLegacyHomeDmxToPercent(
      c.panHome,
      panMin,
      panMax,
      DEFAULT_MOVING_HEAD_FIXTURE_CONFIG.panHome,
    ),
    panMin,
    panMax,
    panRangeDeg:
      Number.isFinite(c.panRangeDeg) && (c.panRangeDeg as number) > 0
        ? (c.panRangeDeg as number)
        : DEFAULT_MOVING_HEAD_FIXTURE_CONFIG.panRangeDeg,
    panDirectionCW: c.panDirectionCW ?? DEFAULT_MOVING_HEAD_FIXTURE_CONFIG.panDirectionCW,
    panStageDeg:
      Number.isFinite(c.panStageDeg) && (c.panStageDeg as number) >= 0
        ? (c.panStageDeg as number)
        : (Number.isFinite(c.panRangeDeg) && (c.panRangeDeg as number) > 0
            ? (c.panRangeDeg as number)
            : DEFAULT_MOVING_HEAD_FIXTURE_CONFIG.panRangeDeg) / 2,
    tiltHome: migrateLegacyHomeDmxToPercent(
      c.tiltHome,
      tiltMin,
      tiltMax,
      DEFAULT_MOVING_HEAD_FIXTURE_CONFIG.tiltHome,
    ),
    tiltMin,
    tiltMax,
    tiltRangeDeg:
      Number.isFinite(c.tiltRangeDeg) && (c.tiltRangeDeg as number) > 0
        ? (c.tiltRangeDeg as number)
        : DEFAULT_MOVING_HEAD_FIXTURE_CONFIG.tiltRangeDeg,
    tiltStageDeg:
      Number.isFinite(c.tiltStageDeg) && (c.tiltStageDeg as number) >= 0
        ? (c.tiltStageDeg as number)
        : (Number.isFinite(c.tiltRangeDeg) && (c.tiltRangeDeg as number) > 0
            ? (c.tiltRangeDeg as number)
            : DEFAULT_MOVING_HEAD_FIXTURE_CONFIG.tiltRangeDeg) / 2,
    invertPan,
    invertTilt,
  }
}

/**
 * Merges a moving-head {@link FixtureConfig} patch into a base config with UI-consistent clamps
 * (ranges, home %, stage reference degrees).
 */
export function clampMergeMovingHeadFixtureConfig(
  base: FixtureConfig,
  patch: Partial<FixtureConfig>,
): FixtureConfig {
  const merged: FixtureConfig = { ...base, ...patch }
  const panRangeDeg = Math.max(1, Math.min(720, Math.round(merged.panRangeDeg)))
  const tiltRangeDeg = Math.max(1, Math.min(360, Math.round(merged.tiltRangeDeg)))
  const panHome = Math.max(0, Math.min(100, Math.round(merged.panHome)))
  const tiltHome = Math.max(0, Math.min(100, Math.round(merged.tiltHome)))
  const panStageDeg = Math.max(0, Math.min(panRangeDeg, Math.round(merged.panStageDeg)))
  const tiltStageDeg = Math.max(0, Math.min(tiltRangeDeg, Math.round(merged.tiltStageDeg)))
  return normalizeFixtureConfig({
    ...merged,
    panRangeDeg,
    tiltRangeDeg,
    panHome,
    tiltHome,
    panStageDeg,
    tiltStageDeg,
  })
}
