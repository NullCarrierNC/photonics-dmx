/**
 * @class Clock
 * @description Centralized timing source for the lighting sequencer system.
 * 
 * Provides a single source of truth for timing by using a 
 * 1ms interval that notifies all registered components.
 */
export class Clock {
  private intervalId: NodeJS.Timeout | null = null;
  private startTime: number;
  private lastUpdateTime: number;
  private updateCallbacks: Array<(deltaTime: number) => void> = [];
  private isRunning: boolean = false;
  private tickCount: number = 0;

  constructor() {
    this.startTime = this.getCurrentTime();
    this.lastUpdateTime = this.startTime;
  }

  /**
   * Register a callback to be called on each timing update
   * @param callback Function to call with delta time in milliseconds
   */
  onTick(callback: (deltaTime: number) => void): void {
    this.updateCallbacks.push(callback);
  }

  /**
   * Unregister a previously registered callback
   * @param callback The callback to remove
   */
  offTick(callback: (deltaTime: number) => void): void {
    const index = this.updateCallbacks.indexOf(callback);
    if (index > -1) {
      this.updateCallbacks.splice(index, 1);
    }
  }

  /**
   * Start the timing system
   */
  start(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.intervalId = setInterval(() => {
      this.update();
    }, 1);
  }

  /**
   * Stop the timing system
   */
  stop(): void {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Check if the timing system is currently running
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Get the current time in milliseconds since the clock started
   */
  getCurrentTimeMs(): number {
    return this.getCurrentTime() - this.startTime;
  }

  /**
   * Get the current absolute time in milliseconds
   */
  getAbsoluteTimeMs(): number {
    return this.getCurrentTime();
  }

  /**
   * Get the current tick count (useful for testing)
   */
  getTickCount(): number {
    return this.tickCount;
  }

  /**
   * Internal method to get current time with fallback for test environments
   */
  private getCurrentTime(): number {
    const perfTime = performance.now();
    // If performance.now() returns 0 (test environment), use tick count as fallback
    if (perfTime === 0) {
      return this.tickCount;
    }
    return perfTime;
  }

  /**
   * Internal update method that notifies all registered callbacks
   */
  private update(): void {
    this.tickCount++;
    const currentTime = this.getCurrentTime();
    const deltaTime = currentTime - this.lastUpdateTime;
    this.lastUpdateTime = currentTime;
    
    // Notify all registered callbacks
    this.updateCallbacks.forEach(callback => {
      try {
        callback(deltaTime);
      } catch (error) {
        console.error('Error in timing update callback:', error);
      }
    });
  }

  /**
   * Clean up all resources
   */
  destroy(): void {
    this.stop();
    this.updateCallbacks.length = 0;
  }
}
