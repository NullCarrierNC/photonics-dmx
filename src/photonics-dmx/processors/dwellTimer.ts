import { monotonicNowMs } from '../../shared/time'
import { randomFloatInRange } from '../helpers/utils'

/** Countdown state pushed to the renderer for a game mode's next-switch display. */
export type DwellSchedulePayload = { deadlineMs: number | null; pending: boolean }

/**
 * The countdown behind a game mode's primary-cue rotation.
 *
 * A dwell drawn from a [min, max] second range arms a pending switch once it elapses, and the game
 * mode fires the switch on its own musical edge: a beat for audio, a Light-1 edge for RB3. The
 * deadline is kept twice. The monotonic copy decides when to arm, so a wall-clock change cannot
 * fire or stall a switch, and the wall-clock copy is what the renderer counts down to.
 */
export class DwellTimer {
  private pending = false
  private scheduled = false
  private deadlineMs = 0
  private deadlineWallMs = 0
  private onChange: ((payload: DwellSchedulePayload) => void) | null = null

  public setOnChange(cb: ((payload: DwellSchedulePayload) => void) | null): void {
    this.onChange = cb
  }

  /** Whether the dwell has elapsed and a switch is waiting for its edge. */
  public get isPending(): boolean {
    return this.pending
  }

  /** Whether a countdown has been scheduled at all. */
  public get isScheduled(): boolean {
    return this.scheduled
  }

  /**
   * Start a fresh countdown drawn from [minSec, maxSec] seconds. A range reaching below zero starts
   * at zero and an inverted range collapses to its minimum, so the deadline never lands in the past.
   */
  public schedule(minSec: number, maxSec: number): void {
    const lo = Math.max(0, minSec)
    const hi = Math.max(lo, maxSec)
    const durationMs = Math.round(randomFloatInRange(lo, hi) * 1000)
    this.deadlineMs = monotonicNowMs() + durationMs
    this.deadlineWallMs = Date.now() + durationMs
    this.scheduled = true
  }

  /** Arm the pending switch once the countdown has elapsed, telling the renderer when it does. */
  public armIfElapsed(): void {
    if (this.pending || monotonicNowMs() < this.deadlineMs) {
      return
    }
    this.pending = true
    this.emit()
  }

  /** Drop a pending switch, leaving the countdown where it is. */
  public clearPending(): void {
    this.pending = false
  }

  /** Tell the renderer the current countdown and whether a switch is pending. */
  public emit(): void {
    this.onChange?.({
      deadlineMs: this.scheduled ? this.deadlineWallMs : null,
      pending: this.pending,
    })
  }

  /** Tell the renderer there is no countdown to show. */
  public emitCleared(): void {
    this.onChange?.({ deadlineMs: null, pending: false })
  }
}
