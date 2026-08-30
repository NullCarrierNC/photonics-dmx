import { ConfigurationManager } from '../../services/configuration/ConfigurationManager'
import { DmxLightManager } from '../../photonics-dmx/controllers/DmxLightManager'
import { DmxPublisher } from '../../photonics-dmx/controllers/DmxPublisher'
import { VenueFrameProcessor } from '../../photonics-dmx/controllers/VenueFrameProcessor'
import { SenderManager } from '../../photonics-dmx/controllers/SenderManager'
import { CueHandler } from '../../photonics-dmx/cueHandlers/CueHandler'
import { ProcessorManager } from '../../photonics-dmx/processors/ProcessorManager'
import { app } from 'electron'
import { sendToAllWindows } from '../utils/windowUtils'
import { clearSenderErrorTracking } from '../senderErrorTracking'
import { setGlobalBrightnessConfig } from '../../photonics-dmx/helpers/dmxHelpers'
import { copyDefaultData } from '../utils/copyDefaultData'
import * as path from 'path'
import { EffectLoader } from '../../photonics-dmx/cues/node/loader/EffectLoader'

import { ILightingController } from '../../photonics-dmx/controllers/sequencer/interfaces'
import { ChainFanout } from './ChainFanout'
import { TestEffectRunner } from './TestEffectRunner'
import { MotionCueSimulator } from './MotionCueSimulator'
import { ListenerLifecycleController } from './ListenerLifecycleController'
import {
  SenderLifecycleController,
  type OutputSenderStateSnapshot,
} from './SenderLifecycleController'
import { ConsoleModeController } from './ConsoleModeController'
import { RegistryInitializer } from './RegistryInitializer'
import { ControllerLifecycle, LifecycleAbortedError } from './ControllerLifecycle'
import { ControllerGraph } from './ControllerGraph'
import { runControllerRestart } from './controllerRestart'
import {
  buildControllerCollaborators,
  type ControllerCollaborators,
  type ControllerHost,
} from './controllerWiring'
import { RENDERER_RECEIVE } from '../../shared/ipcChannels'
import type { LifecyclePhase } from '../../shared/ipcTypes'
import { CUE_DOMAIN_BINDINGS, applyAllEnabledGroupsFromConfig } from './cueDomainBindings'
import type { NetCueMode } from '../../photonics-dmx/cues/types/nodeCueTypes'
import type { MotionCueRef } from '../../photonics-dmx/cues/types/cueTypes'
import { NodeCueLoader } from '../../photonics-dmx/cues/node/loader/NodeCueLoader'
// Import all cue sets to register with registry
import '../../photonics-dmx/cues'
import { createLogger } from '../../shared/logger'

const log = createLogger('ControllerManager')

/**
 * Runtime lifecycle of the main-process controller graph.
 *
 * Transitions (call graph):
 * - [construction] → `initializing` (until first successful `init()`)
 * - `init()` (cold): `initializing` → `running` when complete. Idempotent when already `running` + initialized.
 * - `restartControllers()`: `running`, `consoleMode`, or `failed` → `restarting` for teardown/reinit, then
 *   `running` or `consoleMode` (restored) when complete. Overlapping calls share one in-flight restart.
 *   If `shutdown()` starts mid-restart, reinit is skipped and the failure is rethrown.
 * - `enableConsoleMode` (after success): `running` → `consoleMode`. `disableConsoleMode`: `consoleMode` → `running`.
 * - `shutdown()`: from `initializing` (if early exit), `running`, `restarting`, `consoleMode`, or `failed`
 *   → `shuttingDown` while teardown is in flight, then → `stopped` when teardown succeeds.
 *   If teardown rejects, phase stays at `shuttingDown` and `shutdown()` may be retried.
 * - `failed`: reinitialization after teardown did not complete; call `restartControllers()` or `init()` to recover.
 *
 * Concurrency:
 * - YARG/RB3 toggles and `restartControllers()` serialize on one lifecycle queue (`runLifecycleOp`),
 *   so no two of them ever interleave. Queued ops additionally await any in-flight shutdown.
 * - Audio toggles run off the queue and await any in-flight restart/shutdown (one-directional).
 * - `shutdown()` runs off the queue and must NEVER drain it: queued ops await the in-flight
 *   shutdown via `awaitShutdownWork`, so a shutdown that waited on the queue would deadlock
 *   against them.
 * - `init()` rejects with a `LifecycleAbortedError` if called while shutting down.
 */
