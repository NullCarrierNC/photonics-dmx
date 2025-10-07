import { WorkerThread } from './BaseWorker';
import { DMX, ArtnetDriver, IUniverseDriver } from 'dmx-ts';
import { EventEmitter } from 'events';

/**
 * Network worker thread for handling all DMX sender operations
 * This prevents network I/O from blocking the main UI thread
 */
export class NetworkWorker extends WorkerThread {
  private dmx: DMX;
  private universes: Map<string, IUniverseDriver> = new Map();
  private payloadBuffers: Map<string, Record<number, number>> = new Map();
  private senders: Map<string, NetworkSender> = new Map();

  constructor() {
    super();
    try {
      this.dmx = new DMX();
      console.log('DMX instance created successfully');

      // Set up global error handlers for the worker
      process.on('uncaughtException', (error) => {
        console.error('Uncaught exception in NetworkWorker:', error);
        this.sendToMain({
          type: 'WORKER_ERROR',
          error: `Uncaught exception: ${error.message}`,
          stack: error.stack
        });
      });

      process.on('unhandledRejection', (reason) => {
        console.error('Unhandled rejection in NetworkWorker:', reason);
        this.sendToMain({
          type: 'WORKER_ERROR',
          error: `Unhandled rejection: ${reason}`,
          stack: reason instanceof Error ? reason.stack : String(reason)
        });
      });

    } catch (error) {
      console.error('Failed to create DMX instance:', error);
      throw error;
    }
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
    this.universes.clear();
    this.payloadBuffers.clear();

    if (this.dmx) {
      try {
        await this.dmx.close();
      } catch (error) {
        console.error('Error closing DMX during shutdown:', error);
      }
    }
  }

