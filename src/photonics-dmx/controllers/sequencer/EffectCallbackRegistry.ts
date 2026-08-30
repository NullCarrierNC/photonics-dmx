import { createLogger } from '../../../shared/logger'

const log = createLogger('EffectCallbackRegistry')

/**
 * Completion callbacks for in-flight effects, keyed by effect name.
 *
 * A blocking graph node parks on one of these, so every registered callback must eventually fire.
 * When effects are force-cleared the callbacks fire with `cancelled = true` rather than being
 * dropped, otherwise the waiting node is never told its action ended and strands its context.
 */
export class EffectCallbackRegistry {
  private callbacks: Map<string, (cancelled: boolean) => void> = new Map()

  /** Register the callback fired when `name` completes, replacing any callback already held. */
  public set(name: string, onComplete: (cancelled: boolean) => void): void {
    this.callbacks.set(name, onComplete)
  }

  /** Drop the callback for `name` without firing it. */
  public remove(name: string): void {
    this.callbacks.delete(name)
  }

  public get(name: string): ((cancelled: boolean) => void) | undefined {
    return this.callbacks.get(name)
  }

  public get size(): number {
    return this.callbacks.size
  }

  /** Fire and drop the callback for `name`, if one is held. */
  public fire(name: string, cancelled = false): void {
    const callback = this.callbacks.get(name)
    if (callback) {
      this.callbacks.delete(name)
      callback(cancelled)
    }
  }

  /** Fire every held callback with `cancelled = true`, then drop them all. */
  public cancelAll(): void {
    const pending = [...this.callbacks.values()]
    this.callbacks.clear()
    for (const callback of pending) {
      try {
        callback(true)
      } catch (err) {
        log.error('Error in cancelled effect completion callback:', err)
      }
    }
  }
}
