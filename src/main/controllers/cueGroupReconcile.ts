export interface ReconciledCueGroups {
  /** Group ids to persist as enabled and apply to the registry (ids no longer registered dropped). */
  enabled: string[]
  /** The full registered set, to persist as the new known-groups baseline. */
  known: string[]
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
