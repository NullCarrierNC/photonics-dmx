import { ConfigurationManager } from '../../services/configuration/ConfigurationManager'
import {
  normalizeRb3ProcessingMode,
  normalizeWhiteChannelMixMode,
} from '../../services/configuration/configurationDefaults'
import { DmxLightManager } from '../../photonics-dmx/controllers/DmxLightManager'
import { DmxPublisher } from '../../photonics-dmx/controllers/DmxPublisher'
import { getStrobeStateManager } from '../../photonics-dmx/controllers/StrobeStateManager'
import { SenderManager } from '../../photonics-dmx/controllers/SenderManager'
import { LightingConfiguration, ConfigStrobeType, FixtureConfig } from '../../photonics-dmx/types'
import { CueHandler } from '../../photonics-dmx/cueHandlers/CueHandler'
import { ProcessorManager } from '../../photonics-dmx/processors/ProcessorManager'
import type { ProcessingMode } from '../../photonics-dmx/processors/ProcessorManager'
import {
  AudioConfig,
  AudioGameModeConfig,
  AudioLightingData,
} from '../../photonics-dmx/listeners/Audio/AudioTypes'
import { Clock } from '../../photonics-dmx/controllers/sequencer/Clock'
import { app } from 'electron'
import { sendToAllWindows, mainRuntimeBroadcaster, hasBrowserWindows } from '../utils/windowUtils'
import { copyDefaultData } from '../utils/copyDefaultData'
import * as path from 'path'
import { EffectLoader } from '../../photonics-dmx/cues/node/loader/EffectLoader'

import { ILightingController } from '../../photonics-dmx/controllers/sequencer/interfaces'
import { RigChain } from './RigChain'
import { ChainFanout } from './ChainFanout'
import { TestEffectRunner, type Rb3LedState } from './TestEffectRunner'
import { ChainCueRuntime } from '../../photonics-dmx/controllers/ChainCueRuntime'
import { MotionCueSimulator } from './MotionCueSimulator'
import { ListenerLifecycleController } from './ListenerLifecycleController'
import {
  SenderLifecycleController,
  type OutputSenderStateSnapshot,
} from './SenderLifecycleController'
import { ConsoleModeController } from './ConsoleModeController'
import { RegistryInitializer } from './RegistryInitializer'
import { RENDERER_RECEIVE } from '../../shared/ipcChannels'
import type { LifecyclePhase } from '../../shared/ipcTypes'
import {
  CUE_DOMAIN_BINDINGS,
  reconcileAndApplyGroups,
  type CueDomainRegistryBinding,
} from './cueDomainBindings'
import { buildDomainChainHandlers, readMotionPrefs } from './cueRuntimeDomains'
import type { NetCueMode } from '../../photonics-dmx/cues/types/nodeCueTypes'
import { AudioCueType, AudioMotionCueRef } from '../../photonics-dmx/cues/types/audioCueTypes'
import type { MotionCueRef } from '../../photonics-dmx/cues/types/cueTypes'
import { NodeCueLoader } from '../../photonics-dmx/cues/node/loader/NodeCueLoader'
// Import all cue sets to register with registry
import '../../photonics-dmx/cues'
import { createLogger } from '../../shared/logger'
import { DMX_OUTPUT_REFRESH_RATE_HZ_MAX } from '../../shared/dmxOutputRefresh'

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
 * - `shutdown()` runs off the queue and must NEVER drain it: queued ops await `controllerShutdownPromise`,
 *   so a shutdown that waited on the queue would deadlock against them.
 * - `init()` rejects with a `LifecycleAbortedError` if called while shutting down.
 */
// LifecyclePhase is owned by `shared/ipcTypes` so the renderer hook can reference the same union.
export type { LifecyclePhase } from '../../shared/ipcTypes'

/**
 * Thrown when a lifecycle method (typically `init()` invoked from a restart) is called against a
 * controller that has already begun shutting down. Restart routines treat this as a clean abort
 * rather than a reinit failure.
 */
export class LifecycleAbortedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LifecycleAbortedError'
  }
}

export class ControllerManager {
  private config: ConfigurationManager
  /**
   * Per-rig sequencer chains. Order is significant: `rigChains[0]` is the primary chain,
   * whose handlers own user-visible renderer broadcasts so the UI sees one event per
   * logical cue rather than one per rig.
   */
  private rigChains: RigChain[] = []
  /**
   * Listener / processor surface that dispatches each incoming event to every chain's
   * matching cue handler. Held here so listener controllers can read the up-to-date chain
   * list without re-creating their listener wiring on every chain rebuild.
   */
  private chainFanout = new ChainFanout()
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
  private lifecycleOpChain: Promise<void> = Promise.resolve()
  private nodeCueLoader: NodeCueLoader | null = null
  private effectLoader: EffectLoader | null = null

  private pendingValidationErrors: Array<{ source: 'node-cue' | 'effect'; errors: string[] }> = []
  private onSimulationPreempt: (() => void) | null = null

