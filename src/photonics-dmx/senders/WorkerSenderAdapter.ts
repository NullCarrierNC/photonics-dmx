import { BaseSender, SenderError } from './BaseSender';
import { WorkerSender } from '../workers/NetworkWorkerManager';
import { IpcSender } from './IpcSender';
import { EventEmitter } from 'events';

/**
 * Adapter that makes WorkerSender compatible with BaseSender interface
 */
export class WorkerSenderAdapter extends BaseSender {
  private eventEmitter: EventEmitter;
  private workerSender: WorkerSender | null = null;
  private ipcSender: IpcSender | null = null;
  private isStarting = false;
  private isStopping = false;

  constructor(
    private senderId: string,
    private senderType: 'artnet' | 'sacn' | 'enttecpro' | 'ipc',
    private config: any,
    private workerManager: any
  ) {
    super();
    this.eventEmitter = new EventEmitter();
  }

  /**
   * Initialize the sender (IPC senders run in main process, others in worker threads)
   */
  public async initialize(): Promise<void> {
    if (this.senderType === 'ipc') {
      // IPC sender runs in main process
      if (this.ipcSender) {
        return;
      }
      this.ipcSender = new IpcSender();
    } else {
      // Network senders run in worker threads
      if (this.workerSender) {
        return;
      }

      try {
        console.log(`WorkerSenderAdapter: Creating worker sender for ${this.senderType} with ID "${this.senderId}"`);
        this.workerSender = await this.workerManager.createSender(
          this.senderId,
          this.senderType as 'artnet' | 'sacn' | 'enttecpro',
          this.config
        );
        console.log(`WorkerSenderAdapter: Worker sender created successfully for "${this.senderId}"`);

        // Set up error forwarding from worker manager
        this.workerManager.on('error', (senderId: string, error: string) => {
          if (senderId === this.senderId) {
            this.eventEmitter.emit('SenderError', new SenderError(new Error(error)));
          }
        });

        this.workerManager.on('send_error', (senderId: string, error: string) => {
          if (senderId === this.senderId) {
            this.eventEmitter.emit('SenderError', new SenderError(new Error(error)));
          }
        });
      } catch (error) {
        console.error(`WorkerSenderAdapter: Failed to create worker sender for "${this.senderId}":`, error);
        throw new Error(`Failed to create worker sender: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  public async start(): Promise<void> {
    if (this.isStarting || this.isStopping) {
      throw new Error('Sender is already starting or stopping');
    }

    if (this.senderType === 'ipc') {
      // IPC sender runs in main process
      if (!this.ipcSender) {
        await this.initialize();
      }
      if (this.ipcSender) {
        await this.ipcSender.start();
      }
    } else {
      // Network senders run in worker threads
      if (!this.workerSender) {
        console.log(`WorkerSenderAdapter: Initializing worker sender for "${this.senderId}"`);
        await this.initialize();
      }

      if (this.workerSender!.isRunning()) {
        console.log(`WorkerSenderAdapter: Worker sender "${this.senderId}" is already running`);
        return;
      }

      this.isStarting = true;
      console.log(`WorkerSenderAdapter: Starting worker sender "${this.senderId}"`);

      try {
        await this.workerSender!.start();
        console.log(`WorkerSenderAdapter: Worker sender "${this.senderId}" started successfully`);
      } catch (error) {
        console.error(`WorkerSenderAdapter: Failed to start worker sender "${this.senderId}":`, error);
        throw error;
      } finally {
        this.isStarting = false;
      }
    }
  }

  public async stop(): Promise<void> {
    if (this.isStarting || this.isStopping) {
      return;
    }

    if (this.senderType === 'ipc') {
      // IPC sender runs in main process
      if (this.ipcSender) {
        await this.ipcSender.stop();
        this.ipcSender = null;
      }
    } else {
      // Network senders run in worker threads
      if (!this.workerSender || !this.workerSender.isRunning()) {
        return;
      }

      this.isStopping = true;

      try {
        await this.workerSender.stop();
        this.workerSender = null;
      } finally {
        this.isStopping = false;
      }
    }
  }

  public async send(universeBuffer: Record<number, number>): Promise<void> {
    this.verifySenderStarted();

    if (this.senderType === 'ipc') {
      // IPC sender runs in main process
      if (!this.ipcSender) {
        throw new Error('IPC sender not initialized');
      }
      try {
        await this.ipcSender.send(universeBuffer);
      } catch (error) {
        this.eventEmitter.emit('SenderError', new SenderError(error));
      }
    } else {
      // Network senders run in worker threads
      if (!this.workerSender) {
        throw new Error('Worker sender not initialized');
      }

      // Fire-and-forget - don't await
      try {
        this.workerSender.send(universeBuffer);
      } catch (error) {
        this.eventEmitter.emit('SenderError', new SenderError(error));
      }
    }
  }

  protected verifySenderStarted(): void {
    if (this.senderType === 'ipc') {
      // IPC sender doesn't need to be "started" in the same way
      return;
    } else {
      // Network senders run in worker threads
      if (!this.workerSender || !this.workerSender.isRunning()) {
        throw new Error(`${this.senderType} sender isn't started.`);
      }
    }
  }

  public onSendError(listener: (error: SenderError) => void): void {
    this.eventEmitter.on('SenderError', listener);
  }

  public removeSendError(listener: (error: SenderError) => void): void {
    this.eventEmitter.off('SenderError', listener);
  }

  /**
   * Get the underlying worker sender
   */
  public getWorkerSender(): WorkerSender | null {
    return this.workerSender;
  }

  /**
   * Check if sender is running
   */
  public isRunning(): boolean {
    if (this.senderType === 'ipc') {
      return this.ipcSender !== null;
    } else {
      return this.workerSender?.isRunning() ?? false;
    }
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
