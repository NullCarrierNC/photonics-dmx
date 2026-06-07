/**
 * Shared types for per-domain cue configuration (YARG, audio, and motion layers).
 */

export const CUE_DOMAINS = ['yarg', 'audio', 'yargMotion', 'audioMotion'] as const

export type CueDomain = (typeof CUE_DOMAINS)[number]

/**
 * YARG and audio *lighting* use oncePerSong | withinSong.
 * YARG and audio *motion* use oncePerSong | perCueChange | none.
 * Storage uses one union; each domain only reads the subset it supports.
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
  /** Meaning depends on domain (YARG lighting vs motion layers). */
  selectionMode?: CueDomainSelectionMode
  activeCueRef?: CueActiveRef | null
  /** YARG motion and audio motion automatic picks only. */
  probabilityPercent?: number
  /** Shared min-hold (ms) for YARG and audio motion automatic picks. */
  minimumHoldMs?: number
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
  if (domain === 'yarg') {
    base.selectionMode = 'withinSong'
  } else if (domain === 'yargMotion' || domain === 'audioMotion') {
    base.selectionMode = 'perCueChange'
    base.probabilityPercent = 50
    base.minimumHoldMs = 5000
    base.activeCueRef = null
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
    yargMotion: createDefaultCueDomainPrefs('yargMotion'),
    audioMotion: createDefaultCueDomainPrefs('audioMotion'),
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