// LifecyclePhase is owned by `shared/ipcTypes` so the renderer hook can reference the same union.
export type { LifecyclePhase } from '../../shared/ipcTypes'

export { LifecycleAbortedError } from './ControllerLifecycle'

/**
 * Collaborators a caller can supply instead of the ones this builds for itself.
 *
 * Production passes nothing. Tests pass a configuration store so constructing a manager does not
 * reach the real config files, plus any subset of collaborators (fakes for the sender, listener,
 * console, registry or simulator controllers) and a lifecycle, which is what lets them drive a
 * normally constructed instance rather than assembling one field by field off the prototype.
 */
export interface ControllerManagerDeps {
  config?: ConfigurationManager
  collaborators?: Partial<ControllerCollaborators>
  lifecycle?: ControllerLifecycle
  graph?: ControllerGraph
}

export class ControllerManager {
  private config: ConfigurationManager
  /**
   * Listener / processor surface that dispatches each incoming event to every chain's
   * matching cue handler. Held here so listener controllers can read the up-to-date chain
   * list without re-creating their listener wiring on every chain rebuild.
   */
  private chainFanout = new ChainFanout()
  /**
   * The venue post-processing stage. Owned here rather than by the publisher so the effect YARG
   * reported survives a controller restart, and so publisher rebuilds do not drop it.
   */
  private readonly venueFrameProcessor = new VenueFrameProcessor()
  /** The built controller-object graph: chains, clock, publisher, cue handlers, loaders. */
  private readonly graph: ControllerGraph

  private pendingValidationErrors: Array<{ source: 'node-cue' | 'effect'; errors: string[] }> = []
  private onSimulationPreempt: (() => void) | null = null

  private readonly testEffectRunner: TestEffectRunner
  /** RB3 cue-mode twin of {@link testEffectRunner}: dispatches through the RB3 chain runtime. */
  private readonly rb3TestEffectRunner: TestEffectRunner
  private readonly motionCueSimulator: MotionCueSimulator
  private readonly senderLifecycle: SenderLifecycleController
  private readonly listenerLifecycle: ListenerLifecycleController
  private readonly registryInit: RegistryInitializer
  private readonly consoleMode: ConsoleModeController

  private isInitialized = false
  /** Phase state, the op queue, and the in-flight restart and shutdown memos. */
  private readonly lifecycle: ControllerLifecycle
  /** Invoked during restart teardown so process-scoped consumers (e.g. laser sim) drop state tied to the
   *  engine/registry being rebuilt. A list, not a single slot, so multiple consumers can register without
   *  overwriting each other. */
  private readonly onControllerRestartListeners: Array<() => void> = []

  constructor(deps: ControllerManagerDeps = {}) {
    this.config = deps.config ?? new ConfigurationManager()
    this.lifecycle =
      deps.lifecycle ??
      new ControllerLifecycle((phase) => {
        sendToAllWindows(RENDERER_RECEIVE.LIFECYCLE_PHASE_CHANGED, phase)
      })
    const collaborators = buildControllerCollaborators(this.asControllerHost(), deps.collaborators)
    this.senderLifecycle = collaborators.senderLifecycle
    this.testEffectRunner = collaborators.testEffectRunner
    this.rb3TestEffectRunner = collaborators.rb3TestEffectRunner
    this.motionCueSimulator = collaborators.motionCueSimulator
    this.listenerLifecycle = collaborators.listenerLifecycle
    this.registryInit = collaborators.registryInit
    this.consoleMode = collaborators.consoleMode
    this.graph =
      deps.graph ??
      new ControllerGraph({
        getConfig: () => this.config,
        getSenderManager: () => this.senderLifecycle.getSenderManager(),
        chainFanout: this.chainFanout,
        venueFrameProcessor: this.venueFrameProcessor,
      })
  }

