import { EventEmitter } from 'events'
import { DmxLightManager } from '../../photonics-dmx/controllers/DmxLightManager'
import { ILightingController } from '../../photonics-dmx/controllers/sequencer/interfaces'
import { YargNetworkListener } from '../../photonics-dmx/listeners/YARG/YargNetworkListener'
import { Rb3eNetworkListener } from '../../photonics-dmx/listeners/RB3/Rb3eNetworkListener'
import { Rb3MenuCueHandler } from '../../photonics-dmx/cueHandlers/Rb3MenuCueHandler'
import { CueHandler } from '../../photonics-dmx/cueHandlers/CueHandler'
import { getCueRegistry } from '../../photonics-dmx/cues/registries/cueRegistries'
import { CueType, type CueData, type PostProcessing } from '../../photonics-dmx/cues/types/cueTypes'
import type { CueRuntime } from '../../photonics-dmx/cueHandlers/CueRuntime'
import type { NetCueMode } from '../../photonics-dmx/cues/types/nodeCueTypes'
import { ProcessorManager } from '../../photonics-dmx/processors/ProcessorManager'
import type { ProcessingMode } from '../../photonics-dmx/processors/ProcessorManager'
import { RENDERER_RECEIVE } from '../../shared/ipcChannels'
import { createLogger } from '../../shared/logger'
import type { RuntimeBroadcaster } from '../../photonics-dmx/runtime/broadcaster'
import { buildDomainChainHandlers } from './cueRuntimeDomains'
import type { RigChain } from './RigChain'
import { clearAndBlackOutChains } from './chainBlackout'
import type { ChainFanout } from './ChainFanout'
const log = createLogger('ListenerCoordinator')

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
  /** False is the RB3 lighting `oncePerSong` mode: hold one primary group for the whole song. */
  getRb3RotationEnabled: () => boolean
  getFallbackCueTimeMs: () => number
  /** Applies the venue effect YARG reports to DMX output. */
  setVenuePostProcessing: (state: PostProcessing) => void
  sendSenderError: (message: string) => void
  sendToAllWindows: (channel: string, payload: unknown) => void
  runtimeBroadcaster: RuntimeBroadcaster
  setCueHandlerRef: (h: CueHandler | null) => void
  setRb3CueHandlerRef: (h: CueHandler | null) => void
  getRb3ProcessingMode: () => ProcessingMode
  /** The Global DMX Publishing Rate, which RB3 direct-mode strobes slow to. */
  getDmxOutputRateHz?: () => number
  /**
   * Wrap a domain's runtime before the listener or processor consumes it, so an additional
   * consumer can be teed onto the same cue stream. Returns the base runtime when absent.
   */
  decorateCueRuntime?: (domain: NetCueMode, base: CueRuntime) => CueRuntime
}

export class ListenerCoordinator {
  private yargListener: YargNetworkListener | null = null
  private rb3eListener: Rb3eNetworkListener | null = null
  private processorManager: ProcessorManager | null = null
  private cueHandler: CueHandler | null = null
  private rb3CueHandler: CueHandler | null = null
  private isYargEnabled = false
  private isRb3Enabled = false
  private rb3TeardownPromise: Promise<void> | null = null
  private readonly domainRuntimes: Partial<Record<NetCueMode, CueRuntime>> = {}
  /** Every cue the primary handlers and the RB3 direct processor handle, whichever exist now. */
  private readonly cueHandledEvents = new EventEmitter()
  private readonly forwardCueHandled = (data: CueData): void => {
    this.cueHandledEvents.emit('cueHandled', data)
  }

  constructor(private readonly deps: ListenerCoordinatorDeps) {}

  /**
   * Follows every handled cue across listener switches and controller restarts, which replace the
   * handlers that emit them. Returns the unsubscribe.
   */
  public onCueHandled(listener: (data: CueData) => void): () => void {
    this.cueHandledEvents.on('cueHandled', listener)
    return () => {
      this.cueHandledEvents.off('cueHandled', listener)
    }
  }

