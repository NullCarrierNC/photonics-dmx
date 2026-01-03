import { DMX, EnttecOpenUSBDMXDriver, IUniverseDriver } from "dmx-ts";
import { EventEmitter } from "events";
import { BaseSender, SenderError } from "./BaseSender";

export class OpenDmxSender extends BaseSender {
  private dmx: DMX = new DMX();
  private universe?: IUniverseDriver;
  private eventEmitter: EventEmitter;
  private dmxUniverse: number;

  constructor(
    private port: string,
    private options: { dmxSpeed?: number } = { dmxSpeed: 40 },
    private universeName: string = "uni1",
    universe: number = 0
  ) {
    super();
    this.eventEmitter = new EventEmitter();
    this.dmxUniverse = universe;
  }

  public async start(): Promise<void> {
    try {
      this.universe = await this.dmx.addUniverse(
        this.universeName,
        new EnttecOpenUSBDMXDriver(this.port, this.options)
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

    console.log(`Stopping OpenDMX sender on port ${this.port}...`);

    try {
      const zeroPayload: Record<number, number> = {};
      for (let channel = 1; channel <= 255; channel++) {
        zeroPayload[channel] = 0;
      }

      try {
        if (this.universe) {
          this.universe.update(zeroPayload);
          console.log("Sent zero values to all DMX channels");
        }
      } catch (err) {
        console.error("Failed to send zero values before stopping:", err);
      }

      await new Promise(resolve => setTimeout(resolve, 100));

      try {
        this.eventEmitter.removeAllListeners();
        if (this.dmx) {
          this.dmx.removeAllListeners();
        }
        console.log("Removed all event listeners");
      } catch (err) {
        console.error("Error removing event listeners:", err);
      }

      try {
        if (this.dmx) {
          await this.dmx.close();
          console.log("DMX connection closed");
        }
      } catch (err) {
        console.error("Error during DMX close:", err);
        try {
          this.universe = undefined;
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (innerErr) {
          console.error("Error during failsafe cleanup:", innerErr);
        }
      }
    } catch (outerErr) {
      console.error("Unhandled error during OpenDmxSender stop:", outerErr);
    } finally {
      this.universe = undefined;
      console.log("OpenDmxSender cleanup completed");
    }
  }

  public async send(universeBuffer: Record<number, number>): Promise<void> {
    try {
      this.verifySenderStarted();
      this.universe!.update(universeBuffer);
    } catch (err) {
      console.error("OpenDmxSender error:", err);
      const errorEvent = new SenderError(err);
      this.eventEmitter.emit("SenderError", errorEvent);
    }
  }

  protected verifySenderStarted(): void {
    if (!this.universe) {
      throw new Error("OpenDmxSender isn't started.");
    }
  }

  public onSendError(listener: (error: SenderError) => void): void {
    this.eventEmitter.on("SenderError", listener);
  }

  public removeSendError(listener: (error: SenderError) => void): void {
    this.eventEmitter.off("SenderError", listener);
  }

  public getUniverse(): number {
    return this.dmxUniverse;
  }
}

