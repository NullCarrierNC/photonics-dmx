import { DmxLightManager } from '../../photonics-dmx/controllers/DmxLightManager'
import { ILightingController } from '../../photonics-dmx/controllers/sequencer/interfaces'
import { YargNetworkListener } from '../../photonics-dmx/listeners/YARG/YargNetworkListener'
import { Rb3eNetworkListener } from '../../photonics-dmx/listeners/RB3/Rb3eNetworkListener'
import { Rb3MenuCueHandler } from '../../photonics-dmx/cueHandlers/Rb3MenuCueHandler'
import { YargCueHandler } from '../../photonics-dmx/cueHandlers/YargCueHandler'
import { getRb3CueRegistry } from '../../photonics-dmx/cues/registries/Rb3CueRegistry'
import { CueType } from '../../photonics-dmx/cues/types/cueTypes'
import { Rb3ChainRuntime } from '../../photonics-dmx/controllers/Rb3ChainRuntime'
import { ProcessorManager } from '../../photonics-dmx/processors/ProcessorManager'
import type { ProcessingMode } from '../../photonics-dmx/processors/ProcessorManager'
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
  getActiveRb3MotionCueRef: () => { groupId: string; cueId: string } | null
  getRb3MotionCueMinimumHoldMs: () => number
  getRb3MotionCueProbabilityPercent: () => number
  getRb3MotionCueDurationRangeSec: () => { min: number; max: number }
  getFallbackCueTimeMs: () => number
  sendSenderError: (message: string) => void
  sendToAllWindows: (channel: string, payload: unknown) => void
  runtimeBroadcaster: RuntimeBroadcaster
  setCueHandlerRef: (h: YargCueHandler | null) => void
  setRb3CueHandlerRef: (h: YargCueHandler | null) => void
  getRb3ProcessingMode: () => ProcessingMode
}

export class ListenerCoordinator {
  private yargListener: YargNetworkListener | null = null
  private rb3eListener: Rb3eNetworkListener | null = null
  private processorManager: ProcessorManager | null = null
  private cueHandler: YargCueHandler | null = null
  private rb3CueHandler: YargCueHandler | null = null
  private isYargEnabled = false
  private isRb3Enabled = false

  constructor(private readonly deps: ListenerCoordinatorDeps) {}

  public async enableYarg(isInitialized: boolean, initAsync: () => Promise<void>): Promise<void> {
    if (!isInitialized) {
      log.info('Initializing system before enabling YARG')
      await initAsync()
    }
    await this.enableYargInternal()
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
    this.buildYargChainHandlers(chains)
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
      this.clearYargCueHandlers()
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
    this.clearYargCueHandlers()
  }

  /**
   * Create one YargCueHandler per rig chain so each chain resolves cues against its own lights
   * and sequencer, and expose the primary chain's handler as the shared cue handler. Only the
   * primary chain's handler emits renderer broadcasts so the UI gets one event per logical cue
   * rather than one per rig. Used by both the YARG listener and RB3 cue mode (whose cues fan out
   * through these same handlers).
   */
  private buildYargChainHandlers(chains: RigChain[]): void {
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
  }

  /**
   * Build one RB3 cue handler per chain, pointed at the RB3 cue registry so RB3 cue mode's group,
   * lock, consistency, and motion state stay isolated from the YARG listener's. Populates the
   * RB3-only slot (not `yargCueHandler`) and exposes the primary chain's handler as the RB3 cue
   * handler reference; motion tunables come from the RB3 motion domain.
   */
  private buildRb3ChainHandlers(chains: RigChain[]): void {
    for (const chain of chains) {
      if (chain.rb3CueHandler) {
        chain.rb3CueHandler.shutdown()
      }
      const handler = new YargCueHandler(chain.dmxLightManager, chain.sequencer, {
        registry: getRb3CueRegistry(),
        getMotionCueMinimumHoldMs: this.deps.getRb3MotionCueMinimumHoldMs,
        getMotionCueProbabilityPercent: this.deps.getRb3MotionCueProbabilityPercent,
        runtimeBroadcaster: chain.isPrimary ? this.deps.runtimeBroadcaster : noopBroadcaster(),
        motionChangeChannel: RENDERER_RECEIVE.RB3_MOTION_CUE_CHANGE,
      })
      handler.setMotionEnabled(this.deps.getMotionEnabled())
      handler.setManualMotionRef(this.deps.getActiveRb3MotionCueRef())
      chain.rb3CueHandler = handler
    }
    const primary = chains.find((c) => c.isPrimary) ?? chains[0]
    this.rb3CueHandler = primary.rb3CueHandler
    this.deps.setRb3CueHandlerRef(this.rb3CueHandler)
  }

