/**
 * OpenDMX USB sender using enttec-open-dmx-usb.
 *
 * dmxSpeed (Hz) is mapped to send interval (ms) as: interval = 1000 / dmxSpeed.
 * Optional usleep: On some systems Node's setTimeout is too imprecise for DMX
 * break/MAB timing; pass a microsecond sleep (e.g. easy-sleep) as options.usleep
 * to reduce flicker / timing issues.
 *
 * NOTE: usleep is part of the underling enttec-open-dmx-usb library, but is not
 * implemented in the rest of the Photonics system. It's included here in case
 * we add it down the road.
 */

import { EventEmitter } from 'events'
import { EnttecOpenDMXUSBDevice } from 'enttec-open-dmx-usb'
import { BaseSender, SenderError } from './BaseSender'

/** Function that blocks for n microseconds (used for precise DMX break timing). */
type UsleepFn = (microSeconds: number) => unknown

interface OpenDmxDeviceOptions {
  dmxSpeed?: number
  onError?: (err: Error) => void
  usleep?: UsleepFn | null
}

const DEFAULT_DMX_SPEED_HZ = 40

/**
 * Converts dmxSpeed (Hz) to send interval in ms for enttec-open-dmx-usb.
 * interval = 1000 / dmxSpeed; e.g. 40 Hz -> 25 ms.
 */
function dmxSpeedToIntervalMs(dmxSpeed: number): number {
  if (dmxSpeed <= 0 || !Number.isFinite(dmxSpeed)) {
    return 1000 / DEFAULT_DMX_SPEED_HZ
  }
  return Math.max(1, Math.round(1000 / dmxSpeed))
}

/** Minimal device interface used by OpenDmxSender (and by tests for injection). */
interface IOpenDmxDeviceAdapter {
  start(): Promise<void>
  writeChannels(buffer: Record<number, number>): void
  stop(): Promise<void>
}

/** Internal adapter wrapping enttec-open-dmx-usb for lifecycle and channel writes. */
class OpenDmxDeviceAdapter implements IOpenDmxDeviceAdapter {
  private device: EnttecOpenDMXUSBDevice | null = null
  private readonly path: string
  private readonly intervalMs: number
  private readonly onError?: (err: Error) => void
  private readonly usleep?: UsleepFn | null

  constructor(path: string, options: OpenDmxDeviceOptions = {}) {
    this.path = path
    this.onError = options.onError
    this.usleep = options.usleep
    const dmxSpeed = options.dmxSpeed ?? DEFAULT_DMX_SPEED_HZ
    this.intervalMs = dmxSpeedToIntervalMs(dmxSpeed)
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.device = new EnttecOpenDMXUSBDevice(this.path, false, this.usleep ?? undefined)
      if (this.onError) {
        this.device.on('error', this.onError)
      }
      const onReady = (): void => {
        this.device!.off('ready', onReady)
        this.device!.off('error', onError)
        try {
          this.device!.startSending(this.intervalMs)
          resolve()
        } catch (err) {
          reject(err)
        }
      }
      const onError = (err: Error): void => {
        this.device?.off('ready', onReady)
        this.device?.off('error', onError)
        reject(err)
      }
      this.device.once('ready', onReady)
      this.device.once('error', onError)
    })
  }

  writeChannels(buffer: Record<number, number>): void {
    if (this.device) {
      this.device.setChannels(buffer)
    }
  }

  async stop(): Promise<void> {
    if (!this.device) {
      return
    }
    if (this.onError) {
      this.device.off('error', this.onError)
    }
    const zeroPayload: Record<number, number> = {}
    for (let ch = 1; ch <= 512; ch++) {
      zeroPayload[ch] = 0
    }
    this.device.setChannels(zeroPayload, true)
    this.device.stopSending()
    this.device = null
  }
}

export class OpenDmxSender extends BaseSender {
  private device: IOpenDmxDeviceAdapter | undefined
  private eventEmitter: EventEmitter
  private dmxUniverse: number
  private readonly deviceFactory?: (
    path: string,
    options: OpenDmxDeviceOptions,
  ) => IOpenDmxDeviceAdapter

  constructor(
    private port: string,
    private options: OpenDmxDeviceOptions = { dmxSpeed: 40 },
    _universeName: string = 'uni1', // All OpenDMX devices are single-universe
    universe: number = 0,
    deviceFactory?: (path: string, options: OpenDmxDeviceOptions) => IOpenDmxDeviceAdapter,
  ) {
    super()
    this.eventEmitter = new EventEmitter()
    this.dmxUniverse = universe
    this.deviceFactory = deviceFactory
  }

  public async start(): Promise<void> {
    const adapter = this.deviceFactory
      ? this.deviceFactory(this.port, {
          dmxSpeed: this.options.dmxSpeed,
          onError: (err) => {
            const errorEvent = new SenderError(err, { senderId: 'opendmx' })
            this.eventEmitter.emit('SenderError', errorEvent)
          },
        })
      : new OpenDmxDeviceAdapter(this.port, {
          dmxSpeed: this.options.dmxSpeed,
          onError: (err) => {
            const errorEvent = new SenderError(err, { senderId: 'opendmx' })
            this.eventEmitter.emit('SenderError', errorEvent)
          },
        })
    try {
      await adapter.start()
      this.device = adapter
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new Error(
        `OpenDMX device failed to start on port "${this.port}": ${msg}. Check that the port exists and is not in use by another process.`,
      )
    }
  }

  public async stop(): Promise<void> {
    if (!this.device) {
      return
    }

    console.log(`Stopping OpenDMX sender on port ${this.port}...`)

    try {
      try {
        await this.device.stop()
        console.log('Sent zero values to all DMX channels and stopped sending')
      } catch (err) {
        console.error('Failed to stop OpenDMX device:', err)
      }

      this.eventEmitter.removeAllListeners()
      console.log('Removed all event listeners')
    } catch (outerErr) {
      console.error('Unhandled error during OpenDmxSender stop:', outerErr)
    } finally {
      this.device = undefined
      console.log('OpenDmxSender cleanup completed')
    }
  }

  public async send(universeBuffer: Record<number, number>): Promise<void> {
    try {
      this.verifySenderStarted()
      this.device!.writeChannels(universeBuffer)
    } catch (err) {
      console.error('OpenDmxSender error:', err)
      const errorEvent = new SenderError(err, { senderId: 'opendmx' })
      this.eventEmitter.emit('SenderError', errorEvent)
    }
  }

  protected verifySenderStarted(): void {
    if (!this.device) {
      throw new Error("OpenDmxSender isn't started.")
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
