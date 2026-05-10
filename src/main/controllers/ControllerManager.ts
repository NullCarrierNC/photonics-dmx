import { ConfigurationManager } from '../../services/configuration/ConfigurationManager'
import { DmxLightManager } from '../../photonics-dmx/controllers/DmxLightManager'
import { Sequencer } from '../../photonics-dmx/controllers/sequencer/Sequencer'
import { DmxPublisher } from '../../photonics-dmx/controllers/DmxPublisher'
import { SenderManager } from '../../photonics-dmx/controllers/SenderManager'
import { LightingConfiguration, ConfigStrobeType, FixtureConfig } from '../../photonics-dmx/types'
import { YargCueHandler } from '../../photonics-dmx/cueHandlers/YargCueHandler'
import { ProcessorManager } from '../../photonics-dmx/processors/ProcessorManager'
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
import { LightStateManager } from '../../photonics-dmx/controllers/sequencer/LightStateManager'
import { TestEffectRunner } from './TestEffectRunner'
import { ListenerLifecycleController } from './ListenerLifecycleController'
import {
  SenderLifecycleController,
  type OutputSenderStateSnapshot,
} from './SenderLifecycleController'
import { ConsoleModeController } from './ConsoleModeController'
import { RegistryInitializer } from './RegistryInitializer'
import { RENDERER_RECEIVE } from '../../shared/ipcChannels'
import type { LifecyclePhase } from '../../shared/ipcTypes'
import { LightTransitionController } from '../../photonics-dmx/controllers/sequencer/LightTransitionController'
import { YargCueRegistry } from '../../photonics-dmx/cues/registries/YargCueRegistry'
import { AudioCueRegistry } from '../../photonics-dmx/cues/registries/AudioCueRegistry'
import {
  AudioCueType,
  AudioMotionCueRef,
  YargMotionCueRef,
} from '../../photonics-dmx/cues/types/audioCueTypes'
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
 * - `enable*` / `disable*` listener-lifecycle methods await any in-flight restart before proceeding.
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
  private dmxLightManager: DmxLightManager | null = null
  private lightStateManager: LightStateManager | null = null
  private lightTransitionController: LightTransitionController | null = null
  private sequencer: Sequencer | null = null
  private effectsController: ILightingController | null = null
  private dmxPublisher: DmxPublisher | null = null

  private cueHandler: YargCueHandler | null = null
  private nodeCueLoader: NodeCueLoader | null = null
  private effectLoader: EffectLoader | null = null

  private pendingValidationErrors: Array<{ source: 'node-cue' | 'effect'; errors: string[] }> = []

  private readonly testEffectRunner: TestEffectRunner
  private readonly senderLifecycle: SenderLifecycleController
  private readonly listenerLifecycle: ListenerLifecycleController
  private readonly registryInit: RegistryInitializer
  private readonly consoleMode: ConsoleModeController

  private isInitialized = false
  private lifecyclePhase: LifecyclePhase = 'initializing'
  private controllerShutdownPromise: Promise<void> | null = null
  private controllerShutdownCompleted = false
  private restartControllersInFlight: Promise<void> | null = null

  constructor() {
    this.config = new ConfigurationManager()
    this.senderLifecycle = new SenderLifecycleController(() => this.config, {
      broadcaster: mainRuntimeBroadcaster,
      hasReceivers: hasBrowserWindows,
    })
    this.testEffectRunner = new TestEffectRunner({
      getConfig: () => ({
        getPreference: (key: string) =>
          key === 'effectDebounce' ? this.config.getPreference('effectDebounce') : 0,
      }),
      getCueHandler: () => (this.cueHandler instanceof YargCueHandler ? this.cueHandler : null),
      getEffectsController: () => this.effectsController,
      getDmxLightManager: () => this.dmxLightManager!,
      ensureInitialized: () => this.init(),
      createCueHandler: (dmx, eff) => {
        const h = new YargCueHandler(dmx, eff, {
          getMotionCueMinimumHoldMs: () =>
            this.config.getPreference('cueDomains').yargMotion.minimumHoldMs ?? 5000,
          getMotionCueProbabilityPercent: () =>
            this.config.getPreference('cueDomains').yargMotion.probabilityPercent ?? 100,
          runtimeBroadcaster: mainRuntimeBroadcaster,
        })
        h.setMotionEnabled(this.config.getPreference('motionEnabled') ?? true)
        h.setManualMotionRef(
          this.config.getPreference('cueDomains').yargMotion.activeCueRef ?? null,
        )
        return h
      },
      setCueHandler: (h) => {
        this.cueHandler = h
      },
    })
    this.listenerLifecycle = new ListenerLifecycleController(
      {
        getDmxLightManager: () => this.dmxLightManager,
        getEffectsController: () => this.effectsController,
        getMotionEnabled: () => this.config.getPreference('motionEnabled') ?? true,
        getActiveYargMotionCueRef: () =>
          this.config.getPreference('cueDomains').yargMotion.activeCueRef ?? null,
        getMotionCueMinimumHoldMs: () =>
          this.config.getPreference('cueDomains').yargMotion.minimumHoldMs ?? 5000,
        getMotionCueProbabilityPercent: () =>
          this.config.getPreference('cueDomains').yargMotion.probabilityPercent ?? 100,
        sendSenderError: (message: string) => {
          sendToAllWindows(RENDERER_RECEIVE.SENDER_ERROR, message)
        },
        sendToAllWindows,
        runtimeBroadcaster: mainRuntimeBroadcaster,
        setCueHandlerRef: (h) => {
          this.cueHandler = h
        },
      },
      {
        getDmxLightManager: () => this.dmxLightManager,
        getEffectsController: () => this.effectsController,
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
   * Wait for any in-flight restart (or shutdown) to settle before mutating listener lifecycle.
   * Errors from the in-flight operation are swallowed here so that the caller can still attempt
   * its own work; the operation that owns the promise is responsible for surfacing its error.
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
    await this.initializeDmxManager()
    await this.initializeSequencer()
    await this.registryInit.initializeCueRegistry()
    await this.registryInit.initializeAudioCueRegistry()
    await this.applyMotionPreferencesFromConfig()
    const baseDir = path.join(app.getPath('appData'), 'Photonics.rocks')
    await copyDefaultData(process.resourcesPath, baseDir)
    await this.registryInit.initializeEffectLoader() // effects before node cues
    await this.registryInit.initializeNodeCueLoader()
    await this.applyYargEnabledGroupsFromConfig()
    await this.applyAudioEnabledGroupsFromConfig()
    await this.applyYargMotionEnabledGroupsFromConfig()
    await this.applyAudioMotionEnabledGroupsFromConfig()
    await this.initializeListeners()

    this.isInitialized = true
    this.setLifecyclePhase('running')
  }

  /**
   * Initialize the DMX Light Manager
   * Creates a merged manager from all active rigs for backward compatibility
   * Individual rig managers are handled by DmxPublisher
   */
  private async initializeDmxManager(): Promise<void> {
    // Load only active rigs
    const activeRigs = this.config.getActiveRigs()

    if (activeRigs.length === 0) {
      log.warn('No active DMX rigs found. DMX output will be disabled.')
      // Create empty manager for backward compatibility
      const emptyConfig = {
        numLights: 0,
        lightLayout: { id: 'default-layout', label: 'Default Layout' },
        strobeType: ConfigStrobeType.None,
        frontLights: [],
        backLights: [],
        strobeLights: [],
      }
      this.dmxLightManager = new DmxLightManager(emptyConfig)
      return
    }

    log.info(`Initializing ${activeRigs.length} active DMX rig(s)`)

    // Create merged configuration from all active rigs for backward compatibility
    // This allows processors and cue handlers to work with all lights
    const mergedConfig: LightingConfiguration = {
      numLights: 0,
      lightLayout: { id: 'merged', label: 'Merged Rigs' },
      strobeType: ConfigStrobeType.None,
      frontLights: [],
      backLights: [],
      strobeLights: [],
    }

    // Merge all lights from all active rigs
    for (const rig of activeRigs) {
      mergedConfig.frontLights.push(...rig.config.frontLights)
      mergedConfig.backLights.push(...rig.config.backLights)
      mergedConfig.strobeLights.push(...rig.config.strobeLights)
      mergedConfig.numLights += rig.config.numLights
    }

    this.dmxLightManager = new DmxLightManager(mergedConfig)
  }

  /**
   * Initialize the lighting system
   */
  private async initializeSequencer(): Promise<void> {
    // Get clock rate from configuration
    const clockRate = this.config.getPreference('clockRate')

    // Create the shared Clock instance
    const clock = new Clock(clockRate)

    // Create the sequencer components with the Clock
    this.lightStateManager = new LightStateManager()
    this.lightTransitionController = new LightTransitionController(this.lightStateManager)

    // Create the sequencer with all components
    this.sequencer = new Sequencer(this.lightTransitionController, clock)
    this.effectsController = this.sequencer

    // Start the centralized timing system
    clock.start()

    // Set up DMX publisher (no longer takes DmxLightManager in constructor)
    this.dmxPublisher = new DmxPublisher(
      this.senderLifecycle.getSenderManager(),
      this.lightStateManager,
    )

    // Load active rigs and set them up in the publisher
    const activeRigs = this.config.getActiveRigs()
    if (this.dmxPublisher && activeRigs.length > 0) {
      this.dmxPublisher.updateActiveRigs(activeRigs)
    }
  }

  /**
   * Apply YARG and Audio motion preferences from configuration (groups register later via NodeCueLoader).
   */
  private async applyMotionPreferencesFromConfig(): Promise<void> {
    const yarg = YargCueRegistry.getInstance()
    const audio = AudioCueRegistry.getInstance()
    yarg.setMotionSelectionMode(this.config.getMotionGroupSelectionMode())
    yarg.setDisabledMotionCues(this.config.getPreference('cueDomains').yargMotion.disabledCues)
    audio.setMotionSelectionMode(this.config.getAudioMotionGroupSelectionMode())
    audio.setDisabledMotionCues(this.config.getPreference('cueDomains').audioMotion.disabledCues)
    log.info('YARG + Audio motion registries initialized (selection modes from preferences).')
  }

  /**
   * Re-apply Yarg enabled groups from configuration after all groups are registered.
   * Node cue groups are registered in initializeNodeCueLoader(), and each registerGroup()
   * adds the group to enabled by default, which would overwrite a saved "disabled" preference.
   * Calling this after the node cue loader ensures the persisted preference wins.
   * Auto-enables groups that were never seen before (vs knownYargCueGroups); user-disabled
   * groups stay disabled because they remain in the known set.
   */
  private async applyYargEnabledGroupsFromConfig(): Promise<void> {
    const registry = YargCueRegistry.getInstance()
    const registeredIds = registry.getAllGroups()
    const yargDomain = this.config.getPreference('cueDomains').yarg
    let enabledGroupIds = yargDomain.enabledGroups ?? []
    const knownGroups = yargDomain.knownGroups ?? []

    if (!enabledGroupIds || enabledGroupIds.length === 0) {
      enabledGroupIds = registeredIds
      if (registeredIds.length > 0) {
        await this.config.updateCueDomain('yarg', { enabledGroups: enabledGroupIds })
      }
    } else {
      const newGroups = registeredIds.filter((id) => !knownGroups.includes(id))
      if (newGroups.length > 0) {
        enabledGroupIds = [...enabledGroupIds, ...newGroups]
        await this.config.updateCueDomain('yarg', { enabledGroups: enabledGroupIds })
      }
    }

    await this.config.updateCueDomain('yarg', { knownGroups: registeredIds })
    const restricted = enabledGroupIds.filter((id) => registeredIds.includes(id))
    registry.setEnabledGroups(restricted)
    log.info('CueRegistry enabled groups re-applied from config:', restricted)

    const disabledYarg = this.config.getPreference('cueDomains').yarg.disabledCues
    registry.setDisabledCues(disabledYarg)
  }

  /**
   * Re-apply audio enabled groups from configuration after all groups are registered.
   * Auto-enables groups that were never seen before (vs knownAudioCueGroups); user-disabled
   * groups stay disabled because they remain in the known set.
   */
  private async applyAudioEnabledGroupsFromConfig(): Promise<void> {
    const registry = AudioCueRegistry.getInstance()
    const registeredIds = registry.getRegisteredGroups()
    const audioDomain = this.config.getPreference('cueDomains').audio
    let enabledGroupIds = audioDomain.enabledGroups
    const knownGroups = audioDomain.knownGroups ?? []

    if (!enabledGroupIds || enabledGroupIds.length === 0) {
      enabledGroupIds = registeredIds
      if (registeredIds.length > 0) {
        await this.config.updateCueDomain('audio', { enabledGroups: enabledGroupIds })
      }
    } else {
      const newGroups = registeredIds.filter((id) => !knownGroups.includes(id))
      if (newGroups.length > 0) {
        enabledGroupIds = [...enabledGroupIds, ...newGroups]
        await this.config.updateCueDomain('audio', { enabledGroups: enabledGroupIds })
      }
    }

    await this.config.updateCueDomain('audio', { knownGroups: registeredIds })
    registry.setEnabledGroups(enabledGroupIds)
    const disabledAudio = this.config.getPreference('cueDomains').audio.disabledCues
    registry.setDisabledCues(disabledAudio)
    log.info('AudioCueRegistry enabled groups re-applied from config:', enabledGroupIds)
    this.refreshAudioCueSelection()
  }

  /**
   * Re-apply YARG motion enabled groups from configuration after node cues are registered.
   */
  private async applyYargMotionEnabledGroupsFromConfig(): Promise<void> {
    const registry = YargCueRegistry.getInstance()
    const registeredIds = registry.getRegisteredMotionGroupIds()
    const motionDomain = this.config.getPreference('cueDomains').yargMotion
    let enabledGroupIds = motionDomain.enabledGroups
    const knownGroups = motionDomain.knownGroups ?? []

    if (!enabledGroupIds || enabledGroupIds.length === 0) {
      enabledGroupIds = registeredIds
      if (registeredIds.length > 0) {
        await this.config.updateCueDomain('yargMotion', { enabledGroups: enabledGroupIds })
      }
    } else {
      const newGroups = registeredIds.filter((id) => !knownGroups.includes(id))
      if (newGroups.length > 0) {
        enabledGroupIds = [...enabledGroupIds, ...newGroups]
        await this.config.updateCueDomain('yargMotion', { enabledGroups: enabledGroupIds })
      }
    }

    await this.config.updateCueDomain('yargMotion', { knownGroups: registeredIds })
    registry.setEnabledMotionGroups(enabledGroupIds)
    const disabledMotion = this.config.getPreference('cueDomains').yargMotion.disabledCues
    registry.setDisabledMotionCues(disabledMotion)
    log.info('YARG motion enabled groups re-applied from config:', enabledGroupIds)
  }

  /**
   * Re-apply audio motion enabled groups from configuration after node cues are registered.
   */
  private async applyAudioMotionEnabledGroupsFromConfig(): Promise<void> {
    const registry = AudioCueRegistry.getInstance()
    const registeredIds = registry.getRegisteredMotionGroupIds()
    const audioMotionDomain = this.config.getPreference('cueDomains').audioMotion
    let enabledGroupIds = audioMotionDomain.enabledGroups
    const knownGroups = audioMotionDomain.knownGroups ?? []

    if (!enabledGroupIds || enabledGroupIds.length === 0) {
      enabledGroupIds = registeredIds
      if (registeredIds.length > 0) {
        await this.config.updateCueDomain('audioMotion', { enabledGroups: enabledGroupIds })
      }
    } else {
      const newGroups = registeredIds.filter((id) => !knownGroups.includes(id))
      if (newGroups.length > 0) {
        enabledGroupIds = [...enabledGroupIds, ...newGroups]
        await this.config.updateCueDomain('audioMotion', { enabledGroups: enabledGroupIds })
      }
    }

    await this.config.updateCueDomain('audioMotion', { knownGroups: registeredIds })
    registry.setEnabledMotionGroups(enabledGroupIds)
    const disabledMotion = this.config.getPreference('cueDomains').audioMotion.disabledCues
    registry.setDisabledMotionCues(disabledMotion)
    log.info('Audio motion enabled groups re-applied from config:', enabledGroupIds)
  }

  /**
   * Initialize network listeners
   */
  private async initializeListeners(): Promise<void> {
    if (!this.dmxLightManager || !this.effectsController) return

    // Create cue handler (default to YARG)
    const yargHandler = new YargCueHandler(this.dmxLightManager, this.effectsController, {
      getMotionCueMinimumHoldMs: () =>
        this.config.getPreference('cueDomains').yargMotion.minimumHoldMs ?? 5000,
      getMotionCueProbabilityPercent: () =>
        this.config.getPreference('cueDomains').yargMotion.probabilityPercent ?? 100,
      runtimeBroadcaster: mainRuntimeBroadcaster,
    })
    yargHandler.setMotionEnabled(this.config.getPreference('motionEnabled') ?? true)
    yargHandler.setManualMotionRef(
      this.config.getPreference('cueDomains').yargMotion.activeCueRef ?? null,
    )
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
   * Stop the currently running test effect
   */
  public async stopTestEffect(): Promise<void> {
    await this.testEffectRunner.stopTestEffect()
  }

  /**
   * Enable YARG listener.
   * Awaits any in-flight restart so enable/disable cannot interleave with teardown/reinit.
   */
  public enableYarg(): void {
    void this.awaitInFlightLifecycleWork().then(() => {
      this.listenerLifecycle.yargRb3.enableYarg(this.isInitialized, () => this.init())
    })
  }

  /**
   * Disable YARG listener
   */
  public async disableYarg(): Promise<void> {
    await this.awaitInFlightLifecycleWork()
    await this.listenerLifecycle.yargRb3.disableYarg()
  }

  /**
   * Enable Rb3 listener
   */
  public async enableRb3(): Promise<void> {
    await this.awaitInFlightLifecycleWork()
    await this.listenerLifecycle.yargRb3.enableRb3(this.isInitialized, () => this.init())
  }

  /**
   * Disable Rb3 listener
   */
  public async disableRb3(): Promise<void> {
    await this.awaitInFlightLifecycleWork()
    await this.listenerLifecycle.yargRb3.disableRb3()
  }

  /**
   * Get current RB3 processing mode
   */
  public getRb3Mode(): 'direct' | 'none' {
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

      if (this.cueHandler) {
        try {
          this.cueHandler.shutdown()
          this.cueHandler = null
          log.info('ControllerManager shutdown: cue handler stopped')
        } catch (err) {
          log.error('Error shutting down cue handler:', err)
        }
      }

      if (this.effectsController) {
        try {
          await this.effectsController.shutdown()
          log.info('ControllerManager shutdown: effects controller stopped')
        } catch (err) {
          log.error('Error shutting down effects controller:', err)
        }
      }

      if (this.dmxPublisher) {
        try {
          await this.dmxPublisher.shutdown()
          log.info('ControllerManager shutdown: DMX publisher stopped')
        } catch (err) {
          log.error('Error shutting down DMX publisher:', err)
        }
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

  public getCueHandler(): YargCueHandler | null {
    return this.cueHandler
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
    this.restartControllersInFlight = this.runRestartControllers().finally(() => {
      this.restartControllersInFlight = null
    })
    return this.restartControllersInFlight
  }

  private async runRestartControllers(): Promise<void> {
    this.assertPhase(['running', 'consoleMode', 'failed'], 'restartControllers')
    this.setLifecyclePhase('restarting')
    log.info('Restarting controllers to apply configuration changes')

    const wasYargEnabled = this.listenerLifecycle.yargRb3.getIsYargEnabled()
    const wasRb3Enabled = this.listenerLifecycle.yargRb3.getIsRb3Enabled()
    const wasAudioEnabled = this.listenerLifecycle.audio.getIsAudioEnabled()
    const activeSendersBeforeRestart = this.senderLifecycle.getActiveOutputSenderSnapshotIfAny()
    const wasConsoleMode = this.consoleMode.getConsoleRestore() !== null

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

      if (this.effectsController) {
        await this.effectsController.shutdown()
      }

      if (this.dmxPublisher) {
        await this.dmxPublisher.shutdown()
      }
      await this.senderLifecycle.resetSenderForControllerRestart()

      if (this.cueHandler) {
        this.cueHandler.shutdown()
      }

      this.dmxLightManager = null
      this.lightStateManager = null
      this.lightTransitionController = null
      this.sequencer = null
      this.effectsController = null
      this.dmxPublisher = null
      this.cueHandler = null

      this.isInitialized = false

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

    try {
      await this.init()
      this.setLifecyclePhase(wasConsoleMode ? 'consoleMode' : 'running')
      this.consoleMode.onControllersReinitializedWhileConsoleOpen()

      if (wasYargEnabled) {
        // Use the listener directly to avoid re-entering the in-flight restart guard.
        this.listenerLifecycle.yargRb3.enableYarg(this.isInitialized, () => this.init())
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
   * Apply global motion master toggle to YARG and audio motion handlers.
   */
  public setMotionEnabledGlobal(enabled: boolean): void {
    if (this.cueHandler instanceof YargCueHandler) {
      this.cueHandler.setMotionEnabled(enabled)
    }
    this.listenerLifecycle.audio.setMotionEnabled(enabled)
  }

  public setActiveAudioMotionCueRef(ref: AudioMotionCueRef | null): void {
    this.listenerLifecycle.audio.setActiveAudioMotionCueRef(ref)
  }

  public isAudioGameModeActive(): boolean {
    return this.listenerLifecycle.audio.isAudioGameModeActive()
  }

  public setActiveYargMotionCueRef(ref: YargMotionCueRef | null): void {
    if (this.cueHandler instanceof YargCueHandler) {
      this.cueHandler.setManualMotionRef(ref)
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
      this.lifecyclePhase = 'consoleMode'
    }
    return r
  }

  public async disableConsoleMode(): Promise<
    { success: true } | { success: false; error: string }
  > {
    const r = await this.consoleMode.disableConsoleMode()
    if (r.success && this.lifecyclePhase === 'consoleMode') {
      this.lifecyclePhase = 'running'
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
