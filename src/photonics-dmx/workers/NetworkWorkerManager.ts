import { BaseWorker } from './BaseWorker';
import { EventEmitter } from 'events';
import { resolve as pathResolve } from 'path';

/**
 * Manages the network worker thread from the main thread
 */
export class NetworkWorkerManager extends BaseWorker {
  private senders: Map<string, WorkerSender> = new Map();
  private isInitialized = false;

  constructor() {
    // Use correct path for both development and production
    const workerPath = pathResolve(__dirname, 'workers/NetworkWorker.js');
    super(workerPath);
  }

  protected handleMessage(message: any): void {
    switch (message.type) {
      case 'WORKER_READY':
        this.isInitialized = true;
        this.emit('ready');
        break;
      case 'SENDER_CREATED':
        this.handleSenderCreated(message.senderId);
        break;
      case 'SENDER_STARTED':
        this.handleSenderStarted(message.senderId);
        break;
      case 'SENDER_STOPPED':
        this.handleSenderStopped(message.senderId);
        break;
      case 'SENDER_ERROR':
        this.handleSenderError(message.senderId, message.error);
        break;
      case 'SEND_ERROR':
        this.handleSendError(message.senderId, message.error);
        break;
      case 'WORKER_ERROR':
        console.error('Worker error:', message.error, message.stack);
        this.emit('error', new Error(message.error));
        break;
      case 'SHUTDOWN_COMPLETE':
        this.emit('shutdown_complete');
        break;
      default:
        console.warn('Unknown worker message type:', message.type);
    }
  }

  /**
   * Initialize the network worker
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log(`NetworkWorkerManager: Already initialized`);
      return;
    }

    console.log(`NetworkWorkerManager: Starting worker...`);
    try {
      await this.start();
      console.log(`NetworkWorkerManager: Worker started successfully`);
      this.isInitialized = true;
      console.log(`NetworkWorkerManager: Initialization complete`);
    } catch (error) {
      console.error(`NetworkWorkerManager: Failed to start worker:`, error);
      throw error;
    }
  }

  /**
   * Create a new sender in the worker thread
   */
  public async createSender(
    senderId: string,
    senderType: 'artnet' | 'sacn' | 'enttecpro',
    config: any
  ): Promise<WorkerSender> {
    console.log(`NetworkWorkerManager: Creating sender "${senderId}" of type "${senderType}"`);
    
    if (!this.isInitialized) {
      console.log(`NetworkWorkerManager: Initializing worker manager for sender "${senderId}"`);
      await this.initialize();
    }

    // Check if sender already exists
    if (this.senders.has(senderId)) {
      console.log(`NetworkWorkerManager: Sender "${senderId}" already exists, returning existing sender`);
      return this.senders.get(senderId)!;
    }

    return new Promise((resolve, reject) => {
      console.log(`NetworkWorkerManager: Creating new WorkerSender for "${senderId}"`);
      const sender = new WorkerSender(senderId, senderType, config, this);

      // Set up promise resolution when sender is created
      const onCreated = () => {
        console.log(`NetworkWorkerManager: Sender "${senderId}" created successfully`);
        this.removeListener('sender_error', onError);
        this.senders.set(senderId, sender);
        resolve(sender);
      };

      // Timeout after 10 seconds
      const timeoutId = setTimeout(() => {
        console.error(`NetworkWorkerManager: Timeout creating sender "${senderId}" - this should not happen if sender was created successfully`);
        this.removeListener('sender_created', wrappedOnCreated);
        this.removeListener('sender_error', onError);
        reject(new Error('Timeout creating sender'));
      }, 10000);

      // Clear timeout when sender is created successfully
      const wrappedOnCreated = () => {
        clearTimeout(timeoutId);
        onCreated();
      };

      const onError = (errorSenderId: string, error: string) => {
        if (errorSenderId === senderId) {
          console.error(`NetworkWorkerManager: Error creating sender "${senderId}": ${error}`);
          clearTimeout(timeoutId);
          this.removeListener('sender_created', wrappedOnCreated);
          reject(new Error(error));
        }
      };

      this.once('sender_created', wrappedOnCreated);
      this.once('sender_error', onError);

      // Send create message to worker
      console.log(`NetworkWorkerManager: Sending CREATE_SENDER message for "${senderId}"`);
      this.sendMessage({
        type: 'CREATE_SENDER',
        senderId,
        senderType,
        config
      });
    });
  }

