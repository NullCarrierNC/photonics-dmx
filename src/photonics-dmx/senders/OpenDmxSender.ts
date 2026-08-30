/**
 * OpenDMX USB sender using enttec-open-dmx-usb.
 *
 * dmxSpeed (Hz) is mapped to send interval (ms) as: interval = 1000 / dmxSpeed.
 *
 * usleep: enttec-open-dmx-usb bit-bangs DMX512 and times the BREAK/MAB with
 * setTimeout unless given a microsecond sleep. We supply a precise busy-wait
 * (see ./usleep) so the break/mark-after-break framing meets the DMX spec,
 * which avoids flicker on FTDI adapters.
 */

import { EnttecOpenDMXUSBDevice } from 'enttec-open-dmx-usb'
import { createLogger } from '../../shared/logger'
import {
  OPEN_DMX_DEFAULT_REFRESH_RATE_HZ,
  hzToThrottleIntervalMs,
} from '../../shared/dmxOutputRefresh'
import { BaseSender, SenderError } from './BaseSender'
import { usleep } from './usleep'

const log = createLogger('OpenDmxSender')

/** Function that blocks for n microseconds (used for precise DMX break timing). */
type UsleepFn = (microSeconds: number) => unknown

interface OpenDmxDeviceOptions {
  dmxSpeed?: number
  onError?: (err: Error) => void
  usleep?: UsleepFn | null
}

/**
 * Converts dmxSpeed (Hz) to send interval in ms for enttec-open-dmx-usb.
 * interval = 1000 / dmxSpeed; e.g. 20 Hz -> 50 ms. Unlike the network senders, OpenDMX always
 * throttles, so a zero or invalid speed falls back to the default rate instead of "no throttle".
 */
function dmxSpeedToIntervalMs(dmxSpeed: number): number {
  return hzToThrottleIntervalMs(dmxSpeed) || 1000 / OPEN_DMX_DEFAULT_REFRESH_RATE_HZ
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
    const dmxSpeed = options.dmxSpeed ?? OPEN_DMX_DEFAULT_REFRESH_RATE_HZ
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
    const device = this.device

    if (this.onError) {
      device.off('error', this.onError)
    }
    const zeroPayload: Record<number, number> = {}
    for (let ch = 1; ch <= 512; ch++) {
      zeroPayload[ch] = 0
    }
    device.setChannels(zeroPayload, true)
    device.stopSending()

    type PortWithClose = {
      isOpen: boolean
      close: (cb: (err?: Error | null) => void) => void
      drain?: (cb: (err?: Error | null) => void) => void
    }
    const port = (device as unknown as { port?: PortWithClose }).port
    if (port && port.isOpen) {
      if (typeof port.drain === 'function') {
        try {
          await new Promise<void>((resolve, reject) => {
            port.drain!((err?: Error | null) => (err ? reject(err) : resolve()))
          })
        } catch {
          // Best effort; continue to close
        }
      }
      try {
        await new Promise<void>((resolve, reject) => {
          port.close((err?: Error | null) => (err ? reject(err) : resolve()))
        })
      } catch (err) {
        log.error('OpenDMX serial port close failed (port may already be closed):', err)
      }
    }
    this.device = null
  }
}

export class OpenDmxSender extends BaseSender {
  /** Consecutive send() failures before the sender reports itself unusable (transient USB write
   *  errors are normal at per-frame rates; a streak means the device is gone). */
  private static readonly MAX_SEND_FAILURES = 3

  private device: IOpenDmxDeviceAdapter | undefined
  private dmxUniverse: number
  private consecutiveSendFailures = 0
  private readonly deviceFactory?: (
    path: string,
    options: OpenDmxDeviceOptions,
  ) => IOpenDmxDeviceAdapter

  constructor(
    private port: string,
    private options: OpenDmxDeviceOptions = { dmxSpeed: OPEN_DMX_DEFAULT_REFRESH_RATE_HZ },
    _universeName: string = 'uni1', // All OpenDMX devices are single-universe
    universe: number = 0,
    deviceFactory?: (path: string, options: OpenDmxDeviceOptions) => IOpenDmxDeviceAdapter,
  ) {
    super()
    this.dmxUniverse = universe
    this.deviceFactory = deviceFactory
  }

  public async start(): Promise<void> {
    const onError = (err: Error): void => {
      const errorEvent = new SenderError(err, { senderId: 'opendmx', shouldDisable: true })
      this.emitSenderError(errorEvent)
    }
    const options: OpenDmxDeviceOptions = {
      dmxSpeed: this.options.dmxSpeed,
      onError,
      usleep,
    }
    const adapter = this.deviceFactory
      ? this.deviceFactory(this.port, options)
      : new OpenDmxDeviceAdapter(this.port, options)
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

    log.info(`Stopping OpenDMX sender on port ${this.port}...`)

    try {
      try {
        await this.device.stop()
        log.info('Sent zero values to all DMX channels and stopped sending')
      } catch (err) {
        log.error('Failed to stop OpenDMX device:', err)
      }

      this.removeAllSendErrorListeners()
      log.info('Removed all event listeners')
    } catch (outerErr) {
      log.error('Unhandled error during OpenDmxSender stop:', outerErr)
    } finally {
      this.device = undefined
      log.info('OpenDmxSender cleanup completed')
    }
  }

  public async send(universeBuffer: Record<number, number>): Promise<void> {
    try {
      this.verifySenderStarted()
      this.device!.writeChannels(universeBuffer)
      this.consecutiveSendFailures = 0
    } catch (err) {
      log.error('OpenDmxSender error:', err)
      // Per-frame USB writes can fail transiently, so a single failure only reports; a sustained
      // streak means the device is gone (unplug) and the sender must auto-disable like the
      // start-path failures do — otherwise frames error forever with the toggle still on.
      this.consecutiveSendFailures++
      const shouldDisable = this.consecutiveSendFailures >= OpenDmxSender.MAX_SEND_FAILURES
      const errorEvent = new SenderError(err, { senderId: 'opendmx', shouldDisable })
      this.emitSenderError(errorEvent)
    }
  }

  protected verifySenderStarted(): void {
    if (!this.device) {
      throw new Error("OpenDmxSender isn't started.")
    }
  }

  public getUniverse(): number {
    return this.dmxUniverse
  }
}
