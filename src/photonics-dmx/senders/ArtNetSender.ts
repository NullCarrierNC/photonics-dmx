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
  /** Latest frame withheld by the rate limiter, flushed by {@link flushTimer}. */
  private pendingBuffer: Record<number, number> | null = null
  private flushTimer: NodeJS.Timeout | null = null

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
      this.eventEmitter.emit('SenderError', errorEvent)
      throw err // Re-throw to allow SenderManager to handle it
    }
  }

  public async stop(): Promise<void> {
    if (!this.universe) {
      return
    }

    log.info(`Stopping ArtNet sender on host ${this.host}...`)

    // Drop any withheld frame and its flush timer BEFORE the blackout write, so the last frame on
    // the wire is the blackout rather than a stale queued cue frame.
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    this.pendingBuffer = null

    try {
      this.lastSendTimeMs = 0
      // Blackout all 512 channels through send(), which converts the 1-based DMX channels to the
      // 0-based keys dmxnet expects (its prepChannel rejects channel 512).
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
          // Throttled: keep the latest frame and schedule a trailing-edge flush so the
          // final frame of a burst still reaches the wire instead of being dropped. Snapshot
          // the frame: the publisher reuses and mutates its slot buffer in place each frame, so
          // holding it by reference would let the trailing flush send a newer frame than the one
          // withheld. The buffer is a flat channel->value record, so a shallow copy suffices.
          this.pendingBuffer = { ...universeBuffer }
          if (!this.flushTimer) {
            this.flushTimer = setTimeout(() => {
              this.flushTimer = null
              const buffer = this.pendingBuffer
              this.pendingBuffer = null
              if (buffer) {
                void this.send(buffer)
              }
            }, this.minIntervalMs - elapsed)
          }
          return
        }
        this.lastSendTimeMs = now
      }

      // A frame that goes out now supersedes any queued trailing frame.
      this.pendingBuffer = null

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
