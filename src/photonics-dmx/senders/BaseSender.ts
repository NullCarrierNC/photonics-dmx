// src/senders/BaseSender.ts

export class SenderError {
  err: any;
  constructor(err: any) {
    this.err = err;
  }
}

export abstract class BaseSender {
  /**
   * Starts the sender.
   */
  public abstract start(): Promise<void>;

  /**
   * Stops the sender.
   */
  public abstract stop(): Promise<void>;

  /**
   * Sends DMX data to the corresponding implementation.
   * @param universeBuffer Pre-built universe buffer (channel -> value mapping).
   */
  public abstract send(universeBuffer: Record<number, number>): Promise<void>;

  /**
   * Verifies that the sender is ready to send data.
   * @throws Error if the sender is not started.
   */
  protected abstract verifySenderStarted(): void;

  /**
   * Registers an event listener for send errors.
   */
  public abstract onSendError(listener: (error: SenderError) => void): void;

  /**
   * Removes an event listener for send errors.
   */
  public abstract removeSendError(listener: (error: SenderError) => void): void;
}