  /** The host surface the collaborators are wired against. */
  private asControllerHost(): ControllerHost {
    return {
      getConfig: () => this.config,
      getChainFanout: () => this.chainFanout,
      getRigChains: () => this.graph.getChains(),
      getDmxLightManager: () => this.graph.getDmxLightManager(),
      getEffectsController: () => this.graph.getEffectsController(),
      getDmxPublisher: () => this.graph.getDmxPublisher(),
      getVenueFrameProcessor: () => this.venueFrameProcessor,
      ensureInitialized: () => this.init(),
      ensureChainsHaveHandlersForSimulation: (domain) =>
        this.ensureChainsHaveHandlersForSimulation(domain),
      setCueHandlerRef: (h) => this.graph.setCueHandler(h),
      setRb3CueHandlerRef: (h) => this.graph.setRb3CueHandler(h),
      getNodeCueLoader: () => this.graph.getNodeCueLoader(),
      setNodeCueLoader: (l) => this.graph.setNodeCueLoader(l),
      getEffectLoader: () => this.graph.getEffectLoader(),
      setEffectLoader: (l) => this.graph.setEffectLoader(l),
      pushValidationError: (e) => {
        this.pendingValidationErrors.push(e)
      },
      refreshAudioCueSelection: () => {
        this.refreshAudioCueSelection()
      },
      getIsAudioEnabled: () => this.getIsAudioEnabled(),
      pauseYarg: () => this.disableYarg(),
      pauseRb3: () => this.disableRb3(),
      pauseAudio: () => this.disableAudio(),
      refreshActiveRigs: () => this.refreshActiveRigs(),
      restartControllers: () => this.restartControllers(),
    }
  }

  public getLifecyclePhase(): LifecyclePhase {
    return this.lifecycle.phase
  }

  /**
   * Initialize all controllers and systems
   */
  public async init(): Promise<void> {
    if (this.isInitialized) {
      return
    }
    if (this.lifecycle.phase === 'shuttingDown' || this.lifecycle.phase === 'stopped') {
      throw new LifecycleAbortedError(
        `ControllerManager.init aborted: shutdown in progress or already complete (phase=${this.lifecycle.phase})`,
      )
    }
    this.lifecycle.assertPhase(['initializing', 'restarting', 'failed'], 'init')

    try {
      this.senderLifecycle.ensureSenderManager()
      this.graph.buildChains()
      for (const binding of CUE_DOMAIN_BINDINGS) {
        await this.registryInit.initializeCueRegistry(binding.domain)
      }
      const baseDir = path.join(app.getPath('appData'), 'Photonics.rocks')
      await copyDefaultData(process.resourcesPath, baseDir)
      await this.registryInit.initializeEffectLoader() // effects before node cues
      await this.registryInit.initializeNodeCueLoader()
      await applyAllEnabledGroupsFromConfig(this.config, () => this.refreshAudioCueSelection())
      this.graph.buildPrimaryYargHandler()
    } catch (error) {
      // A restart records its own outcome, but a cold init has nothing above it to do so, so mark
      // the phase here. The renderer reads it to offer a retry instead of leaving the user with a
      // graph that never came up. An abort is a shutdown racing init, not a fault, so it is left
      // to the shutdown to own the phase.
      if (!(error instanceof LifecycleAbortedError)) {
        this.isInitialized = false
        this.lifecycle.setPhase('failed')
      }
      throw error
    }

    // Applied on every init path (cold start, restart reinit, retry after a failure) so a graph
    // that comes up late is wired the same as one that came up first time. The callback is what
    // lets SenderManager clear its error state when senders are re-enabled, and it has to be
    // re-attached because a restart can hand the lifecycle a fresh SenderManager. Both setters
    // are idempotent.
    this.senderLifecycle.setSenderErrorTrackingCallback(clearSenderErrorTracking)
    const brightnessConfig = this.config.getPreference('brightness')
    if (brightnessConfig) {
      setGlobalBrightnessConfig(brightnessConfig)
    }

    this.isInitialized = true
    this.lifecycle.setPhase('running')
  }

  /**
   * Stop the currently running test effect. Both domain runners are stopped; the idle one
   * early-returns, so this is a safe no-op for whichever domain isn't running.
   */
  public async stopTestEffect(): Promise<void> {
    await this.testEffectRunner.stopTestEffect()
    await this.rb3TestEffectRunner.stopTestEffect()
  }

