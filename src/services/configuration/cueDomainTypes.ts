/**
 * Shared types for per-domain cue configuration: the YARG, RB3 and audio lighting domains plus a
 * motion domain for each.
 */

export const CUE_DOMAINS = [
  'yarg',
  'audio',
  'rb3',
  'yargMotion',
  'audioMotion',
  'rb3Motion',
] as const

export type CueDomain = (typeof CUE_DOMAINS)[number]

/**
 * Lighting domains use oncePerSong | withinSong; motion domains use oncePerSong | perCueChange |
 * none. Storage uses one union; each domain only reads the subset it supports.
 */
export type CueDomainSelectionMode = 'oncePerSong' | 'perCueChange' | 'withinSong' | 'none'

export interface CueActiveRef {
  groupId: string
  cueId: string
}

export interface CueDomainPrefs {
  enabledGroups: string[]
  knownGroups: string[]
  disabledCues: Record<string, string[]>
  /** Meaning depends on the domain (lighting vs motion), see CueDomainSelectionMode. */
  selectionMode?: CueDomainSelectionMode
  activeCueRef?: CueActiveRef | null
  /** Motion domains: chance (0-100) that an automatic pick plays on a new lighting cue. */
  probabilityPercent?: number
  /** Motion domains: minimum time (ms) an automatic pick is held before another can replace it. */
  minimumHoldMs?: number
  /** Motion domains: randomized switch-timer range (seconds). RB3 arms a switch when a countdown
   *  drawn from [min, max] elapses, then fires on the next trigger edge. */
  cueDurationMin?: number
  cueDurationMax?: number
}

export function createDefaultCueDomainPrefs(
  domain: CueDomain,
  overrides: Partial<CueDomainPrefs> = {},
): CueDomainPrefs {
  const base: CueDomainPrefs = {
    enabledGroups: domain === 'yarg' ? ['stagekit'] : [],
    knownGroups: [],
    disabledCues: {},
  }
  if (domain === 'yarg' || domain === 'rb3') {
    base.selectionMode = 'withinSong'
  } else if (domain === 'yargMotion' || domain === 'audioMotion' || domain === 'rb3Motion') {
    base.selectionMode = 'perCueChange'
    base.probabilityPercent = 50
    base.minimumHoldMs = 5000
    base.activeCueRef = null
    base.cueDurationMin = 5
    base.cueDurationMax = 20
  }
  return {
    ...base,
    ...overrides,
    disabledCues: { ...base.disabledCues, ...overrides.disabledCues },
  }
}

export function createDefaultCueDomains(): Record<CueDomain, CueDomainPrefs> {
  return {
    yarg: createDefaultCueDomainPrefs('yarg'),
    audio: createDefaultCueDomainPrefs('audio'),
    rb3: createDefaultCueDomainPrefs('rb3'),
    yargMotion: createDefaultCueDomainPrefs('yargMotion'),
    audioMotion: createDefaultCueDomainPrefs('audioMotion'),
    rb3Motion: createDefaultCueDomainPrefs('rb3Motion'),
  }
}

export function mergePartialCueDomains(
  current: Record<CueDomain, CueDomainPrefs>,
  partial: Partial<Record<CueDomain, Partial<CueDomainPrefs> | undefined>>,
): Record<CueDomain, CueDomainPrefs> {
  const out: Record<CueDomain, CueDomainPrefs> = { ...current }
  for (const d of CUE_DOMAINS) {
    const p = partial[d]
    if (!p) {
      continue
    }
    const c = out[d]
    out[d] = {
      ...c,
      ...p,
      disabledCues: p.disabledCues ? { ...c.disabledCues, ...p.disabledCues } : c.disabledCues,
    }
  }
  return out
}
