import { monotonicNowMs } from '../../shared/time'
import { createLogger } from '../../shared/logger'

const log = createLogger('DelayedDispatchQueue')

/** Backpressure cap. A 500 ms hold is tens of frames, so hitting this means a stalled timer. */
const DEFAULT_MAX_PENDING = 2048

type TimerHandle = ReturnType<typeof setTimeout>

interface Waiting<T> {
  item: T
  arrivedAt: number
}

export interface DelayedDispatchQueueOptions {
  now?: () => number
  maxPending?: number
  /** Timer source. Defaults to real timers; the publisher injects its own so tests can drive it. */
  setTimer?: (cb: () => void, ms: number) => TimerHandle
  clearTimer?: (handle: TimerHandle) => void
}

/**
 * FIFO that defers each item by a caller-supplied delay, preserving arrival order.
 *
 * Deadlines are `arrivedAt + getDelayMs()` evaluated at drain time, not stamped at enqueue, so the
 * delay can change mid-stream without reordering: a decrease makes a run of items due at once and
 * they still leave oldest first. A change is picked up on the next enqueue or timer fire, not when
 * the source value moves.
 *
 * One timer, re-armed from the head after each drain. A delay of 0 with an empty queue dispatches
 * synchronously and arms nothing. At `maxPending` the head is dispatched early, never dropped.
 *
 * {@link clear} is synchronous: a caller tearing output down must call it before blacking out, or
 * held items land after the blackout.
 */
export class DelayedDispatchQueue<T> {
  private readonly waiting: Waiting<T>[] = []
  private timer: TimerHandle | null = null
  private readonly deliver: (item: T) => void
  private readonly getDelayMs: () => number
  private readonly now: () => number
  private readonly maxPending: number
  private readonly setTimer: (cb: () => void, ms: number) => TimerHandle
  private readonly clearTimer: (handle: TimerHandle) => void

  constructor(
    deliver: (item: T) => void,
    getDelayMs: () => number = () => 0,
    options?: DelayedDispatchQueueOptions,
  ) {
    this.deliver = deliver
    this.getDelayMs = getDelayMs
    this.now = options?.now ?? monotonicNowMs
    this.maxPending = options?.maxPending ?? DEFAULT_MAX_PENDING
    this.setTimer = options?.setTimer ?? ((cb, ms) => setTimeout(cb, ms))
    this.clearTimer = options?.clearTimer ?? ((handle) => clearTimeout(handle))
  }

  public get pending(): number {
    return this.waiting.length
  }

  public enqueue(item: T): void {
    if (this.currentDelayMs() <= 0 && this.waiting.length === 0) {
      this.dispatch(item)
      return
    }
    if (this.waiting.length >= this.maxPending) {
      // Early rather than dropped: the head may carry a terminating state (strobe off, blackout).
      const oldest = this.waiting.shift()
      if (oldest) {
        this.dispatch(oldest.item)
      }
    }
    this.waiting.push({ item, arrivedAt: this.now() })
    this.drainDue()
    this.rearm()
  }

  /** Drops pending items and cancels the timer. Synchronous: teardown ordering depends on it. */
  public clear(): void {
    this.waiting.length = 0
    this.stopTimer()
  }

  /** Non-finite, negative or zero reads as no delay. */
  private currentDelayMs(): number {
    const delay = this.getDelayMs()
    return typeof delay === 'number' && Number.isFinite(delay) && delay > 0 ? delay : 0
  }

  private dispatch(item: T): void {
    try {
      this.deliver(item)
    } catch (error) {
      // Swallowed so one bad item cannot stall the drain.
      log.error('Failed to dispatch a delayed item:', error)
    }
  }

  private drainDue(): void {
    const delay = this.currentDelayMs()
    const now = this.now()
    // Head re-read each pass: dispatch can clear the queue (teardown mid-drain), so length and
    // head are not safe to cache across iterations.
    for (;;) {
      const head = this.waiting[0]
      if (!head || head.arrivedAt + delay > now) {
        return
      }
      this.waiting.shift()
      this.dispatch(head.item)
    }
  }

  private rearm(): void {
    this.stopTimer()
    const head = this.waiting[0]
    if (!head) {
      return
    }
    const wait = Math.max(0, Math.ceil(head.arrivedAt + this.currentDelayMs() - this.now()))
    this.timer = this.setTimer(() => {
      this.timer = null
      this.drainDue()
      this.rearm()
    }, wait)
  }

  private stopTimer(): void {
    if (this.timer !== null) {
      this.clearTimer(this.timer)
      this.timer = null
    }
  }
}
