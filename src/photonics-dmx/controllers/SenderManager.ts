// src/managers/SenderManager.ts
import { EventEmitter } from 'stream';
import { BaseSender, SenderError } from '../senders/BaseSender';
import { IpcSender } from '../senders/IpcSender';
import { ArtNetSender } from '../senders/ArtNetSender';
import { SacnSender } from '../senders/SacnSender';
import { EnttecProSender } from '../senders/EnttecProSender';


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
  private ipcSender: IpcSender | null = null;
  private initializingSenders: Set<string> = new Set();

  constructor() {
    this.enabledSenders = new Map<string, BaseSender>();
    this.eventEmitter = new EventEmitter();
  }

  /**
   * Enables a sender by starting it and registering its error handler.
   * @param id A unique string identifier for the sender.
   * @param senderType The type of sender to create ('artnet', 'sacn', 'enttecpro', 'ipc').
   * @param config Configuration for the sender.
   */
  public async enableSender(
    id: string,
    senderType: 'artnet' | 'sacn' | 'enttecpro' | 'ipc',
    config: any
  ): Promise<void> {
    // Check if sender is already enabled or currently initializing
    if (this.enabledSenders.has(id) || this.initializingSenders.has(id)) {
      console.warn(`Sender with ID "${id}" is already enabled or initializing.`);
      return;
    }

    // Mark this sender as initializing
    this.initializingSenders.add(id);

    try {
      if (senderType === 'ipc') {
        // Handle IPC sender separately (runs in main process)
        if (this.ipcSender) {
          console.warn('IPC sender is already enabled.');
          this.initializingSenders.delete(id);
          return;
        }

        this.ipcSender = new IpcSender();
        await this.ipcSender.start();

        // Register error handler (IPC sender doesn't use the same error system)
        // We'll handle IPC sender errors in the send method

        console.log(`IPC sender enabled and started successfully.`);
        this.initializingSenders.delete(id);
      } else {
        // Handle network senders directly
        console.log(`Creating direct sender for ${senderType} with ID "${id}"`);

        let sender: BaseSender;

        // Create sender instance based on type
        switch (senderType) {
          case 'artnet':
            // ArtNet config: { host, options: { universe, net, subnet, subuni, port, base_refresh_interval } }
            const host = config.host || '127.0.0.1';
            const artnetOptions = config.options || {
              universe: 1,
              net: 0,
              subnet: 0,
              subuni: 0,
              port: 6454,
              base_refresh_interval: 1000
            };
            sender = new ArtNetSender(host, artnetOptions);
            break;

          case 'sacn':
            // sACN config: { universe, networkInterface, useUnicast, unicastDestination }
            sender = new SacnSender(config);
            break;

          case 'enttecpro':
            // EnttecPro config: { devicePath }
            const devicePath = config.devicePath;
            if (!devicePath) {
              throw new Error('Device path (port) is required for EnttecPro sender');
            }
            sender = new EnttecProSender(devicePath, { dmxSpeed: 20 }, 'uni1');
            break;

          default:
            throw new Error(`Unknown sender type: ${senderType}`);
        }

        console.log(`Direct sender created for "${id}"`);

        // Register error handler before starting
        sender.onSendError(this.handleSenderError);

        // Start the sender and wait for it to complete
        console.log(`Starting sender "${id}"...`);
        await sender.start();
        console.log(`Sender "${id}" started successfully`);

        // Only add to enabled senders after successful startup
        this.enabledSenders.set(id, sender);
        console.log(`Direct sender with ID "${id}" enabled and started successfully.`);

        // Remove from initializing set
        this.initializingSenders.delete(id);
      }
    } catch (err) {
      console.error(`Error starting sender with ID "${id}":`, err);
      // Remove from initializing set on error
      this.initializingSenders.delete(id);

      // Re-throw the error so the IPC handler can catch it and send the failure notification
      throw err;
    }
  }

  /**
   * Disables a sender by stopping it and removing its error handler.
   * @param id The unique identifier for the sender to disable.
   */
  public async disableSender(id: string): Promise<void> {
    if (id === 'ipc') {
      // Handle IPC sender separately
      if (this.ipcSender) {
        try {
          await this.ipcSender.stop();
          this.ipcSender = null;
          this.initializingSenders.delete(id);
          console.log('IPC sender disabled.');
        } catch (err) {
          console.error('Error stopping IPC sender:', err);
        }
      }
      return;
    }

    const sender = this.enabledSenders.get(id);
    if (!sender) {
      console.warn(`No enabled sender with ID "${id}" found.`);
      // Still remove from initializing set in case it was stuck there
      this.initializingSenders.delete(id);
      return;
    }

    try {
      await sender.stop();
    } catch (err) {
      console.error(`Error stopping sender with ID "${id}":`, err);
    }
    sender.removeSendError(this.handleSenderError);
    this.enabledSenders.delete(id);
    this.initializingSenders.delete(id);
    console.log(`Sender with ID "${id}" disabled.`);
  }

  /**
   * Restarts a sender with new configuration.
   * @param id The unique string identifier for the sender.
   * @param config New configuration for the sender.
   */
  public async restartSender(id: string, config: any): Promise<void> {
    if (this.enabledSenders.has(id)) {
      console.log(`Restarting sender with ID "${id}" with new configuration`);

      // Disable the current sender
      await this.disableSender(id);

      // Re-enable with new configuration
      await this.enableSender(id, config.senderType || 'sacn', config);
    } else {
      console.warn(`Sender with ID "${id}" is not enabled, cannot restart.`);
    }
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
    
    // Clear the lists regardless of any errors
    this.enabledSenders.clear();
    this.initializingSenders.clear();
    console.log('All senders disabled and removed from manager');
  }

  /**
   * Sends pre-built universe buffer to all enabled senders without blocking.
   * @param universeBuffer Complete DMX universe buffer (channel -> value mapping).
   */
  public send(universeBuffer: Record<number, number>): void {
    // Send to IPC sender if enabled
    if (this.ipcSender) {
      Promise.resolve(this.ipcSender.send(universeBuffer)).catch((error) => {
        console.error('Error sending data to IPC sender:', error);
      });
    }

    // Send to network senders if any are enabled
    if (this.enabledSenders.size === 0) {
      return;
    }

    // Fire-and-forget - send to all senders asynchronously
    for (const sender of this.enabledSenders.values()) {
      // Use Promise.resolve to make it non-blocking
      Promise.resolve(sender.send(universeBuffer)).catch((error) => {
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

      // Stop IPC sender if it's running
      if (this.ipcSender) {
        try {
          await this.ipcSender.stop();
          this.ipcSender = null;
          console.log("IPC sender shutdown: completed");
        } catch (err) {
          console.error("Error shutting down IPC sender:", err);
        }
      }

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
   * Check if a specific sender is enabled or currently initializing
   * @param senderId The sender ID to check
   * @returns True if the sender is enabled or initializing, false otherwise
   */
  public isSenderEnabled(senderId: string): boolean {
    if (senderId === 'ipc') {
      return this.ipcSender !== null || this.initializingSenders.has(senderId);
    }
    return this.enabledSenders.has(senderId) || this.initializingSenders.has(senderId);
  }


  // Using an arrow function to ensure correct "this" binding.
  private handleSenderError = (senderErr: SenderError): void => {
    this.eventEmitter.emit('SenderError', senderErr);
  }
}