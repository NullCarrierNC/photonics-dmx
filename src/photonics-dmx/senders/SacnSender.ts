// src/senders/SacnSender.ts
import { createLogger } from '../../shared/logger'
import { hzToThrottleIntervalMs } from '../../shared/dmxOutputRefresh'
import { BaseSender } from './BaseSender'
import { Sender } from 'sacn'
import * as os from 'os'

const log = createLogger('SacnSender')

/** Default sACN output rate in Hz. */
export const SACN_DEFAULT_MAX_OUTPUT_RATE = 44

export interface SacnConfig {
  universe?: number
  networkInterface?: string
  useUnicast?: boolean
  unicastDestination?: string
  /** Max packets per second (Hz). 0 = no limit. Default 44. */
  maxOutputRate?: number
  /** Passed to sacn `Sender` as minRefreshRate (Hz). Defaults to effective max output rate. */
  minRefreshRate?: number
}

export class SacnSender extends BaseSender {
  private sender: Sender | undefined
  private config: SacnConfig

  constructor(config: SacnConfig = {}) {
    super()
    this.config = config
    const throttleHz =
      config.maxOutputRate !== undefined && config.maxOutputRate !== null
        ? config.maxOutputRate
        : config.minRefreshRate ?? SACN_DEFAULT_MAX_OUTPUT_RATE
    this.minIntervalMs = hzToThrottleIntervalMs(throttleHz)
  }

  public async start(): Promise<void> {
    const universe = this.config.universe !== undefined ? this.config.universe : 1
    const networkInterface = this.config.networkInterface
    const unicastDestination = this.config.unicastDestination
    const useUnicast = this.config.useUnicast || false

    // Ensure universe is a valid number (0-63999)
    const validUniverse = Math.max(0, Math.min(63999, Number(universe)))

    // Configure sender options (sacn library does not export types for Sender options)
    const minRefreshHz =
      this.config.minRefreshRate ?? this.config.maxOutputRate ?? SACN_DEFAULT_MAX_OUTPUT_RATE

    const senderOptions: {
      universe: number
      port: number
      reuseAddr: boolean
      minRefreshRate: number
      defaultPacketOptions: { sourceName: string; useRawDmxValues: boolean }
      iface?: string
      useUnicastDestination?: string
    } = {
      universe: validUniverse,
      port: 5568,
      reuseAddr: true,
      minRefreshRate: minRefreshHz,
      defaultPacketOptions: {
        sourceName: 'Photonics-DMX',
        useRawDmxValues: true,
      },
    }

    // Only add iface if we have a specific interface selected (not auto-detect)
    if (networkInterface) {
      const networkInterfaces = os.networkInterfaces()
      const iface = this.getNetworkInterfaceAddress(networkInterface, networkInterfaces)

      if (!iface) {
        throw new Error(`Network interface '${networkInterface}' not found`)
      }

      senderOptions.iface = iface
    }

    // Add unicast destination if specified
    if (useUnicast && unicastDestination) {
      senderOptions.useUnicastDestination = unicastDestination
    }

    this.sender = new Sender(senderOptions)
  }

  private getNetworkInterfaceAddress(
    interfaceName: string,
    networkInterfaces: NodeJS.Dict<os.NetworkInterfaceInfo[]>,
  ): string | undefined {
    const interfaces = networkInterfaces[interfaceName]
    if (!interfaces) {
      return undefined
    }

    // Find the first IPv4 address that's not internal
    for (const iface of interfaces) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address
      }
    }

    // Fallback to first IPv4 address (even if internal)
    for (const iface of interfaces) {
      if (iface.family === 'IPv4') {
        return iface.address
      }
    }

    return undefined
  }

  public async stop(): Promise<void> {
    if (!this.sender) {
      return
    }

    // Cancel any queued trailing flush so it cannot fire after the sender closes.
    this.cancelThrottledSend()

    try {
      const zeroBuffer: Record<number, number> = {}
      for (let i = 1; i <= 512; i++) {
        zeroBuffer[i] = 0
      }
      await this.send(zeroBuffer)
    } catch (error) {
      log.error('Failed to send zero values before stopping:', error)
    } finally {
      this.sender.close()
      this.sender = undefined
    }
  }

  public async send(universeBuffer: Record<number, number>): Promise<void> {
    try {
      this.verifySenderStarted()

      if (this.throttleSend(universeBuffer)) {
        return
      }

      await this.sender!.send({ payload: universeBuffer })
    } catch (err: unknown) {
      log.error('SacnSender error:', err)
      this.emitSenderError(this.toSenderError(err, 'sacn'))
    }
  }

  protected verifySenderStarted(): void {
    if (!this.sender) {
      throw new Error("SacnSender isn't running.")
    }
  }

  public getUniverse(): number {
    return this.config.universe !== undefined ? this.config.universe : 1
  }

  public getConfiguredPort(): number {
    return 5568
  }
}
