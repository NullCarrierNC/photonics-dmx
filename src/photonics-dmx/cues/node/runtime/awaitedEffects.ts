/**
 * The blocking effects each running context waits on, by context id, as name and layer. A run that
 * is cancelled to start again hands its entries over to the run that replaces it, which claims the
 * names it submits again.
 */

/** An effect a restarted run left up, held for the run that replaced it. */
interface HeldEffect {
  layer: number
  /** The events whose runs were restarted. */
  eventIds: readonly string[]
  /** The restart the effect is held for, until its replacing run ends. */
  restart: object
}

export class AwaitedEffects {
  private readonly byContext = new Map<string, Map<string, number>>()
  private readonly handedOver = new Map<string, HeldEffect>()

  constructor(private readonly removeEffect: (name: string, layer: number) => void) {}

  add(contextId: string, name: string, layer: number): void {
    const awaited = this.byContext.get(contextId) ?? new Map<string, number>()
    awaited.set(name, layer)
    this.byContext.set(contextId, awaited)
  }

  /** Forget one effect once it has settled. */
  settle(contextId: string, name: string): void {
    const awaited = this.byContext.get(contextId)
    awaited?.delete(name)
    if (awaited?.size === 0) this.byContext.delete(contextId)
  }

  /**
   * Hand over what the contexts `runIds` wait on, call `cancel`, which cancels them and returns the
   * effects their raisers leave showing, and then `startAgain`, which starts the replacing run and
   * calls `ended` once that run has ended. Each of those effects stays up until the replacing run
   * claims its name by submitting it again, and is removed when the run ends without it. Effects
   * still held for an earlier restart of these events are held for this one. A name another
   * context also waits on stays up for it, with its waiter.
   */
  restart(
    runIds: ReadonlySet<string>,
    eventIds: readonly string[],
    cancel: () => Map<string, number>,
    startAgain: (ended: () => void) => void,
  ): void {
    const restart = {}
    const hold = (name: string, layer: number): void => {
      this.handedOver.set(name, { layer, eventIds, restart })
    }
    for (const [name, held] of this.handedOver) {
      if (held.eventIds.some((id) => eventIds.includes(id))) hold(name, held.layer)
    }
    const waitedOnElsewhere = new Set<string>()
    for (const [contextId, awaited] of this.byContext) {
      if (!runIds.has(contextId)) for (const name of awaited.keys()) waitedOnElsewhere.add(name)
    }
    for (const contextId of runIds) {
      for (const [name, layer] of this.byContext.get(contextId) ?? []) {
        if (!waitedOnElsewhere.has(name)) hold(name, layer)
      }
      this.byContext.delete(contextId)
    }
    for (const [name, layer] of cancel()) hold(name, layer)
    let starting = true
    let endedWhileStarting = false
    startAgain(() => {
      if (starting) endedWhileStarting = true
      else this.removeHeldFor(restart)
    })
    starting = false
    if (endedWhileStarting) this.removeHeldFor(restart)
  }

  /** Whether `name` was handed over, claiming it for the run submitting it again. */
  claim(name: string): boolean {
    return this.handedOver.delete(name)
  }

  /** Forget every entry, removing the effects still held when `removeHeld` is set. */
  clear(removeHeld: boolean): void {
    this.byContext.clear()
    const held = [...this.handedOver]
    this.handedOver.clear()
    if (removeHeld) for (const [name, { layer }] of held) this.removeEffect(name, layer)
  }

  private removeHeldFor(restart: object): void {
    for (const [name, held] of [...this.handedOver]) {
      if (held.restart !== restart) continue
      this.handedOver.delete(name)
      this.removeEffect(name, held.layer)
    }
  }
}
