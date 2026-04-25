/**
 * Stage-relative compass bearings for moving-head direction mode.
 * North = upstage (0°), angles increase clockwise when viewed from above.
 */

export const STAGE_DIRECTION_BEARING_DEG: Readonly<Record<string, number>> = {
  'n': 0,
  'north': 0,
  'upstage': 0,
  'ne': 45,
  'e': 90,
  'east': 90,
  'stage-right': 90,
  'se': 135,
  's': 180,
  'south': 180,
  'downstage': 180,
  'sw': 225,
  'w': 270,
  'west': 270,
  'stage-left': 270,
  'nw': 315,
}

/** Dropdown options for the bearing selector in the cue editor (8 directions including diagonals). */
export const STAGE_DIRECTION_OPTIONS: ReadonlyArray<{ label: string; value: string }> = [
  { label: 'Downstage (Toward audience)', value: 'downstage' },
  { label: 'Downstage-right (Toward audience, audience-left)', value: 'se' },
  { label: 'Stage-right (Audience-left)', value: 'stage-right' },
  { label: 'Upstage-right (Away from audience, audience-left)', value: 'ne' },
  { label: 'Upstage (Away from audience)', value: 'upstage' },
  { label: 'Upstage-left (Away from audience, audience-right)', value: 'nw' },
  { label: 'Stage-left (Audience-right)', value: 'stage-left' },
  { label: 'Downstage-left (Toward audience, audience-right)', value: 'sw' },
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
 * Maps a cue literal (alias or degrees) to a canonical dropdown value from {@link STAGE_DIRECTION_OPTIONS}.
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
 * Resolves a bearing from a cue literal (named direction or numeric degrees string) or a number.
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
