// src/senders/SacnSender.ts
import { EventEmitter } from 'events';
import { BaseSender, SenderError } from './BaseSender';
import { Sender } from 'sacn';

export class SacnSender extends BaseSender {
  private sender: Sender | undefined;
  private eventEmitter: EventEmitter;
  
  // Reusable payload buffer for performance optimization
  private payloadBuffer: Record<number, number> = {};

  constructor() {
    super();
    this.eventEmitter = new EventEmitter();
    
    // Pre-allocate 512 channels (DMX universe size)
    for (let i = 1; i <= 512; i++) {
      this.payloadBuffer[i] = 0;
    }
  }

  public async start(): Promise<void> {
    // Reset payload buffer on start
    for (let i = 1; i <= 512; i++) {
      this.payloadBuffer[i] = 0;
    }
    
    this.sender = new Sender({
      universe: 1,
      defaultPacketOptions: {
        sourceName: "un1",
        useRawDmxValues: true,
      },
      minRefreshRate: 30,
      //  useUnicastDestination: "192.168.1.116",
    });
  }

  public async stop(): Promise<void> {
    if (!this.sender) {
      return;
    }

    try {
      const zeroBuffer: Record<number, number> = {};
      for (let i = 1; i <= 512; i++) {
        zeroBuffer[i] = 0;
      }
      await this.send(zeroBuffer);
    } catch (error) {
      console.error('Failed to send zero values before stopping:', error);
    } finally {
      this.sender.close();
      this.sender = undefined;
    }
  }

  public async send(universeBuffer: Record<number, number>): Promise<void> {
    try {
      this.verifySenderStarted();
      
      // Check if anything changed in the incoming buffer
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
        await this.sender!.send({ payload: this.payloadBuffer });
      }
    } catch (err) {
      console.error("SacnSender error:", err);
      const errorEvent = new SenderError(err);
      this.eventEmitter.emit('SenderError', errorEvent);
    }
  }

  protected verifySenderStarted(): void {
    if (!this.sender) {
      throw new Error("SacnSender isn't running.");
    }
  }

  public onSendError(listener: (error: SenderError) => void): void {
    this.eventEmitter.on('SenderError', listener);
  }

  public removeSendError(listener: (error: SenderError) => void): void {
    this.eventEmitter.off('SenderError', listener);
  }
}