import { NetworkSender } from './NetworkSender';

/**
 * sACN sender implementation for worker thread
 */
export class SacnNetworkSender extends NetworkSender {
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
    const networkInterface = this.config.networkInterface;
    const unicastDestination = this.config.unicastDestination;
    const useUnicast = this.config.useUnicast || false;

    console.log(`SACN sender starting with universe: ${universe}, unicast: ${useUnicast}, destination: ${unicastDestination || 'broadcast'}, interface: ${networkInterface || 'auto'}`, this.config);

    // Ensure universe is a valid number
    const validUniverse = Math.max(1, Math.min(63999, Number(universe)));
    console.log(`SACN sender using universe: ${validUniverse}`);

    // Configure sender options
    const senderOptions: any = {
      universe: validUniverse,
      port: 5568,
      reuseAddr: true,
      defaultPacketOptions: {
        sourceName: "Photonics-DMX",
        useRawDmxValues: true,
      }
    };

    // Only add iface if we have a specific interface selected (not auto-detect)
    if (networkInterface) {
      const networkInterfaces = require('os').networkInterfaces();
      const iface = this.getNetworkInterfaceAddress(networkInterface, networkInterfaces);

      if (!iface) {
        throw new Error(`Network interface '${networkInterface}' not found`);
      }

      senderOptions.iface = iface;
      console.log(`SACN sender configured for specific interface: ${iface}`);
    } else {
      console.log('SACN sender configured for auto-detect interface');
    }

    // Add unicast destination if specified
    if (useUnicast && unicastDestination) {
      senderOptions.useUnicastDestination = unicastDestination;
      console.log(`SACN sender configured for unicast to: ${unicastDestination}`);
    }

    // Create the sACN sender
    this.sender = new sacn.Sender(senderOptions);

    // Send an initial blackout packet to ensure the sender is active
    // This helps establish the connection and ensures the sender is ready
    try {
      await this.sender.send({ payload: this.payloadBuffer });
      console.log(`SACN sender initialized with blackout packet on universe: ${validUniverse}`);
    } catch (error) {
      console.warn(`SACN sender initialization warning:`, error);
      // Don't throw here, the sender might still work for subsequent sends
    }

    const interfaceInfo = networkInterface ? ` on interface: ${networkInterface}` : ' (auto-detect)';
    console.log(`SACN sender created successfully with universe: ${validUniverse}${interfaceInfo}${useUnicast ? ` (unicast to ${unicastDestination})` : ' (broadcast)'}`);
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
    let changedChannels: number[] = [];

    for (const channelStr in universeBuffer) {
      const channel = parseInt(channelStr, 10);
      const value = universeBuffer[channel];

      if (this.payloadBuffer[channel] !== value) {
        this.payloadBuffer[channel] = value;
        hasChanges = true;
        changedChannels.push(channel);
      }
    }

    // Only send if something changed
    if (hasChanges) {
      // Fire-and-forget - don't await, but handle errors
      this.sender.send({ payload: this.payloadBuffer }).catch((error: Error) => {
        console.error(`sACN send error: ${error.message}`);
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
        console.error(`sACN blackout error: ${error.message}`);
        this.sendError(`sACN blackout error: ${error.message}`);
      });
    }
  }

  /**
   * Get the address of a specific network interface
   */
  private getNetworkInterfaceAddress(interfaceName: string, networkInterfaces: any): string | null {
    for (const [, interfaces] of Object.entries(networkInterfaces)) {
      for (const iface of interfaces as any[]) {
        // Skip internal and loopback interfaces
        if (!iface.internal && !iface.address.startsWith('127.')) {
          if (iface.address === interfaceName) {
            return iface.address;
          }
        }
      }
    }
    return null;
  }
}

