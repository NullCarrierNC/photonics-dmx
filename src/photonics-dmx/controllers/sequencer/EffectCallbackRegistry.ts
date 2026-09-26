import { createLogger } from '../../../shared/logger'

const log = createLogger('EffectCallbackRegistry')

type CompletionCallback = (cancelled: boolean) => void

/**
 * Completion callbacks for in-flight effects, keyed by effect name.
 *
 * A blocking graph node parks on one of these, so every registered callback must eventually fire.
 * When effects are force-cleared the callbacks fire with `cancelled = true` rather than being
 * dropped, otherwise the waiting node is never told its action ended and strands its context.
 *
 * A name can hold more than one callback. A submission refused because the name is already running
 * parks its waiter alongside the one already there, and both fire, in registration order, once the
 * name has finished running.
 */
export class EffectCallbackRegistry {
  private callbacks: Map<string, CompletionCallback[]> = new Map()

  /** Register a callback fired when `name` completes, alongside any already held. */
  public add(name: string, onComplete: CompletionCallback): void {
    const held = this.callbacks.get(name)
    if (held) {
      held.push(onComplete)
    } else {
      this.callbacks.set(name, [onComplete])
    }
  }

  /** Drop every callback for `name` without firing them. */
  public remove(name: string): void {
    this.callbacks.delete(name)
  }

  /** The callbacks held for `name`, in registration order. */
  public get(name: string): ReadonlyArray<CompletionCallback> | undefined {
    return this.callbacks.get(name)
  }

  /** How many names hold at least one callback. */
  public get size(): number {
    return this.callbacks.size
  }

  /**
   * Fire and drop every callback held for `name`.
   *
   * Callbacks run inside the frame, so a waiter that throws is contained here. Letting it out
   * costs the rest of that frame: the effects finishing beside it never hear, their queued
   * successors never start, and the lights hold what they had. A callback registered for the same
   * name while these run is held for that name's next completion, so a waiter that resubmits the
   * name as it hears leaves two callbacks on it, both firing on the next completion.
   */
  public fire(name: string, cancelled = false): void {
    const held = this.callbacks.get(name)
    if (!held) return
    this.callbacks.delete(name)
    for (const callback of held) {
      try {
        callback(cancelled)
      } catch (err) {
        log.error(`Error in completion callback for effect "${name}":`, err)
      }
    }
  }

  /** Fire every held callback with `cancelled = true`, then drop them all. */
  public cancelAll(): void {
    const pending = [...this.callbacks.values()].flat()
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