  private createSender(senderId: string, senderType: string, config: any): void {
    try {
      // Check if sender already exists
      if (this.senders.has(senderId)) {
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
      this.sendToMain({ type: 'SENDER_CREATED', senderId });
    } catch (error) {
      this.sendToMain({
        type: 'SENDER_ERROR',
        senderId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private async startSender(senderId: string): Promise<void> {
    const sender = this.senders.get(senderId);
    if (!sender) {
      throw new Error(`Sender ${senderId} not found`);
    }

    try {
      await sender.start();
      this.sendToMain({ type: 'SENDER_STARTED', senderId });
    } catch (error) {
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

/**
 * Base class for network senders in worker thread
 */
abstract class NetworkSender {
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

/**
 * ArtNet sender implementation for worker thread
 */
class ArtNetNetworkSender extends NetworkSender {
  private universe?: IUniverseDriver;
  private payloadBuffer: Record<number, number> = {};

  constructor(private config: any) {
    super();

    // Pre-allocate payload buffer with 512 channels (ArtNet uses 0-based indexing)
    for (let i = 0; i < 512; i++) {
      this.payloadBuffer[i] = 0;
    }
  }

  public async start(): Promise<void> {
    try {
      console.log(`ArtNet sender starting with host: ${this.config.host}`, this.config.options);

      // Validate configuration
      if (!this.config.host) {
        throw new Error('ArtNet host is required');
      }

      // Add timeout to prevent hanging on unresponsive targets
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`ArtNet connection timeout for host ${this.config.host}`)), 10000);
      });

      const universePromise = this.dmx.addUniverse(
        "artnet-universe",
        new ArtnetDriver(this.config.host, this.config.options)
      );

      this.universe = await Promise.race([universePromise, timeoutPromise]);
      console.log(`ArtNet sender started successfully for host: ${this.config.host}`);
    } catch (error) {
      console.error(`Failed to start ArtNet sender for host ${this.config.host}:`, error);
      throw new Error(`ArtNet connection failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  public async stop(): Promise<void> {
    if (this.universe) {
      // Send blackout before stopping
      this.sendBlackout();

      // Clean up
      this.universe = undefined;
    }
  }

  public send(universeBuffer: Record<number, number>): void {
    if (!this.universe) {
      throw new Error("ArtNet sender not started");
    }

    // Update buffer with only changed values (optimization)
    let hasChanges = false;

    for (const channelStr in universeBuffer) {
      const channel = parseInt(channelStr, 10);
      const value = universeBuffer[channel];
      // ArtNet uses 0-based indexing, DMX uses 1-based
      const artNetChannel = channel - 1;

      if (this.payloadBuffer[artNetChannel] !== value) {
        this.payloadBuffer[artNetChannel] = value;
        hasChanges = true;
      }
    }

    // Only send if something changed
    if (hasChanges) {
      this.universe.update(this.payloadBuffer);
    }
  }

  public sendBlackout(): void {
    if (this.universe) {
      const zeroPayload: Record<number, number> = {};
      for (let channel = 1; channel <= 512; channel++) {
        const artNetChannel = channel - 1;
        zeroPayload[artNetChannel] = 0;
      }
      this.universe.update(zeroPayload);
    }
  }

  private get dmx(): DMX {
    // Access DMX instance from the worker
    return (global as any).dmx || new DMX();
  }
}

/**
 * sACN sender implementation for worker thread
 */
class SacnNetworkSender extends NetworkSender {
  private sender: any;
  private payloadBuffer: Record<number, number> = {};

  constructor(private config: any) {
    super();

    // Pre-allocate payload buffer with 512 channels (sACN uses 1-based indexing)
    for (let i = 1; i <= 512; i++) {
      this.payloadBuffer[i] = 0;
    }
  }

  public async start(): Promise<void> {
    const sacn = await import('sacn');
    const universe = this.config.universe || 1;
    console.log(`SACN sender starting with universe: ${universe} (type: ${typeof universe})`, this.config);

    // Ensure universe is a valid number
    const validUniverse = Math.max(1, Math.min(63999, Number(universe)));
    console.log(`SACN sender using universe: ${validUniverse}`);

    // SACN library expects universe as object with universe property
    this.sender = new sacn.Sender({ universe: validUniverse } as any);
    console.log(`SACN sender created successfully with universe: ${validUniverse}`);
  }

  public async stop(): Promise<void> {
    if (this.sender) {
      // Send blackout before stopping
      this.sendBlackout();
      this.sender = null;
    }
  }

  public send(universeBuffer: Record<number, number>): void {
    if (!this.sender) {
      throw new Error("sACN sender not started");
    }

    // Update buffer with only changed values (optimization)
    let hasChanges = false;

    for (const channelStr in universeBuffer) {
      const channel = parseInt(channelStr, 10);
      const value = universeBuffer[channel];

      if (this.payloadBuffer[channel] !== value) {
        this.payloadBuffer[channel] = value;
        hasChanges = true;
      }
    }

    // Only send if something changed
    if (hasChanges) {
      // Fire-and-forget - don't await
      this.sender.send({ payload: this.payloadBuffer }).catch((error: Error) => {
        this.sendError(`sACN send error: ${error.message}`);
      });
    }
  }

  public sendBlackout(): void {
    if (this.sender) {
      const zeroPayload: Record<number, number> = {};
      for (let channel = 1; channel <= 512; channel++) {
        zeroPayload[channel] = 0;
      }

      this.sender.send({ payload: zeroPayload }).catch((error: Error) => {
        this.sendError(`sACN blackout error: ${error.message}`);
      });
    }
  }
}

/**
 * Enttec Pro sender implementation for worker thread
 */
class EnttecProNetworkSender extends NetworkSender {
  private universe?: IUniverseDriver;
  private payloadBuffer: Record<number, number> = {};

  constructor(private config: any) {
    super();

    // Pre-allocate payload buffer with 512 channels (Enttec Pro uses 0-based indexing)
    for (let i = 0; i < 512; i++) {
      this.payloadBuffer[i] = 0;
    }
  }

  public async start(): Promise<void> {
    this.universe = await this.dmx.addUniverse(
      "enttec-universe",
      new (await import('dmx-ts')).EnttecUSBDMXProDriver(this.config.devicePath)
    );
  }

  public async stop(): Promise<void> {
    if (this.universe) {
      // Send blackout before stopping
      this.sendBlackout();

      // Clean up
      this.universe = undefined;
    }
  }

  public send(universeBuffer: Record<number, number>): void {
    if (!this.universe) {
      throw new Error("Enttec Pro sender not started");
    }

    // Update buffer with only changed values (optimization)
    let hasChanges = false;

    for (const channelStr in universeBuffer) {
      const channel = parseInt(channelStr, 10);
      const value = universeBuffer[channel];
      // Enttec Pro uses 0-based indexing, DMX uses 1-based
      const enttecChannel = channel - 1;

      if (this.payloadBuffer[enttecChannel] !== value) {
        this.payloadBuffer[enttecChannel] = value;
        hasChanges = true;
      }
    }

    // Only send if something changed
    if (hasChanges) {
      this.universe.update(this.payloadBuffer);
    }
  }

  public sendBlackout(): void {
    if (this.universe) {
      const zeroPayload: Record<number, number> = {};
      for (let channel = 1; channel <= 512; channel++) {
        const enttecChannel = channel - 1;
        zeroPayload[enttecChannel] = 0;
      }
      this.universe.update(zeroPayload);
    }
  }

  private get dmx(): DMX {
    // Access DMX instance from the worker
    return (global as any).dmx || new DMX();
  }
}

// Start the worker if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  new NetworkWorker();
}
