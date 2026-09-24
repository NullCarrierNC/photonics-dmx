import { monotonicNowMs } from '../../shared/time'

/** How often the watchdog polls for silence, matching the YARG fallback poll. */
const POLL_MS = 500

/** Window used when a caller does not name one. */
export const DEFAULT_STROBE_WATCHDOG_MS = 2000

/**
 * Cuts a strobe that outlives the packets driving it.
 *
 * A game that crashes, quits without a clean state packet or drops off the network mid-strobe
 * leaves the strobe running, and silence is the only sign.
 *
 * `windowMs` of 0 or less disables the cut.
 */
export class StrobeWatchdog {
  private lastPacketAt = 0
  private strobeRunning = false
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(
    private readonly windowMs: number,
    private readonly onCut: () => void,
  ) {}

  /** Record a packet from the console. Resets the silence the watchdog measures. */
  packetSeen(): void {
    this.lastPacketAt = monotonicNowMs()
  }

  /** Whether a strobe is currently believed to be running. */
  setStrobeRunning(running: boolean): void {
    this.strobeRunning = running
  }

  /**
   * Whether the console has been silent long enough that a running strobe should not be trusted.
   * For callers that already own a pump and want to check on their own cadence.
   */
  hasLapsed(): boolean {
    if (this.windowMs <= 0) return false
    return monotonicNowMs() - this.lastPacketAt >= this.windowMs
  }

  /** Arm the poll. Callers that drive their own checks do not need this. */
  start(): void {
    if (this.timer) return
    this.packetSeen()
    this.timer = setInterval(() => this.check(), POLL_MS)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.strobeRunning = false
  }

  /** Cut the strobe if one is running and the console has gone quiet. */
  check(): void {
    if (!this.strobeRunning || !this.hasLapsed()) return
    this.strobeRunning = false
    this.onCut()
  }
}
