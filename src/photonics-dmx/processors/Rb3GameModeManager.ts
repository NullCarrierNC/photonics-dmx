import { monotonicNowMs } from '../../shared/time'
import { pickRandom, randomFloatInRange } from '../helpers/utils'

/** Countdown state pushed to the renderer for the RB3 primary-cue countdown display. */
export type Rb3GameModeSchedulePayload = { deadlineMs: number | null; pending: boolean }

/**
 * Drives RB3 "game mode" primary-cue rotation. RB3E sends no cue-change signal, so — like the audio
 * Game Mode dwell timer — a countdown drawn from a [min, max] second range arms a pending switch once
 * it elapses, and the switch fires on the next StageKit Light-1 (led-1) edge. On each switch it rotates
 * the primary cue GROUP (RB3 has a single cueType, so rotation is by group) and re-rolls motion via
 * `onSwitchDue` (the handler owns the probability + min-hold gated re-pick). It mirrors
 * {@link AudioGameModeManager}, but keyed on Light-1 edges instead of beats and on groups instead of
 * cueTypes; it keeps a monotonic deadline for the switch logic and a wall-clock mirror for the display.
 */
export class Rb3GameModeManager {
  private started = false
  private pendingSwitch = false
  private primaryGroupId = ''
  private switchDeadlineMs = 0 // monotonic; drives the actual switch (immune to clock changes)
  private switchDeadlineWallMs = 0 // wall-clock mirror; sent to the renderer countdown
  private onPrimaryCueChange: ((groupId: string | null) => void) | null = null
  private onScheduleChange: ((info: Rb3GameModeSchedulePayload) => void) | null = null

  constructor(
    private readonly getPrimaryGroupPool: () => string[],
    private readonly getDurationRangeSec: () => { min: number; max: number },
    private readonly onSwitchDue: () => void,
  ) {}

  public setOnPrimaryCueChange(cb: ((groupId: string | null) => void) | null): void {
    this.onPrimaryCueChange = cb
  }

  public setOnScheduleChange(cb: ((info: Rb3GameModeSchedulePayload) => void) | null): void {
    this.onScheduleChange = cb
  }

  public getActivePrimaryGroupId(): string {
    return this.primaryGroupId
  }

  /** Begin scheduling (call on song start): pick an initial primary group and arm a fresh countdown. */
  public start(): void {
    this.started = true
    this.pendingSwitch = false
    this.primaryGroupId = pickRandom(this.getPrimaryGroupPool()) ?? ''
    this.scheduleNext()
    this.onPrimaryCueChange?.(this.primaryGroupId || null)
    this.emitScheduleChange()
  }

  /** Stop scheduling (call on song end). Clears the renderer countdown. */
  public stop(): void {
    this.started = false
    this.pendingSwitch = false
    this.onScheduleChange?.({ deadlineMs: null, pending: false })
  }

  /** Run on the ~30 Hz keepalive tick: arm a pending switch once the countdown has elapsed. */
  public tick(): void {
    if (!this.started || this.pendingSwitch) return
    if (monotonicNowMs() >= this.switchDeadlineMs) {
      this.pendingSwitch = true
      this.emitScheduleChange()
    }
  }

  /**
   * Run on any Light-1 (led-1 / led-1-off) edge: once the countdown has elapsed, rotate the primary
   * group, re-arm the timer, and re-roll motion. A no-op until the timer elapses, so edges before the
   * deadline are ignored. Emission order per switch: primary change (only when the group actually
   * changes) -> schedule -> motion re-roll, matching the audio flow.
   */
  public notifyLight1Edge(): void {
    if (!this.started || !this.pendingSwitch) return
    this.pendingSwitch = false
    const changed = this.switchToNextGroup()
    this.scheduleNext()
    if (changed) {
      this.onPrimaryCueChange?.(this.primaryGroupId || null)
    }
    this.emitScheduleChange()
    this.onSwitchDue()
  }

  /**
   * Re-validate the active primary group against the current pool WITHOUT restarting a still-valid
   * run (e.g. after the user toggles enabled groups). Leaves a still-eligible group and its timer
   * running; only re-picks and reschedules when the active group left the pool.
   */
  public ensureValidPrimary(): void {
    if (!this.started) return
    const pool = this.getPrimaryGroupPool()
    if (this.primaryGroupId !== '' && pool.includes(this.primaryGroupId)) {
      this.emitScheduleChange()
      return
    }
    this.primaryGroupId = pickRandom(pool) ?? ''
    this.pendingSwitch = false
    this.scheduleNext()
    this.onPrimaryCueChange?.(this.primaryGroupId || null)
    this.emitScheduleChange()
  }

  /** Advance to a different primary group (avoid-repeat). Returns whether the group actually changed. */
  private switchToNextGroup(): boolean {
    const prev = this.primaryGroupId
    const pool = this.getPrimaryGroupPool()
    if (pool.length === 0) return false
    const others = pool.filter((id) => id !== this.primaryGroupId)
    if (others.length > 0) {
      this.primaryGroupId = pickRandom(others) ?? this.primaryGroupId
    } else if (!pool.includes(this.primaryGroupId)) {
      this.primaryGroupId = pool[0]!
    }
    return this.primaryGroupId !== prev
  }

  private scheduleNext(): void {
    const { min, max } = this.getDurationRangeSec()
    const lo = Math.max(0, min)
    const hi = Math.max(lo, max)
    const durationMs = Math.round(randomFloatInRange(lo, hi) * 1000)
    this.switchDeadlineMs = monotonicNowMs() + durationMs
    this.switchDeadlineWallMs = Date.now() + durationMs
  }

  private emitScheduleChange(): void {
    this.onScheduleChange?.({
      deadlineMs: this.switchDeadlineMs > 0 ? this.switchDeadlineWallMs : null,
      pending: this.pendingSwitch,
    })
  }
}
