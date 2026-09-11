import { EnttecUSBDMXProDriver } from 'dmx-ts'
import { SenderError } from './BaseSender'
import { DmxTsSender } from './DmxTsSender'
import { createLogger } from '../../shared/logger'
const log = createLogger('EnttecProSender')

export class EnttecProSender extends DmxTsSender {
  private dmxUniverse: number

  constructor(
    private port: string,
    private options = { dmxSpeed: 20 },
    private universeName: string = 'uni1',
    universe: number = 0,
  ) {
    super('Enttec Pro', log)
    this.dmxUniverse = universe
  }

  public async start(): Promise<void> {
    this.universe = await this.dmx.addUniverse(
      this.universeName,
      new EnttecUSBDMXProDriver(this.port, this.options),
    )
  }

  protected describeTarget(): string {
    return `port ${this.port}`
  }

  /** The serial driver is 1-based, so the blackout goes to the universe as it is. */
  protected writeBlackout(buffer: Record<number, number>): void {
    this.universe?.update(buffer)
  }

  public async send(universeBuffer: Record<number, number>): Promise<boolean> {
    try {
      this.verifySenderStarted()
      this.universe!.update(universeBuffer)
      return true
    } catch (err) {
      log.error('EnttecProSender error:', err)
      // Disable the sender on failure so the user gets a true on/off indicator and can
      // re-enable once corrected. dmx-ts does not surface the driver's async serial-write
      // errors (the SerialPort is private and not re-emitted), so this synchronous catch is
      // the only error signal available for the Enttec Pro.
      const errorEvent = new SenderError(err, { senderId: 'enttecpro', shouldDisable: true })
      this.emitSenderError(errorEvent)
      return false
    }
  }

  protected verifySenderStarted(): void {
    if (!this.universe) {
      throw new Error("EnttecProSender isn't started.")
    }
  }

  public getUniverse(): number {
    return this.dmxUniverse
  }
}
