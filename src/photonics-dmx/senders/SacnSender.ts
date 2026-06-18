// src/senders/SacnSender.ts
import { EventEmitter } from 'events'
import { createLogger } from '../../shared/logger'
import { BaseSender, SenderError } from './BaseSender'
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
  private eventEmitter: EventEmitter
  private config: SacnConfig
  private lastSendTimeMs: number = 0
  private minIntervalMs: number = 0
  /** Latest frame withheld by the rate limiter, flushed on the trailing edge so the last frame of a burst is not dropped. */
  private pendingBuffer: Record<number, number> | null = null
  private flushTimer: ReturnType<typeof setTimeout> | null = null

  constructor(config: SacnConfig = {}) {
    super()
    this.eventEmitter = new EventEmitter()
    this.config = config
    const throttleHz =
      config.maxOutputRate !== undefined && config.maxOutputRate !== null
        ? config.maxOutputRate
        : config.minRefreshRate ?? SACN_DEFAULT_MAX_OUTPUT_RATE
    this.minIntervalMs = throttleHz > 0 ? 1000 / throttleHz : 0
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
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    this.pendingBuffer = null

    try {
      this.lastSendTimeMs = 0
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

      await this.sender!.send({ payload: universeBuffer })
    } catch (err: unknown) {
      log.error('SacnSender error:', err)
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
        senderId: 'sacn',
        shouldDisable: Boolean(isNetworkError),
        code: errObj && 'code' in errObj ? String(errObj.code) : undefined,
      })
      this.eventEmitter.emit('SenderError', errorEvent)
    }
  }

  protected verifySenderStarted(): void {
    if (!this.sender) {
      throw new Error("SacnSender isn't running.")
    }
  }

  public onSendError(listener: (error: SenderError) => void): void {
    this.eventEmitter.on('SenderError', listener)
  }

  public removeSendError(listener: (error: SenderError) => void): void {
    this.eventEmitter.off('SenderError', listener)
  }

  public getUniverse(): number {
    return this.config.universe !== undefined ? this.config.universe : 1
  }

  public getConfiguredPort(): number {
    return 5568
  }
}
