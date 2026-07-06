import type { CueDomain, CueDomainPrefs } from '../../services/configuration/cueDomainTypes'

export interface ReconciledCueGroups {
  /** Group ids to persist as enabled and apply to the registry (ids no longer registered dropped). */
  enabled: string[]
  /** The full registered set, to persist as the new known-groups baseline. */
  known: string[]
}

/** Minimal config surface `persistReconciledGroups` needs; satisfied by ConfigurationManager. */
export interface CueDomainPatchWriter {
  updateCueDomain(domain: CueDomain, patch: Partial<CueDomainPrefs>): Promise<void>
}

/**
 * Reconcile a cue domain's stored enabled/known group ids against the registry's currently
 * registered ids: auto-enable any group never seen before (registered but absent from the known
 * set), then drop any enabled id that is no longer registered so a deleted group is never persisted
 * or applied. The returned `known` is the full registered set, becoming the next baseline.
 */
export function reconcileEnabledGroups(
  storedEnabled: string[] | undefined,
  storedKnown: string[] | undefined,
  registeredIds: string[],
): ReconciledCueGroups {
  const known = new Set(storedKnown ?? [])
  const registered = new Set(registeredIds)
  const newGroups = registeredIds.filter((id) => !known.has(id))
  // Keep stored order, drop deregistered ids, and de-duplicate: a stored id that is also "new"
  // (e.g. it slipped out of a stale knownGroups) must not appear twice in the persisted/applied set.
  const enabled: string[] = []
  const seen = new Set<string>()
  for (const id of [...(storedEnabled ?? []), ...newGroups]) {
    if (registered.has(id) && !seen.has(id)) {
      seen.add(id)
      enabled.push(id)
    }
  }
  return { enabled, known: registeredIds }
}

function sameIds(a: string[], b: string[]): boolean {
  if (a.length !== b.length) {
    return false
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false
    }
  }
  return true
}

/**
 * Persist a reconcile result as one combined write, skipped entirely when it already matches the
 * stored values. Coalescing enabledGroups + knownGroups into a single updateCueDomain call halves
 * the prefs writes and closes the crash window where enabled was persisted against a stale known
 * baseline. Returns whether a write happened.
 */
export async function persistReconciledGroups(
  config: CueDomainPatchWriter,
  domain: CueDomain,
  reconciled: ReconciledCueGroups,
  storedEnabled: string[] | undefined,
  storedKnown: string[] | undefined,
): Promise<boolean> {
  if (
    sameIds(reconciled.enabled, storedEnabled ?? []) &&
    sameIds(reconciled.known, storedKnown ?? [])
  ) {
    return false
  }
  await config.updateCueDomain(domain, {
    enabledGroups: reconciled.enabled,
    knownGroups: reconciled.known,
  })
  return true
}