  /**
   * Enable YARG listener. Runs on the shared lifecycle queue with the other toggles and controller
   * restarts, so enable/disable cannot interleave with each other or with teardown/reinit, and
   * additionally yields to any in-flight shutdown.
   */
  public async enableYarg(): Promise<void> {
    await this.lifecycle.runOp(async () => {
      await this.lifecycle.awaitShutdownWork()
      await this.listenerLifecycle.yargRb3.enableYarg(this.isInitialized, () => this.init())
    })
  }

  /**
   * Disable YARG listener
   */
  public async disableYarg(): Promise<void> {
    await this.lifecycle.runOp(async () => {
      await this.lifecycle.awaitShutdownWork()
      await this.listenerLifecycle.yargRb3.disableYarg()
    })
  }

  /**
   * Enable Rb3 listener. Running simulations are stopped first — the listener owns the rig
   * chains from here and simulation IPC is refused while RB3E is enabled.
   */
  public async enableRb3(): Promise<void> {
    await this.lifecycle.runOp(async () => {
      await this.lifecycle.awaitShutdownWork()
      await this.stopTestEffect()
      this.onSimulationPreempt?.()
      await this.listenerLifecycle.yargRb3.enableRb3(this.isInitialized, () => this.init())
    })
  }

  /**
   * Disable Rb3 listener
   */
  public async disableRb3(): Promise<void> {
    await this.lifecycle.runOp(async () => {
      await this.lifecycle.awaitShutdownWork()
      await this.listenerLifecycle.yargRb3.disableRb3()
    })
  }

  /**
   * Shutdown all controllers and systems.
   * Idempotent via the lifecycle's exclusive-shutdown operation: subsequent calls share the
   * in-flight attempt (or resolve immediately when teardown has already completed), a teardown
   * rejection stays retryable, and the terminal 'stopped' transition follows a successful
   * teardown. The operation runs off the lifecycle queue; queued toggles await it through
   * `awaitShutdownWork`, so draining the queue here would deadlock.
   */
  public async shutdown(): Promise<void> {
    return this.lifecycle.runExclusiveShutdown(async () => {
      // 'shuttingDown' is allowed so a retry after a failed teardown can run again.
      this.lifecycle.assertPhase(
        ['initializing', 'running', 'restarting', 'consoleMode', 'failed', 'shuttingDown'],
        'shutdown',
      )
      this.lifecycle.setPhase('shuttingDown')
      log.info('ControllerManager shutdown: starting')

      // Shutdown in reverse order of initialization
      try {
        await this.listenerLifecycle.yargRb3.disableYarg()
        log.info('ControllerManager shutdown: YARG disabled')
      } catch (err) {
        log.error('Error disabling YARG:', err)
      }

      try {
        await this.listenerLifecycle.yargRb3.disableRb3()
        log.info('ControllerManager shutdown: RB3 disabled')
      } catch (err) {
        log.error('Error disabling RB3:', err)
      }

      try {
        await this.listenerLifecycle.audio.disableAudio()
        log.info('ControllerManager shutdown: Audio disabled')
      } catch (err) {
        log.error('Error disabling Audio:', err)
      }

      await this.graph.disposeLoaders()
      this.graph.shutdownDomainCueHandlerRefs()
      await this.graph.disposeChainsForShutdown()
      await this.graph.shutdownPublisherSafe()
      this.graph.destroyClock()

      try {
        await this.senderLifecycle.shutdownSenderOnAppExit()
        log.info('ControllerManager shutdown: sender manager stopped')
      } catch (err) {
        log.error('Error shutting down sender manager:', err)
      }

      this.isInitialized = false
      log.info('ControllerManager shutdown: completed')
    })
  }

  // Getters for controllers
  public getConfig(): ConfigurationManager {
    return this.config
  }

  public getDmxLightManager(): DmxLightManager | null {
    return this.graph.getDmxLightManager()
  }

  public getLightingController(): ILightingController | null {
    return this.graph.getEffectsController()
  }

  public getSenderManager(): SenderManager {
    return this.senderLifecycle.getSenderManager()
  }

  /** The sender lifecycle surface (status, error tracking, restore). */
  public getSenderLifecycle(): SenderLifecycleController {
    return this.senderLifecycle
  }