  /** Shutdown every chain's YARG handler and drop the shared reference. Each handler's shutdown ends
   *  any open YARG song, so the registry's once-per-song and motion locks don't survive the session. */
  private clearYargCueHandlers(): void {
    this.disposeYargChainHandlers()
    this.cueHandler = null
    this.deps.setCueHandlerRef(null)
  }

  /** Shutdown every chain's RB3 cue handler and drop the reference. Each handler's shutdown ends any
   *  open RB3 song, so the RB3 registry's locks don't survive into the next session. */
  private clearRb3CueHandlers(): void {
    for (const chain of this.deps.getRigChains()) {
      if (chain.rb3CueHandler) {
        chain.rb3CueHandler.shutdown()
        chain.rb3CueHandler = null
      }
    }
    this.rb3CueHandler = null
    this.deps.setRb3CueHandlerRef(null)
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
      await initAsync()
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
    this.clearYargCueHandlers()

    // One menu-cue handler per chain so menu lighting renders independently on each rig.
    for (const chain of chains) {
      if (chain.rb3MenuCueHandler) {
        chain.rb3MenuCueHandler.shutdown()
      }
      chain.rb3MenuCueHandler = new Rb3MenuCueHandler(chain.dmxLightManager, chain.sequencer)
    }
    const mode = this.deps.getRb3ProcessingMode()
    // Cue mode dispatches an always-active RB3 cue to each chain's own RB3 cue handler (resolved
    // against the RB3 cue registry), driven by the RB3 chain runtime. Direct mode drives the
    // sequencer straight from the packet stream and needs no cue handlers.
    let cueRuntime: Rb3ChainRuntime | undefined
    if (mode === 'cue') {
      this.buildRb3ChainHandlers(chains)
      cueRuntime = new Rb3ChainRuntime(this.deps.getChainFanout())
    }
    // The processor takes the chain fanout for menu dispatch (playMenuFrame / clear to each rig's
    // RB3 menu handler) and, in cue mode, the RB3 chain runtime for gameplay cue dispatch.
    log.info(`ListenerCoordinator: Creating ProcessorManager with mode: ${mode}`)
    this.processorManager = new ProcessorManager(this.deps.getChainFanout(), {
      mode,
      cueRuntime,
      getRb3MotionCueDurationRangeSec: this.deps.getRb3MotionCueDurationRangeSec,
      getRb3PrimaryGroupPool: () => getRb3CueRegistry().getActiveGroupsImplementing(CueType.RB3),
      onRb3PrimaryCueChange: (p) =>
        this.deps.sendToAllWindows(RENDERER_RECEIVE.RB3_GAME_MODE_CUE_CHANGE, { groupId: p }),
      onRb3GameModeScheduleChange: (p) =>
        this.deps.sendToAllWindows(RENDERER_RECEIVE.RB3_GAME_MODE_DEADLINE, p),
    })
    this.processorManager.setCueHandler(this.deps.getChainFanout())
    this.rb3eListener = new Rb3eNetworkListener()
    this.processorManager.setNetworkListener(this.rb3eListener)
    // Enable only once the socket is actually listening. On a bind failure (e.g. port in use) the
    // RB3 surface is torn back down and the renderer is told to un-toggle — otherwise the UI shows
    // an enabled listener that receives nothing.
    try {
      await this.rb3eListener.start()
      this.isRb3Enabled = true
      log.info(`RB3 listener enabled in ${mode} StageKit mode`)
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code
      const isPortInUse = code === 'EADDRINUSE'
      const message = isPortInUse
        ? 'RB3E network port is already in use. Is another lighting app or instance running? If so, you must quit it first.'
        : err instanceof Error
          ? err.message
          : String(err)
      log.error('Failed to start RB3E listener:', err)
      this.rb3eListener = null
      this.isRb3Enabled = false
      this.processorManager.destroy()
      this.processorManager = null
      this.clearRb3CueHandlers()
      for (const chain of chains) {
        if (chain.rb3MenuCueHandler) {
          chain.rb3MenuCueHandler.shutdown()
          chain.rb3MenuCueHandler = null
        }
      }
      this.deps.sendToAllWindows(RENDERER_RECEIVE.RB3_ERROR, {
        type: isPortInUse ? 'port-in-use' : 'start-failed',
        message,
        autoDisabled: true,
      })
    }
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
    // Cue mode built per-chain RB3 cue handlers; direct mode leaves none. Safe either way.
    this.clearRb3CueHandlers()
    for (const chain of this.deps.getRigChains()) {
      if (chain.rb3MenuCueHandler) {
        chain.rb3MenuCueHandler.shutdown()
        chain.rb3MenuCueHandler = null
      }
    }
  }

  public getRb3Mode(): ProcessingMode | 'none' {
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

  public getRb3CueHandler(): YargCueHandler | null {
    return this.rb3CueHandler
  }

  public getProcessorManager(): ProcessorManager | null {
    return this.processorManager
  }
}
