export interface ReconciledCueGroups {
  /** Group ids to persist as enabled: the stored selection plus groups never seen before. */
  enabled: string[]
  /** The enabled ids registered now, which are the ones applied to the registry. */
  active: string[]
  /** Every group ever registered, to persist as the new known-groups baseline. */
  known: string[]
}

/**
 * Reconcile a cue domain's stored enabled/known group ids against the registry's currently
 * registered ids: auto-enable any group never seen before (registered but absent from the known
 * set), and keep the selection for a known group that is not registered now. A group whose file
 * failed to load keeps the state the user gave it for when it loads again, and only registered ids
 * are applied. An enabled id that was never a known group is dropped.
 */
export function reconcileEnabledGroups(
  storedEnabled: string[] | undefined,
  storedKnown: string[] | undefined,
  registeredIds: string[],
): ReconciledCueGroups {
  const storedKnownIds = storedKnown ?? []
  const knownBefore = new Set(storedKnownIds)
  const registered = new Set(registeredIds)
  const newGroups = registeredIds.filter((id) => !knownBefore.has(id))
  // Keep stored order and de-duplicate: a stored id that is also "new" (e.g. it slipped out of a
  // stale knownGroups) must not appear twice in the persisted/applied set.
  const enabled: string[] = []
  const seen = new Set<string>()
  for (const id of [...(storedEnabled ?? []), ...newGroups]) {
    if ((registered.has(id) || knownBefore.has(id)) && !seen.has(id)) {
      seen.add(id)
      enabled.push(id)
    }
  }
  return {
    enabled,
    active: enabled.filter((id) => registered.has(id)),
    known: [...storedKnownIds, ...newGroups],
  }
}

/** Order-sensitive equality of two id lists, so every domain's "already matches stored, do not
 *  persist" check stays identical. */
export function sameIds(a: readonly string[], b: readonly string[]): boolean {
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
