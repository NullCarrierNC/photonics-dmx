import { DMX, ArtnetDriver, IUniverseDriver } from 'dmx-ts';
import { NetworkSender } from './NetworkSender';

/**
 * ArtNet sender implementation for worker thread
 */
export class ArtNetNetworkSender extends NetworkSender {
  private universe?: IUniverseDriver;
  private payloadBuffer: Record<number, number> = {};
  private dmx: DMX;

  constructor(private config: any) {
    super();
    this.dmx = new DMX();

    // Pre-allocate payload buffer with 512 channels (ArtNet uses 0-based indexing)
    for (let i = 0; i < 512; i++) {
      this.payloadBuffer[i] = 0;
    }
  }

  public async start(): Promise<void> {
    try {
      // Validate configuration
      if (!this.config.host) {
        throw new Error('ArtNet host is required');
      }

      // Add timeout to prevent hanging on unresponsive targets
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`ArtNet connection timeout for host ${this.config.host}`)), 10000);
      });

      // Ensure base_refresh_interval is properly set
      const artnetOptions = {
        ...this.config.options,
        base_refresh_interval: this.config.options.base_refresh_interval || 1000
      };
      
      const universePromise = this.dmx.addUniverse(
        "artnet-universe",
        new ArtnetDriver(this.config.host, artnetOptions)
      );

      this.universe = await Promise.race([universePromise, timeoutPromise]);
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
}

