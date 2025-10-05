import { DMX, ArtnetDriver, IUniverseDriver } from "dmx-ts";
import { EventEmitter } from "events";
import { BaseSender, SenderError } from "./BaseSender";

export class ArtNetSender extends BaseSender {
  private dmx: DMX = new DMX();
  private universe?: IUniverseDriver;
  private eventEmitter: EventEmitter;
  
  // Reusable payload buffer for performance optimization
  private payloadBuffer: Record<number, number> = {};

  constructor(
    private host: string = "127.0.0.1",
    private options = {
      universe: 1,
      net: 0,
      subnet: 0,
      subuni: 0,
      port: 6454
    }
  ) {
    super();
    this.eventEmitter = new EventEmitter();
    
    // Pre-allocate payload buffer with 512 channels (DMX universe size)
    for (let i = 0; i < 512; i++) {
      this.payloadBuffer[i] = 0;
    }
  }

  public async start(): Promise<void> {
    try {
      // Reset payload buffer on start
      for (let i = 0; i < 512; i++) {
        this.payloadBuffer[i] = 0;
      }
      
      this.universe = await this.dmx.addUniverse(
        "artnet-universe",
        new ArtnetDriver(this.host, this.options)
      );
    } catch (err) {
      const errorEvent = new SenderError(err);
      this.eventEmitter.emit("SenderError", errorEvent);
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
      
      // Check if anything changed in the incoming buffer
      let hasChanges = false;
      
      for (const channelStr in universeBuffer) {
        const channel = parseInt(channelStr, 10);
        const value = universeBuffer[channel];
        // Channel indexing needs to be shifted by -1 for ArtNet
        const artNetChannel = channel - 1;
        
        // Only update if value actually changed
        if (this.payloadBuffer[artNetChannel] !== value) {
          this.payloadBuffer[artNetChannel] = value;
          hasChanges = true;
        }
      }
      
      // Only send if something changed
      if (hasChanges) {
        this.universe!.update(this.payloadBuffer);
      }
    } catch (err) {
      console.error("ArtNetSender error:", err);
      const errorEvent = new SenderError(err);
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
} 