/**
 * The effect engines a cue's raisers have running, by raiser key, with the hold each one takes on
 * the context that raised it.
 */
import type { EffectExecutionEngine } from './EffectExecutionEngine'

/** A running effect engine, with the release for whatever hold its raising context took. */
export interface RaisedEffect {
  engine: EffectExecutionEngine
  releaseWaiter: () => void
  /** The id of the context this effect holds open, when it holds one. */
  heldBy?: string
}

/**
 * Cancel and forget the raised effects that hold one of these contexts open, and return the
 * effects they leave showing, by name and layer. Raised effects nothing waits on run on.
 */
export function releaseHeldBy(
  raised: Map<string, RaisedEffect>,
  contextIds: ReadonlySet<string>,
): Map<string, number> {
  const showing = new Map<string, number>()
  for (const [key, { engine, heldBy }] of raised) {
    if (heldBy === undefined || !contextIds.has(heldBy)) continue
    raised.delete(key)
    for (const [name, layer] of engine.cancelLeavingEffects()) showing.set(name, layer)
  }
  return showing
}
