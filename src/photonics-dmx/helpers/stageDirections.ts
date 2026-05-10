/**
 * Stage-relative bearings for moving-head direction mode.
 * Angles increase clockwise when viewed from above (0° at upstage).
 */

export const STAGE_DIRECTION_BEARING_DEG: Readonly<Record<string, number>> = {
  'upstage': 0,
  'upstage-right': 45,
  'stage-right': 90,
  'downstage-right': 135,
  'downstage': 180,
  'downstage-left': 225,
  'stage-left': 270,
  'upstage-left': 315,
}

/** Compass aliases from older cue files; mapped at load time to stage direction names. */
const LEGACY_COMPASS_BEARING_ALIASES: Readonly<Record<string, string>> = {
  n: 'upstage',
  north: 'upstage',
  ne: 'upstage-right',
  e: 'stage-right',
  east: 'stage-right',
  se: 'downstage-right',
  s: 'downstage',
  south: 'downstage',
  sw: 'downstage-left',
  w: 'stage-left',
  west: 'stage-left',
  nw: 'upstage-left',
}

/** Dropdown options for the bearing selector (8-way stage directions). */
export const STAGE_DIRECTION_OPTIONS: ReadonlyArray<{ label: string; value: string }> = [
  { label: 'Upstage (Away from audience)', value: 'upstage' },
  {
    label: 'Upstage-right (Away from audience, audience-left)',
    value: 'upstage-right',
  },
  { label: 'Stage-right (Audience-left)', value: 'stage-right' },
  {
    label: 'Downstage-right (Toward audience, audience-left)',
    value: 'downstage-right',
  },
  { label: 'Downstage (Toward audience)', value: 'downstage' },
  {
    label: 'Downstage-left (Toward audience, audience-right)',
    value: 'downstage-left',
  },
  { label: 'Stage-left (Audience-right)', value: 'stage-left' },
  {
    label: 'Upstage-left (Away from audience, audience-right)',
    value: 'upstage-left',
  },
]

export function normalizeBearingDegrees(deg: number): number {
  if (!Number.isFinite(deg)) {
    return 0
  }
  let x = deg % 360
  if (x < 0) {
    x += 360
  }
  return x
}

const CANONICAL_BEARING_BY_DEG = new Map<number, string>()
for (const { value } of STAGE_DIRECTION_OPTIONS) {
  const deg = STAGE_DIRECTION_BEARING_DEG[value]
  if (deg !== undefined && !CANONICAL_BEARING_BY_DEG.has(deg)) {
    CANONICAL_BEARING_BY_DEG.set(deg, value)
  }
}

/**
 * If `raw` is a legacy compass token, returns its stage-era replacement; otherwise `null`.
 */
export function migrateLegacyBearingToken(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase()
  if (trimmed === '') {
    return null
  }
  const mapped = LEGACY_COMPASS_BEARING_ALIASES[trimmed]
  return mapped ?? null
}

/**
 * Maps a cue literal (degrees or canonical stage direction) to a canonical dropdown value from {@link STAGE_DIRECTION_OPTIONS}.
 */
export function bearingLiteralToCanonicalSelectValue(literal: unknown): string {
  if (typeof literal === 'number') {
    if (!Number.isFinite(literal)) {
      return 'downstage'
    }
    const deg = normalizeBearingDegrees(literal)
    return CANONICAL_BEARING_BY_DEG.get(deg) ?? 'downstage'
  }
  const trimmed = String(literal ?? '')
    .trim()
    .toLowerCase()
  if (trimmed === '') {
    return 'downstage'
  }
  if (STAGE_DIRECTION_OPTIONS.some((o) => o.value === trimmed)) {
    return trimmed
  }
  if (Object.prototype.hasOwnProperty.call(STAGE_DIRECTION_BEARING_DEG, trimmed)) {
    const deg = STAGE_DIRECTION_BEARING_DEG[trimmed]!
    return CANONICAL_BEARING_BY_DEG.get(deg) ?? 'downstage'
  }
  const parsed = Number.parseFloat(trimmed)
  if (Number.isFinite(parsed)) {
    const deg = normalizeBearingDegrees(parsed)
    return CANONICAL_BEARING_BY_DEG.get(deg) ?? 'downstage'
  }
  return 'downstage'
}

/**
 * Resolves a bearing from a cue literal (stage direction name or numeric degrees string) or a number.
 */
export function parseBearingFromResolvedValue(value: string | number): number {
  if (typeof value === 'number') {
    return normalizeBearingDegrees(value)
  }
  const trimmed = value.trim().toLowerCase()
  if (trimmed === '') {
    return 0
  }
  if (Object.prototype.hasOwnProperty.call(STAGE_DIRECTION_BEARING_DEG, trimmed)) {
    return STAGE_DIRECTION_BEARING_DEG[trimmed]!
  }
  const parsed = Number.parseFloat(trimmed)
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid bearing: ${value}`)
  }
  return normalizeBearingDegrees(parsed)
}

/** True when a light's absolute stage bearings should reflect across the SR-SL axis (US/DS swap). */
export function backLightBearingIsFlipped(
  layoutId: string | undefined,
  group: string | undefined,
): boolean {
  return layoutId === 'front-back' && group === 'back'
}

/** Reflect a stage bearing across the SR-SL axis: US<->DS, SR/SL unchanged. */
export function reflectBearingUsDs(bearingDeg: number): number {
  return normalizeBearingDegrees(180 - bearingDeg)
}
