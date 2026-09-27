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
  /** How long (ms) nothing new goes out before the last frame is resent. Default 1000. */
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
    this.refreshIntervalMs = this.options.base_refresh_interval ?? 1000
  }

  public async start(): Promise<void> {
    try {
      const driver = new ArtnetDriver(this.host, this.options)
      this.universe = await this.dmx.addUniverse('artnet-universe', driver)
      // dmxnet resends on a fixed timer alongside new frames, which doubles the packet rate while
      // the look changes, and has no setting to turn it off. send() arms the resends instead.
      clearInterval(driver.universe?.interval)
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

      this.scheduleRefresh(universeBuffer)
      this.universe!.update(convertedBuffer)
      return true
    } catch (err: unknown) {
      this.cancelRefresh()
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
