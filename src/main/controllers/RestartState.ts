/**
 * The restart in flight and the follow-up queued behind it, each with the fault count it is judged
 * from. Every change to either is one of the named transitions below.
 */

/** Where a restart is: waiting its turn on the queue, tearing down, or rebuilding. */
export type RestartStage = 'queued' | 'tearingDown' | 'rebuilding'

/** How a request is served: by a restart it shares, by opening the follow-up, or by a new one. */
export type RestartRequest =
  | { kind: 'share'; run: Promise<void> }
  | { kind: 'followUp' }
  | { kind: 'new' }

export class RestartState {
  private current: { run: Promise<void>; stage: RestartStage; mark: number } | null = null
  private followUp: { run: Promise<void>; mark: number } | null = null

  /** The restart in flight, from its request until it settles. */
  public inFlight(): Promise<void> | null {
    return this.current?.run ?? null
  }

  /** The in-flight restart's mark once it has started, which the work it runs is judged from. */
  public startedMark(): number | null {
    return this.current !== null && this.current.stage !== 'queued' ? this.current.mark : null
  }

  /**
   * Serve a request made at fault count `mark`. It shares a restart still queued, moving that
   * restart's mark up to it, and shares one tearing down when `faultedSince` holds no fault since
   * that restart's mark. Any other request shares the follow-up, moving its mark up, or opens it.
   */
  public request(mark: number, faultedSince: (mark: number) => boolean): RestartRequest {
    const current = this.current
    if (current === null) return { kind: 'new' }
    if (current.stage === 'queued') {
      current.mark = Math.max(current.mark, mark)
      return { kind: 'share', run: current.run }
    }
    if (current.stage === 'tearingDown' && !faultedSince(current.mark)) {
      return { kind: 'share', run: current.run }
    }
    if (this.followUp !== null) {
      this.followUp.mark = Math.max(this.followUp.mark, mark)
      return { kind: 'share', run: this.followUp.run }
    }
    return { kind: 'followUp' }
  }

  /** `run` waits its turn on the queue as the restart in flight, asked for at `mark`. */
  public queue(run: Promise<void>, mark: number): void {
    this.current = { run, stage: 'queued', mark }
  }

  /** The restart in flight takes its turn and tears down. Returns the mark it is judged from. */
  public start(): number {
    if (this.current === null) throw new Error('No restart is in flight to start')
    this.current.stage = 'tearingDown'
    return this.current.mark
  }

  /** The restart in flight rebuilds, so it has read the configuration it will run with. */
  public rebuild(): void {
    if (this.current !== null) this.current.stage = 'rebuilding'
  }

  /** The restart in flight has settled, either way. */
  public settle(): void {
    this.current = null
  }

  /** `run` waits behind the restart in flight as the follow-up, asked for at `mark`. */
  public openFollowUp(run: Promise<void>, mark: number): void {
    this.followUp = { run, mark }
  }

  /**
   * The follow-up takes its turn. Returns the mark of its latest request and frees the slot, so a
   * request from here on is served by the restart the follow-up asks for.
   */
  public startFollowUp(): number {
    if (this.followUp === null) throw new Error('No follow-up restart is waiting to start')
    const { mark } = this.followUp
    this.followUp = null
    return mark
  }
}