  private readonly testEffectRunner: TestEffectRunner
  /** RB3 cue-mode twin of {@link testEffectRunner}: dispatches through the RB3 chain runtime. */
  private readonly rb3TestEffectRunner: TestEffectRunner
  /** Reused RB3 dispatch surface for the RB3 test-effect runner (the fanout is stable). */
  private readonly rb3SimRuntime = new ChainCueRuntime(this.chainFanout, 'rb3')
  private readonly motionCueSimulator: MotionCueSimulator
  private readonly senderLifecycle: SenderLifecycleController
  private readonly listenerLifecycle: ListenerLifecycleController
  private readonly registryInit: RegistryInitializer
  private readonly consoleMode: ConsoleModeController

  private isInitialized = false
  private lifecyclePhase: LifecyclePhase = 'initializing'
  private controllerShutdownPromise: Promise<void> | null = null
  private controllerShutdownCompleted = false
  private restartControllersInFlight: Promise<void> | null = null
  /** Invoked during restart teardown so process-scoped consumers (e.g. laser sim) drop state tied to the
   *  engine/registry being rebuilt. A list, not a single slot, so multiple consumers can register without
   *  overwriting each other. */
  private readonly onControllerRestartListeners: Array<() => void> = []

  constructor() {
    this.config = new ConfigurationManager()
    this.senderLifecycle = new SenderLifecycleController(() => this.config, {
      broadcaster: mainRuntimeBroadcaster,
      hasReceivers: hasBrowserWindows,
    })
    const testEffectCtx = {
      getChainFanout: () => this.chainFanout,
      ensureInitialized: () => this.init(),
    }
    this.testEffectRunner = new TestEffectRunner(testEffectCtx, {
      ensureHandlers: () => this.ensureChainsHaveHandlersForSimulation('yarg'),
      dispatch: (cue, data) => void this.chainFanout.handleCue(cue, data),
      stopActiveCue: () => this.chainFanout.stopActiveCue(),
    })
    this.rb3TestEffectRunner = new TestEffectRunner(testEffectCtx, {
      ensureHandlers: () => this.ensureChainsHaveHandlersForSimulation('rb3'),
      dispatch: (cue, data) => void this.rb3SimRuntime.handleCue(cue, data),
      stopActiveCue: () => this.rb3SimRuntime.stopActiveCue(),
      songEvent: (condition) => this.rb3SimRuntime.handleSongEvent(condition),
    })
    this.motionCueSimulator = new MotionCueSimulator({
      getChainFanout: () => this.chainFanout,
    })
    this.listenerLifecycle = new ListenerLifecycleController(
      {
        getDmxLightManager: () => this.dmxLightManager,
        getEffectsController: () => this.effectsController,
        getRigChains: () => this.rigChains,
        getChainFanout: () => this.chainFanout,
        getMotionEnabled: () => this.config.getPreference('motionEnabled') ?? true,
        getActiveYargMotionCueRef: () => readMotionPrefs(this.config, 'yarg').activeCueRef,
        getMotionCueMinimumHoldMs: () => readMotionPrefs(this.config, 'yarg').minimumHoldMs,
        getMotionCueProbabilityPercent: () =>
          readMotionPrefs(this.config, 'yarg').probabilityPercent,
        getActiveRb3MotionCueRef: () => readMotionPrefs(this.config, 'rb3').activeCueRef,
        getRb3MotionCueMinimumHoldMs: () => readMotionPrefs(this.config, 'rb3').minimumHoldMs,
        getRb3MotionCueProbabilityPercent: () =>
          readMotionPrefs(this.config, 'rb3').probabilityPercent,
        getRb3MotionCueDurationRangeSec: () => {
          const d = readMotionPrefs(this.config, 'rb3')
          return { min: d.cueDurationMin, max: d.cueDurationMax }
        },
        getFallbackCueTimeMs: () => this.config.getPreference('yargFallbackCueTimeMs') ?? 20000,
        sendSenderError: (message: string) => {
          sendToAllWindows(RENDERER_RECEIVE.SENDER_ERROR, message)
        },
        sendToAllWindows,
        runtimeBroadcaster: mainRuntimeBroadcaster,
        setCueHandlerRef: (h) => {
          this.cueHandler = h
        },
        setRb3CueHandlerRef: (h) => {
          this.rb3CueHandler = h
        },
        getRb3ProcessingMode: () =>
          normalizeRb3ProcessingMode(this.config.getPreference('rb3Prefs')?.processingMode),
      },
      {
        getDmxLightManager: () => this.dmxLightManager,
        getEffectsController: () => this.effectsController,
        getRigChains: () => this.rigChains,
        getChainFanout: () => this.chainFanout,
        config: this.config,
        sendToAllWindows,
        runtimeBroadcaster: mainRuntimeBroadcaster,
      },
    )
    this.registryInit = new RegistryInitializer({
      getConfig: () => this.config,
      sendToAllWindows,
      pushValidationError: (e) => {
        this.pendingValidationErrors.push(e)
      },
      refreshAudioCueSelection: () => {
        this.refreshAudioCueSelection()
      },
      getNodeCueLoader: () => this.nodeCueLoader,
      setNodeCueLoader: (l) => {
        this.nodeCueLoader = l
      },
      getEffectLoader: () => this.effectLoader,
      setEffectLoader: (l) => {
        this.effectLoader = l
      },
      runtimeBroadcaster: mainRuntimeBroadcaster,
    })
    this.consoleMode = new ConsoleModeController({
      getConfig: () => this.config,
      ensureInitialized: () => this.init(),
      getDmxPublisher: () => this.dmxPublisher,
      getListenerSnapshot: () => ({
        yarg: this.listenerLifecycle.yargRb3.getIsYargEnabled(),
        rb3: this.listenerLifecycle.yargRb3.getIsRb3Enabled(),
      }),
      getIsAudioEnabled: () => this.getIsAudioEnabled(),
      pauseYarg: () => this.disableYarg(),
      pauseRb3: () => this.disableRb3(),
      pauseAudio: () => this.disableAudio(),
      refreshActiveRigs: () => this.refreshActiveRigs(),
      restartControllers: () => this.restartControllers(),
    })
  }

