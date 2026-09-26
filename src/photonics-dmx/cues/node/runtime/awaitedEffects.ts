/**
 * The blocking effects each running context waits on, by context id, as name and layer. A run that
 * is cancelled to start again hands its entries over to the runs that replace it, which claim the
 * names they submit again.
 */
export class AwaitedEffects {
  private readonly byContext = new Map<string, Map<string, number>>()
  private readonly handedOver = new Map<string, number>()

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
   * effects their raisers leave showing, and then `startAgain`. The runs it starts claim the names
   * they submit again. Every entry left unclaimed after that, and every effect `cancel` returned,
   * is removed.
   */
  restart(
    runIds: ReadonlySet<string>,
    cancel: () => Map<string, number>,
    startAgain: () => void,
  ): void {
    for (const contextId of runIds) {
      for (const [name, layer] of this.byContext.get(contextId) ?? []) {
        this.handedOver.set(name, layer)
      }
      this.byContext.delete(contextId)
    }
    for (const [name, layer] of cancel()) this.handedOver.set(name, layer)
    startAgain()
    const unclaimed = [...this.handedOver]
    this.handedOver.clear()
    for (const [name, layer] of unclaimed) this.removeEffect(name, layer)
  }

  /** Whether `name` was handed over, claiming it for the run submitting it again. */
  claim(name: string): boolean {
    return this.handedOver.delete(name)
  }

  clear(): void {
    this.byContext.clear()
    this.handedOver.clear()
  }
}
