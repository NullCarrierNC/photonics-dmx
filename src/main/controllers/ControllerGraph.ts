import { ConfigurationManager } from '../../services/configuration/ConfigurationManager'
import {
  normalizeWhiteChannelMixMode,
  normalizeVenuePostProcessingEnabled,
} from '../../services/configuration/configurationDefaults'
import { DmxLightManager } from '../../photonics-dmx/controllers/DmxLightManager'
import { DmxPublisher } from '../../photonics-dmx/controllers/DmxPublisher'
import { VenueFrameProcessor } from '../../photonics-dmx/controllers/VenueFrameProcessor'
import { SenderManager } from '../../photonics-dmx/controllers/SenderManager'
import { LightingConfiguration, ConfigStrobeType } from '../../photonics-dmx/types'
import { CueHandler } from '../../photonics-dmx/cueHandlers/CueHandler'
import { Clock } from '../../photonics-dmx/controllers/sequencer/Clock'
import { ILightingController } from '../../photonics-dmx/controllers/sequencer/interfaces'
import { EffectLoader } from '../../photonics-dmx/cues/node/loader/EffectLoader'
import { NodeCueLoader } from '../../photonics-dmx/cues/node/loader/NodeCueLoader'
import type { NetCueMode } from '../../photonics-dmx/cues/types/nodeCueTypes'
import type { MotionCueRef } from '../../photonics-dmx/cues/types/cueTypes'
import { mainRuntimeBroadcaster } from '../utils/windowUtils'
import { RigChain } from './RigChain'
import { ChainFanout } from './ChainFanout'
import { buildDomainChainHandlers, readMotionPrefs } from './cueRuntimeDomains'
import { createLogger } from '../../shared/logger'
import { DMX_OUTPUT_REFRESH_RATE_HZ_MAX } from '../../shared/dmxOutputRefresh'

const log = createLogger('ControllerGraph')

/** What the graph needs from its owner to build and tear down its objects. */
export interface ControllerGraphDeps {
  getConfig(): ConfigurationManager
  getSenderManager(): SenderManager
  chainFanout: ChainFanout
  venueFrameProcessor: VenueFrameProcessor
}

/**
 * The built controller-object graph: the per-rig sequencer chains, the shared clock, the DMX
 * publisher, the domain cue handlers, and the cue/effect loaders. ControllerManager owns when the
 * graph is built and torn down (init, restart, shutdown); this owns the objects themselves and
 * the build/dispose steps those sequences are made of.
 */
export class ControllerGraph {
  /**
   * Per-rig sequencer chains. Order is significant: `rigChains[0]` is the primary chain,
   * whose handlers own user-visible renderer broadcasts so the UI sees one event per
   * logical cue rather than one per rig.
   */
  private rigChains: RigChain[] = []
  /**
   * Shared tick source for every chain's `Sequencer`. Owned here (rather than inside a
   * `Sequencer`) so chains can share one clock and tear down independently without
   * stopping ticks for the others. Rebuilt on every `restartControllers`.
   */
  private clock: Clock | null = null
  /**
   * Shorthand accessors pointing at the same instances exposed by `rigChains[0]`. Provided
   * for call sites (listener coordinators, audio controller, IPC handlers, test runner)
   * that need a single light manager / effects controller reference without iterating
   * chains.
   */
  private dmxLightManager: DmxLightManager | null = null
  private effectsController: ILightingController | null = null
  private dmxPublisher: DmxPublisher | null = null

  private cueHandler: CueHandler | null = null
  private rb3CueHandler: CueHandler | null = null
  private nodeCueLoader: NodeCueLoader | null = null
  private effectLoader: EffectLoader | null = null

  constructor(private readonly deps: ControllerGraphDeps) {}

  public getChains(): RigChain[] {
    return this.rigChains
  }

  public getDmxLightManager(): DmxLightManager | null {
    return this.dmxLightManager
  }