  private assertPhase(allowed: readonly LifecyclePhase[], context: string): void {
    if (!allowed.includes(this.lifecyclePhase)) {
      throw new Error(
        `ControllerManager: invalid lifecycle for ${context} (phase=${this.lifecyclePhase}, allowed=[${allowed.join(
          ', ',
        )}])`,
      )
    }
  }

  /**
   * Single point that mutates `lifecyclePhase`; emits LIFECYCLE_PHASE_CHANGED on every real
   * transition so the renderer can disable actions outside `running` / `consoleMode`.
   */
  private setLifecyclePhase(next: LifecyclePhase): void {
    if (this.lifecyclePhase === next) return
    this.lifecyclePhase = next
    sendToAllWindows(RENDERER_RECEIVE.LIFECYCLE_PHASE_CHANGED, next)
  }

  /**
   * Wait for any in-flight restart (or shutdown) to settle before mutating audio lifecycle.
   * Errors from the in-flight operation are swallowed here so that the caller can still attempt
   * its own work; the operation that owns the promise is responsible for surfacing its error.
   *
   * Off-queue callers only (audio enable/disable). Never call this from inside a queued lifecycle
   * op: the restart is itself a queued op, so a queued op awaiting `restartControllersInFlight`
   * that sits behind it on the queue would deadlock. Queued ops use `awaitShutdownWork` instead.
   */
  private async awaitInFlightLifecycleWork(): Promise<void> {
    const pending = this.restartControllersInFlight ?? this.controllerShutdownPromise
    if (!pending) return
    try {
      await pending
    } catch {
      // The owner already logged / rethrew; we just needed to wait.
    }
  }

  /**
   * Wait for an in-flight shutdown to settle. Used by queued lifecycle ops, which already exclude
   * each other and any restart via the queue, but must still yield to `shutdown()` (which runs off
   * the queue). Deliberately does NOT await `restartControllersInFlight` — the restart is a queued
   * op, so a toggle queued ahead of it awaiting that memo would deadlock.
   */
  private async awaitShutdownWork(): Promise<void> {
    if (!this.controllerShutdownPromise) return
    try {
      await this.controllerShutdownPromise
    } catch {
      // The owner already logged / rethrew; we just needed to wait.
    }
  }

  /**
   * Serialize every listener toggle and controller restart on one lifecycle queue: each op waits
   * for the previous one to settle (success or failure) before running, so handler slots and rig
   * chains are never built and torn down concurrently.
   */
  private runLifecycleOp<T>(op: () => Promise<T>): Promise<T> {
    const previous = this.lifecycleOpChain ?? Promise.resolve()
    const run = previous.then(op, op)
    // Flatten so the next op runs regardless of this one's outcome, and log any failure here
    // exactly once so fire-and-forget callers (`void enableYarg()`) don't discard it silently.
    // A LifecycleAbortedError is a clean shutdown/restart abort, not a fault, so log it at info.
    this.lifecycleOpChain = run.then(
      () => undefined,
      (err) => {
        if (err instanceof LifecycleAbortedError) {
          log.info('Lifecycle operation aborted:', err.message)
        } else {
          log.error('Lifecycle operation failed:', err)
        }
      },
    )
    return run
  }

  public getLifecyclePhase(): LifecyclePhase {
    return this.lifecyclePhase
  }