  /**
   * Send DMX data to a specific sender
   */
  public sendDmxData(senderId: string, universeBuffer: Record<number, number>): void {
    if (!this.isInitialized) {
      return;
    }

    this.sendMessage({
      type: 'SEND_DMX',
      senderId,
      universeBuffer
    });
  }

  /**
   * Send blackout to a specific sender
   */
  public sendBlackout(senderId: string): void {
    if (!this.isInitialized) {
      return;
    }

    this.sendMessage({
      type: 'SEND_BLACKOUT',
      senderId
    });
  }

  /**
   * Shutdown the network worker
   */
  public async shutdown(): Promise<void> {
    if (!this.isInitialized) {
      return;
    }

    this.isInitialized = false;

    // Send shutdown to all senders first
    for (const sender of this.senders.values()) {
      try {
        await sender.stop();
      } catch (error) {
        console.error('Error stopping sender during shutdown:', error);
      }
    }

    this.senders.clear();
    await this.stop();
  }

  private handleSenderCreated(senderId: string): void {
    this.emit('sender_created', senderId);
  }

  private handleSenderStarted(senderId: string): void {
    this.emit('sender_started', senderId);
  }

  private handleSenderStopped(senderId: string): void {
    this.emit('sender_stopped', senderId);
    this.senders.delete(senderId);
  }

  private handleSenderError(senderId: string, error: string): void {
    this.emit('sender_error', senderId, error);
  }

  private handleSendError(senderId: string, error: string): void {
    this.emit('send_error', senderId, error);
  }
}

/**
 * Wrapper for senders running in the worker thread
 */
export class WorkerSender extends EventEmitter {
  private isStarted = false;

  constructor(
    private senderId: string,
    private senderType: string,
    private config: any,
    private workerManager: NetworkWorkerManager
  ) {
    super();

    // Set up event forwarding from worker manager
    workerManager.on('sender_started', (id: string) => {
      if (id === this.senderId) {
        this.isStarted = true;
        workerManager.emit('started', this.senderId);
      }
    });

    workerManager.on('sender_error', (id: string, error: string) => {
      if (id === this.senderId) {
        workerManager.emit('error', this.senderId, error);
      }
    });

    workerManager.on('send_error', (id: string, error: string) => {
      if (id === this.senderId) {
        workerManager.emit('send_error', this.senderId, error);
      }
    });
  }

  /**
   * Start the sender
   */
  public async start(): Promise<void> {
    if (this.isStarted) {
      throw new Error('Sender already started');
    }

    return new Promise((resolve, reject) => {
      const onStarted = () => {
        this.workerManager.removeListener('sender_error', onError);
        resolve();
      };

      const onError = (senderId: string, error: string) => {
        if (senderId === this.senderId) {
          this.workerManager.removeListener('sender_started', onStarted);
          reject(new Error(error));
        }
      };

      this.workerManager.once('sender_started', onStarted);
      this.workerManager.once('sender_error', onError);

      this.workerManager.sendMessageToWorker({
        type: 'START_SENDER',
        senderId: this.senderId
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        this.workerManager.removeListener('sender_started', onStarted);
        this.workerManager.removeListener('sender_error', onError);
        reject(new Error('Timeout starting sender'));
      }, 5000);
    });
  }

  /**
   * Stop the sender
   */
  public async stop(): Promise<void> {
    if (!this.isStarted) {
      return;
    }

    return new Promise((resolve) => {
      const onStopped = () => {
        this.isStarted = false;
        resolve();
      };

      this.workerManager.once('sender_stopped', onStopped);

      this.workerManager.sendMessageToWorker({
        type: 'STOP_SENDER',
        senderId: this.senderId
      });

      // Timeout after 3 seconds
      setTimeout(() => {
        this.workerManager.removeListener('sender_stopped', onStopped);
        this.isStarted = false;
        resolve();
      }, 3000);
    });
  }

  /**
   * Send DMX data
   */
  public send(universeBuffer: Record<number, number>): void {
    if (!this.isStarted) {
      throw new Error('Sender not started');
    }

    this.workerManager.sendDmxData(this.senderId, universeBuffer);
  }

  /**
   * Send blackout
   */
  public sendBlackout(): void {
    if (!this.isStarted) {
      return;
    }

    this.workerManager.sendBlackout(this.senderId);
  }

  /**
   * Check if sender is running
   */
  public isRunning(): boolean {
    return this.isStarted;
  }

  /**
   * Get sender configuration
   */
  public getConfig(): any {
    return this.config;
  }

  /**
   * Get sender type
   */
  public getType(): string {
    return this.senderType;
  }
}
