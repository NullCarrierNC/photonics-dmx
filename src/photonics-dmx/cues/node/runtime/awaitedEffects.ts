/**
 * The blocking effects each running context waits on, by context id, as name and layer. A run that
 * is cancelled to start again takes its entries so the effects can be removed by name.
 */
export class AwaitedEffects {
  private readonly byContext = new Map<string, Map<string, number>>()

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

  /** Remove and return every entry held for these contexts. */
  take(contextIds: Iterable<string>): Map<string, number> {
    const taken = new Map<string, number>()
    for (const contextId of contextIds) {
      for (const [name, layer] of this.byContext.get(contextId) ?? []) taken.set(name, layer)
      this.byContext.delete(contextId)
    }
    return taken
  }

  clear(): void {
    this.byContext.clear()
  }
}