  public getEffectsController(): ILightingController | null {
    return this.effectsController
  }

  public getDmxPublisher(): DmxPublisher | null {
    return this.dmxPublisher
  }

  public getCueHandler(): CueHandler | null {
    return this.cueHandler
  }

  public setCueHandler(handler: CueHandler | null): void {
    this.cueHandler = handler
  }

  public getRb3CueHandler(): CueHandler | null {
    return this.rb3CueHandler
  }

  public setRb3CueHandler(handler: CueHandler | null): void {
    this.rb3CueHandler = handler
  }

  public getNodeCueLoader(): NodeCueLoader | null {
    return this.nodeCueLoader
  }

  public setNodeCueLoader(loader: NodeCueLoader | null): void {
    this.nodeCueLoader = loader
  }

  public getEffectLoader(): EffectLoader | null {
    return this.effectLoader
  }

  public setEffectLoader(loader: EffectLoader | null): void {
    this.effectLoader = loader
  }

  /**
   * Build one `RigChain` per active rig and wire up the DMX publisher. Each chain owns its
   * own sequencer, light manager, and (later) cue handlers; the same listener event fans
   * out to every chain so the cue resolves against each rig's own lights independently.
   *
   * If no rigs are active, a single empty chain is built so the rest of the system has a
   * sequencer/light-state plumbing to reference (cue handlers never get installed; nothing
   * makes it to the wire).
   *
   * `Clock` is rebuilt every time we initialise so a stale clock from a previous lifecycle
   * never drives a fresh sequencer.
   */
  public buildChains(): void {
    const config = this.deps.getConfig()
    const activeRigs = config.getActiveRigs()

    const clockRate = config.getPreference('clockRate')
    this.clock = new Clock(clockRate)

    if (activeRigs.length === 0) {
      log.warn('No active DMX rigs found. DMX output will be disabled.')
      const emptyConfig: LightingConfiguration = {
        numLights: 0,
        lightLayout: { id: 'default-layout', label: 'Default Layout' },
        strobeType: ConfigStrobeType.None,
        frontLights: [],
        backLights: [],
        strobeLights: [],
      }
      this.rigChains = [
        new RigChain({
          rigId: 'empty',
          config: emptyConfig,
          clock: this.clock,
          isPrimary: true,
        }),
      ]
    } else {
      log.info(`Initializing ${activeRigs.length} active DMX rig(s)`)
      // One chain per active rig. The first chain is marked primary so its handlers own
      // user-visible renderer broadcasts; secondary chains run silently.
      this.rigChains = activeRigs.map(
        (rig, index) =>
          new RigChain({
            rigId: rig.id,
            rigLabel: rig.name,
            config: rig.config,
            clock: this.clock!,
            isPrimary: index === 0,
            mirror: { horiz: rig.mirrorHoriz, vert: rig.mirrorVert },
          }),
      )
    }

    const primaryChain = this.rigChains[0]
    this.dmxLightManager = primaryChain.dmxLightManager
    this.effectsController = primaryChain.sequencer

    this.deps.chainFanout.setChains(this.rigChains)

    // Start the centralized timing system
    this.clock.start()

    // Set up DMX publisher. Govern wire output so the render tick rate (clockRate, up to
    // 100 Hz) doesn't fire-hose cheap USB / low-end sACN adapters. The Global DMX Publishing
    // Rate pref sits upstream of all enabled senders; per-sender refresh settings still pace
    // individual slow links below this cap. Falls back to the absolute DMX ceiling when the
    // pref is absent so the governor never throttles a sender below what it could output.
    const globalDmxRateHz =
      config.getPreference('globalDmxPublishingRateHz') ?? DMX_OUTPUT_REFRESH_RATE_HZ_MAX
    this.dmxPublisher = new DmxPublisher(this.deps.getSenderManager(), null, undefined, {
      outputRateHz: globalDmxRateHz,
      whiteChannelMixMode: normalizeWhiteChannelMixMode(
        config.getPreference('whiteChannelMixMode'),
      ),
      frameProcessor: this.deps.venueFrameProcessor,
    })
    this.deps.venueFrameProcessor.setVenuePostProcessingEnabled(
      normalizeVenuePostProcessingEnabled(config.getPreference('venuePostProcessingEnabled')),
    )
    // Subscribe the publisher to every chain's LightStateManager. Each chain's emission
    // writes its rig's lights into the publisher's aggregated map; a coalesced flush calls
    // publishNow once per tick.
    this.dmxPublisher.setRigChains(
      this.rigChains.map((c) => ({ rigId: c.rigId, lightStateManager: c.lightStateManager })),
    )

    if (activeRigs.length > 0) {
      this.dmxPublisher.updateActiveRigs(activeRigs)
    }
  }

