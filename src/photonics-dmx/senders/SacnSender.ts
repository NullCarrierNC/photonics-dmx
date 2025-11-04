// src/senders/SacnSender.ts
import { EventEmitter } from 'events';
import { BaseSender, SenderError } from './BaseSender';
import { Sender } from 'sacn';
import * as os from 'os';

export interface SacnConfig {
  universe?: number;
  networkInterface?: string;
  useUnicast?: boolean;
  unicastDestination?: string;
}

export class SacnSender extends BaseSender {
  private sender: Sender | undefined;
  private eventEmitter: EventEmitter;
  private config: SacnConfig;
  
  // Reusable payload buffer for performance optimization
  private payloadBuffer: Record<number, number> = {};

  constructor(config: SacnConfig = {}) {
    super();
    this.eventEmitter = new EventEmitter();
    this.config = config;
    
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
    
    const universe = this.config.universe || 1;
    const networkInterface = this.config.networkInterface;
    const unicastDestination = this.config.unicastDestination;
    const useUnicast = this.config.useUnicast || false;

    // Ensure universe is a valid number
    const validUniverse = Math.max(1, Math.min(63999, Number(universe)));

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
      const networkInterfaces = os.networkInterfaces();
      const iface = this.getNetworkInterfaceAddress(networkInterface, networkInterfaces);

      if (!iface) {
        throw new Error(`Network interface '${networkInterface}' not found`);
      }

      senderOptions.iface = iface;
    }

    // Add unicast destination if specified
    if (useUnicast && unicastDestination) {
      senderOptions.useUnicastDestination = unicastDestination;
    }
    
    this.sender = new Sender(senderOptions);
  }

  private getNetworkInterfaceAddress(interfaceName: string, networkInterfaces: NodeJS.Dict<os.NetworkInterfaceInfo[]>): string | undefined {
    const interfaces = networkInterfaces[interfaceName];
    if (!interfaces) {
      return undefined;
    }

    // Find the first IPv4 address that's not internal
    for (const iface of interfaces) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }

    // Fallback to first IPv4 address (even if internal)
    for (const iface of interfaces) {
      if (iface.family === 'IPv4') {
        return iface.address;
      }
    }

    return undefined;
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