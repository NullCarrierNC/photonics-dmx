import { DMX, type IUniverseDriver } from 'dmx-ts'
import type { Logger } from '../../shared/logger'
import { blackoutUniverse } from '../helpers/dmxHelpers'
import { BaseSender } from './BaseSender'

/**
 * A wire sender driving one dmx-ts universe: Art-Net and the Enttec Pro. They share the driver,
 * the universe it hands back, and the order a stop has to go in. Each supplies only how its
 * blackout reaches the driver and what it is writing to.
 */
export abstract class DmxTsSender extends BaseSender {
  protected readonly dmx = new DMX()
  protected universe?: IUniverseDriver

  constructor(
    private readonly label: string,
    private readonly logger: Logger,
  ) {
    super()
  }

  /** What this sender writes to, for the stop log line: a host or a serial port. */
  protected abstract describeTarget(): string

  /** Put the blackout frame on the wire the way this sender's driver takes it. */
  protected abstract writeBlackout(buffer: Record<number, number>): Promise<void> | void

  /** How long to wait for the blackout frame to leave before closing the connection (ms). A
   *  subclass whose driver sends slower than this overrides it to cover at least one interval. */
  protected blackoutSettleMs(): number {
    return 100
  }

  /**
   * Stop the sender, leaving the universe dark.
   *
   * A withheld frame is dropped first so the blackout is the last frame on the wire. The blackout
   * then gets a moment to leave before the listeners and the connection go, and a close that fails
   * still ends with the sender holding no universe.
   */
  public async stop(): Promise<void> {
    if (!this.universe) {
      return
    }

    this.logger.info(`Stopping ${this.label} sender on ${this.describeTarget()}...`)
    this.cancelThrottledSend()

    try {
      try {
        await this.writeBlackout(blackoutUniverse())
        this.logger.info(`Sent zero values to all ${this.label} channels`)
      } catch (err) {
        this.logger.error('Failed to send zero values before stopping:', err)
      }

      // Give the blackout time to leave before the connection goes.
      await new Promise((resolve) => setTimeout(resolve, this.blackoutSettleMs()))

      try {
        this.removeAllSendErrorListeners()
        this.dmx.removeAllListeners()
        this.logger.info('Removed all event listeners')
      } catch (err) {
        this.logger.error('Error removing event listeners:', err)
      }

      try {
        await this.dmx.close()
        this.logger.info(`${this.label} connection closed`)
      } catch (err) {
        this.logger.error(`Error during ${this.label} close:`, err)
        // Drop the universe now and let any pending driver work settle before carrying on.
        this.universe = undefined
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
    } catch (outerErr) {
      this.logger.error(`Unhandled error during ${this.label} sender stop:`, outerErr)
    } finally {
      this.universe = undefined
      this.logger.info(`${this.label} sender cleanup completed`)
    }
  }
}
