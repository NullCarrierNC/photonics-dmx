import { DMX, EnttecUSBDMXProDriver, IUniverseDriver } from 'dmx-ts'
import { EventEmitter } from 'events'
import { BaseSender, SenderError } from './BaseSender'
import { createLogger } from '../../shared/logger'
const log = createLogger('EnttecProSender')

export class EnttecProSender extends BaseSender {
  private dmx: DMX = new DMX()
  private universe?: IUniverseDriver
  private eventEmitter: EventEmitter
  private dmxUniverse: number

  constructor(
    private port: string,
    private options = { dmxSpeed: 20 },
    private universeName: string = 'uni1',
    universe: number = 0,
  ) {
    super()
    this.eventEmitter = new EventEmitter()
    this.dmxUniverse = universe
  }

  public async start(): Promise<void> {
    this.universe = await this.dmx.addUniverse(
      this.universeName,
      new EnttecUSBDMXProDriver(this.port, this.options),
    )
  }

  public async stop(): Promise<void> {
    if (!this.universe) {
      return
    }

    log.info(`Stopping Enttec Pro sender on port ${this.port}...`)

    try {
      // First set all channels to zero (blackout). A DMX universe is 512 channels.
      const zeroPayload: Record<number, number> = {}
      for (let channel = 1; channel <= 512; channel++) {
        zeroPayload[channel] = 0
      }

      // Try to update one last time
      try {
        if (this.universe) {
          this.universe.update(zeroPayload)
          log.info('Sent zero values to all DMX channels')
        }
      } catch (err) {
        log.error('Failed to send zero values before stopping:', err)
      }

      // Give a small delay to ensure commands are sent
      await new Promise((resolve) => setTimeout(resolve, 100))

      // Clean up all event listeners first
      try {
        this.eventEmitter.removeAllListeners()
        if (this.dmx) {
          this.dmx.removeAllListeners()
        }
        log.info('Removed all event listeners')
      } catch (err) {
        log.error('Error removing event listeners:', err)
      }

      // Carefully close the DMX connection
      try {
        if (this.dmx) {
          // Try first with close()
          await this.dmx.close()
          log.info('DMX connection closed')
        }
      } catch (err) {
        log.error('Error during DMX close:', err)

        // If close fails, we'll try forcibly clearing references
        try {
          // Force nullify the universe reference first
          this.universe = undefined

          // Add a small delay to let any pending operations complete
          await new Promise((resolve) => setTimeout(resolve, 100))
        } catch (innerErr) {
          log.error('Error during failsafe cleanup:', innerErr)
        }
      }
    } catch (outerErr) {
      log.error('Unhandled error during EnttecProSender stop:', outerErr)
    } finally {
      // Final cleanup, clear all references
      this.universe = undefined
      log.info('EnttecProSender cleanup completed')
    }
  }

  public async send(universeBuffer: Record<number, number>): Promise<void> {
    try {
      this.verifySenderStarted()
      this.universe!.update(universeBuffer)
    } catch (err) {
      log.error('EnttecProSender error:', err)
      // Disable the sender on failure so the user gets a true on/off indicator and can
      // re-enable once corrected. dmx-ts does not surface the driver's async serial-write
      // errors (the SerialPort is private and not re-emitted), so this synchronous catch is
      // the only error signal available for the Enttec Pro.
      const errorEvent = new SenderError(err, { senderId: 'enttecpro', shouldDisable: true })
      this.eventEmitter.emit('SenderError', errorEvent)
    }
  }

  protected verifySenderStarted(): void {
    if (!this.universe) {
      throw new Error("EnttecProSender isn't started.")
    }
  }

  public onSendError(listener: (error: SenderError) => void): void {
    this.eventEmitter.on('SenderError', listener)
  }

  public removeSendError(listener: (error: SenderError) => void): void {
    this.eventEmitter.off('SenderError', listener)
  }

  public getUniverse(): number {
    return this.dmxUniverse
  }
}
