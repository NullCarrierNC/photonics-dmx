import { DmxLightManager } from '../../photonics-dmx/controllers/DmxLightManager'
import { ILightingController } from '../../photonics-dmx/controllers/sequencer/interfaces'
import { YargNetworkListener } from '../../photonics-dmx/listeners/YARG/YargNetworkListener'
import { Rb3eNetworkListener } from '../../photonics-dmx/listeners/RB3/Rb3eNetworkListener'
import { Rb3MenuCueHandler } from '../../photonics-dmx/cueHandlers/Rb3MenuCueHandler'
import { YargCueHandler } from '../../photonics-dmx/cueHandlers/YargCueHandler'
import { ProcessorManager } from '../../photonics-dmx/processors/ProcessorManager'
import { RENDERER_RECEIVE } from '../../shared/ipcChannels'
import { createLogger } from '../../shared/logger'
import {
  noopRuntimeBroadcaster,
  type RuntimeBroadcaster,
} from '../../photonics-dmx/runtime/broadcaster'
import type { RigChain } from './RigChain'
import type { ChainFanout } from './ChainFanout'
const log = createLogger('ListenerCoordinator')

const noopBroadcaster = noopRuntimeBroadcaster

export interface ListenerCoordinatorDeps {
  getDmxLightManager: () => DmxLightManager | null
  getEffectsController: () => ILightingController | null
  getRigChains: () => RigChain[]
  getChainFanout: () => ChainFanout
  getMotionEnabled: () => boolean
  getActiveYargMotionCueRef: () => { groupId: string; cueId: string } | null
  getMotionCueMinimumHoldMs: () => number
  getMotionCueProbabilityPercent: () => number
  getFallbackCueTimeMs: () => number
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
    const chains = this.deps.getRigChains()
    if (this.isYargEnabled || chains.length === 0) {
      log.info('Cannot enable YARG: already enabled or no rig chains')
      return
    }
    if (this.isRb3Enabled) {
      await this.disableRb3()
    }
    // Create one YargCueHandler per rig chain so each chain resolves cues against its own
    // lights and sequencer. Only the primary chain's handler emits renderer broadcasts so
    // the UI gets one event per logical cue rather than one per rig.
    for (const chain of chains) {
      if (chain.yargCueHandler) {
        chain.yargCueHandler.shutdown()
      }
      const handler = new YargCueHandler(chain.dmxLightManager, chain.sequencer, {
        getMotionCueMinimumHoldMs: this.deps.getMotionCueMinimumHoldMs,
        getMotionCueProbabilityPercent: this.deps.getMotionCueProbabilityPercent,
        // Secondary chains share a no-op broadcaster so they don't produce duplicate
        // renderer events for the same cue running on every rig.
        runtimeBroadcaster: chain.isPrimary ? this.deps.runtimeBroadcaster : noopBroadcaster(),
      })
      handler.setMotionEnabled(this.deps.getMotionEnabled())
      handler.setManualMotionRef(this.deps.getActiveYargMotionCueRef())
      chain.yargCueHandler = handler
    }
    const primary = chains.find((c) => c.isPrimary) ?? chains[0]
    this.cueHandler = primary.yargCueHandler
    this.deps.setCueHandlerRef(this.cueHandler)
    if (this.yargListener) {
      await this.yargListener.shutdown()
    }
    // The listener calls into the fanout, which iterates every chain's handler.
    this.yargListener = new YargNetworkListener(this.deps.getChainFanout(), {
      getFallbackCueTimeMs: this.deps.getFallbackCueTimeMs,
    })
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
        ? 'YARG network port is already in use. Do you have YALCY or another app running? If so, you must quit it first.'
        : err instanceof Error
          ? err.message
          : String(err)
      log.error('Failed to start YARG listener:', err)
      this.yargListener = null
      this.isYargEnabled = false
      this.disposeYargChainHandlers()
      this.cueHandler = null
      this.deps.setCueHandlerRef(null)
      this.deps.sendToAllWindows(RENDERER_RECEIVE.YARG_ERROR, {
        type: isPortInUse ? 'port-in-use' : 'start-failed',
        message,
        autoDisabled: true,
      })
    }
  }

  public async disableYarg(): Promise<void> {
    if (!this.isYargEnabled) return
    // Blackout via every chain's sequencer so a multi-rig setup doesn't leave secondary
    // rigs lit while the primary fades out.
    for (const chain of this.deps.getRigChains()) {
      try {
        chain.sequencer.removeAllEffects()
        await chain.sequencer.blackout(0)
      } catch (error) {
        log.error(`Error clearing effects on rig ${chain.rigId} when disabling YARG:`, error)
      }
    }
    log.info(
      'ListenerCoordinator: Cleared running effects and blacked out every rig (disable YARG)',
    )
    if (this.yargListener) {
      await this.yargListener.shutdown()
      this.yargListener = null
    }
    this.isYargEnabled = false
    this.disposeYargChainHandlers()
    this.cueHandler = null
    this.deps.setCueHandlerRef(null)
  }

  /** Shutdown every chain's YARG handler. Safe to call when no handlers exist. */
  private disposeYargChainHandlers(): void {
    for (const chain of this.deps.getRigChains()) {
      if (chain.yargCueHandler) {
        chain.yargCueHandler.shutdown()
        chain.yargCueHandler = null
      }
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
    const chains = this.deps.getRigChains()
    if (this.isRb3Enabled || chains.length === 0) {
      log.info('Cannot enable RB3: already enabled or no rig chains')
      return
    }
    if (this.isYargEnabled) {
      await this.disableYarg()
    }
    this.disposeYargChainHandlers()
    this.cueHandler = null
    this.deps.setCueHandlerRef(null)

    // One menu-cue handler per chain so menu lighting renders independently on each rig.
    for (const chain of chains) {
      if (chain.rb3MenuCueHandler) {
        chain.rb3MenuCueHandler.shutdown()
      }
      chain.rb3MenuCueHandler = new Rb3MenuCueHandler(chain.dmxLightManager, chain.sequencer)
    }
    // The processor takes the chain fanout directly: the StageKit pipeline builds one
    // per-rig render processor for every chain, and the menu cue handler dispatches
    // `playMenuFrame` / `clear` to every chain's RB3 menu handler.
    log.info('ListenerCoordinator: Creating ProcessorManager with mode: direct')
    this.processorManager = new ProcessorManager(this.deps.getChainFanout(), { mode: 'direct' })
    this.processorManager.setCueHandler(this.deps.getChainFanout())
    this.rb3eListener = new Rb3eNetworkListener()
    this.processorManager.setNetworkListener(this.rb3eListener)
    this.rb3eListener.start()
    this.isRb3Enabled = true
    log.info('RB3 listener enabled in direct StageKit mode')
  }

  public async disableRb3(): Promise<void> {
    if (!this.isRb3Enabled) return
    for (const chain of this.deps.getRigChains()) {
      try {
        chain.sequencer.removeAllEffects()
        await chain.sequencer.blackout(0)
      } catch (error) {
        log.error(`Error clearing effects on rig ${chain.rigId} when disabling RB3:`, error)
      }
    }
    log.info('ListenerCoordinator: Cleared running effects and blacked out every rig (disable RB3)')
    if (this.rb3eListener) {
      await this.rb3eListener.shutdown()
      this.rb3eListener = null
    }
    this.isRb3Enabled = false
    if (this.processorManager) {
      this.processorManager.destroy()
      this.processorManager = null
    }
    for (const chain of this.deps.getRigChains()) {
      if (chain.rb3MenuCueHandler) {
        chain.rb3MenuCueHandler.shutdown()
        chain.rb3MenuCueHandler = null
      }
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
