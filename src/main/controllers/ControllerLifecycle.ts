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
 * The transitions each phase may move to. A transition outside this table is still performed (the
 * running graph knows more than the table does) but logged as a warning so protocol violations
 * surface in the log instead of silently rewriting history.
 */
const PHASE_TRANSITIONS: Record<LifecyclePhase, readonly LifecyclePhase[]> = {
  initializing: ['running', 'shuttingDown'],
  running: ['restarting', 'consoleMode', 'shuttingDown'],
  restarting: ['running', 'failed', 'shuttingDown'],
  consoleMode: ['running', 'restarting', 'shuttingDown'],
  failed: ['running', 'restarting', 'shuttingDown'],
  shuttingDown: ['stopped'],
  stopped: [],
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
 * - `runExclusiveShutdown` runs off the queue and must never drain it, since queued ops await the
 *   shutdown memo and a shutdown waiting on the queue would deadlock against them.
 * - Off-queue callers (audio toggles) await restart and shutdown through `awaitInFlightWork`.
 *   A queued op must never call that: the restart is itself queued, so a queued op waiting behind
 *   it on the same queue would deadlock. Queued ops use `awaitShutdownWork`.
 */
export class ControllerLifecycle {
  private phaseValue: LifecyclePhase = 'initializing'
  private opChain: Promise<void> = Promise.resolve()

  /** Set while a shutdown is in flight, and kept until it settles. */
  private shutdownPromise: Promise<void> | null = null
  /** Set once a shutdown has fully completed, making further shutdowns a no-op. */
  private shutdownCompleted = false
  /** Set while a restart is in flight so overlapping callers share the one attempt. */
  private restartInFlight: Promise<void> | null = null

  /**
   * @param broadcastPhase Called on every real phase transition so the renderer can disable
   *   actions outside `running` and `consoleMode`.
   */
  constructor(private readonly broadcastPhase: (phase: LifecyclePhase) => void) {}

  public get phase(): LifecyclePhase {
    return this.phaseValue
  }

  /**
   * Single point that mutates the phase, emitting only on a real transition. A transition outside
   * PHASE_TRANSITIONS is performed but logged as a warning.
   */
  public setPhase(next: LifecyclePhase): void {
    if (this.phaseValue === next) return
    if (!PHASE_TRANSITIONS[this.phaseValue].includes(next)) {
      log.warn(`Unexpected lifecycle transition ${this.phaseValue} -> ${next}`)
    }
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

  /** Whether a shutdown has fully completed, making further shutdowns a no-op. */
  public isShutdownComplete(): boolean {
    return this.shutdownCompleted
  }

  /** Whether a shutdown is currently in flight. */
  public isShutdownInFlight(): boolean {
    return this.shutdownPromise !== null
  }

  /** Whether a restart is currently in flight. */
  public isRestartInFlight(): boolean {
    return this.restartInFlight !== null
  }

  /**
   * Run the one-and-only shutdown. A completed shutdown resolves immediately, an in-flight one is
   * shared with the new caller, and only a shutdown whose work resolves marks completion, so a
   * failed teardown clears the memo and can be retried. Completion is marked before the terminal
   * 'stopped' transition, so a failing phase broadcast never re-runs a finished teardown: the
   * retry short-circuits on the completion flag.
   *
   * Runs off the op queue. See the class comment for why it must never drain it.
   */
  public runExclusiveShutdown(work: () => Promise<void>): Promise<void> {
    if (this.shutdownCompleted) {
      return Promise.resolve()
    }
    if (this.shutdownPromise) {
      return this.shutdownPromise
    }

    const run = (async () => {
      await work()
      this.shutdownCompleted = true
      this.setPhase('stopped')
    })()
    this.shutdownPromise = run

    return run.finally(() => {
      this.shutdownPromise = null
    })
  }

  /**
   * Run a restart as a queued lifecycle op, memoized so overlapping callers share the one attempt
   * and the off-queue audio toggles can wait on it. The memo is assigned synchronously so a
   * same-tick second call shares it, and cleared when the attempt settles either way.
   */
  public runSharedRestart(work: () => Promise<void>): Promise<void> {
    if (this.restartInFlight) {
      return this.restartInFlight
    }
    this.restartInFlight = this.runOp(work).finally(() => {
      this.restartInFlight = null
    })
    return this.restartInFlight
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
   * each other and any restart via the queue, but must still yield to the exclusive shutdown
   * (which runs off the queue). Deliberately does NOT await the restart memo.
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
