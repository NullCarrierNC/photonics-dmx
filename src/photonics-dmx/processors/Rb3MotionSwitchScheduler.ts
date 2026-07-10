import { monotonicNowMs } from '../../shared/time'

function randomInRange(minSec: number, maxSec: number): number {
  return minSec + Math.random() * (maxSec - minSec)
}

/**
 * Drives RB3 motion-cue switching. RB3 has no beat to key motion selection on, so this mirrors the
 * audio Game Mode dwell timer: a countdown drawn from a [min, max] second range arms a pending switch
 * once it elapses, and the switch then fires on the next Light-1 (led-1) state change. The actual
 * cue re-pick (probability + min-hold gated) is done by the handler via `onSwitchDue`; this class only
 * owns the timing.
 */
export class Rb3MotionSwitchScheduler {
  private started = false
  private pendingSwitch = false
  private switchDeadlineMs = 0

  constructor(
    private readonly getDurationRangeSec: () => { min: number; max: number },
    private readonly onSwitchDue: () => void,
  ) {}

  /** Begin scheduling (call on song start). Resets any pending switch and arms a fresh countdown. */
  public start(): void {
    this.started = true
    this.pendingSwitch = false
    this.scheduleNext()
  }

  /** Stop scheduling (call on song end). */
  public stop(): void {
    this.started = false
    this.pendingSwitch = false
  }

  /** Run on the ~30 Hz keepalive tick: arm a pending switch once the countdown has elapsed. */
  public tick(): void {
    if (!this.started || this.pendingSwitch) return
    if (monotonicNowMs() >= this.switchDeadlineMs) {
      this.pendingSwitch = true
    }
  }

  /** Run on any Light-1 (led-1 / led-1-off) edge: fire the switch if the countdown has elapsed, then
   *  re-arm the timer. A no-op until the timer elapses, so edges before the deadline are ignored. */
  public notifyLight1Edge(): void {
    if (!this.started || !this.pendingSwitch) return
    this.pendingSwitch = false
    this.scheduleNext()
    this.onSwitchDue()
  }

  private scheduleNext(): void {
    const { min, max } = this.getDurationRangeSec()
    const lo = Math.max(0, min)
    const hi = Math.max(lo, max)
    this.switchDeadlineMs = monotonicNowMs() + Math.round(randomInRange(lo, hi) * 1000)
  }
}
