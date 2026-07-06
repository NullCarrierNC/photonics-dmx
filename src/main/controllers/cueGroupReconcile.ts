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
  const known = storedKnown ?? []
  let enabled = storedEnabled ?? []
  const newGroups = registeredIds.filter((id) => !known.includes(id))
  if (newGroups.length > 0) {
    enabled = [...enabled, ...newGroups]
  }
  enabled = enabled.filter((id) => registeredIds.includes(id))
  return { enabled, known: registeredIds }
}
