import { DmxLightManager } from '../../photonics-dmx/controllers/DmxLightManager'
import { ILightingController } from '../../photonics-dmx/controllers/sequencer/interfaces'
import { YargNetworkListener } from '../../photonics-dmx/listeners/YARG/YargNetworkListener'
import { Rb3eNetworkListener } from '../../photonics-dmx/listeners/RB3/Rb3eNetworkListener'
import { Rb3MenuCueHandler } from '../../photonics-dmx/cueHandlers/Rb3MenuCueHandler'
import { YargCueHandler } from '../../photonics-dmx/cueHandlers/YargCueHandler'
import { ProcessorManager } from '../../photonics-dmx/processors/ProcessorManager'
import { RENDERER_RECEIVE } from '../../shared/ipcChannels'
import { createLogger } from '../../shared/logger'
import type { RuntimeBroadcaster } from '../../photonics-dmx/runtime/broadcaster'
const log = createLogger('ListenerCoordinator')

export interface ListenerCoordinatorDeps {
  getDmxLightManager: () => DmxLightManager | null
  getEffectsController: () => ILightingController | null
  getMotionEnabled: () => boolean
  getActiveYargMotionCueRef: () => { groupId: string; cueId: string } | null
  getMotionCueMinimumHoldMs: () => number
  getMotionCueProbabilityPercent: () => number
  sendSenderError: (message: string) => void
  sendToAllWindows: (channel: string, payload: unknown) => void
  runtimeBroadcaster: RuntimeBroadcaster
  setCueHandlerRef: (h: YargCueHandler | null) => void
}

export class ListenerCoordinator {
  private yargListener: YargNetworkListener | null = null
  private rb3eListener: Rb3eNetworkListener | null = null
  private processorManager: ProcessorManager | null = null
  private cueHandler: YargCueHandler | null = null
  private rb3MenuHandler: Rb3MenuCueHandler | null = null
  private isYargEnabled = false
  private isRb3Enabled = false

  constructor(private readonly deps: ListenerCoordinatorDeps) {}

  public enableYarg(isInitialized: boolean, initAsync: () => Promise<void>): void {
    if (!isInitialized) {
      log.info('Initializing system before enabling YARG')
      initAsync()
        .then(() => this.enableYargInternal())
        .catch((error) => {
          log.error('Error during initialization:', error)
        })
      return
    }
    void this.enableYargInternal().catch((error) => {
      log.error('Error enabling YARG:', error)
    })
  }

  public async enableYargInternal(): Promise<void> {
    const dmxLightManager = this.deps.getDmxLightManager()
    const effectsController = this.deps.getEffectsController()
    if (this.isYargEnabled || !effectsController || !dmxLightManager) {
      log.info('Cannot enable YARG: already enabled or missing required components')
      return
    }
    if (this.isRb3Enabled) {
      await this.disableRb3()
    }
    if (this.cueHandler) {
      this.cueHandler.shutdown()
    }
    this.cueHandler = new YargCueHandler(dmxLightManager, effectsController, {
      getMotionCueMinimumHoldMs: this.deps.getMotionCueMinimumHoldMs,
      getMotionCueProbabilityPercent: this.deps.getMotionCueProbabilityPercent,
      runtimeBroadcaster: this.deps.runtimeBroadcaster,
    })
    this.cueHandler.setMotionEnabled(this.deps.getMotionEnabled())
    this.cueHandler.setManualMotionRef(this.deps.getActiveYargMotionCueRef())
    this.deps.setCueHandlerRef(this.cueHandler)
    if (this.yargListener) {
      await this.yargListener.shutdown()
    }
    this.yargListener = new YargNetworkListener(this.cueHandler)
    this.yargListener.on(
      'yarg-error',
      (errorData: { type: string; message: string; datagramVersion?: number }) => {
        log.error('YARG Listener Error:', errorData)
        this.deps.sendToAllWindows(RENDERER_RECEIVE.YARG_ERROR, {
          type: errorData.type,
          message: errorData.message,
        })
      },
    )
    try {
      await this.yargListener.start()
      this.isYargEnabled = true
      log.info('YARG listener enabled')
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code
      const isPortInUse = code === 'EADDRINUSE'
      const message = isPortInUse
        ? 'YARG network port is already in use. Do you have YALCY or another running? If so, you must quit it first.'
        : err instanceof Error
          ? err.message
          : String(err)
      log.error('Failed to start YARG listener:', err)
      this.yargListener = null
      this.isYargEnabled = false
      if (this.cueHandler) {
        this.cueHandler.shutdown()
        this.cueHandler = null
        this.deps.setCueHandlerRef(null)
      }
      this.deps.sendToAllWindows(RENDERER_RECEIVE.YARG_ERROR, {
        type: isPortInUse ? 'port-in-use' : 'start-failed',
        message,
        autoDisabled: true,
      })
    }
  }