  /**
   * Initialize all controllers and systems
   */
  public async init(): Promise<void> {
    if (this.isInitialized) {
      return
    }
    if (this.lifecyclePhase === 'shuttingDown' || this.lifecyclePhase === 'stopped') {
      throw new LifecycleAbortedError(
        `ControllerManager.init aborted: shutdown in progress or already complete (phase=${this.lifecyclePhase})`,
      )
    }
    this.assertPhase(['initializing', 'restarting', 'failed'], 'init')

    this.senderLifecycle.ensureSenderManager()
    await this.initializeRigChains()
    for (const binding of CUE_DOMAIN_BINDINGS) {
      await this.registryInit.initializeCueRegistry(binding.domain)
    }
    const baseDir = path.join(app.getPath('appData'), 'Photonics.rocks')
    await copyDefaultData(process.resourcesPath, baseDir)
    await this.registryInit.initializeEffectLoader() // effects before node cues
    await this.registryInit.initializeNodeCueLoader()
    await this.applyAllEnabledGroupsFromConfig()
    await this.initializeListeners()

    this.isInitialized = true
    this.setLifecyclePhase('running')
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
  private async initializeRigChains(): Promise<void> {
    const activeRigs = this.config.getActiveRigs()

    const clockRate = this.config.getPreference('clockRate')
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

    this.chainFanout.setChains(this.rigChains)

    // Start the centralized timing system
    this.clock.start()

    // Set up DMX publisher. Govern wire output so the render tick rate (clockRate, up to
    // 100 Hz) doesn't fire-hose cheap USB / low-end sACN adapters. The Global DMX Publishing
    // Rate pref sits upstream of all enabled senders; per-sender refresh settings still pace
    // individual slow links below this cap. Falls back to the absolute DMX ceiling when the
    // pref is absent so the governor never throttles a sender below what it could output.
    const globalDmxRateHz =
      this.config.getPreference('globalDmxPublishingRateHz') ?? DMX_OUTPUT_REFRESH_RATE_HZ_MAX
    this.dmxPublisher = new DmxPublisher(this.senderLifecycle.getSenderManager(), null, undefined, {
      outputRateHz: globalDmxRateHz,
      whiteChannelMixMode: normalizeWhiteChannelMixMode(
        this.config.getPreference('whiteChannelMixMode'),
      ),
    })
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

  /**
   * Apply YARG and Audio motion preferences from configuration (groups register later via NodeCueLoader).
   */
  /**
   * Re-apply one cue domain's enabled groups and disabled cues from configuration after all groups
   * are registered. Node cue groups are registered in initializeNodeCueLoader(), and each
   * registerGroup() adds the group to enabled by default, which would overwrite a saved "disabled"
   * preference; running this after the loader ensures the persisted preference wins. Auto-enables
   * groups never seen before (vs the known set); user-disabled groups stay disabled because they
   * remain in the known set, and deregistered groups are dropped.
   */
  private async applyEnabledGroupsFromConfig(binding: CueDomainRegistryBinding): Promise<void> {
    const reconciled = await reconcileAndApplyGroups(binding, this.config)
    log.info(`${binding.domain} enabled groups re-applied from config:`, reconciled.enabled)
  }

  /** Re-apply every cue domain's enabled groups and disabled cues from configuration. */
  private async applyAllEnabledGroupsFromConfig(): Promise<void> {
    for (const binding of CUE_DOMAIN_BINDINGS) {
      await this.applyEnabledGroupsFromConfig(binding)
    }
    // Audio selection reads the freshly-applied enabled/disabled state; refresh once after the loop.
    this.refreshAudioCueSelection()
  }

  /**
   * Initialize network listeners
   */
  private async initializeListeners(): Promise<void> {
    if (!this.dmxLightManager || !this.effectsController) return

    // Create cue handler (default to YARG)
    const yargHandler = new CueHandler(this.dmxLightManager, this.effectsController, {
      getMotionCueMinimumHoldMs: () => readMotionPrefs(this.config, 'yarg').minimumHoldMs,
      getMotionCueProbabilityPercent: () => readMotionPrefs(this.config, 'yarg').probabilityPercent,
      runtimeBroadcaster: mainRuntimeBroadcaster,
    })
    yargHandler.setMotionEnabled(this.config.getPreference('motionEnabled') ?? true)
    yargHandler.setManualMotionRef(readMotionPrefs(this.config, 'yarg').activeCueRef)
    this.cueHandler = yargHandler
  }

  /**
   * Start a test effect
   */
  public startTestEffect(
    effectId: string,
    venueSize?: 'NoVenue' | 'Small' | 'Large',
    bpm?: number,
    cueGroup?: string,
  ): void {
    this.testEffectRunner.startTestEffect(effectId, venueSize, bpm, cueGroup)
  }

  /**
   * Start an RB3 cue-mode test effect: interval-driven dispatch through the RB3 chain runtime so a
   * held strobe re-fires `cue-called` continuously, mirroring the live processor keepalive.
   */
  public startRb3TestEffect(
    effectId: string,
    venueSize?: 'NoVenue' | 'Small' | 'Large',
    bpm?: number,
    cueGroup?: string,
  ): void {
    this.rb3TestEffectRunner.startTestEffect(effectId, venueSize, bpm, cueGroup)
  }

  /** Set the simulated RB3 StageKit LED bank masks + fog driving the running RB3 test effect. */
  public setRb3SimulationLedState(state: Rb3LedState): void {
    this.rb3TestEffectRunner.setRb3LedState(state)
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
    await this.runLifecycleOp(async () => {
      await this.awaitShutdownWork()
      await this.listenerLifecycle.yargRb3.enableYarg(this.isInitialized, () => this.init())
    })
  }

  /**
   * Disable YARG listener
   */
  public async disableYarg(): Promise<void> {
    await this.runLifecycleOp(async () => {
      await this.awaitShutdownWork()
      await this.listenerLifecycle.yargRb3.disableYarg()
    })
  }

  /**
   * Enable Rb3 listener. Running simulations are stopped first — the listener owns the rig
   * chains from here and simulation IPC is refused while RB3E is enabled.
   */
  public async enableRb3(): Promise<void> {
    await this.runLifecycleOp(async () => {
      await this.awaitShutdownWork()
      await this.stopTestEffect()
      this.onSimulationPreempt?.()
      await this.listenerLifecycle.yargRb3.enableRb3(this.isInitialized, () => this.init())
    })
  }

  /**
   * Disable Rb3 listener
   */
  public async disableRb3(): Promise<void> {
    await this.runLifecycleOp(async () => {
      await this.awaitShutdownWork()
      await this.listenerLifecycle.yargRb3.disableRb3()
    })
  }

  /**
   * Get current RB3 processing mode
   */
  public getRb3Mode(): ProcessingMode | 'none' {
    return this.listenerLifecycle.yargRb3.getRb3Mode()
  }

  /**
   * Get RB3 processor statistics
   */
  public getRb3ProcessorStats(): ReturnType<ProcessorManager['getProcessorStats']> | null {
    return this.listenerLifecycle.yargRb3.getRb3ProcessorStats()
  }

  /**
   * Shutdown all controllers and systems.
   * Idempotent: subsequent calls return the in-flight promise (or resolve immediately when
   * teardown has already completed). A teardown rejection leaves `controllerShutdownCompleted`
   * unset so `shutdown()` can be retried; only a successful teardown is "completed".
   *
   * Runs off the lifecycle queue and must NOT be changed to drain it: queued toggles await
   * `controllerShutdownPromise` (assigned below), so waiting on the queue here would deadlock.
   */
  public async shutdown(): Promise<void> {
    if (this.controllerShutdownCompleted) {
      return
    }
    if (this.controllerShutdownPromise) {
      return this.controllerShutdownPromise
    }

    this.assertPhase(['initializing', 'running', 'restarting', 'consoleMode', 'failed'], 'shutdown')
    this.setLifecyclePhase('shuttingDown')
    log.info('ControllerManager shutdown: starting')

    this.controllerShutdownPromise = (async () => {
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

      this.shutdownDomainCueHandlerRefs()

      // Dispose every rig chain. The shared clock is stopped separately below so a chain
      // tearing down can't take ticks away from any sibling chain.
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

      if (this.dmxPublisher) {
        try {
          await this.dmxPublisher.shutdown()
          log.info('ControllerManager shutdown: DMX publisher stopped')
        } catch (err) {
          log.error('Error shutting down DMX publisher:', err)
        }
      }

      if (this.clock) {
        try {
          this.clock.destroy()
        } catch (err) {
          log.error('Error stopping shared clock:', err)
        }
        this.clock = null
      }

      try {
        await this.senderLifecycle.shutdownSenderOnAppExit()
        log.info('ControllerManager shutdown: sender manager stopped')
      } catch (err) {
        log.error('Error shutting down sender manager:', err)
      }

      this.isInitialized = false
      this.controllerShutdownCompleted = true
      this.setLifecyclePhase('stopped')
      log.info('ControllerManager shutdown: completed')
    })()

    try {
      await this.controllerShutdownPromise
    } finally {
      this.controllerShutdownPromise = null
    }
  }

  // Getters for controllers
  public getConfig(): ConfigurationManager {
    return this.config
  }

  public getDmxLightManager(): DmxLightManager | null {
    return this.dmxLightManager
  }

  public getLightingController(): ILightingController | null {
    return this.effectsController
  }

  public getSenderManager(): SenderManager {
    return this.senderLifecycle.getSenderManager()
  }

  /**
   * Handles uncaught exceptions that are network sender errors.
   * @returns true if the error was handled as a network sender error, false otherwise
   */
  public handleUncaughtException(error: unknown): boolean {
    return this.senderLifecycle.handleUncaughtException(error, () => this.getIsInitialized())
  }

  public setSenderErrorTrackingCallback(callback: (senderId: string) => void): void {
    this.senderLifecycle.setSenderErrorTrackingCallback(callback)
  }

  public setOnConsoleEnter(callback: (() => void) | null): void {
    this.consoleMode.setOnConsoleEnter(callback)
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
    return this.cueHandler
  }

  public getRb3CueHandler(): CueHandler | null {
    return this.rb3CueHandler
  }

  /**
   * Shut down and null every domain cue-handler ref (YARG + RB3). Single owner for both the
   * shutdown and restart-teardown paths, so a handler ref can never survive teardown pointing at a
   * disposed handler. Each is guarded independently so one failing shutdown can't strand the other;
   * a new domain adds one block here rather than another pair of mirrored teardown sites.
   */
  private shutdownDomainCueHandlerRefs(): void {
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
    buildDomainChainHandlers(domain, this.rigChains, {
      getMotionEnabled: () => this.config.getPreference('motionEnabled') ?? true,
      getMotionCueMinimumHoldMs: () => readMotionPrefs(this.config, domain).minimumHoldMs,
      getMotionCueProbabilityPercent: () => readMotionPrefs(this.config, domain).probabilityPercent,
      getActiveMotionCueRef: () => readMotionPrefs(this.config, domain).activeCueRef,
      runtimeBroadcaster: mainRuntimeBroadcaster,
      replaceExisting: false,
    })
  }

  public getNodeCueLoader(): NodeCueLoader | null {
    return this.nodeCueLoader
  }

  public getEffectLoader(): EffectLoader | null {
    return this.effectLoader
  }

  public getProcessorManager(): ProcessorManager | null {
    return this.listenerLifecycle.yargRb3.getProcessorManager()
  }

  public getDmxPublisher(): DmxPublisher | null {
    return this.dmxPublisher
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
   * Get sender status information
   * @returns Object containing status of each sender type
   */
  public getSenderStatus(): { sacn: boolean; artnet: boolean; enttecpro: boolean; ipc: boolean } {
    const sm = this.senderLifecycle.getSenderManager()
    return {
      sacn: sm.isSenderEnabled('sacn'),
      artnet: sm.isSenderEnabled('artnet'),
      enttecpro: sm.isSenderEnabled('enttecpro'),
      ipc: sm.isSenderEnabled('ipc'),
    }
  }

  /**
   * Refresh which rigs are active for DMX output without restarting controllers.
   * Use this when only the active-rig set changes so senders stay running.
   */
  public refreshActiveRigs(): void {
    if (!this.isInitialized || !this.dmxPublisher) {
      return
    }
    const activeRigs = this.config.getActiveRigs()
    this.dmxPublisher.updateActiveRigs(activeRigs)
    log.info('Refreshed active rigs for DMX output:', activeRigs.length, 'rig(s)')
  }

  /**
   * Restart controllers to pick up configuration changes
   * This shuts down existing controllers and reinitializes them
   */
  public async restartControllers(): Promise<void> {
    if (this.restartControllersInFlight) {
      return this.restartControllersInFlight
    }
    // A restart is a peer on the lifecycle queue with the listener toggles, so teardown never runs
    // while a toggle is mid-flight (and vice versa). The memo dedupes overlapping calls and gates
    // the off-queue audio toggles. Assigned synchronously so a same-tick second call shares it.
    this.restartControllersInFlight = this.runLifecycleOp(() =>
      this.runRestartControllers(),
    ).finally(() => {
      this.restartControllersInFlight = null
    })
    return this.restartControllersInFlight
  }

  private async runRestartControllers(): Promise<void> {
    // A shutdown may have started while this restart waited its turn on the queue; abort cleanly
    // (typed) rather than failing assertPhase with a generic invalid-lifecycle error. Snapshot into
    // a local so the check doesn't narrow `this.lifecyclePhase` for the post-teardown guard below.
    const phaseAtDequeue: LifecyclePhase = this.lifecyclePhase
    if (
      phaseAtDequeue === 'shuttingDown' ||
      phaseAtDequeue === 'stopped' ||
      this.controllerShutdownPromise
    ) {
      throw new LifecycleAbortedError('restartControllers aborted: shutdown in progress')
    }
    this.assertPhase(['running', 'consoleMode', 'failed'], 'restartControllers')
    this.setLifecyclePhase('restarting')
    log.info('Restarting controllers to apply configuration changes')

    // The lifecycle queue guarantees no listener toggle is mid-flight here, so the was-enabled
    // snapshot is stable and rig chains can't be disposed under an in-flight enable.
    const wasYargEnabled = this.listenerLifecycle.yargRb3.getIsYargEnabled()
    const wasRb3Enabled = this.listenerLifecycle.yargRb3.getIsRb3Enabled()
    const wasAudioEnabled = this.listenerLifecycle.audio.getIsAudioEnabled()
    const activeSendersBeforeRestart = this.senderLifecycle.getActiveOutputSenderSnapshotIfAny()
    const wasConsoleMode = this.consoleMode.getConsoleRestore() !== null

    let teardownSucceeded = false
    try {
      if (wasYargEnabled) {
        await this.listenerLifecycle.yargRb3.disableYarg()
      }
      if (wasRb3Enabled) {
        await this.listenerLifecycle.yargRb3.disableRb3()
      }
      if (wasAudioEnabled) {
        await this.listenerLifecycle.audio.disableAudio()
      }

      for (const chain of this.rigChains) {
        await chain.dispose()
      }
      this.rigChains = []

      if (this.dmxPublisher) {
        await this.dmxPublisher.shutdown()
      }
      await this.senderLifecycle.resetSenderForControllerRestart()

      this.shutdownDomainCueHandlerRefs()

      // Gguarantee the process-wide strobe state is cleared on every restart,
      // even if no cue handler was active to clear it during its own shutdown.
      // Prevents a stale strobe slot from driving hardware-strobe-channel
      // lights after an input-platform switch.
      getStrobeStateManager().setActive(null)

      // Drop process-scoped state bound to the engine/registry being rebuilt (e.g. an active laser sim
      // cue + its render tick). Each callback is wrapped so one consumer's failure can neither abort the
      // restart nor skip the others. Iterate a snapshot so a listener that unregisters during the loop
      // cannot shift the array under the iterator and skip its neighbour.
      for (const listener of [...(this.onControllerRestartListeners ?? [])]) {
        try {
          listener()
        } catch (err) {
          log.error('Error running controller-restart callback:', err)
        }
      }

      // Drop any active simulated motion cue — the chains it drove are being rebuilt, so a held cue
      // would otherwise execute against torn-down sequencers on the next simulate tick. Wrapped so a
      // reset failure can never abort the controller restart.
      try {
        this.motionCueSimulator.reset()
      } catch (err) {
        log.error('Error resetting motion cue simulator during restart:', err)
      }

      // Clear the shared tick source so `init()` builds a fresh one rather than reusing
      // a clock whose tick callbacks have been unregistered.
      if (this.clock) {
        this.clock.destroy()
        this.clock = null
      }

      this.dmxLightManager = null
      this.effectsController = null
      this.dmxPublisher = null

      this.isInitialized = false

      teardownSucceeded = true
      log.info('Controllers shutdown completed, reinitializing')
    } catch (error) {
      log.error('Error shutting down controllers:', error)
    }

    // If shutdown began while we were tearing down, do not reinitialize. The shutdown promise
    // owns the next phase transition; restartControllers exits with a typed abort.
    if (
      this.lifecyclePhase === 'shuttingDown' ||
      this.lifecyclePhase === 'stopped' ||
      this.controllerShutdownPromise
    ) {
      log.info('Restart aborted: shutdown started during teardown')
      throw new LifecycleAbortedError(
        'restartControllers aborted: shutdown started before reinitialization',
      )
    }

    // A teardown failure (with no concurrent shutdown) leaves controllers partially torn down.
    // Reinitializing on top of that risks dangling listeners/timers and double-published state,
    // so fail the restart instead of building a fresh graph over a broken one.
    if (!teardownSucceeded) {
      log.error('Restart aborted: controller teardown did not complete; not reinitializing')
      this.setLifecyclePhase('failed')
      this.isInitialized = false
      throw new Error('Controller teardown failed during restart; reinitialization aborted')
    }

    try {
      await this.init()
      this.setLifecyclePhase(wasConsoleMode ? 'consoleMode' : 'running')
      this.consoleMode.onControllersReinitializedWhileConsoleOpen()

      if (wasYargEnabled) {
        // Drive the listener directly: the public toggles are queued lifecycle ops and would
        // deadlock behind this restart's own queue slot.
        await this.listenerLifecycle.yargRb3.enableYarg(this.isInitialized, () => this.init())
      } else if (wasRb3Enabled) {
        await this.listenerLifecycle.yargRb3.enableRb3(this.isInitialized, () => this.init())
      }

      if (wasAudioEnabled) {
        await this.listenerLifecycle.audio.enableAudio(this.isInitialized, () => this.init())
      }

      // Restore DMX output senders from persisted preferences so that output
      // continues without requiring a manual toggle after any config change.
      await this.senderLifecycle.restoreSenderOutputsFromPrefs(
        activeSendersBeforeRestart ?? undefined,
      )

      // Single source of the restart broadcast: every caller of restartControllers() used to fire
      // this itself (and SET_CLOCK_RATE forgot to), so broadcast once here after a successful restart
      // and let the callers drop their copies.
      sendToAllWindows(RENDERER_RECEIVE.CONTROLLERS_RESTARTED, undefined)

      log.info('Controllers restarted successfully')
    } catch (error) {
      if (error instanceof LifecycleAbortedError) {
        // Shutdown raced reinit; let the shutdown promise own the final state.
        log.info('Reinit aborted by concurrent shutdown')
        throw error
      }
      log.error('Error reinitializing controllers:', error)
      this.setLifecyclePhase('failed')
      this.isInitialized = false
      throw error
    }
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
    await this.awaitInFlightLifecycleWork()
    await this.listenerLifecycle.audio.enableAudio(this.isInitialized, () => this.init())
  }

  /**
   * Disable audio processing
   */
  public async disableAudio(): Promise<void> {
    await this.awaitInFlightLifecycleWork()
    await this.listenerLifecycle.audio.disableAudio()
  }

  /**
   * Update audio configuration while audio is running
   */
  public updateAudioConfig(config: AudioConfig): void {
    this.listenerLifecycle.audio.updateAudioConfig(config)
  }

  /**
   * Refresh active audio cue selection when enabled groups change
   */
  public refreshAudioCueSelection(): void {
    this.listenerLifecycle.audio.refreshAudioCueSelection()
  }

  /**
   * Get the current audio cue selection
   */
  public getActiveAudioCueType(): AudioCueType {
    return this.listenerLifecycle.audio.getActiveAudioCueType()
  }

  /**
   * Secondary cue driving the overlay slot (manual secondary or active strobe cue).
   */
  public getActiveSecondaryCueType(): AudioCueType | null {
    return this.listenerLifecycle.audio.getActiveSecondaryCueType()
  }

  /**
   * Persist and apply a new audio cue selection
   */
  public setActiveAudioCueType(cueType: AudioCueType): { success: boolean; error?: string } {
    return this.listenerLifecycle.audio.setActiveAudioCueType(cueType)
  }

  /**
   * Return cue options sourced from enabled audio cue groups
   */
  public getAudioCueOptions(): Array<{
    id: AudioCueType
    label: string
    description: string
    groupId: string
    groupName: string
    groupDescription: string
  }> {
    return this.listenerLifecycle.audio.getAudioCueOptions()
  }

  /**
   * Get audio enabled state
   */
  public getIsAudioEnabled(): boolean {
    return this.listenerLifecycle.audio.getIsAudioEnabled()
  }

  public getAudioGameModeConfig(): AudioGameModeConfig {
    return this.listenerLifecycle.audio.getAudioGameModeConfig()
  }

  public async setAudioGameModeConfig(config: AudioGameModeConfig): Promise<void> {
    await this.listenerLifecycle.audio.setAudioGameModeConfig(config)
  }

  /**
   * Apply the global motion master toggle to every active rig's YARG handler plus the audio
   * processor (audio's fanout is hidden behind `AudioCueProcessor`). Without the chain loop
   * only the primary chain would see the toggle and secondary rigs would keep producing
   * motion output until the next listener restart.
   */
  public setMotionEnabledGlobal(enabled: boolean): void {
    for (const chain of this.rigChains) {
      chain.cueHandlers.yarg?.setMotionEnabled(enabled)
      chain.cueHandlers.rb3?.setMotionEnabled(enabled)
    }
    this.listenerLifecycle.audio.setMotionEnabled(enabled)
  }

  public setActiveAudioMotionCueRef(ref: AudioMotionCueRef | null): void {
    this.listenerLifecycle.audio.setActiveAudioMotionCueRef(ref)
  }

  public isAudioGameModeActive(): boolean {
    return this.listenerLifecycle.audio.isAudioGameModeActive()
  }

  /**
   * Update the manual YARG motion cue reference on every active rig's handler so all rigs
   * pick up the new reference together. Only the primary chain emits the renderer
   * broadcast for the change (see Phase 4 dedup); the secondary chains apply silently.
   */
  public setActiveYargMotionCueRef(ref: MotionCueRef | null): void {
    for (const chain of this.rigChains) {
      chain.cueHandlers.yarg?.setManualMotionRef(ref)
    }
  }

  /**
   * Update the manual RB3 motion cue reference on every active rig's RB3 handler so all rigs
   * pick up the new reference together.
   */
  public setActiveRb3MotionCueRef(ref: MotionCueRef | null): void {
    for (const chain of this.rigChains) {
      chain.cueHandlers.rb3?.setManualMotionRef(ref)
    }
  }

  /**
   * Routes analysed audio frames to the Audio Preview window (wired from IPC setup).
   */
  public setAudioMirrorBroadcaster(fn: (data: AudioLightingData) => void): void {
    this.listenerLifecycle.audio.setBroadcastAudioMirror(fn)
  }

  public async enableConsoleMode(
    rigId: string,
  ): Promise<{ success: true } | { success: false; error: string }> {
    await this.init()
    if (this.lifecyclePhase !== 'consoleMode') {
      this.assertPhase(['running'], 'enableConsoleMode')
    }
    const r = await this.consoleMode.enableConsoleMode(rigId)
    if (r.success) {
      this.setLifecyclePhase('consoleMode')
    }
    return r
  }

  public async disableConsoleMode(): Promise<
    { success: true } | { success: false; error: string }
  > {
    const r = await this.consoleMode.disableConsoleMode()
    if (r.success && this.lifecyclePhase === 'consoleMode') {
      this.setLifecyclePhase('running')
    }
    return r
  }

  public sendConsoleDmx(buffer: Record<number, number>): void {
    this.consoleMode.sendConsoleDmx(buffer)
  }

  public async updateConsoleChannel(payload: {
    rigId: string
    lightId: string
    fixtureId: string
    channelName: string
    channelNumber: number
  }): Promise<{ success: true } | { success: false; error: string }> {
    return this.consoleMode.updateConsoleChannel(payload)
  }

  public async setConsoleHome(payload: {
    rigId: string
    lightId: string
    fixtureId: string
    panHome: number
    tiltHome: number
  }): Promise<{ success: true } | { success: false; error: string }> {
    return this.consoleMode.setConsoleHome(payload)
  }

  public async setConsoleFixtureConfig(payload: {
    rigId: string
    lightId: string
    fixtureId: string
    config: Partial<FixtureConfig>
  }): Promise<{ success: true } | { success: false; error: string }> {
    return this.consoleMode.setConsoleFixtureConfig(payload)
  }
}

export type { OutputSenderStateSnapshot } from './SenderLifecycleController'
