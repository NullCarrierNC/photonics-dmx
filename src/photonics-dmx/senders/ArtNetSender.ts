import { DMX, ArtnetDriver, IUniverseDriver } from 'dmx-ts'
import { EventEmitter } from 'events'
import { createLogger } from '../../shared/logger'
import { BaseSender, SenderError } from './BaseSender'

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

export class ArtNetSender extends BaseSender {
  private dmx: DMX = new DMX()
  private universe?: IUniverseDriver
  private eventEmitter: EventEmitter
  private lastSendTimeMs: number = 0
  private minIntervalMs: number = 0

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
    super()
    this.eventEmitter = new EventEmitter()
    const rate = this.options.maxOutputRate ?? ARTNET_DEFAULT_MAX_OUTPUT_RATE
    this.minIntervalMs = rate > 0 ? 1000 / rate : 0
  }

  public async start(): Promise<void> {
    try {
      this.universe = await this.dmx.addUniverse(
        'artnet-universe',
        new ArtnetDriver(this.host, this.options),
      )

      // Listen for error events from the DMX instance
      this.dmx.on('error', (err: unknown) => {
        log.error('ArtNetSender DMX error event:', err)
        const errObj =
          err && typeof err === 'object' ? (err as { code?: string; syscall?: string }) : null
        const isNetworkError =
          errObj &&
          (errObj.code === 'EHOSTUNREACH' ||
            errObj.code === 'EHOSTDOWN' ||
            errObj.code === 'ENETUNREACH' ||
            errObj.code === 'ETIMEDOUT' ||
            errObj.syscall === 'send')
        const errorEvent = new SenderError(err, {
          senderId: 'artnet',
          shouldDisable: Boolean(isNetworkError),
          code: errObj && 'code' in errObj ? String(errObj.code) : undefined,
        })
        this.eventEmitter.emit('SenderError', errorEvent)
      })
    } catch (err) {
      const errorEvent = new SenderError(err, { senderId: 'artnet' })
      this.eventEmitter.emit('SenderError', errorEvent)
      throw err // Re-throw to allow SenderManager to handle it
    }
  }

  public async stop(): Promise<void> {
    if (!this.universe) {
      return
    }

    log.info(`Stopping ArtNet sender on host ${this.host}...`)

    try {
      this.lastSendTimeMs = 0
      // Blackout all 512 channels. Route through send() so the 1-based DMX channels are
      // converted to 0-based Art-Net keys: dmxnet's prepChannel rejects channel 512, so a
      // direct universe.update() with 1-based keys throws and the blackout never transmits.
      const zeroPayload: Record<number, number> = {}
      for (let channel = 1; channel <= 512; channel++) {
        zeroPayload[channel] = 0
      }
      try {
        await this.send(zeroPayload)
        log.info('Sent zero values to all ArtNet channels')
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

      // Close the DMX connection
      try {
        if (this.dmx) {
          await this.dmx.close()
          log.info('ArtNet connection closed')
        }
      } catch (err) {
        log.error('Error during ArtNet close:', err)

        // If close fails, we'll try forcibly clearing references
        try {
          this.universe = undefined
          await new Promise((resolve) => setTimeout(resolve, 100))
        } catch (innerErr) {
          log.error('Error during failsafe cleanup:', innerErr)
        }
      }
    } catch (outerErr) {
      log.error('Unhandled error during ArtNetSender stop:', outerErr)
    } finally {
      // Final cleanup, clear all references
      this.universe = undefined
      log.info('ArtNetSender cleanup completed')
    }
  }

  public async send(universeBuffer: Record<number, number>): Promise<void> {
    try {
      this.verifySenderStarted()

      if (this.minIntervalMs > 0) {
        const now = performance.now()
        const elapsed = now - this.lastSendTimeMs
        if (elapsed < this.minIntervalMs && this.lastSendTimeMs !== 0) {
          return
        }
        this.lastSendTimeMs = now
      }

      // Convert from 1-based DMX indexing to 0-based ArtNet indexing
      const convertedBuffer: Record<number, number> = {}
      for (const channelStr in universeBuffer) {
        const channel = parseInt(channelStr, 10)
        convertedBuffer[channel - 1] = universeBuffer[channel]
      }

      this.universe!.update(convertedBuffer)
    } catch (err: unknown) {
      log.error('ArtNetSender error:', err)
      const errObj =
        err && typeof err === 'object' ? (err as { code?: string; syscall?: string }) : null
      const isNetworkError =
        errObj &&
        (errObj.code === 'EHOSTUNREACH' ||
          errObj.code === 'EHOSTDOWN' ||
          errObj.code === 'ENETUNREACH' ||
          errObj.code === 'ETIMEDOUT' ||
          errObj.syscall === 'send')
      const errorEvent = new SenderError(err, {
        senderId: 'artnet',
        shouldDisable: Boolean(isNetworkError),
        code: errObj && 'code' in errObj ? String(errObj.code) : undefined,
      })
      this.eventEmitter.emit('SenderError', errorEvent)
    }
  }

  protected verifySenderStarted(): void {
    if (!this.universe) {
      throw new Error("ArtNetSender isn't started.")
    }
  }

  public onSendError(listener: (error: SenderError) => void): void {
    this.eventEmitter.on('SenderError', listener)
  }

  public removeSendError(listener: (error: SenderError) => void): void {
    this.eventEmitter.off('SenderError', listener)
  }

  public getUniverse(): number {
    return this.options.universe || 1
  }

  public getConfiguredPort(): number {
    return this.options.port ?? 6454
  }
}
