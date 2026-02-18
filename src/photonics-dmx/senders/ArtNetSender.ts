import { DMX, ArtnetDriver, IUniverseDriver } from "dmx-ts";
import { EventEmitter } from "events";
import { BaseSender, SenderError } from "./BaseSender";

export class ArtNetSender extends BaseSender {
  private dmx: DMX = new DMX();
  private universe?: IUniverseDriver;
  private eventEmitter: EventEmitter;

  constructor(
    private host: string = "127.0.0.1",
    private options = {
      universe: 1,
      net: 0,
      subnet: 0,
      subuni: 0,
      port: 6454,
      base_refresh_interval: 1000  // 1 second refresh interval for unchanged frames
    }
  ) {
    super();
    this.eventEmitter = new EventEmitter();
  }

  public async start(): Promise<void> {
    try {
      this.universe = await this.dmx.addUniverse(
        "artnet-universe",
        new ArtnetDriver(this.host, this.options)
      );
      
      // Listen for error events from the DMX instance
      this.dmx.on('error', (err: any) => {
        console.error("ArtNetSender DMX error event:", err);
        const isNetworkError = err && (
          err.code === 'EHOSTUNREACH' ||
          err.code === 'EHOSTDOWN' ||
          err.code === 'ENETUNREACH' ||
          err.code === 'ETIMEDOUT' ||
          err.syscall === 'send'
        );
        
        const errorEvent = new SenderError(err, {
          senderId: 'artnet',
          shouldDisable: isNetworkError,
          code: err && typeof err === 'object' && 'code' in err ? String((err as { code: unknown }).code) : undefined
        });
        this.eventEmitter.emit("SenderError", errorEvent);
      });
    } catch (err) {
      const errorEvent = new SenderError(err, { senderId: 'artnet' });
      this.eventEmitter.emit("SenderError", errorEvent);
      throw err; // Re-throw to allow SenderManager to handle it
    }
  }

  public async stop(): Promise<void> {
    if (!this.universe) {
      return;
    }
    
    console.log(`Stopping ArtNet sender on host ${this.host}...`);
    
    try {
      // First set all channels to zero (blackout)
      const zeroPayload: Record<number, number> = {};
      for (let channel = 1; channel <= 255; channel++) {
        zeroPayload[channel] = 0;
      }
      
      // Try to update one last time
      try {
        if (this.universe) {
          this.universe.update(zeroPayload);
          console.log("Sent zero values to all ArtNet channels");
        }
      } catch (err) {
        console.error("Failed to send zero values before stopping:", err);
      }
      
      // Give a small delay to ensure commands are sent
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Clean up all event listeners first
      try {
        this.eventEmitter.removeAllListeners();
        if (this.dmx) {
          this.dmx.removeAllListeners();
        }
        console.log("Removed all event listeners");
      } catch (err) {
        console.error("Error removing event listeners:", err);
      }
      
      // Close the DMX connection
      try {
        if (this.dmx) {
          await this.dmx.close();
          console.log("ArtNet connection closed");
        }
      } catch (err) {
        console.error("Error during ArtNet close:", err);
        
        // If close fails, we'll try forcibly clearing references
        try {
          this.universe = undefined;
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (innerErr) {
          console.error("Error during failsafe cleanup:", innerErr);
        }
      }
    } catch (outerErr) {
      console.error("Unhandled error during ArtNetSender stop:", outerErr);
    } finally {
      // Final cleanup, clear all references
      this.universe = undefined;
      console.log("ArtNetSender cleanup completed");
    }
  }

  public async send(universeBuffer: Record<number, number>): Promise<void> {
    try {
      this.verifySenderStarted();
      
      // Convert from 1-based DMX indexing to 0-based ArtNet indexing
      const convertedBuffer: Record<number, number> = {};
      for (const channelStr in universeBuffer) {
        const channel = parseInt(channelStr, 10);
        convertedBuffer[channel - 1] = universeBuffer[channel];
      }
      
      this.universe!.update(convertedBuffer);
    } catch (err: any) {
      console.error("ArtNetSender error:", err);
      
      // Check if this is a network error that indicates an invalid destination
      const isNetworkError = err && (
        err.code === 'EHOSTUNREACH' ||
        err.code === 'EHOSTDOWN' ||
        err.code === 'ENETUNREACH' ||
        err.code === 'ETIMEDOUT' ||
        err.syscall === 'send'
      );
      
      const errorEvent = new SenderError(err, {
        senderId: 'artnet',
        shouldDisable: isNetworkError,
        code: err && typeof err === 'object' && 'code' in err ? String((err as { code: unknown }).code) : undefined
      });
      this.eventEmitter.emit("SenderError", errorEvent);
    }
  }

  protected verifySenderStarted(): void {
    if (!this.universe) {
      throw new Error("ArtNetSender isn't started.");
    }
  }

  public onSendError(listener: (error: SenderError) => void): void {
    this.eventEmitter.on("SenderError", listener);
  }

  public removeSendError(listener: (error: SenderError) => void): void {
    this.eventEmitter.off("SenderError", listener);
  }

  public getUniverse(): number {
    return this.options.universe || 1;
  }

  public getConfiguredPort(): number {
    return this.options.port;
  }
} 