  /** The listener lifecycle surface: `yargRb3` for the net listeners, `audio` for audio. */
  public getListenerLifecycle(): ListenerLifecycleController {
    return this.listenerLifecycle
  }

  /** The DMX console surface (channel edits, manual buffers, console callbacks). */
  public getConsoleModeController(): ConsoleModeController {
    return this.consoleMode
  }

  /** The domain's test-effect runner, for simulation IPC. Stop both via stopTestEffect. */
  public getTestEffectRunner(domain: NetCueMode): TestEffectRunner {
    return domain === 'rb3' ? this.rb3TestEffectRunner : this.testEffectRunner
  }

  /**
   * Handles uncaught exceptions that are network sender errors.
   * @returns true if the error was handled as a network sender error, false otherwise
   */
  public handleUncaughtException(error: unknown): boolean {
    return this.senderLifecycle.handleUncaughtException(error, () => this.getIsInitialized())
  }

  /** Register a callback run during restart teardown. Returns an unregister function. */
  public addOnControllerRestart(callback: () => void): () => void {
    this.onControllerRestartListeners.push(callback)
    return () => {
      const i = this.onControllerRestartListeners.indexOf(callback)
      if (i !== -1) {
        this.onControllerRestartListeners.splice(i, 1)
      }
    }
  }

  /** Called when a listener takes over the rig chains (RB3E enable) so running simulations stop. */
  public setOnSimulationPreempt(callback: (() => void) | null): void {
    this.onSimulationPreempt = callback
  }

  public getCueHandler(): CueHandler | null {
    return this.graph.getCueHandler()
  }

  public getRb3CueHandler(): CueHandler | null {
    return this.graph.getRb3CueHandler()
  }

  /**
   * Returns the listener / processor fanout. Exposed so simulation IPC handlers and the
   * test-effect runner can dispatch events to every active rig's handler without going
   * through `getCueHandler()` (which only returns the primary chain's handler).
   */
  public getChainFanout(): ChainFanout {
    return this.chainFanout
  }

  /** The Cue-Simulation motion-cue state holder (reset on restart). */
  public getMotionCueSimulator(): MotionCueSimulator {
    return this.motionCueSimulator
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
    this.graph.ensureChainsHaveHandlersForSimulation(domain)
  }

  public getNodeCueLoader(): NodeCueLoader | null {
    return this.graph.getNodeCueLoader()
  }

  public getEffectLoader(): EffectLoader | null {
    return this.graph.getEffectLoader()
  }

  public getProcessorManager(): ProcessorManager | null {
    return this.listenerLifecycle.yargRb3.getProcessorManager()
  }

  public getDmxPublisher(): DmxPublisher | null {
    return this.graph.getDmxPublisher()
  }

  /** The venue post-processing stage, for callers driving or reporting the effect. */
  public getVenueFrameProcessor(): VenueFrameProcessor {
    return this.venueFrameProcessor
  }

  public getIsInitialized(): boolean {
    return this.isInitialized
  }

  public flushValidationErrors(): Array<{ source: 'node-cue' | 'effect'; errors: string[] }> {
    const errors = this.pendingValidationErrors
    this.pendingValidationErrors = []
    return errors
  }

  public getIsYargEnabled(): boolean {
    return this.listenerLifecycle.yargRb3.getIsYargEnabled()
  }

  public getIsRb3Enabled(): boolean {
    return this.listenerLifecycle.yargRb3.getIsRb3Enabled()
  }

  /**
   * Refresh which rigs are active for DMX output without restarting controllers.
   * Use this when only the active-rig set changes so senders stay running.
   */
  public refreshActiveRigs(): void {
    if (!this.isInitialized) {
      return
    }
    this.graph.refreshActiveRigs()
  }

  /**
   * Restart controllers to pick up configuration changes
   * This shuts down existing controllers and reinitializes them
   */
  public async restartControllers(): Promise<void> {
    // A restart is a peer on the lifecycle queue with the listener toggles, so teardown never runs
    // while a toggle is mid-flight (and vice versa). The shared-restart operation dedupes
    // overlapping calls and gates the off-queue audio toggles.
    return this.lifecycle.runSharedRestart(() => this.runRestartControllers())
  }

