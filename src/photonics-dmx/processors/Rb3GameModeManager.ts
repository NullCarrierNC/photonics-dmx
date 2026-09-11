import { pickOther, pickRandom } from '../helpers/utils'
import { DwellTimer, type DwellSchedulePayload } from './dwellTimer'

/** Countdown state pushed to the renderer for the RB3 primary-cue countdown display. */
export type Rb3GameModeSchedulePayload = DwellSchedulePayload

/**
 * Drives RB3 "game mode" primary-cue rotation. RB3E sends no cue-change signal, so a dwell drawn
 * from a [min, max] second range arms a pending switch once it elapses, and the switch fires on the
 * next StageKit Light-1 (led-1) edge. On each switch it rotates the primary cue GROUP, since RB3 has
 * a single cueType, and re-rolls motion via `onSwitchDue`, where the handler owns the probability and
 * min-hold gated re-pick. The countdown is a {@link DwellTimer}, the same one
 * {@link AudioGameModeManager} runs on beats and cue types.
 */
export class Rb3GameModeManager {
  private started = false
  private primaryGroupId = ''
  private readonly dwell = new DwellTimer()
  private onPrimaryCueChange: ((groupId: string | null) => void) | null = null

  /**
   * @param getRotationEnabled Read live on every tick: false is the RB3 lighting domain's
   *   `oncePerSong` mode, where `start()` still picks a group but no switch is ever armed. Reading
   *   it per tick rather than per song means a change mid-song takes effect without a restart.
   */
  constructor(
    private readonly getPrimaryGroupPool: () => string[],
    private readonly getDurationRangeSec: () => { min: number; max: number },
    private readonly onSwitchDue: () => void,
    private readonly getRotationEnabled: () => boolean = () => true,
  ) {}

  public setOnPrimaryCueChange(cb: ((groupId: string | null) => void) | null): void {
    this.onPrimaryCueChange = cb
  }

  public setOnScheduleChange(cb: ((info: Rb3GameModeSchedulePayload) => void) | null): void {
    this.dwell.setOnChange(cb)
  }

  public getActivePrimaryGroupId(): string {
    return this.primaryGroupId
  }

  /** Begin scheduling (call on song start): pick an initial primary group and arm a fresh countdown. */
  public start(): void {
    this.started = true
    this.dwell.clearPending()
    this.primaryGroupId = pickRandom(this.getPrimaryGroupPool()) ?? ''
    this.scheduleNext()
    this.onPrimaryCueChange?.(this.primaryGroupId || null)
    this.dwell.emit()
  }

  /** Stop scheduling (call on song end). Clears the renderer countdown. */
  public stop(): void {
    this.started = false
    this.dwell.clearPending()
    this.dwell.emitCleared()
  }

  /** Run on the ~30 Hz keepalive tick: arm a pending switch once the countdown has elapsed. */
  public tick(): void {
    if (!this.started || this.dwell.isPending) return
    if (!this.getRotationEnabled()) return
    this.dwell.armIfElapsed()
  }

  /**
   * Run on any Light-1 (led-1 / led-1-off) edge: once the countdown has elapsed, rotate the primary
   * group, re-arm the timer, and re-roll motion. A no-op until the timer elapses, so edges before the
   * deadline are ignored. Emission order per switch: primary change (only when the group actually
   * changes), then schedule, then motion re-roll, matching the audio flow.
   */
  public notifyLight1Edge(): void {
    if (!this.started || !this.dwell.isPending) return
    this.dwell.clearPending()
    const changed = this.switchToNextGroup()
    this.scheduleNext()
    if (changed) {
      this.onPrimaryCueChange?.(this.primaryGroupId || null)
    }
    this.dwell.emit()
    this.onSwitchDue()
  }

  /**
   * Re-validate the active primary group against the current pool WITHOUT restarting a still-valid
   * run (e.g. after the user toggles enabled groups). Leaves a still-eligible group and its timer
   * running, and only re-picks and reschedules when the active group left the pool.
   */
  public ensureValidPrimary(): void {
    if (!this.started) return
    const pool = this.getPrimaryGroupPool()
    if (this.primaryGroupId !== '' && pool.includes(this.primaryGroupId)) {
      this.dwell.emit()
      return
    }
    this.primaryGroupId = pickRandom(pool) ?? ''
    this.dwell.clearPending()
    this.scheduleNext()
    this.onPrimaryCueChange?.(this.primaryGroupId || null)
    this.dwell.emit()
  }

  /** Advance to a different primary group (avoid-repeat). Returns whether the group actually changed. */
  private switchToNextGroup(): boolean {
    const prev = this.primaryGroupId
    const pool = this.getPrimaryGroupPool()
    if (pool.length === 0) return false
    const next = pickOther(pool, this.primaryGroupId)
    if (next !== undefined) {
      this.primaryGroupId = next
    } else if (!pool.includes(this.primaryGroupId)) {
      this.primaryGroupId = pool[0]!
    }
    return this.primaryGroupId !== prev
  }

  private scheduleNext(): void {
    const { min, max } = this.getDurationRangeSec()
    this.dwell.schedule(min, max)
  }
}
