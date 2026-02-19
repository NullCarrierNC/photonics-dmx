// src/senders/BaseSender.ts

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
   * Sends DMX data to the corresponding implementation.
   * @param universeBuffer Pre-built universe buffer (channel -> value mapping).
   */
  public abstract send(universeBuffer: Record<number, number>): Promise<void>

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

  /**
   * Registers an event listener for send errors.
   */
  public abstract onSendError(listener: (error: SenderError) => void): void

  /**
   * Removes an event listener for send errors.
   */
  public abstract removeSendError(listener: (error: SenderError) => void): void
}