  /** Create the primary YARG cue handler bound to the primary chain's managers. */
  public buildPrimaryYargHandler(): void {
    if (!this.dmxLightManager || !this.effectsController) return

    const config = this.deps.getConfig()
    const yargHandler = new CueHandler(this.dmxLightManager, this.effectsController, {
      getMotionCueMinimumHoldMs: () => readMotionPrefs(config, 'yarg').minimumHoldMs,
      getMotionCueProbabilityPercent: () => readMotionPrefs(config, 'yarg').probabilityPercent,
      runtimeBroadcaster: mainRuntimeBroadcaster,
    })
    yargHandler.setMotionEnabled(config.getPreference('motionEnabled') ?? true)
    yargHandler.setManualMotionRef(readMotionPrefs(config, 'yarg').activeCueRef)
    this.cueHandler = yargHandler
  }

  /**
   * Idempotent: ensures every active rig chain has a cue handler in the domain's slot, creating one
   * bound to the chain's own `(dmxLightManager, sequencer)` for any chain whose slot is still null.
   * Used by the simulation IPC path and `TestEffectRunner` to bring secondary chains up to par with
   * the primary so cues dispatched through `ChainFanout` reach every rig, even when no real network
   * listener has run.
   *
   * Safe to call after a listener has enabled (no-op for chains that already have handlers) and
   * after it is disabled (rebuilds the chain slots from scratch).
   */
  public ensureChainsHaveHandlersForSimulation(domain: NetCueMode): void {
    const config = this.deps.getConfig()
    buildDomainChainHandlers(domain, this.rigChains, {
      getMotionEnabled: () => config.getPreference('motionEnabled') ?? true,
      getMotionCueMinimumHoldMs: () => readMotionPrefs(config, domain).minimumHoldMs,
      getMotionCueProbabilityPercent: () => readMotionPrefs(config, domain).probabilityPercent,
      getActiveMotionCueRef: () => readMotionPrefs(config, domain).activeCueRef,
      runtimeBroadcaster: mainRuntimeBroadcaster,
      replaceExisting: false,
    })
  }

  /**
   * Refresh which rigs are active for DMX output without restarting controllers.
   * Use this when only the active-rig set changes so senders stay running.
   */
  public refreshActiveRigs(): void {
    if (!this.dmxPublisher) {
      return
    }
    const activeRigs = this.deps.getConfig().getActiveRigs()
    this.dmxPublisher.updateActiveRigs(activeRigs)
    log.info('Refreshed active rigs for DMX output:', activeRigs.length, 'rig(s)')
  }

  /** Apply the motion master toggle to every chain's YARG and RB3 handlers. */
  public setMotionEnabledOnChains(enabled: boolean): void {
    for (const chain of this.rigChains) {
      chain.cueHandlers.yarg?.setMotionEnabled(enabled)
      chain.cueHandlers.rb3?.setMotionEnabled(enabled)
    }
  }

  /** Apply a manual motion cue reference to every chain's handler for the domain. */
  public setManualMotionRefOnChains(domain: 'yarg' | 'rb3', ref: MotionCueRef | null): void {
    for (const chain of this.rigChains) {
      chain.cueHandlers[domain]?.setManualMotionRef(ref)
    }
  }