  /** Records whether a listener runs and tells every window, whatever started or stopped it. */
  private setListenerEnabled(listener: 'yarg' | 'rb3', enabled: boolean): void {
    if (listener === 'yarg') {
      this.isYargEnabled = enabled
    } else {
      this.isRb3Enabled = enabled
    }
    this.deps.sendToAllWindows(RENDERER_RECEIVE.LISTENER_ENABLED_CHANGED, { listener, enabled })
  }

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
    if (this.isRb3Enabled || this.rb3TeardownPromise) {
      await this.disableRb3()
    }
    this.buildChainHandlers(chains, 'yarg')
    if (this.yargListener) {
      await this.yargListener.shutdown()
    }
    // The listener calls into the fanout, which iterates every chain's handler.
    this.domainRuntimes.yarg = this.decorate('yarg', this.deps.getChainFanout().cueRuntime('yarg'))
    this.yargListener = new YargNetworkListener(this.domainRuntimes.yarg, {
      getFallbackCueTimeMs: this.deps.getFallbackCueTimeMs,
      onVenuePostProcessing: this.deps.setVenuePostProcessing,
    })
    this.yargListener.on(
      'yarg-error',
      (errorData: {
        type: string
        message: string
        datagramVersion?: number
        severity?: 'error' | 'warning'
      }) => {
        if (errorData.severity === 'warning') {
          log.warn('YARG Listener Warning:', errorData)
        } else {
          log.error('YARG Listener Error:', errorData)
        }
        // A runtime socket error closes the socket, so the listener is off whatever the toggle
        // says. Clear the enabled flag too, so the UI reports it off and a re-enable can start
        // it again, and leave the rig dark as a disable does.
        const stopped = errorData.severity !== 'warning' && errorData.type === 'runtime-error'
        if (stopped) {
          this.yargListener = null
          this.setListenerEnabled('yarg', false)
          this.deps.setVenuePostProcessing('Default')
          this.notifyRuntimeDisabled('yarg')
          this.clearChainHandlers('yarg')
          void clearAndBlackOutChains(this.deps.getRigChains(), 'the YARG listener failing')
        }
        this.deps.sendToAllWindows(RENDERER_RECEIVE.YARG_ERROR, {
          type: errorData.type,
          message: errorData.message,
          severity: errorData.severity,
          datagramVersion: errorData.datagramVersion,
          ...(stopped ? { autoDisabled: true } : {}),
        })
      },
    )
    try {
      await this.yargListener.start()
      this.setListenerEnabled('yarg', true)
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
      this.setListenerEnabled('yarg', false)
      this.deps.setVenuePostProcessing('Default')
      this.notifyRuntimeDisabled('yarg')
      this.clearChainHandlers('yarg')
      this.deps.sendToAllWindows(RENDERER_RECEIVE.YARG_ERROR, {
        type: isPortInUse ? 'port-in-use' : 'start-failed',
        message,
        autoDisabled: true,
      })
    }
  }

  public async disableYarg(): Promise<void> {
    if (!this.isYargEnabled) return
    // Input, then cues, then output: every cue engine is stopped before the rig is cleared, so the
    // blackout is the last word on the lights. The socket closes synchronously, so no frame lands
    // past this line, and awaiting it last keeps the blackout in the toggle's own tick.
    const listenerClosing = this.yargListener?.shutdown()
    this.deps.setVenuePostProcessing('Default')
    this.notifyRuntimeDisabled('yarg')
    this.clearChainHandlers('yarg')
    await clearAndBlackOutChains(this.deps.getRigChains(), 'disabling YARG')
    if (listenerClosing) {
      await listenerClosing
      this.yargListener = null
    }
    this.setListenerEnabled('yarg', false)
  }

  /** Apply the optional runtime decorator for a domain, or pass the base runtime through. */
  private decorate(domain: NetCueMode, base: CueRuntime): CueRuntime {
    return this.deps.decorateCueRuntime?.(domain, base) ?? base
  }

  /** Tell a domain's runtime the listener is going away, so a decorator can clear its own state. */
  private notifyRuntimeDisabled(domain: NetCueMode): void {
    this.domainRuntimes[domain]?.onDisable?.()
    delete this.domainRuntimes[domain]
  }

  /**
   * Build one cue handler per rig chain in the domain's slot and expose the primary chain's handler
   * as that domain's shared reference. Each domain resolves against its own registry, so RB3 cue
   * mode's group, lock, consistency and motion state stay isolated from the YARG listener's.
   */
  private buildChainHandlers(chains: RigChain[], domain: NetCueMode): void {
    const motion =
      domain === 'yarg'
        ? {
            getMotionCueMinimumHoldMs: this.deps.getMotionCueMinimumHoldMs,
            getMotionCueProbabilityPercent: this.deps.getMotionCueProbabilityPercent,
            getActiveMotionCueRef: this.deps.getActiveYargMotionCueRef,
          }
        : {
            getMotionCueMinimumHoldMs: this.deps.getRb3MotionCueMinimumHoldMs,
            getMotionCueProbabilityPercent: this.deps.getRb3MotionCueProbabilityPercent,
            getActiveMotionCueRef: this.deps.getActiveRb3MotionCueRef,
          }
    const primary = buildDomainChainHandlers(domain, chains, {
      ...motion,
      getMotionEnabled: this.deps.getMotionEnabled,
      runtimeBroadcaster: this.deps.runtimeBroadcaster,
      strobeState: this.deps.getChainFanout().strobeState,
      replaceExisting: true,
    })
    primary?.addCueHandledListener(this.forwardCueHandled)
    if (domain === 'yarg') {
      this.cueHandler = primary
      this.deps.setCueHandlerRef(primary)
    } else {
      this.rb3CueHandler = primary
      this.deps.setRb3CueHandlerRef(primary)
    }
  }

  /**
   * Shutdown every chain's handler for a domain and drop the shared reference. Each handler's
   * shutdown ends any open song, so the registry's once-per-song and motion locks don't survive the
   * session. Safe to call when no handlers exist.
   */
  private clearChainHandlers(domain: NetCueMode): void {
    for (const chain of this.deps.getRigChains()) {
      const handler = chain.cueHandlers[domain]
      if (handler) {
        handler.shutdown()
        chain.cueHandlers[domain] = null
      }
    }
    if (domain === 'yarg') {
      this.cueHandler = null
      this.deps.setCueHandlerRef(null)
    } else {
      this.rb3CueHandler = null
      this.deps.setRb3CueHandlerRef(null)
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
    // A runtime error or a manual disable may still be tearing down the previous session. Joining
    // it here keeps that teardown from acting on the session this call is about to build.
    await this.rb3TeardownPromise
    const chains = this.deps.getRigChains()
    if (this.isRb3Enabled || chains.length === 0) {
      log.info('Cannot enable RB3: already enabled or no rig chains')
      return
    }
    if (this.isYargEnabled) {
      await this.disableYarg()
    }
    this.clearChainHandlers('yarg')

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
    let cueRuntime: CueRuntime | undefined
    if (mode === 'cue') {
      this.buildChainHandlers(chains, 'rb3')
      cueRuntime = this.decorate('rb3', this.deps.getChainFanout().cueRuntime('rb3'))
      this.domainRuntimes.rb3 = cueRuntime
    }
    // The processor takes the chain fanout for menu dispatch (playMenuFrame / clear to each rig's
    // RB3 menu handler) and, in cue mode, the RB3 chain runtime for gameplay cue dispatch.
    log.info(`ListenerCoordinator: Creating ProcessorManager with mode: ${mode}`)
    this.processorManager = new ProcessorManager(this.deps.getChainFanout(), {
      mode,
      cueRuntime,
      getRb3MotionCueDurationRangeSec: this.deps.getRb3MotionCueDurationRangeSec,
      getRb3PrimaryGroupPool: () => getCueRegistry('rb3').getActiveGroupsImplementing(CueType.RB3),
      getRb3RotationEnabled: this.deps.getRb3RotationEnabled,
      onRb3PrimaryCueChange: (p) =>
        this.deps.sendToAllWindows(RENDERER_RECEIVE.RB3_GAME_MODE_CUE_CHANGE, { groupId: p }),
      onRb3GameModeScheduleChange: (p) =>
        this.deps.sendToAllWindows(RENDERER_RECEIVE.RB3_GAME_MODE_DEADLINE, p),
      getDmxOutputRateHz: this.deps.getDmxOutputRateHz,
    })
    this.processorManager.setCueHandler(this.deps.getChainFanout())
    this.processorManager.on('cueHandled', this.forwardCueHandled)
    const listener = new Rb3eNetworkListener()
    this.rb3eListener = listener
    listener.on('rb3-error', (errorData: { type: string; message: string }) => {
      log.error('RB3 Listener Error:', errorData)
      // A listener this session no longer owns has nothing left to tear down.
      if (this.rb3eListener !== listener) return
      // A manual disable or an earlier error may already be tearing this session down. Only the
      // call that starts the teardown tells the renderer to un-toggle, so a race between the two
      // never sends two notices for the one failure. The session may still be starting, in which
      // case the enable below sees the teardown and does not mark RB3 enabled.
      const startsTeardown = !this.rb3TeardownPromise
      this.teardownRb3({ blackout: true }).catch((error) =>
        log.error('Error tearing down RB3 after a runtime error:', error),
      )
      if (startsTeardown) {
        this.deps.sendToAllWindows(RENDERER_RECEIVE.RB3_ERROR, {
          type: errorData.type,
          message: errorData.message,
          autoDisabled: true,
        })
      }
    })
    this.processorManager.setNetworkListener(listener)
    // Enable only once the socket is listening. On a bind failure (e.g. port in use) the RB3
    // surface is torn back down and the renderer is told to un-toggle, so the UI never shows an
    // enabled listener that receives nothing.
    try {
      await listener.start()
      // A socket error between the bind and this point has already started tearing the session
      // down and told the renderer. Wait for that teardown so this enable ends with it.
      if (this.rb3eListener !== listener || this.rb3TeardownPromise) {
        await this.rb3TeardownPromise
        return
      }
      this.setListenerEnabled('rb3', true)
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
      this.setListenerEnabled('rb3', false)
      this.processorManager.destroy()
      this.processorManager = null
      this.notifyRuntimeDisabled('rb3')
      this.clearChainHandlers('rb3')
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

  /** Serialized, idempotent RB3 shutdown shared by manual disable and runtime auto-disable. */
  private async teardownRb3(options: { blackout: boolean }): Promise<void> {
    if (this.rb3TeardownPromise) {
      return this.rb3TeardownPromise
    }
    this.rb3TeardownPromise = this.doTeardownRb3(options).finally(() => {
      this.rb3TeardownPromise = null
    })
    return this.rb3TeardownPromise
  }

  private async doTeardownRb3(options: { blackout: boolean }): Promise<void> {
    if (!this.isRb3Enabled && !this.rb3eListener && !this.processorManager) {
      return
    }
    this.setListenerEnabled('rb3', false)
    // Input, then cues, then output, as disableYarg does. The socket closes synchronously and
    // destroying the processors stops the keepalive and the menu pump generating frames of their
    // own, so the blackout below is the last word on the lights rather than something a late
    // packet or a local tick can undo.
    const listenerClosing = this.rb3eListener?.shutdown()
    if (this.processorManager) {
      this.processorManager.destroy()
      this.processorManager = null
    }
    this.notifyRuntimeDisabled('rb3')
    this.clearChainHandlers('rb3')
    for (const chain of this.deps.getRigChains()) {
      if (chain.rb3MenuCueHandler) {
        chain.rb3MenuCueHandler.shutdown()
        chain.rb3MenuCueHandler = null
      }
    }
    if (options.blackout) {
      await clearAndBlackOutChains(this.deps.getRigChains(), 'disabling RB3')
    }
    // Awaited last, so the blackout stays in the toggle's own tick.
    if (listenerClosing) {
      await listenerClosing
      this.rb3eListener = null
    }
  }

  public async disableRb3(): Promise<void> {
    if (this.rb3TeardownPromise) {
      await this.rb3TeardownPromise
      return
    }
    if (!this.isRb3Enabled) return
    await this.teardownRb3({ blackout: true })
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

  public getCueHandler(): CueHandler | null {
    return this.cueHandler
  }

  public getRb3CueHandler(): CueHandler | null {
    return this.rb3CueHandler
  }

  public getProcessorManager(): ProcessorManager | null {
    return this.processorManager
  }
}
