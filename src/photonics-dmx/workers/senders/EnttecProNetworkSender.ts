import { DMX, IUniverseDriver } from 'dmx-ts';
import { NetworkSender } from './NetworkSender';

/**
 * Enttec Pro sender implementation for worker thread
 */
export class EnttecProNetworkSender extends NetworkSender {
  private universe?: IUniverseDriver;
  private payloadBuffer: Record<number, number> = {};
  private dmx: DMX;

  constructor(private config: any) {
    super();
    this.dmx = new DMX();

    // Pre-allocate payload buffer with 512 channels
    for (let i = 0; i < 512; i++) {
      this.payloadBuffer[i] = 0;
    }
  }

  public async start(): Promise<void> {
    const EnttecUSBDMXProDriver = (await import('dmx-ts')).EnttecUSBDMXProDriver;
    this.universe = await this.dmx.addUniverse(
      "enttec-universe",
      new EnttecUSBDMXProDriver(this.config.devicePath)
    );
  }

  public async stop(): Promise<void> {
    if (!this.universe) {
      return;
    }

    console.log(`Stopping Enttec Pro sender on port ${this.config.devicePath}...`);

    try {
      // First set all channels to zero (blackout)
      this.sendBlackout();

      // Give a small delay to ensure commands are sent
      await new Promise(resolve => setTimeout(resolve, 100));

      // Close the DMX connection to release the serial port lock
      try {
        if (this.dmx) {
          await this.dmx.close();
          console.log("Enttec Pro DMX connection closed");
        }
      } catch (err) {
        console.error("Error during DMX close:", err);
      }
    } catch (err) {
      console.error("Error during EnttecProNetworkSender stop:", err);
    } finally {
      // Final cleanup, clear all references
      this.universe = undefined;
      console.log("Enttec Pro sender cleanup completed");
    }
  }

  public send(universeBuffer: Record<number, number>): void {
    if (!this.universe) {
      throw new Error("Enttec Pro sender not started");
    }

    // Update buffer with only changed values (optimization)
    let hasChanges = false;
    let channelCount = 0;

    for (const channelStr in universeBuffer) {
      channelCount++;
      const channel = parseInt(channelStr, 10);
      const value = universeBuffer[channel];
      
      // dmx-ts EnttecUSBDMXProDriver expects channel numbers directly (no conversion)
      if (this.payloadBuffer[channel] !== value) {
        this.payloadBuffer[channel] = value;
        hasChanges = true;
      }
    }

    // Log periodically to see if data is flowing
    if (Math.random() < 0.01 || hasChanges) {
      console.log(`EnttecProNetworkSender: received ${channelCount} channels, hasChanges=${hasChanges}`);
    }

    // Only send if something changed
    if (hasChanges) {
      try {
        this.universe.update(this.payloadBuffer);
      } catch (err) {
        console.error("EnttecProNetworkSender: Error calling universe.update:", err);
      }
    }
  }

  public sendBlackout(): void {
    if (this.universe) {
      const zeroPayload: Record<number, number> = {};
      for (let channel = 1; channel <= 512; channel++) {
        zeroPayload[channel] = 0;
      }
      this.universe.update(zeroPayload);
    }
  }
}

