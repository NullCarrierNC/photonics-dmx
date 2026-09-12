import { ArtnetDriver } from 'dmx-ts'
import { createLogger } from '../../shared/logger'
import { hzToThrottleIntervalMs } from '../../shared/dmxOutputRefresh'
import { SenderError } from './BaseSender'
import { DmxTsSender } from './DmxTsSender'

const log = createLogger('ArtNetSender')

/** Default Art-Net output rate in Hz. */
export const ARTNET_DEFAULT_MAX_OUTPUT_RATE = 44

export interface ArtNetSenderOptions {
  universe?: number
  net?: number
  subnet?: number
  subuni?: number
  port?: number
  base_refresh_interval?: number
  /** Max packets per second (Hz). 0 = no limit. */
  maxOutputRate?: number
}

export class ArtNetSender extends DmxTsSender {
  constructor(
    private host: string = '127.0.0.1',
    private options: ArtNetSenderOptions = {
      universe: 1,
      net: 0,
      subnet: 0,
      subuni: 0,
      port: 6454,
      base_refresh_interval: 1000,
      maxOutputRate: ARTNET_DEFAULT_MAX_OUTPUT_RATE,
    },
  ) {
    super('ArtNet', log)
    const rate = this.options.maxOutputRate ?? ARTNET_DEFAULT_MAX_OUTPUT_RATE
    this.minIntervalMs = hzToThrottleIntervalMs(rate)
  }

  public async start(): Promise<void> {
    try {
      this.universe = await this.dmx.addUniverse(
        'artnet-universe',
        // dmx-ts reads the keepalive as `unchangedDataInterval` (it maps that onto dmxnet's
        // base_refresh_interval internally); the config side carries the value under the dmxnet
        // name, so translate here where the driver is constructed.
        new ArtnetDriver(this.host, {
          ...this.options,
          unchangedDataInterval: this.options.base_refresh_interval,
        }),
      )
    } catch (err) {
      const errorEvent = new SenderError(err, { senderId: 'artnet' })
      this.emitSenderError(errorEvent)
      throw err // Re-throw to allow SenderManager to handle it
    }
  }

  protected describeTarget(): string {
    return `host ${this.host}`
  }

  /**
   * The blackout goes through send(), which converts the 1-based DMX channels to the 0-based keys
   * dmxnet expects (its prepChannel rejects channel 512).
   */
  protected async writeBlackout(buffer: Record<number, number>): Promise<void> {
    await this.send(buffer)
  }

  public async send(universeBuffer: Record<number, number>): Promise<boolean> {
    try {
      this.verifySenderStarted()

      if (this.throttleSend(universeBuffer)) {
        return true
      }

      // Convert from 1-based DMX indexing to 0-based ArtNet indexing
      const convertedBuffer: Record<number, number> = {}
      for (const channelStr in universeBuffer) {
        const channel = parseInt(channelStr, 10)
        convertedBuffer[channel - 1] = universeBuffer[channel]
      }

      this.universe!.update(convertedBuffer)
      return true
    } catch (err: unknown) {
      log.error('ArtNetSender error:', err)
      this.emitSenderError(this.toSenderError(err, 'artnet'))
      return false
    }
  }

  protected verifySenderStarted(): void {
    if (!this.universe) {
      throw new Error("ArtNetSender isn't started.")
    }
  }

  public getUniverse(): number {
    return this.options.universe || 1
  }

  public override getConfiguredPort(): number {
    return this.options.port ?? 6454
  }
}
