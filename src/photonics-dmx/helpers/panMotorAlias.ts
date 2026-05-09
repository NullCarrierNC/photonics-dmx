/**
 * Pan motor angles on wide fixtures (e.g. 540°) repeat every 360°. When mapping offsets
 * to logical pan %, pick an in-range alias instead of clamping at 0/100.
 */

/** Build valid motor angles in `[0, panRangeDeg]` equivalent to `rawMotorDeg` mod 360°. */
function collectPanAliasesInRange(
  rawMotorDeg: number,
  panRangeDeg: number,
): { unique: number[]; clampedFallback: number } {
  if (!Number.isFinite(rawMotorDeg) || !Number.isFinite(panRangeDeg) || panRangeDeg <= 0) {
    return { unique: [], clampedFallback: 0 }
  }

  const candidates: number[] = []
  for (let k = -4; k <= 4; k++) {
    const a = rawMotorDeg + k * 360
    if (a >= -1e-9 && a <= panRangeDeg + 1e-9) {
      candidates.push(Math.max(0, Math.min(panRangeDeg, a)))
    }
  }

  const unique = Array.from(new Set(candidates.map((x) => Math.round(x * 1e6) / 1e6))).sort(
    (x, y) => x - y,
  )
  const clampedFallback = Math.max(0, Math.min(panRangeDeg, rawMotorDeg))
  return { unique, clampedFallback }
}

/**
 * Among 360° aliases, pick the one that best matches a one-shot intent: smallest |k| in
 * `rawMotorDeg + k·360`, then smallest |c − rawMotorDeg| (so 360 wins over 0 when raw is 360).
 */
function pickAliasByIntent(rawMotorDeg: number, unique: number[]): number {
  let best = unique[0]!
  let bestKAbs = Number.POSITIVE_INFINITY
  let bestDist = Number.POSITIVE_INFINITY
  for (const c of unique) {
    const k = Math.round((c - rawMotorDeg) / 360)
    const residual = Math.abs(c - rawMotorDeg - k * 360)
    if (residual > 1e-3) {
      continue
    }
    const kAbs = Math.abs(k)
    const dist = Math.abs(c - rawMotorDeg)
    if (kAbs < bestKAbs - 1e-9 || (Math.abs(kAbs - bestKAbs) < 1e-9 && dist < bestDist - 1e-9)) {
      best = c
      bestKAbs = kAbs
      bestDist = dist
    }
  }
  return best
}

/**
 * Motion paths only: when `rawMotorDeg` is outside `[0, panRangeDeg]`, also consider
 * `clampedFallback` and pick whichever is closer to `preferredMotorDeg` in linear motor distance;
 * on a tie, prefer the clamped edge value.
 */
function preferClampOverAliasWhenOverflowMotion(
  rawMotorDeg: number,
  panRangeDeg: number,
  bestAliasFromUnique: number,
  clampedFallback: number,
  preferredMotorDeg: number,
): number {
  if (!Number.isFinite(preferredMotorDeg)) {
    preferredMotorDeg = 0
  }
  const overflow = rawMotorDeg < -1e-9 || rawMotorDeg > panRangeDeg + 1e-9
  if (!overflow) {
    return bestAliasFromUnique
  }
  const dClamp = Math.abs(clampedFallback - preferredMotorDeg)
  const dAlias = Math.abs(bestAliasFromUnique - preferredMotorDeg)
  if (dClamp < dAlias - 1e-9) {
    return clampedFallback
  }
  if (dAlias < dClamp - 1e-9) {
    return bestAliasFromUnique
  }
  return clampedFallback
}

/**
 * Among aliases, pick closest to `preferredMotorDeg` on the physical motor axis (minimal travel).
 */
function pickAliasByContinuity(unique: number[], preferredMotorDeg: number): number {
  if (!Number.isFinite(preferredMotorDeg)) {
    preferredMotorDeg = 0
  }
  let best = unique[0]!
  let bestDist = Math.abs(best - preferredMotorDeg)
  for (const c of unique) {
    const d = Math.abs(c - preferredMotorDeg)
    if (d < bestDist - 1e-9) {
      best = c
      bestDist = d
    }
  }
  return best
}

export type PanAliasPickMode = 'continuity' | 'continuity-clamp' | 'intent'

/**
 * Returns a physical pan motor angle in `[0, panRangeDeg]` equivalent to `rawMotorDeg`
 * up to 360° repeats.
 *
 * - `continuity`: minimise linear motor distance among aliases (set-position; overflow may wrap).
 * - `continuity-clamp`: like continuity, but when `rawMotorDeg` is outside the pan range,
 *   also consider clamping to 0 or `panRangeDeg` and pick by linear distance (motion cues).
 * - `intent`: prefer the alias with smallest |k| in `rawMotorDeg + k·360` (set-position / bearing).
 */
export function pickAliasedPanMotorDeg(
  rawMotorDeg: number,
  panRangeDeg: number,
  preferredMotorDeg: number,
  mode: PanAliasPickMode = 'continuity',
): number {
  const { unique, clampedFallback } = collectPanAliasesInRange(rawMotorDeg, panRangeDeg)
  if (unique.length === 0) {
    return clampedFallback
  }
  if (mode === 'intent') {
    if (unique.length === 1) {
      return unique[0]!
    }
    return pickAliasByIntent(rawMotorDeg, unique)
  }
  const bestAlias =
    unique.length === 1 ? unique[0]! : pickAliasByContinuity(unique, preferredMotorDeg)
  if (mode === 'continuity-clamp') {
    return preferClampOverAliasWhenOverflowMotion(
      rawMotorDeg,
      panRangeDeg,
      bestAlias,
      clampedFallback,
      preferredMotorDeg,
    )
  }
  return bestAlias
}

/** Logical pan % (0–100) from a physical motor angle in `[0, panRangeDeg]`. */
export function logicalPanPercentFromMotorDeg(motorDeg: number, panRangeDeg: number): number {
  if (!Number.isFinite(motorDeg) || !Number.isFinite(panRangeDeg) || panRangeDeg <= 0) {
    return 0
  }
  const r = Math.max(0, Math.min(panRangeDeg, motorDeg))
  return (r / panRangeDeg) * 100
}
