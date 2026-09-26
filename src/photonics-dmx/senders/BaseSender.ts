// src/senders/BaseSender.ts
import { EventEmitter } from 'events'

/** Sender type identifier for error reporting and auto-disable behaviour. */
export type SenderId = 'artnet' | 'sacn' | 'enttecpro' | 'opendmx' | 'ipc'

export interface SenderErrorOptions {
  /** Which sender raised the error; used instead of port heuristics. */
  senderId?: SenderId
  /** If true, the sender should be disabled (e.g. network unreachable). */
  shouldDisable?: boolean
  /** Optional error code (e.g. 'ENETUNREACH'). */
  code?: string
}

export class SenderError {
  /** Raw error for backwards compatibility and logging. */
  readonly err: unknown
  /** Human-readable message. */
  readonly message: string
  /** Which sender raised the error. */
  readonly senderId?: SenderId
  /** If true, the sender should be disabled. */
  readonly shouldDisable: boolean
  /** Error code when available. */
  readonly code?: string

  constructor(err: unknown, options: SenderErrorOptions = {}) {
    this.err = err
    this.message = err instanceof Error ? err.message : String(err)
    this.senderId = options.senderId
    this.shouldDisable = options.shouldDisable === true
    this.code =
      options.code ??
      (err && typeof err === 'object' && 'code' in err
        ? String((err as { code: unknown }).code)
        : undefined)
  }
}

export abstract class BaseSender {
  /**
   * Starts the sender.
   */
  public abstract start(): Promise<void>

  /**
   * Stops the sender.
   */
  public abstract stop(): Promise<void>

  /**
   * Put one frame on the wire, reporting whether it got there.
   *
   * True also covers a frame the throttle withheld, because the trailing flush will deliver it and
   * the wire ends up holding that buffer either way. Reporting those as failures would make the
   * publisher's governor drop its dirty-skip cache on every throttled frame.
   *
   * @param universeBuffer Pre-built universe buffer (channel -> value mapping).
   */
  public abstract send(universeBuffer: Record<number, number>): Promise<boolean>

  /**
   * Gets the universe number this sender is configured for.
   * @returns The universe number, or -1 for senders that handle all universes (e.g., IPC preview)
   */
  public abstract getUniverse(): number

  /**
   * Gets the configured network port for this sender, if applicable.
   * @returns The port number, or null for non-network senders (e.g. IPC, EnttecPro)
   */
  public getConfiguredPort(): number | null {
    return null
  }

  /**
   * Verifies that the sender is ready to send data.
   * @throws Error if the sender is not started.
   */
  protected abstract verifySenderStarted(): void

  /** Emits 'SenderError' events. Shared by every wire sender so each doesn't reimplement it. */
  private readonly errorEmitter = new EventEmitter()

  /**
   * Registers an event listener for send errors.
   */
  public onSendError(listener: (error: SenderError) => void): void {
    this.errorEmitter.on('SenderError', listener)
  }

  /**
   * Removes an event listener for send errors.
   */
  public removeSendError(listener: (error: SenderError) => void): void {
    this.errorEmitter.off('SenderError', listener)
  }

  /** Emit a send error to registered listeners. */
  protected emitSenderError(error: SenderError): void {
    this.errorEmitter.emit('SenderError', error)
  }

  /** Remove all registered send-error listeners. Used on stop/teardown. */
  protected removeAllSendErrorListeners(): void {
    this.errorEmitter.removeAllListeners('SenderError')
  }

  // --- Trailing-edge send throttle, shared by the network senders ---

  /** Min ms between packets on the wire. 0 sends every frame. */
  protected minIntervalMs: number = 0
  private lastSendTimeMs: number = 0
  /** Latest frame withheld by the throttle, flushed on the trailing edge. */
  private pendingBuffer: Record<number, number> | null = null
  private flushTimer: ReturnType<typeof setTimeout> | null = null

  /**
   * Whether this frame should be withheld.
   *
   * Returns true when the throttle has taken the frame, in which case the caller must not send:
   * the newest frame is held and a single timer is armed to flush it, so the last frame of a burst
   * still reaches the wire rather than being dropped. The frame is copied because the publisher
   * reuses and mutates its slot buffer in place, so holding it by reference would let the trailing
   * flush send a newer frame than the one that was withheld.
   */
  protected throttleSend(universeBuffer: Record<number, number>): boolean {
    if (this.minIntervalMs <= 0) {
      return false
    }
    const now = performance.now()
    const elapsed = now - this.lastSendTimeMs
    if (elapsed < this.minIntervalMs && this.lastSendTimeMs !== 0) {
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
      return true
    }
    this.lastSendTimeMs = now
    // A frame going out now supersedes any queued trailing frame.
    this.pendingBuffer = null
    return false
  }

  /** Drop a queued trailing frame and its timer. Used on stop, so a stopped sender stays quiet. */
  protected cancelThrottledSend(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    this.pendingBuffer = null
    this.lastSendTimeMs = 0
  }

  /**
   * Wraps a failed send as a {@link SenderError}, marking the codes that mean the far end is not
   * reachable so the manager disables the sender rather than logging every frame.
   */
  protected toSenderError(err: unknown, senderId: SenderId): SenderError {
    const errObj =
      err && typeof err === 'object' ? (err as { code?: string; syscall?: string }) : null
    const unreachable =
      errObj !== null &&
      (errObj.code === 'EHOSTUNREACH' ||
        errObj.code === 'EHOSTDOWN' ||
        errObj.code === 'ENETUNREACH' ||
        errObj.code === 'ETIMEDOUT' ||
        errObj.syscall === 'send')
    return new SenderError(err, {
      senderId,
      shouldDisable: unreachable,
      code: errObj && 'code' in errObj ? String(errObj.code) : undefined,
    })
  }
}
