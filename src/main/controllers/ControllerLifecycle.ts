import type { LifecyclePhase } from '../../shared/ipcTypes'
import { createLogger } from '../../shared/logger'
import { RestartState } from './RestartState'

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
 * The refusal an input enable, a console entry or a restart asked for before the fault gets while
 * an uncaught fault is held.
 */
export const FAULT_HELD_MESSAGE =
  'The lighting controllers stopped after an error. Press Retry on the banner to restart them.'

/**
 * The transitions each phase may move to. A transition outside this table is still performed (the
 * running graph knows more than the table does) but logged as a warning so protocol violations
 * surface in the log instead of silently rewriting history.
 */
const PHASE_TRANSITIONS: Record<LifecyclePhase, readonly LifecyclePhase[]> = {
  // A build that comes up with the DMX console held settles in console mode.
  initializing: ['running', 'consoleMode', 'failed', 'shuttingDown'],
  running: ['restarting', 'consoleMode', 'failed', 'shuttingDown'],
  restarting: ['running', 'consoleMode', 'failed', 'shuttingDown'],
  consoleMode: ['running', 'restarting', 'failed', 'shuttingDown'],
  failed: ['running', 'consoleMode', 'restarting', 'shuttingDown'],
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
 * - Queued ops exclude each other, and additionally await any in-flight shutdown. Every listener
 *   toggle, audio included, and every restart is a queued op.
 * - `runExclusiveShutdown` runs off the queue and must never drain it, since queued ops await the
 *   shutdown memo and a shutdown waiting on the queue would deadlock against them. The shutdown
 *   waits out only the op already running past that wait (`awaitActiveOp`).
 * - A restart request joins the one in flight until that restart starts rebuilding. After that the
 *   rebuild has read its configuration, so the request gets one follow-up restart instead.
 * - A restart is judged from the fault count at its latest request, so one asked for before a
 *   fault that is still held refuses to start. A request after the fault joins a restart only
 *   while that restart waits its turn, or tears down with no fault held since its own request.
 * - A restart takes its turn only once the fault response in progress has settled, so its
 *   teardown never runs beside the response's input stops.
 */
export class ControllerLifecycle {
  private phaseValue: LifecyclePhase = 'initializing'
  private opChain: Promise<void> = Promise.resolve()

  /** Set while a shutdown is in flight, and kept until it settles. */
  private shutdownPromise: Promise<void> | null = null
  /** Set once a shutdown has fully completed, making further shutdowns a no-op. */
  private shutdownCompleted = false
  /** The restart in flight and its follow-up, so overlapping callers share one attempt. */
  private readonly restart = new RestartState()
  /** Set while the response to an uncaught fault runs, and kept until it settles. */
  private faultResponse: Promise<void> | null = null
  /** Set while an initialisation is in flight so overlapping callers share the one attempt. */
  private initInFlight: Promise<void> | null = null
  /** The queued op or restart running now, past any wait on a shutdown. */
  private activeOp: Promise<unknown> | null = null
  /** Set by an uncaught fault and cleared when the phase leaves `failed`. Refuses input enables. */
  private faulted = false
  /** How many faults have been marked. Work reads it as it starts, see {@link faultMark}. */
  private faultCount = 0

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
    if (next !== 'failed') this.faulted = false
    this.broadcastPhase(next)
  }

  /**
   * Hold the graph `failed` after an uncaught fault, refusing input enables until a restart asked
   * for after the fault, or an init started after it, moves the phase on. Returns false, and
   * changes nothing, once a shutdown has begun or while a fault is already held.
   */
  public markFaulted(): boolean {
    if (this.isShuttingDown() || this.faulted) return false
    this.setPhase('failed')
    this.faulted = true
    this.faultCount += 1
    return true
  }

  /**
   * Run the response to the fault just marked. A restart waits it out before it starts, so it
   * reads the inputs once the response has stopped them.
   */
  public runFaultResponse(response: () => Promise<void>): Promise<void> {
    const run = (async () => response())()
    this.faultResponse = run
    return run.finally(() => {
      if (this.faultResponse === run) this.faultResponse = null
    })
  }

  /**
   * The mark work reads as it starts and hands to {@link settlePhase} or {@link faultedSince} when
   * it lands. Inside a running restart it is the restart's own mark, so a reinit the restart runs
   * is judged from when the restart was asked for.
   */
  public faultMark(): number {
    return this.restart.startedMark() ?? this.faultCount
  }

  /** Whether an uncaught fault is held. */
  public isFaulted(): boolean {
    return this.faulted
  }

  /** Whether a fault marked after `mark` was read is still held. */
  public faultedSince(mark: number): boolean {
    return this.faulted && this.faultCount !== mark
  }

  /**
   * Move to `next` as work that read `mark` when it started lands. A shutdown that has begun owns
   * every phase from then on, and a fault that arose while the work ran stays held, since that work
   * may have been what the fault left half done. Returns whether the phase moved.
   */
  public settlePhase(next: LifecyclePhase, mark: number): boolean {
    if (this.isShuttingDown()) return false
    if (this.faultedSince(mark)) {
      log.warn(`Holding the lifecycle failed: a fault arose before it could move to ${next}`)
      return false
    }
    this.setPhase(next)
    return true
  }

  /** Whether a shutdown has begun, whether or not it has finished. */
  public isShuttingDown(): boolean {
    return (
      this.phaseValue === 'shuttingDown' ||
      this.phaseValue === 'stopped' ||
      this.shutdownPromise !== null
    )
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
    return this.restart.inFlight() !== null
  }

  /** Whether an initialisation is currently in flight. */
  public isInitInFlight(): boolean {
    return this.initInFlight !== null
  }

  /**
   * Run an initialisation, memoized so overlapping callers share the one attempt. The cold start,
   * the renderer's retry, console mode, the simulation handlers and the listener toggles all reach
   * this, and several of them are already running inside a queued op, so this shares in flight
   * rather than queueing: queueing it from inside a queued op would deadlock.
   *
   * The memo is assigned synchronously so a same-tick second call shares it, and cleared when the
   * attempt settles either way, so a failed init can be retried.
   */
  public runSharedInit(work: () => Promise<void>): Promise<void> {
    if (this.initInFlight) {
      return this.initInFlight
    }
    const run = (async () => work())()
    this.initInFlight = run.finally(() => {
      this.initInFlight = null
    })
    return this.initInFlight
  }

  /**
   * Wait for an in-flight initialisation to settle. Errors are swallowed: the caller only needs the
   * graph to have stopped being built, and the init's owner surfaces its own failure.
   */
  public async awaitInitWork(): Promise<void> {
    if (!this.initInFlight) return
    try {
      await this.initInFlight
    } catch {
      // The owner already logged / rethrew; we just needed to wait.
    }
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
      // A graph half built is a graph that tears down badly, so let a build already under way
      // finish first. Init shares in flight rather than queueing, so this cannot deadlock.
      await this.awaitInitWork()
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
   * same-tick second call shares it, and cleared when the attempt settles either way. A caller
   * that arrives once the in-flight restart has started rebuilding gets the follow-up restart, and
   * so does one that arrives after a fault the tearing-down restart will hold.
   */
  public runSharedRestart(work: () => Promise<void>): Promise<void> {
    return this.requestRestart(work, this.faultCount)
  }

  /** The in-flight restart is rebuilding, so it has read the configuration it will run with. */
  public markRestartRebuildStarted(): void {
    this.restart.rebuild()
  }

  /** Ask for a restart on behalf of a request made when the fault count was `mark`. */
  private requestRestart(work: () => Promise<void>, mark: number): Promise<void> {
    const served = this.restart.request(mark, (since) => this.faultedSince(since))
    if (served.kind === 'share') return served.run
    if (served.kind === 'followUp') return this.queueFollowUpRestart(work, mark)
    const begin = (): Promise<void> => {
      if (this.faultedSince(this.restart.start())) {
        return Promise.reject(new Error(FAULT_HELD_MESSAGE))
      }
      return this.runActive(work)
    }
    const start = (): Promise<void> =>
      this.faultResponse ? this.awaitFaultResponse().then(begin) : begin()
    const run = this.runOp(start).finally(() => this.restart.settle())
    this.restart.queue(run, mark)
    return run
  }

  /**
   * Open the one restart behind the in-flight one, which later callers share until it starts. It
   * frees its slot as it starts, so a caller arriving during its own rebuild opens the next one.
   */
  private queueFollowUpRestart(work: () => Promise<void>, mark: number): Promise<void> {
    const current = this.restart.inFlight()
    const run = (async () => {
      try {
        await current
      } catch {
        // The in-flight restart's owner reports its failure. This one still runs.
      }
      await this.requestRestart(work, this.restart.startFollowUp())
    })()
    this.restart.openFollowUp(run, mark)
    return run
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

  /** Wait for the fault response in progress to settle, and for any started while it ran. */
  public async awaitFaultResponse(): Promise<void> {
    while (this.faultResponse) {
      try {
        await this.faultResponse
      } catch {
        // The response logs each step that fails.
      }
    }
  }

  /** Run `op` on the queue once any in-flight shutdown has settled, like every listener toggle. */
  public runQueuedOp<T>(op: () => Promise<T>): Promise<T> {
    return this.runOp(async () => {
      await this.awaitShutdownWork()
      return this.runActive(op)
    })
  }

  /**
   * Run a change that starts something as a queued op, refused once a shutdown has begun, since
   * the shutdown owns every input and sender from then on. `what` names the change in the refusal.
   */
  public runQueuedChange<T>(what: string, op: () => Promise<T>): Promise<T> {
    return this.runQueuedOp(() => {
      if (this.isShuttingDown()) {
        return Promise.reject(
          new LifecycleAbortedError(
            `${what} refused: shutdown in progress or already complete (phase=${this.phaseValue})`,
          ),
        )
      }
      return op()
    })
  }

  /**
   * Run an input enable as a queued change, refused while an uncaught fault is held. An enable that
   * lands after a fault arose is refused too, and the fault response stops the input it started
   * once the op settles.
   */
  public runQueuedEnable<T>(op: () => Promise<T>): Promise<T> {
    return this.runQueuedChange('Input enable', async () => {
      if (this.faulted) {
        throw new Error(FAULT_HELD_MESSAGE)
      }
      const mark = this.faultCount
      const result = await op()
      if (this.faultedSince(mark)) {
        throw new Error(FAULT_HELD_MESSAGE)
      }
      return result
    })
  }

  /**
   * Wait for the queued op or restart that is running now to settle, so a shutdown tears down what
   * it built. Ops still waiting on the queue or on the shutdown are not awaited, which is what
   * keeps this from deadlocking. Errors are swallowed as the op's caller reports them.
   */
  public async awaitActiveOp(): Promise<void> {
    if (!this.activeOp) return
    try {
      await this.activeOp
    } catch {
      // The op's caller reports its failure.
    }
  }

  private runActive<T>(op: () => Promise<T>): Promise<T> {
    const run = (async () => op())()
    this.activeOp = run
    return run.finally(() => {
      if (this.activeOp === run) this.activeOp = null
    })
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
