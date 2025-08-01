import { DMX, ArtnetDriver, IUniverseDriver } from "dmx-ts";
import { EventEmitter } from "events";
import { DmxChannel } from "../types";
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
      port: 6454
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

  public async send(channelValues: DmxChannel[]): Promise<void> {
    try {
      this.verifySenderStarted();
      const payload: Record<number, number> = {};
      channelValues.forEach(({ channel, value }) => {
        // Channel indexing needs to be shifted by -1 for ArtNet
        const artNetChannel = channel - 1;
        payload[artNetChannel] = value;
      });
      
      // Log the DMX values being sent
      /*
      console.log(`[ArtNetSender] Sending DMX data to ${this.host}:`, {
        universe: this.options.universe,
        net: this.options.net,
        subnet: this.options.subnet,
        subuni: this.options.subuni,
        channelCount: channelValues.length,
        channels: channelValues.slice(0, 10), // Show first 10 channels
        payload: Object.keys(payload).length > 0 ? payload : 'No payload'
      });
      */

      this.universe!.update(payload);
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