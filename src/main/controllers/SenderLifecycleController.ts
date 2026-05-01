import { ConfigurationManager } from '../../services/configuration/ConfigurationManager'
import { createLogger } from '../../shared/logger'
import {
  SenderManager,
  type SenderManagerIpcOptions,
} from '../../photonics-dmx/controllers/SenderManager'
import { SenderError, SenderId } from '../../photonics-dmx/senders/BaseSender'
import { createSenderErrorHandler } from './senderErrorHandler'
import { sendToAllWindows } from '../utils/windowUtils'
import {
  isSenderErrorHandled,
  markSenderErrorHandled,
  getLastErrorHandledTime,
  removeSenderErrorHandled,
} from '../senderErrorTracking'

const log = createLogger('SenderLifecycle')

interface NetworkErrorLike {
  code?: string
  syscall?: string
  port?: number
  address?: string
}

function isNetworkErrorLike(err: unknown): err is NetworkErrorLike {
  return err !== null && typeof err === 'object' && 'code' in err && 'syscall' in err
}

export type OutputSenderStateSnapshot = {
  sacn: boolean
  artnet: boolean
  enttecpro: boolean
  opendmx: boolean
}

export class SenderLifecycleController {
  private senderManager: SenderManager | null
  private readonly senderErrorHandler: (error: SenderError) => void
  private senderErrorTrackingCallback: ((senderId: string) => void) | null = null

  constructor(
    private readonly getConfig: () => ConfigurationManager,
    private readonly ipcSenderOptions: SenderManagerIpcOptions,
  ) {
    this.senderManager = new SenderManager(ipcSenderOptions)
    this.senderErrorHandler = createSenderErrorHandler(
      () => this.getSenderManager(),
      sendToAllWindows,
    )
    this.senderManager.onSendError(this.senderErrorHandler)
  }

  public ensureSenderManager(): void {
    if (this.senderManager === null) {
      this.senderManager = new SenderManager(this.ipcSenderOptions)
      this.senderManager.onSendError(this.senderErrorHandler)
      if (this.senderErrorTrackingCallback) {
        this.senderManager.setOnSenderEnabled(this.senderErrorTrackingCallback)
      }
    }
  }

  public getSenderManager(): SenderManager {
    this.ensureSenderManager()
    return this.senderManager!
  }

  /** For restart: snapshot of which outputs are enabled, or null if no manager yet. */
  public getActiveOutputSenderSnapshotIfAny(): OutputSenderStateSnapshot | null {
    if (!this.senderManager) return null
    const sm = this.senderManager
    return {
      sacn: sm.isSenderEnabled('sacn'),
      artnet: sm.isSenderEnabled('artnet'),
      enttecpro: sm.isSenderEnabled('enttecpro'),
      opendmx: sm.isSenderEnabled('opendmx'),
    }
  }

  public setSenderErrorTrackingCallback(callback: (senderId: string) => void): void {
    this.senderErrorTrackingCallback = callback
    this.ensureSenderManager()
    this.senderManager!.setOnSenderEnabled(callback)
  }

  public async shutdownSenderOnAppExit(): Promise<void> {
    if (this.senderManager) {
      try {
        await this.senderManager.shutdown()
      } catch (err) {
        log.error('Error shutting down sender manager:', err)
      }
    }
  }

  /** Shut down the current manager and clear the reference so the next `init` creates a new instance. */
  public async resetSenderForControllerRestart(): Promise<void> {
    if (this.senderManager) {
      try {
        await this.senderManager.shutdown()
      } catch (err) {
        log.error('Error shutting down sender manager:', err)
      }
    }
    this.senderManager = null
  }

