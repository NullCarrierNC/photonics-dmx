import { IEventScheduler } from './interfaces';
import { Clock } from './Clock';

/**
 * @interface ScheduledEvent
 * @description Represents a scheduled event with its target time and callback
 */
interface ScheduledEvent {
  id: string;
  targetTime: number;
  callback: () => void;
  isRepeating: boolean;
  repeatInterval?: number;
}

/**
 * @class EventScheduler
 * @description Centralized tracking of scheduled events using the clock.
 */
export class EventScheduler implements IEventScheduler {
  private scheduledEvents: Map<string, ScheduledEvent> = new Map();
  private clock: Clock | null = null;
  private updateCallback: (deltaTime: number) => void;
  private nextEventId: number = 0;

  constructor() {
    // Create the update callback bound to this instance
    this.updateCallback = this.update.bind(this);
  }

  /**
   * Register this component with the clock
   * @param clock The clock instance
   */
  public registerWithClock(clock: Clock): void {
    this.clock = clock;
    clock.onTick(this.updateCallback);
  }

  /**
   * Unregister from the clock
   */
  public unregisterFromClock(): void {
    if (this.clock) {
      this.clock.offTick(this.updateCallback);
      this.clock = null;
    }
  }


  /**
   * Schedule an event at a specific absolute time
   * @param targetTime The absolute time when the event should fire
   * @param callback The function to call
   * @returns The event ID
   */
  public scheduleEventAt(targetTime: number, callback: () => void): string {
    const eventId = this.generateEventId();
    
    const event: ScheduledEvent = {
      id: eventId,
      targetTime,
      callback,
      isRepeating: false
    };
    
    this.scheduledEvents.set(eventId, event);
    return eventId;
  }

  /**
   * Schedule a repeating event
   * @param callback The function to call
   * @param interval The interval between calls in milliseconds
   * @param initialDelay Optional initial delay before first call
   * @returns The event ID
   */
  public scheduleRepeatingEvent(callback: () => void, interval: number, initialDelay: number = 0): string {
    const eventId = this.generateEventId();
    const targetTime = this.getCurrentTime() + initialDelay;
    
    const event: ScheduledEvent = {
      id: eventId,
      targetTime,
      callback,
      isRepeating: true,
      repeatInterval: interval
    };
    
    this.scheduledEvents.set(eventId, event);
    return eventId;
  }



  /**
   * Remove a scheduled event by ID
   * @param eventId The event ID to remove
   */
  public removeEvent(eventId: string): void {
    this.scheduledEvents.delete(eventId);
  }

  /**
   * Update method called by the clock
   */
  private update(): void {
    const currentTime = this.getCurrentTime();
    const eventsToRemove: string[] = [];
    const eventsToReschedule: ScheduledEvent[] = [];

    // Check all scheduled events
    this.scheduledEvents.forEach((event, eventId) => {
      if (currentTime >= event.targetTime) {
        try {
          // Execute the callback
          event.callback();
          
          if (event.isRepeating && event.repeatInterval) {
            // Reschedule repeating events
            event.targetTime = currentTime + event.repeatInterval;
            eventsToReschedule.push(event);
          } else {
            // Mark non-repeating events for removal
            eventsToRemove.push(eventId);
          }
        } catch (error) {
          console.error('Error in scheduled event callback:', error);
          eventsToRemove.push(eventId);
        }
      }
    });

    // Remove completed events
    eventsToRemove.forEach(eventId => {
      this.scheduledEvents.delete(eventId);
    });

    // Update rescheduled events
    eventsToReschedule.forEach(event => {
      this.scheduledEvents.set(event.id, event);
    });
  }

  /**
   * Get the current time from the clock or fallback to performance.now
   */
  private getCurrentTime(): number {
    return this.clock ? this.clock.getCurrentTimeMs() : performance.now();
  }

  /**
   * Generate a unique event ID
   */
  private generateEventId(): string {
    return `event_${++this.nextEventId}`;
  }

  /**
   * Clean up resources
   */
  public destroy(): void {
    this.unregisterFromClock();
    this.scheduledEvents.clear();
  }
}
