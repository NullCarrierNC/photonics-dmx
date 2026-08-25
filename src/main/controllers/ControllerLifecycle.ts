import type { LifecyclePhase } from '../../shared/ipcTypes'
import { createLogger } from '../../shared/logger'

const log = createLogger('ControllerLifecycle')

/**
 * Thrown when a lifecycle method (typically `init()` invoked from a restart) is called against a
 * controller that has already begun shutting down. Restart routines treat this as a clean abort
 * rather than a reinit failure.
 */
export class LifecycleAbortedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LifecycleAbortedError'
  }
}

/**
 * Phase state and operation ordering for the main-process controller graph.
 *
 * Holds which phase the graph is in, the queue that keeps listener toggles and restarts from
 * interleaving, and the memos for work already in flight. The controller owns what each phase
 * *does*; this owns when a transition is legal and what may run next.
 *
 * Concurrency rules the memos encode:
 * - Queued ops exclude each other, and additionally await any in-flight shutdown.
 * - `shutdown()` runs off the queue and must never drain it, since queued ops await the shutdown
 *   memo and a shutdown waiting on the queue would deadlock against them.
 * - Off-queue callers (audio toggles) await restart and shutdown through `awaitInFlightWork`.
 *   A queued op must never call that: the restart is itself queued, so a queued op waiting behind
 *   it on the same queue would deadlock. Queued ops use `awaitShutdownWork`.
 */
export class ControllerLifecycle {
  private phaseValue: LifecyclePhase = 'initializing'
  private opChain: Promise<void> = Promise.resolve()

  /** Set while a shutdown is in flight, and kept until it settles. */
  public shutdownPromise: Promise<void> | null = null
  /** Set once a shutdown has fully completed, making further shutdowns a no-op. */
  public shutdownCompleted = false
  /** Set while a restart is in flight so overlapping callers share the one attempt. */
  public restartInFlight: Promise<void> | null = null

  /**
   * @param broadcastPhase Called on every real phase transition so the renderer can disable
   *   actions outside `running` and `consoleMode`.
   */
  constructor(private readonly broadcastPhase: (phase: LifecyclePhase) => void) {}

  public get phase(): LifecyclePhase {
    return this.phaseValue
  }

  /** Single point that mutates the phase, emitting only on a real transition. */
  public setPhase(next: LifecyclePhase): void {
    if (this.phaseValue === next) return
    this.phaseValue = next
    this.broadcastPhase(next)
  }

  public assertPhase(allowed: readonly LifecyclePhase[], context: string): void {
    if (!allowed.includes(this.phaseValue)) {
      throw new Error(
        `ControllerManager: invalid lifecycle for ${context} (phase=${this.phaseValue}, allowed=[${allowed.join(
          ', ',
        )}])`,
      )
    }
  }

  /**
   * Wait for any in-flight restart (or shutdown) to settle before mutating audio lifecycle.
   * Errors from the in-flight operation are swallowed here so that the caller can still attempt
   * its own work; the operation that owns the promise is responsible for surfacing its error.
   *
   * Off-queue callers only. See the class comment for why a queued op must not call this.
   */
  public async awaitInFlightWork(): Promise<void> {
    const pending = this.restartInFlight ?? this.shutdownPromise
    if (!pending) return
    try {
      await pending
    } catch {
      // The owner already logged / rethrew; we just needed to wait.
    }
  }

  /**
   * Wait for an in-flight shutdown to settle. Used by queued lifecycle ops, which already exclude
   * each other and any restart via the queue, but must still yield to `shutdown()` (which runs off
   * the queue). Deliberately does NOT await the restart memo.
   */
  public async awaitShutdownWork(): Promise<void> {
    if (!this.shutdownPromise) return
    try {
      await this.shutdownPromise
    } catch {
      // The owner already logged / rethrew; we just needed to wait.
    }
  }

  /**
   * Serialize every listener toggle and controller restart on one queue: each op waits for the
   * previous one to settle (success or failure) before running, so handler slots and rig chains are
   * never built and torn down concurrently.
   */
  public runOp<T>(op: () => Promise<T>): Promise<T> {
    const previous = this.opChain ?? Promise.resolve()
    const run = previous.then(op, op)
    // Flatten so the next op runs regardless of this one's outcome, and log any failure here
    // exactly once so fire-and-forget callers (`void enableYarg()`) don't discard it silently.
    // A LifecycleAbortedError is a clean shutdown/restart abort, not a fault, so log it at info.
    this.opChain = run.then(
      () => undefined,
      (err) => {
        if (err instanceof LifecycleAbortedError) {
          log.info('Lifecycle operation aborted:', err.message)
        } else {
          log.error('Lifecycle operation failed:', err)
        }
      },
    )
    return run
  }
}