  /**
   * Re-enable DMX output senders based on persisted preferences.
   * Called after controller restart so that sACN / Art-Net / USB senders
   * resume automatically without the user needing to toggle them off and on.
   */
  public async restoreSenderOutputsFromPrefs(
    activeSenders?: OutputSenderStateSnapshot,
  ): Promise<void> {
    const prefs = this.getConfig().getAllPreferences()
    const outputConfig = prefs.dmxOutputConfig
    if (!outputConfig) return

    const sendersToRestore: OutputSenderStateSnapshot = activeSenders ?? {
      sacn: outputConfig.sacnEnabled,
      artnet: outputConfig.artNetEnabled,
      enttecpro: outputConfig.enttecProEnabled,
      opendmx: outputConfig.openDmxEnabled,
    }

    this.ensureSenderManager()
    const sm = this.senderManager!

    if (sendersToRestore.sacn) {
      const sc = prefs.sacnConfig
      try {
        await sm.enableSender('sacn', 'sacn', {
          sender: 'sacn',
          universe: sc?.universe ?? 1,
          networkInterface: sc?.networkInterface || undefined,
          useUnicast: sc?.useUnicast ?? false,
          unicastDestination: sc?.unicastDestination || undefined,
        })
        log.info('Restored sACN sender from preferences')
      } catch (err) {
        log.error('Failed to restore sACN sender after restart:', err)
      }
    }

    if (sendersToRestore.artnet) {
      const ac = prefs.artNetConfig
      if (ac?.host) {
        try {
          await sm.enableSender('artnet', 'artnet', {
            sender: 'artnet',
            host: ac.host,
            universe: ac.universe,
            net: ac.net,
            subnet: ac.subnet,
            subuni: ac.subuni,
            port: ac.port,
          })
          log.info('Restored Art-Net sender from preferences')
        } catch (err) {
          log.error('Failed to restore Art-Net sender after restart:', err)
        }
      }
    }

    if (sendersToRestore.enttecpro) {
      const ec = prefs.enttecProConfig
      if (ec?.port) {
        try {
          await sm.enableSender('enttecpro', 'enttecpro', {
            sender: 'enttecpro',
            devicePath: ec.port,
          })
          log.info('Restored Enttec Pro sender from preferences')
        } catch (err) {
          log.error('Failed to restore Enttec Pro sender after restart:', err)
        }
      }
    }

    if (sendersToRestore.opendmx) {
      const oc = prefs.openDmxConfig
      if (oc?.port) {
        try {
          await sm.enableSender('opendmx', 'opendmx', {
            sender: 'opendmx',
            devicePath: oc.port,
            dmxSpeed: oc.dmxSpeed,
          })
          log.info('Restored OpenDMX sender from preferences')
        } catch (err) {
          log.error('Failed to restore OpenDMX sender after restart:', err)
        }
      }
    }
  }

  /**
   * Handles uncaught exceptions that are network sender errors.
   * Resolves senderId, performs emergency removal if needed, and delegates to the same
   * senderErrorHandler used for normal sender errors so all error handling is unified.
   * @returns true if the error was handled as a network sender error, false otherwise
   */
  public handleUncaughtException(error: unknown, getIsInitialized: () => boolean): boolean {
    const isNetworkError =
      isNetworkErrorLike(error) &&
      (error.code === 'EHOSTUNREACH' ||
        error.code === 'EHOSTDOWN' ||
        error.code === 'ENETUNREACH' ||
        error.code === 'ETIMEDOUT') &&
      error.syscall === 'send'

    if (!isNetworkError || !this.senderManager || !getIsInitialized()) {
      return false
    }

    let senderId: string | null = null
    if (isNetworkErrorLike(error)) {
      const senderManager = this.senderManager
      if (error.port != null) {
        senderId = senderManager.getSenderIdByPort(error.port)
      }
      if (!senderId && error.port == null && error.address) {
        if (senderManager.isSenderEnabled('artnet')) {
          senderId = 'artnet'
        } else if (senderManager.isSenderEnabled('sacn')) {
          senderId = 'sacn'
        }
      }
    }

    if (!senderId) {
      return false
    }

    const now = Date.now()
    if (now - getLastErrorHandledTime(senderId) < 1000) {
      return true
    }
    if (isSenderErrorHandled(senderId)) {
      return true
    }

    try {
      if (!this.senderManager.isSenderEnabled(senderId)) {
        return false
      }
      markSenderErrorHandled(senderId, now)

      const senderError = new SenderError(error, {
        senderId: senderId as SenderId,
        shouldDisable: true,
      })

      const sender = this.senderManager.getAndRemoveSenderForEmergency(senderId)
      if (sender) {
        log.error(`Network sender error (${senderId}):`, error)
        sender.stop().catch((stopErr: unknown) => {
          log.error(`Error stopping ${senderId} sender after network error:`, stopErr)
        })
        this.senderErrorHandler(senderError)
      } else {
        log.error(`Network sender error (${senderId}):`, error)
        this.senderManager.markInitFailed(senderId)
        this.senderManager.emitSenderError(senderError)
      }
      return true
    } catch (err) {
      log.error(`Error handling ${senderId} uncaught exception:`, err)
      removeSenderErrorHandled(senderId)
      return false
    }
  }
}
