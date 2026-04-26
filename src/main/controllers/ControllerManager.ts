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
import { sendToAllWindows } from '../utils/windowUtils'
import { copyDefaultData } from '../utils/copyDefaultData'
import * as path from 'path'
import { EffectLoader } from '../../photonics-dmx/cues/node/loader/EffectLoader'

import { ILightingController } from '../../photonics-dmx/controllers/sequencer/interfaces'
import { LightStateManager } from '../../photonics-dmx/controllers/sequencer/LightStateManager'
import { TestEffectRunner } from './TestEffectRunner'
import { ListenerCoordinator } from './ListenerCoordinator'
import { AudioController } from './AudioController'
import {
  SenderLifecycleController,
  type OutputSenderStateSnapshot,
} from './SenderLifecycleController'
import { ConsoleModeController } from './ConsoleModeController'
import { RegistryInitializer } from './RegistryInitializer'
import { RENDERER_RECEIVE } from '../../shared/ipcChannels'
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
  private readonly listenerCoordinator: ListenerCoordinator
  private readonly audioController: AudioController
  private readonly registryInit: RegistryInitializer
  private readonly consoleMode: ConsoleModeController

  private isInitialized = false

  constructor() {
    this.config = new ConfigurationManager()
    this.senderLifecycle = new SenderLifecycleController(() => this.config)
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
    this.listenerCoordinator = new ListenerCoordinator({
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
      setCueHandlerRef: (h) => {
        this.cueHandler = h
      },
    })
    this.audioController = new AudioController({
      getDmxLightManager: () => this.dmxLightManager,
      getEffectsController: () => this.effectsController,
      config: this.config,
      sendToAllWindows,
    })
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
    })
    this.consoleMode = new ConsoleModeController({
      getConfig: () => this.config,
      ensureInitialized: () => this.init(),
      getDmxPublisher: () => this.dmxPublisher,
      getListenerSnapshot: () => ({
        yarg: this.listenerCoordinator.getIsYargEnabled(),
        rb3: this.listenerCoordinator.getIsRb3Enabled(),
      }),
      getIsAudioEnabled: () => this.getIsAudioEnabled(),
      pauseYarg: () => this.disableYarg(),
      pauseRb3: () => this.disableRb3(),
      pauseAudio: () => this.disableAudio(),
      restoreYarg: () => {
        this.enableYarg()
      },
      restoreRb3: () => this.enableRb3(),
      restoreAudio: () => this.enableAudio(),
      refreshActiveRigs: () => this.refreshActiveRigs(),
      restartControllers: () => this.restartControllers(),
    })
  }

  /**
   * Initialize all controllers and systems
   */
  public async init(): Promise<void> {
    if (this.isInitialized) return

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
      console.warn('No active DMX rigs found. DMX output will be disabled.')
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

    console.log(`Initializing ${activeRigs.length} active DMX rig(s)`)

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
    console.log('YARG + Audio motion registries initialized (selection modes from preferences).')
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
    console.log('CueRegistry enabled groups re-applied from config:', restricted)

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
    console.log('AudioCueRegistry enabled groups re-applied from config:', enabledGroupIds)
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
    console.log('YARG motion enabled groups re-applied from config:', enabledGroupIds)
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
    console.log('Audio motion enabled groups re-applied from config:', enabledGroupIds)
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
   * Enable YARG listener
   */
  public enableYarg(): void {
    this.listenerCoordinator.enableYarg(this.isInitialized, () => this.init())
  }

  /**
   * Disable YARG listener
   */
  public async disableYarg(): Promise<void> {
    await this.listenerCoordinator.disableYarg()
  }

  /**
   * Enable Rb3 listener
   */
  public async enableRb3(): Promise<void> {
    await this.listenerCoordinator.enableRb3(this.isInitialized, () => this.init())
  }

  /**
   * Disable Rb3 listener
   */
  public async disableRb3(): Promise<void> {
    await this.listenerCoordinator.disableRb3()
  }

  /**
   * Get current RB3 processing mode
   */
  public getRb3Mode(): 'direct' | 'none' {
    return this.listenerCoordinator.getRb3Mode()
  }

  /**
   * Get RB3 processor statistics
   */
  public getRb3ProcessorStats(): ReturnType<ProcessorManager['getProcessorStats']> | null {
    return this.listenerCoordinator.getRb3ProcessorStats()
  }

  /**
   * Shutdown all controllers and systems
   */
  public async shutdown(): Promise<void> {
    console.log('ControllerManager shutdown: starting')

    try {
      // Shutdown in reverse order of initialization
      try {
        await this.listenerCoordinator.disableYarg()
        console.log('ControllerManager shutdown: YARG disabled')
      } catch (err) {
        console.error('Error disabling YARG:', err)
      }

      try {
        await this.listenerCoordinator.disableRb3()
        console.log('ControllerManager shutdown: RB3 disabled')
      } catch (err) {
        console.error('Error disabling RB3:', err)
      }

      try {
        await this.audioController.disableAudio()
        console.log('ControllerManager shutdown: Audio disabled')
      } catch (err) {
        console.error('Error disabling Audio:', err)
      }

      if (this.nodeCueLoader) {
        try {
          await this.nodeCueLoader.dispose()
          this.nodeCueLoader.removeAllListeners()
          this.nodeCueLoader = null
          console.log('ControllerManager shutdown: node cue loader stopped')
        } catch (err) {
          console.error('Error shutting down node cue loader:', err)
        }
      }

      if (this.effectLoader) {
        try {
          await this.effectLoader.dispose()
          this.effectLoader.removeAllListeners()
          this.effectLoader = null
          console.log('ControllerManager shutdown: effect loader stopped')
        } catch (err) {
          console.error('Error shutting down effect loader:', err)
        }
      }

      // Ensure cue handler is shut down if it still exists
      if (this.cueHandler) {
        try {
          this.cueHandler.shutdown()
          this.cueHandler = null
          console.log('ControllerManager shutdown: cue handler stopped')
        } catch (err) {
          console.error('Error shutting down cue handler:', err)
        }
      }

      if (this.effectsController) {
        try {
          await this.effectsController.shutdown()
          console.log('ControllerManager shutdown: effects controller stopped')
        } catch (err) {
          console.error('Error shutting down effects controller:', err)
        }
      }

      if (this.dmxPublisher) {
        try {
          await this.dmxPublisher.shutdown()
          console.log('ControllerManager shutdown: DMX publisher stopped')
        } catch (err) {
          console.error('Error shutting down DMX publisher:', err)
        }
      }

      try {
        await this.senderLifecycle.shutdownSenderOnAppExit()
        console.log('ControllerManager shutdown: sender manager stopped')
      } catch (err) {
        console.error('Error shutting down sender manager:', err)
      }

      this.isInitialized = false
      console.log('ControllerManager shutdown: completed')
    } catch (err) {
      console.error('Error during controller manager shutdown:', err)
      throw err
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
    return this.listenerCoordinator.getProcessorManager()
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
    return this.listenerCoordinator.getIsYargEnabled()
  }

  public getIsRb3Enabled(): boolean {
    return this.listenerCoordinator.getIsRb3Enabled()
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
    console.log('Refreshed active rigs for DMX output:', activeRigs.length, 'rig(s)')
  }

  /**
   * Restart controllers to pick up configuration changes
   * This shuts down existing controllers and reinitializes them
   */
  public async restartControllers(): Promise<void> {
    console.log('Restarting controllers to apply configuration changes')

    const wasYargEnabled = this.listenerCoordinator.getIsYargEnabled()
    const wasRb3Enabled = this.listenerCoordinator.getIsRb3Enabled()
    const activeSendersBeforeRestart = this.senderLifecycle.getActiveOutputSenderSnapshotIfAny()

    try {
      if (wasYargEnabled) {
        await this.disableYarg()
      }
      if (wasRb3Enabled) {
        await this.disableRb3()
      }

      // Then shutdown other components
      if (this.effectsController) {
        await this.effectsController.shutdown()
      }

      if (this.dmxPublisher) {
        await this.dmxPublisher.shutdown()
      }
      await this.senderLifecycle.resetSenderForControllerRestart()

      // Ensure cue handler lifecycle is handled
      if (this.cueHandler) {
        this.cueHandler.shutdown()
      }

      // Reset component references
      this.dmxLightManager = null
      this.lightStateManager = null
      this.lightTransitionController = null
      this.sequencer = null
      this.effectsController = null
      this.dmxPublisher = null
      this.cueHandler = null

      // Mark as not initialized
      this.isInitialized = false

      console.log('Controllers shutdown completed, reinitializing')
    } catch (error) {
      console.error('Error shutting down controllers:', error)
    }

    // Reinitialize
    try {
      await this.init()
      this.consoleMode.onControllersReinitializedWhileConsoleOpen()

      // Restore previously active listeners
      if (wasYargEnabled) {
        await this.enableYarg()
      } else if (wasRb3Enabled) {
        await this.enableRb3()
      }

      // Restore DMX output senders from persisted preferences so that output
      // continues without requiring a manual toggle after any config change.
      await this.senderLifecycle.restoreSenderOutputsFromPrefs(
        activeSendersBeforeRestart ?? undefined,
      )

      console.log('Controllers restarted successfully')
    } catch (error) {
      console.error('Error reinitializing controllers:', error)
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
    await this.audioController.enableAudio(this.isInitialized, () => this.init())
  }

  /**
   * Disable audio processing
   */
  public async disableAudio(): Promise<void> {
    await this.audioController.disableAudio()
  }

  /**
   * Update audio configuration while audio is running
   */
  public updateAudioConfig(config: AudioConfig): void {
    this.audioController.updateAudioConfig(config)
  }

  /**
   * Refresh active audio cue selection when enabled groups change
   */
  public refreshAudioCueSelection(): void {
    this.audioController.refreshAudioCueSelection()
  }

  /**
   * Get the current audio cue selection
   */
  public getActiveAudioCueType(): AudioCueType {
    return this.audioController.getActiveAudioCueType()
  }

  /**
   * Secondary cue driving the overlay slot (manual secondary or active strobe cue).
   */
  public getActiveSecondaryCueType(): AudioCueType | null {
    return this.audioController.getActiveSecondaryCueType()
  }

  /**
   * Persist and apply a new audio cue selection
   */
  public setActiveAudioCueType(cueType: AudioCueType): { success: boolean; error?: string } {
    return this.audioController.setActiveAudioCueType(cueType)
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
    return this.audioController.getAudioCueOptions()
  }

  /**
   * Get audio enabled state
   */
  public getIsAudioEnabled(): boolean {
    return this.audioController.getIsAudioEnabled()
  }

  public getAudioGameModeConfig(): AudioGameModeConfig {
    return this.audioController.getAudioGameModeConfig()
  }

  public async setAudioGameModeConfig(config: AudioGameModeConfig): Promise<void> {
    await this.audioController.setAudioGameModeConfig(config)
  }

  /**
   * Apply global motion master toggle to YARG and audio motion handlers.
   */
  public setMotionEnabledGlobal(enabled: boolean): void {
    if (this.cueHandler instanceof YargCueHandler) {
      this.cueHandler.setMotionEnabled(enabled)
    }
    this.audioController.setMotionEnabled(enabled)
  }

  public setActiveAudioMotionCueRef(ref: AudioMotionCueRef | null): void {
    this.audioController.setActiveAudioMotionCueRef(ref)
  }

  public isAudioGameModeActive(): boolean {
    return this.audioController.isAudioGameModeActive()
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
    this.audioController.setBroadcastAudioMirror(fn)
  }

  public async enableConsoleMode(
    rigId: string,
  ): Promise<{ success: true } | { success: false; error: string }> {
    return this.consoleMode.enableConsoleMode(rigId)
  }

  public async disableConsoleMode(): Promise<
    { success: true } | { success: false; error: string }
  > {
    return this.consoleMode.disableConsoleMode()
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
