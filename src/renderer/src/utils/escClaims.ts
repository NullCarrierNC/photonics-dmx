/**
 * Transient claims on the Escape key, for interactions that must keep it.
 *
 * The blackout binding listens in the capture phase so it can beat React Flow's node deselect,
 * which means it also beats a drag's own cancel handler. Swallowing that would not merely lose the
 * cancel: a pointer drag stays live and commits on release, so the rig would be quietly rearranged
 * as well as blacked out. A claim marks the stretch of time where Escape means something else.
 *
 * Named for Escape on purpose, even though the blackout key is selectable. A claim is about the key
 * dnd-kit cancels on, not about whichever key blackout happens to be bound to, and the shortcut
 * honours claims only while Escape is the bound key. Renaming this to match the shortcut would
 * invite someone to honour it for every key, which would swallow the panic key mid-drag.
 *
 * Deliberately a module-level set rather than an atom. The key handler needs a synchronous read,
 * and a claim has to hold identically whatever store, if any, encloses the claiming component.
 */

const claims = new Set<symbol>()

/** Claims Escape until the returned function runs. Safe to call the releaser more than once. */
export function claimEscape(): () => void {
  const token = Symbol('escape-claim')
  claims.add(token)
  return () => {
    claims.delete(token)
  }
}

export function isEscapeClaimed(): boolean {
  return claims.size > 0
}

/** Test seam: drops every claim, so one test's leaked claim cannot fail the next. */
export function resetEscapeClaims(): void {
  claims.clear()
}
