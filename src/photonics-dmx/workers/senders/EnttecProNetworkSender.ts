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

    // Pre-allocate payload buffer with 512 channels (Enttec Pro uses 0-based indexing)
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
}

