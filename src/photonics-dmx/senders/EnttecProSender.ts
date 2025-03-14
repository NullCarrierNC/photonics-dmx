import { DMX, EnttecUSBDMXProDriver, IUniverseDriver } from "dmx-ts";
import { EventEmitter } from "events";
import { DmxChannel } from "../types";
import { BaseSender, SenderError } from "./BaseSender";

export class EnttecProSender extends BaseSender {
  private dmx:DMX = new DMX();
  private universe?: IUniverseDriver;
  private eventEmitter: EventEmitter;

  constructor(
    private port: string,
    private options = { dmxSpeed: 20 },
    private universeName: string = "uni1"
  ) {
    super();
    this.eventEmitter = new EventEmitter();
  }

  public async start(): Promise<void> {
    try {
      this.universe = await this.dmx.addUniverse(
        this.universeName,
        new EnttecUSBDMXProDriver(this.port, this.options)
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
    
    console.log(`Stopping Enttec Pro sender on port ${this.port}...`);
    
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
          console.log("Sent zero values to all DMX channels");
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
      
      // Carefully close the DMX connection
      try {
        if (this.dmx) {
          // Try first with close()
          await this.dmx.close();
          console.log("DMX connection closed");
        }
      } catch (err) {
        console.error("Error during DMX close:", err);
        
        // If close fails, we'll try forcibly clearing references
        try {
          // Force nullify the universe reference first
          this.universe = undefined;
          
          // Add a small delay to let any pending operations complete
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (innerErr) {
          console.error("Error during failsafe cleanup:", innerErr);
        }
      }
    } catch (outerErr) {
      console.error("Unhandled error during EnttecProSender stop:", outerErr);
    } finally {
      // Final cleanup, clear all references
      this.universe = undefined;
      console.log("EnttecProSender cleanup completed");
    }
  }

  public async send(channelValues: DmxChannel[]): Promise<void> {
   // console.log("Sending on port", this.port);
    try {
      this.verifySenderStarted();
      const payload: Record<number, number> = {};
      channelValues.forEach(({ channel, value }) => {
        payload[channel] = value;
      });
      this.universe!.update(payload);
    } catch (err) {
      console.error("EnttecProSender error:", err);
      const errorEvent = new SenderError(err);
      this.eventEmitter.emit("SenderError", errorEvent);
    }
  }

  protected verifySenderStarted(): void {
    if (!this.universe) {
      throw new Error("EnttecProSender isn't started.");
    }
  }

  public onSendError(listener: (error: SenderError) => void): void {
    this.eventEmitter.on("SenderError", listener);
  }

  public removeSendError(listener: (error: SenderError) => void): void {
    this.eventEmitter.off("SenderError", listener);
  }
}