  private async runRestartControllers(): Promise<void> {
    return runControllerRestart({
      lifecycle: this.lifecycle,
      graph: this.graph,
      listenerLifecycle: this.listenerLifecycle,
      senderLifecycle: this.senderLifecycle,
      consoleMode: this.consoleMode,
      motionCueSimulator: this.motionCueSimulator,
      init: () => this.init(),
      isInitialized: () => this.isInitialized,
      setInitialized: (value) => {
        this.isInitialized = value
      },
      restartTeardownListeners: () => [...(this.onControllerRestartListeners ?? [])],
    })
  }

  /**
   * Re-enable DMX output senders based on persisted preferences.
   * Called after controller restart so that sACN / Art-Net / USB senders
   * resume automatically without the user needing to toggle them off and on.
   */
  public async restoreSenderOutputsFromPrefs(
    activeSenders?: OutputSenderStateSnapshot,
  ): Promise<void> {
    return this.senderLifecycle.restoreSenderOutputsFromPrefs(activeSenders)
  }

  /**
   * Enable audio listener and processor
   */
  public async enableAudio(): Promise<void> {
    await this.lifecycle.awaitInFlightWork()
    await this.listenerLifecycle.audio.enableAudio(this.isInitialized, () => this.init())
  }

  /**
   * Disable audio processing
   */
  public async disableAudio(): Promise<void> {
    await this.lifecycle.awaitInFlightWork()
    await this.listenerLifecycle.audio.disableAudio()
  }

  /**
   * Refresh active audio cue selection when enabled groups change
   */
  public refreshAudioCueSelection(): void {
    this.listenerLifecycle.audio.refreshAudioCueSelection()
  }

  /**
   * Re-validate RB3 cue mode's rotating primary group after the enabled RB3 groups change, so a
   * group the user just disabled stops being forced. No-op unless RB3 cue mode is running.
   */
  public refreshRb3CueSelection(): void {
    this.listenerLifecycle.yargRb3.getProcessorManager()?.refreshRb3PrimaryGroup()
  }

  /**
   * Get audio enabled state
   */
  public getIsAudioEnabled(): boolean {
    return this.listenerLifecycle.audio.getIsAudioEnabled()
  }

  /**
   * Apply the global motion master toggle to every active rig's YARG handler plus the audio
   * processor (audio's fanout is hidden behind `AudioCueProcessor`). Without the chain loop
   * only the primary chain would see the toggle and secondary rigs would keep producing
   * motion output until the next listener restart.
   */
  public setMotionEnabledGlobal(enabled: boolean): void {
    this.graph.setMotionEnabledOnChains(enabled)
    this.listenerLifecycle.audio.setMotionEnabled(enabled)
  }

  /**
   * Update the manual YARG motion cue reference on every active rig's handler so all rigs
   * pick up the new reference together. Only the primary chain emits the renderer
   * broadcast for the change (see Phase 4 dedup); the secondary chains apply silently.
   */
  public setActiveYargMotionCueRef(ref: MotionCueRef | null): void {
    this.graph.setManualMotionRefOnChains('yarg', ref)
  }

  /**
   * Update the manual RB3 motion cue reference on every active rig's RB3 handler so all rigs
   * pick up the new reference together.
   */
  public setActiveRb3MotionCueRef(ref: MotionCueRef | null): void {
    this.graph.setManualMotionRefOnChains('rb3', ref)
  }

  public async enableConsoleMode(
    rigId: string,
  ): Promise<{ success: true } | { success: false; error: string }> {
    await this.init()
    if (this.lifecycle.phase !== 'consoleMode') {
      this.lifecycle.assertPhase(['running'], 'enableConsoleMode')
    }
    const r = await this.consoleMode.enableConsoleMode(rigId)
    if (r.success) {
      this.lifecycle.setPhase('consoleMode')
    }
    return r
  }

  public async disableConsoleMode(): Promise<
    { success: true } | { success: false; error: string }
  > {
    const r = await this.consoleMode.disableConsoleMode()
    if (r.success && this.lifecycle.phase === 'consoleMode') {
      this.lifecycle.setPhase('running')
    }
    return r
  }
}

export type { OutputSenderStateSnapshot } from './SenderLifecycleController'
