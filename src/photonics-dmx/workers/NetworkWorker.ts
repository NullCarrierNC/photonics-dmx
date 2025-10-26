import { WorkerThread } from './BaseWorker';
import { NetworkSender } from './senders/NetworkSender';
import { ArtNetNetworkSender } from './senders/ArtNetNetworkSender';
import { SacnNetworkSender } from './senders/SacnNetworkSender';
import { EnttecProNetworkSender } from './senders/EnttecProNetworkSender';

/**
 * Network worker thread for handling all DMX sender operations
 * This prevents network I/O from blocking the main UI thread
 */
export class NetworkWorker extends WorkerThread {
  private senders: Map<string, NetworkSender> = new Map();

  constructor() {
    console.log('NetworkWorker: Constructor called');
    super();
    
    // Set up global error handlers for the worker
    process.on('uncaughtException', (error) => {
      console.error('NetworkWorker: Uncaught exception:', error);
      this.sendToMain({
        type: 'WORKER_ERROR',
        error: `Uncaught exception: ${error.message}`,
        stack: error.stack
      });
    });

    process.on('unhandledRejection', (reason) => {
      console.error('NetworkWorker: Unhandled rejection:', reason);
      this.sendToMain({
        type: 'WORKER_ERROR',
        error: `Unhandled rejection: ${reason}`,
        stack: reason instanceof Error ? reason.stack : String(reason)
      });
    });

    console.log('NetworkWorker: Constructor completed successfully');
  }

  protected handleMainMessage(message: any): void {
    switch (message.type) {
      case 'CREATE_SENDER':
        this.createSender(message.senderId, message.senderType, message.config);
        break;
      case 'START_SENDER':
        this.startSender(message.senderId);
        break;
      case 'STOP_SENDER':
        this.stopSender(message.senderId);
        break;
      case 'SEND_DMX':
        this.sendDmxData(message.senderId, message.universeBuffer);
        break;
      case 'SEND_BLACKOUT':
        this.sendBlackout(message.senderId);
        break;
      default:
        console.warn('Unknown message type:', message.type);
    }
  }

  protected async onShutdown(): Promise<void> {
    // Stop all senders and cleanup
    for (const sender of this.senders.values()) {
      try {
        await sender.stop();
      } catch (error) {
        console.error('Error stopping sender during shutdown:', error);
      }
    }

    this.senders.clear();
  }

  private createSender(senderId: string, senderType: string, config: any): void {
    try {
      // Check if sender already exists
      if (this.senders.has(senderId)) {
        console.log(`NetworkWorker: Sender "${senderId}" already exists, sending SENDER_CREATED`);
        this.sendToMain({ type: 'SENDER_CREATED', senderId });
        return;
      }

      let sender: NetworkSender;

      switch (senderType) {
        case 'artnet':
          sender = new ArtNetNetworkSender(config);
          break;
        case 'sacn':
          sender = new SacnNetworkSender(config);
          break;
        case 'enttecpro':
          sender = new EnttecProNetworkSender(config);
          break;
        default:
          throw new Error(`Unknown sender type: ${senderType}`);
      }

      this.senders.set(senderId, sender);
      console.log(`NetworkWorker: Sender "${senderId}" created and stored, sending SENDER_CREATED`);
      this.sendToMain({ type: 'SENDER_CREATED', senderId });
    } catch (error) {
      console.error(`NetworkWorker: Error creating sender "${senderId}":`, error);
      this.sendToMain({
        type: 'SENDER_ERROR',
        senderId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private async startSender(senderId: string): Promise<void> {
    console.log(`NetworkWorker: Starting sender "${senderId}"`);
    const sender = this.senders.get(senderId);
    if (!sender) {
      console.error(`NetworkWorker: Sender "${senderId}" not found`);
      throw new Error(`Sender ${senderId} not found`);
    }

    try {
      await sender.start();
      console.log(`NetworkWorker: Sender "${senderId}" started successfully, sending SENDER_STARTED`);
      this.sendToMain({ type: 'SENDER_STARTED', senderId });
    } catch (error) {
      console.error(`NetworkWorker: Error starting sender "${senderId}":`, error);
      this.sendToMain({
        type: 'SENDER_ERROR',
        senderId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private async stopSender(senderId: string): Promise<void> {
    const sender = this.senders.get(senderId);
    if (!sender) {
      return;
    }

    try {
      await sender.stop();
      this.senders.delete(senderId);
      this.sendToMain({ type: 'SENDER_STOPPED', senderId });
    } catch (error) {
      this.sendToMain({
        type: 'SENDER_ERROR',
        senderId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private sendDmxData(senderId: string, universeBuffer: Record<number, number>): void {
    const sender = this.senders.get(senderId);
    if (!sender) {
      return;
    }

    try {
      sender.send(universeBuffer);
    } catch (error) {
      this.sendToMain({
        type: 'SEND_ERROR',
        senderId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private sendBlackout(senderId: string): void {
    const sender = this.senders.get(senderId);
    if (!sender) {
      return;
    }

    try {
      sender.sendBlackout();
    } catch (error) {
      this.sendToMain({
        type: 'SEND_ERROR',
        senderId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}

// Start the worker if this file is run directly
// Only instantiate if this is the main module being executed
if (require.main === module) {
  console.log('NetworkWorker: Instantiating worker thread');
  new NetworkWorker();
}
