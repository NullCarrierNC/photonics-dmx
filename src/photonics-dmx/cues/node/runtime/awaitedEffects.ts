/**
 * The blocking effects each running context waits on, by context id, as name and layer. A run that
 * is cancelled to start again hands its entries over to the runs that replace it, which claim the
 * names they submit again.
 */
export class AwaitedEffects {
  private readonly byContext = new Map<string, Map<string, number>>()
  private readonly handedOver = new Map<string, number>()

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

  /** Hand every entry held for these contexts over to the runs that replace them. */
  handOver(contextIds: Iterable<string>): void {
    for (const contextId of contextIds) {
      for (const [name, layer] of this.byContext.get(contextId) ?? []) {
        this.handedOver.set(name, layer)
      }
      this.byContext.delete(contextId)
    }
  }

  /** Whether `name` was handed over, claiming it for the run submitting it again. */
  claim(name: string): boolean {
    return this.handedOver.delete(name)
  }

  /** Remove and return the handed-over entries no run claimed. */
  takeUnclaimed(): Map<string, number> {
    const unclaimed = new Map(this.handedOver)
    this.handedOver.clear()
    return unclaimed
  }

  clear(): void {
    this.byContext.clear()
    this.handedOver.clear()
  }
}
