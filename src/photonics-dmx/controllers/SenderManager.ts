// src/managers/SenderManager.ts
import { EventEmitter } from 'stream';
import { BaseSender, SenderError } from '../senders/BaseSender';


/**
 * Senders are responsible for actually broadcasting the 
 * DMX data the light fixtures. The specific method 
 * will depend on which sender(s) are enabled.
 * 
 * sACN and Enttec Pro are example senders.
 */
export class SenderManager {
  private enabledSenders: Map<string, BaseSender>;
  private eventEmitter: EventEmitter;

  constructor() {
    this.enabledSenders = new Map<string, BaseSender>();
    this.eventEmitter = new EventEmitter();
  }

  /**
   * Enables a sender by starting it and registering its error handler.
   * @param id A unique string identifier for the sender.
   * @param sender An already-instantiated sender.
   */
  public async enableSender(id: string, sender: BaseSender): Promise<void> {
    if (this.enabledSenders.has(id)) {
      console.warn(`Sender with ID "${id}" is already enabled.`);
      return;
    }

    try {
      // Register error handler before starting
      sender.onSendError(this.handleSenderError);
      
      // Start the sender and wait for it to complete
      await sender.start();
      
      // Only add to enabled senders after successful startup
      this.enabledSenders.set(id, sender);
      console.log(`Sender with ID "${id}" enabled and started successfully.`);
    } catch (err) {
      console.error(`Error starting sender with ID "${id}":`, err);
      // Clean up error handler if startup failed
      sender.removeSendError(this.handleSenderError);
      return;
    }
  }

  /**
   * Disables a sender by stopping it and removing its error handler.
   * @param id The unique identifier for the sender to disable.
   */
  public async disableSender(id: string): Promise<void> {
    const sender = this.enabledSenders.get(id);
    if (!sender) {
      console.warn(`No enabled sender with ID "${id}" found.`);
      return;
    }

    try {
      await sender.stop();
    } catch (err) {
      console.error(`Error stopping sender with ID "${id}":`, err);
    }
    sender.removeSendError(this.handleSenderError);
    this.enabledSenders.delete(id);
    console.log(`Sender with ID "${id}" disabled.`);
  }

  /**
   * Disables all senders.
   */
  public async disableAllSenders(): Promise<void> {
    console.log('SenderManager: disabling all senders');
    
    const senderPromises: Promise<void>[] = [];
    
    for (const [id, sender] of this.enabledSenders) {
      console.log(`SenderManager: disabling sender "${id}"`);
      try {
        // Add each sender's stop promise to our array
        senderPromises.push(
          sender.stop()
            .catch(err => {
              console.error(`Error stopping sender with ID "${id}":`, err);
              // Don't rethrow, we want to continue with other senders
            })
        );
        
        // Also remove error handlers while we're here
        sender.removeSendError(this.handleSenderError);
      } catch (err) {
        console.error(`Error preparing sender "${id}" for shutdown:`, err);
      }
    }
    
    // Wait for all senders to finish their shutdown process
    if (senderPromises.length > 0) {
      try {
        await Promise.all(senderPromises);
        console.log('All senders have completed shutdown');
      } catch (err) {
        console.error('Error waiting for senders to shut down:', err);
      }
    }
    
    // Clear the list regardless of any errors
    this.enabledSenders.clear();
    console.log('All senders disabled and removed from manager');
  }

  /**
   * Sends pre-built universe buffer to all enabled senders without blocking.
   * @param universeBuffer Complete DMX universe buffer (channel -> value mapping).
   */
  public send(universeBuffer: Record<number, number>): void {
    if (this.enabledSenders.size === 0) {
      return;
    }

    for (const sender of this.enabledSenders.values()) {
      sender.send(universeBuffer).catch((error) => {
        console.error(`Error sending data with ${sender.constructor.name}:`, error);
      });
    }
  }

  /**
   * Shuts down the manager by disabling all senders.
   */
  public async shutdown(): Promise<void> {
    console.log("SenderManager shutdown: starting");
    try {
      await this.disableAllSenders();
      console.log("SenderManager shutdown: completed");
    } catch (error) {
      console.error("SenderManager shutdown error:", error);
      throw error;
    }
  }

  /**
   * Registers an event listener for sender errors.
   * @param listener The callback to handle sender errors.
   */
  public onSendError(listener: (error: SenderError) => void): void {
    this.eventEmitter.on('SenderError', listener);
  }

  /**
   * Removes an event listener for sender errors.
   * @param listener The callback to remove.
   */
  public removeSendError(listener: (error: SenderError) => void): void {
    this.eventEmitter.off('SenderError', listener);
  }

  /**
   * Get the list of enabled sender IDs
   * @returns Array of enabled sender IDs
   */
  public getEnabledSenders(): string[] {
    return Array.from(this.enabledSenders.keys());
  }

  /**
   * Check if a specific sender is enabled
   * @param senderId The sender ID to check
   * @returns True if the sender is enabled, false otherwise
   */
  public isSenderEnabled(senderId: string): boolean {
    return this.enabledSenders.has(senderId);
  }

  // Using an arrow function to ensure correct "this" binding.
  private handleSenderError = (senderErr: SenderError): void => {
    this.eventEmitter.emit('SenderError', senderErr);
  }
}