  public async disableYarg(): Promise<void> {
    if (!this.isYargEnabled) return
    const effectsController = this.deps.getEffectsController()
    if (effectsController) {
      try {
        effectsController.removeAllEffects()
        await effectsController.blackout(0)
        log.info(
          'ListenerCoordinator: Cleared all running effects and initiated blackout when disabling YARG',
        )
      } catch (error) {
        log.error('Error clearing effects when disabling YARG:', error)
      }
    }
    if (this.yargListener) {
      await this.yargListener.shutdown()
      this.yargListener = null
    }
    this.isYargEnabled = false
    if (this.cueHandler) {
      this.cueHandler.shutdown()
      this.cueHandler = null
      this.deps.setCueHandlerRef(null)
    }
  }

  public async enableRb3(isInitialized: boolean, initAsync: () => Promise<void>): Promise<void> {
    if (!isInitialized) {
      log.info('Initializing system before enabling RB3')
      initAsync()
        .then(() => this.enableRb3Internal())
        .catch((error) => {
          log.error('Error during initialization:', error)
        })
      return
    }
    await this.enableRb3Internal()
  }

  public async enableRb3Internal(): Promise<void> {
    const dmxLightManager = this.deps.getDmxLightManager()
    const effectsController = this.deps.getEffectsController()
    if (this.isRb3Enabled || !effectsController || !dmxLightManager) {
      log.info('Cannot enable RB3: already enabled or missing required components')
      return
    }
    if (this.isYargEnabled) {
      await this.disableYarg()
    }
    if (this.cueHandler) {
      this.cueHandler.shutdown()
      this.cueHandler = null
      this.deps.setCueHandlerRef(null)
    }
    log.info('ListenerCoordinator: Creating ProcessorManager with mode: direct')
    this.processorManager = new ProcessorManager(dmxLightManager, effectsController, {
      mode: 'direct',
    })
    this.rb3MenuHandler = new Rb3MenuCueHandler(dmxLightManager, effectsController)
    this.processorManager.setCueHandler(this.rb3MenuHandler)
    this.rb3eListener = new Rb3eNetworkListener()
    this.processorManager.setNetworkListener(this.rb3eListener)
    this.rb3eListener.start()
    this.isRb3Enabled = true
    log.info('RB3 listener enabled in direct StageKit mode')
  }

  public async disableRb3(): Promise<void> {
    if (!this.isRb3Enabled) return
    const effectsController = this.deps.getEffectsController()
    if (effectsController) {
      try {
        effectsController.removeAllEffects()
        await effectsController.blackout(0)
        log.info(
          'ListenerCoordinator: Cleared all running effects and initiated blackout when disabling RB3',
        )
      } catch (error) {
        log.error('Error clearing effects when disabling RB3:', error)
      }
    }
    if (this.rb3eListener) {
      await this.rb3eListener.shutdown()
      this.rb3eListener = null
    }
    this.isRb3Enabled = false
    if (this.processorManager) {
      this.processorManager.destroy()
      this.processorManager = null
    }
    if (this.rb3MenuHandler) {
      this.rb3MenuHandler.shutdown()
      this.rb3MenuHandler = null
    }
  }

  public getRb3Mode(): 'direct' | 'none' {
    if (!this.isRb3Enabled || !this.processorManager) {
      return 'none'
    }
    return this.processorManager.getCurrentMode()
  }

  public getRb3ProcessorStats(): ReturnType<ProcessorManager['getProcessorStats']> | null {
    if (!this.isRb3Enabled || !this.processorManager) {
      return null
    }
    return this.processorManager.getProcessorStats()
  }

  public getIsYargEnabled(): boolean {
    return this.isYargEnabled
  }

  public getIsRb3Enabled(): boolean {
    return this.isRb3Enabled
  }

  public getCueHandler(): YargCueHandler | null {
    return this.cueHandler
  }

  public getProcessorManager(): ProcessorManager | null {
    return this.processorManager
  }
}
