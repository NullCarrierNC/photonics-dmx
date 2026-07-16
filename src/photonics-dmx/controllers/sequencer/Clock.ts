import { createLogger } from '../../../shared/logger'
const log = createLogger('Clock')

/** A tick whose callbacks run longer than this multiple of the interval is flagged as an overrun. */
const OVERRUN_FACTOR = 2

/**
 * @class Clock
 * @description Centralized timing source for the lighting sequencer system.
 *
 * Uses a self-correcting setTimeout loop instead of setInterval to reduce
 * cumulative drift and jitter.
 */
export class Clock {
  private timeoutId: NodeJS.Timeout | null = null
  private startTime: number
  private lastUpdateTime: number
  private nextTargetTime: number = 0
  private updateCallbacks: Array<(deltaTime: number) => void> = []
  private isRunning: boolean = false
  private tickCount: number = 0
  private intervalMs: number
  /** True while a run of overrunning ticks is in progress, so we warn once per episode not per tick. */
  private overrunActive: boolean = false

  constructor(intervalMs: number = 10) {
    this.intervalMs = Math.max(1, Math.min(100, intervalMs)) // Clamp between 1-100ms
    this.startTime = this.getCurrentTime()
    this.lastUpdateTime = this.startTime
  }

  /**
   * Register a callback to be called on each timing update
   * @param callback Function to call with delta time in milliseconds
   */
  onTick(callback: (deltaTime: number) => void): void {
    this.updateCallbacks.push(callback)
  }

  /**
   * Unregister a previously registered callback
   * @param callback The callback to remove
   */
  offTick(callback: (deltaTime: number) => void): void {
    const index = this.updateCallbacks.indexOf(callback)
    if (index > -1) {
      this.updateCallbacks.splice(index, 1)
    }
  }

  /**
   * Start the timing system
   */
  start(): void {
    if (this.isRunning) return

    this.isRunning = true
    this.nextTargetTime = this.getCurrentTime() + this.intervalMs
    this.scheduleNext()
  }

  /**
   * Stop the timing system
   */
  stop(): void {
    if (!this.isRunning) return

    this.isRunning = false
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId)
      this.timeoutId = null
    }
  }

  /**
   * Schedule the next tick with drift correction
   */
  private scheduleNext(): void {
    if (!this.isRunning) return

    const now = this.getCurrentTime()
    const drift = now - this.nextTargetTime
    const delay = Math.max(0, this.intervalMs - drift)

    this.timeoutId = setTimeout(() => {
      this.timeoutId = null
      this.nextTargetTime += this.intervalMs
      this.update()
      this.scheduleNext()
    }, delay)
  }

  /**
   * Check if the timing system is currently running
   */
  isActive(): boolean {
    return this.isRunning
  }

  /**
   * Get the current time in milliseconds since the clock started
   */
  getCurrentTimeMs(): number {
    return this.getCurrentTime() - this.startTime
  }

  /**
   * Get the current absolute time in milliseconds
   */
  getAbsoluteTimeMs(): number {
    return this.getCurrentTime()
  }

  /**
   * Get the current tick count (useful for testing)
   */
  getTickCount(): number {
    return this.tickCount
  }

  /**
   * Internal method to get current time with fallback for test environments
   */
  private getCurrentTime(): number {
    const perfTime = performance.now()
    // If performance.now() returns 0 (test environment), use tick count as fallback
    if (perfTime === 0) {
      return this.tickCount
    }
    return perfTime
  }

  /**
   * Internal update method that notifies all registered callbacks
   */
  private update(): void {
    this.tickCount++
    const currentTime = this.getCurrentTime()
    const deltaTime = currentTime - this.lastUpdateTime
    this.lastUpdateTime = currentTime

    // Watchdog: the callbacks run synchronously inside the timer handler, so a slow tick directly
    // delays the next one and can stutter output. Measure the callback pass and warn once when an
    // overrun episode starts, staying quiet until a clean tick so a sustained stall logs once.
    const tickStart = performance.now()

    // Notify all registered callbacks
    this.updateCallbacks.forEach((callback) => {
      try {
        callback(deltaTime)
      } catch (error) {
        log.error('Error in timing update callback:', error)
      }
    })

    const tickDurationMs = performance.now() - tickStart
    if (tickDurationMs > this.intervalMs * OVERRUN_FACTOR) {
      if (!this.overrunActive) {
        this.overrunActive = true
        log.warn(
          `Tick callbacks took ${tickDurationMs.toFixed(1)}ms, over the ${this.intervalMs}ms interval. Output may stutter.`,
        )
      }
    } else {
      this.overrunActive = false
    }
  }

  /**
   * Clean up all resources
   */
  destroy(): void {
    this.stop()
    this.updateCallbacks.length = 0
  }
}