  /** Dispose the loaders, tolerating each one's failure. */
  public async disposeLoaders(): Promise<void> {
    if (this.nodeCueLoader) {
      try {
        await this.nodeCueLoader.dispose()
        this.nodeCueLoader.removeAllListeners()
        this.nodeCueLoader = null
        log.info('ControllerManager shutdown: node cue loader stopped')
      } catch (err) {
        log.error('Error shutting down node cue loader:', err)
      }
    }

    if (this.effectLoader) {
      try {
        await this.effectLoader.dispose()
        this.effectLoader.removeAllListeners()
        this.effectLoader = null
        log.info('ControllerManager shutdown: effect loader stopped')
      } catch (err) {
        log.error('Error shutting down effect loader:', err)
      }
    }
  }

  /**
   * Shut down and null every domain cue-handler ref (YARG + RB3). Single owner for both the
   * shutdown and restart-teardown paths, so a handler ref can never survive teardown pointing at a
   * disposed handler. Each is guarded independently so one failing shutdown can't strand the other;
   * a new domain adds one block here rather than another pair of mirrored teardown sites.
   */
  public shutdownDomainCueHandlerRefs(): void {
    if (this.cueHandler) {
      try {
        this.cueHandler.shutdown()
      } catch (err) {
        log.error('Error shutting down cue handler:', err)
      }
      this.cueHandler = null
      log.info('ControllerManager teardown: cue handler stopped')
    }
    if (this.rb3CueHandler) {
      try {
        this.rb3CueHandler.shutdown()
      } catch (err) {
        log.error('Error shutting down RB3 cue handler:', err)
      }
      this.rb3CueHandler = null
      log.info('ControllerManager teardown: RB3 cue handler stopped')
    }
  }

  /**
   * Dispose every rig chain, tolerating per-chain failures. The shared clock is destroyed
   * separately so a chain tearing down can't take ticks away from any sibling chain.
   */
  public async disposeChainsForShutdown(): Promise<void> {
    for (const chain of this.rigChains) {
      try {
        await chain.dispose()
      } catch (err) {
        log.error(`Error disposing rig chain ${chain.rigId}:`, err)
      }
    }
    this.rigChains = []
    this.dmxLightManager = null
    this.effectsController = null
    log.info('ControllerManager shutdown: rig chains disposed')
  }

  /**
   * Dispose every rig chain for a restart. Unlike the shutdown flavour this propagates the first
   * failure, so the restart can refuse to rebuild on top of a partially torn-down graph.
   */
  public async disposeChainsForRestart(): Promise<void> {
    for (const chain of this.rigChains) {
      await chain.dispose()
    }
    this.rigChains = []
  }

  /** Shut down the publisher, tolerating failure. Used by the shutdown path. */
  public async shutdownPublisherSafe(): Promise<void> {
    if (this.dmxPublisher) {
      try {
        await this.dmxPublisher.shutdown()
        log.info('ControllerManager shutdown: DMX publisher stopped')
      } catch (err) {
        log.error('Error shutting down DMX publisher:', err)
      }
    }
  }

  /** Shut down the publisher, propagating failure. Used by the restart path. */
  public async shutdownPublisher(): Promise<void> {
    if (this.dmxPublisher) {
      await this.dmxPublisher.shutdown()
    }
  }

  /** Destroy the shared clock so the next build creates a fresh tick source. */
  public destroyClock(): void {
    if (this.clock) {
      try {
        this.clock.destroy()
      } catch (err) {
        log.error('Error stopping shared clock:', err)
      }
      this.clock = null
    }
  }

  /** Null the per-build shorthand refs after the chains they point into are gone. */
  public clearBuildRefs(): void {
    this.dmxLightManager = null
    this.effectsController = null
    this.dmxPublisher = null
  }
}
