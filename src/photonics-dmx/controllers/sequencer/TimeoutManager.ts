import { ITimeoutManager } from './interfaces';

/**
 * @class TimeoutManager
 * @description Centralized tracking of timeouts. 
 */
export class TimeoutManager implements ITimeoutManager {
  private timeouts: Set<NodeJS.Timeout> = new Set();

  /**
   * Sets a timeout and tracks it
   * @param callback The function to call when the timeout completes
   * @param delay The delay in milliseconds
   * @returns The timeout ID
   */
  public setTimeout(callback: () => void, delay: number): NodeJS.Timeout {
    // Create a wrapper function that ensures timeout is removed from the set when it completes
    const wrappedCallback = () => {
      try {
        // Remove the timeout from tracking before executing the callback
        // This ensures it's removed even if the callback throws
        this.timeouts.delete(timeoutId);
        callback();
      } catch (e) {
        console.error('Error in setTimeout callback:', e);
      }
    };
    
    // Create the actual timeout with our wrapped callback
    const timeoutId = setTimeout(wrappedCallback, delay);
    
    // Track the timeout
    this.timeouts.add(timeoutId);
    return timeoutId;
  }

  /**
   * Clears all tracked timeouts
   */
  public clearAllTimeouts(): void {
    // Make a copy of the set before iterating to avoid issues
    // with modification during iteration
    const timeoutsCopy = Array.from(this.timeouts);
    
    // Clear all timeouts
    for (const timeoutId of timeoutsCopy) {
      clearTimeout(timeoutId);
    }
    this.timeouts.clear();
  }

  /**
   * Removes a specific timeout from tracking
   * @param timeoutId The timeout ID to remove
   */
  public removeTimeout(timeoutId: NodeJS.Timeout): void {
    if (timeoutId) {
      clearTimeout(timeoutId);
      this.timeouts.delete(timeoutId);
    }
  }
  

}
