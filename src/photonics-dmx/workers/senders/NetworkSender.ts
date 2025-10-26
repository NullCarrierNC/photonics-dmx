import { EventEmitter } from 'events';

/**
 * Base class for network senders in worker thread
 * These senders run in the worker thread context to prevent blocking the main UI thread
 */
export abstract class NetworkSender {
  protected eventEmitter: EventEmitter;

  constructor() {
    this.eventEmitter = new EventEmitter();
  }

  public abstract start(): Promise<void>;
  public abstract stop(): Promise<void>;
  public abstract send(universeBuffer: Record<number, number>): void;
  public abstract sendBlackout(): void;

  protected sendError(error: string): void {
    // Send error back to main thread would require parentPort access
    // For now, just log it - main thread should handle errors through return values
    console.error('Network sender error:', error);
  }
}

