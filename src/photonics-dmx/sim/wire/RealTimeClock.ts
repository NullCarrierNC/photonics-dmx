import { Clock, type ClockSource } from '../../controllers/sequencer/Clock'

/** A clock a wire run steps through: the virtual clock, or wall-clock time. */
export interface WireClock extends ClockSource {
  /** Lets `ms` pass. */
  advance(ms: number): Promise<void>
}

/**
 * The app's own Clock, running from construction, stepped by waiting in real time. A run on it
 * sends through real senders at the pace the app does.
 */
export class RealTimeClock implements WireClock {
  private readonly clock: Clock

  constructor(intervalMs = 10) {
    this.clock = new Clock(intervalMs)
    this.clock.start()
  }

  public advance(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  public getIntervalMs(): number {
    return this.clock.getIntervalMs()
  }

  public onTick(callback: (deltaMs: number) => void): void {
    this.clock.onTick(callback)
  }

  public offTick(callback: (deltaMs: number) => void): void {
    this.clock.offTick(callback)
  }

  public start(): void {
    this.clock.start()
  }

  public stop(): void {
    this.clock.stop()
  }

  public isActive(): boolean {
    return this.clock.isActive()
  }

  /** Whole milliseconds since the clock started, as the virtual clock counts them. */
  public getCurrentTimeMs(): number {
    return Math.round(this.clock.getCurrentTimeMs())
  }

  public getAbsoluteTimeMs(): number {
    return this.clock.getAbsoluteTimeMs()
  }

  public getTickCount(): number {
    return this.clock.getTickCount()
  }

  public destroy(): void {
    this.clock.destroy()
  }
}
