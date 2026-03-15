import {
  ConfigurationManager,
  AppPreferences,
} from '../../services/configuration/ConfigurationManager'
import { DmxLightManager } from '../../photonics-dmx/controllers/DmxLightManager'
import { Sequencer } from '../../photonics-dmx/controllers/sequencer/Sequencer'
import { DmxPublisher } from '../../photonics-dmx/controllers/DmxPublisher'
import { SenderManager } from '../../photonics-dmx/controllers/SenderManager'
import { LightingConfiguration, ConfigStrobeType } from '../../photonics-dmx/types'
import { YargCueHandler } from '../../photonics-dmx/cueHandlers/YargCueHandler'
import { Rb3CueHandler } from '../../photonics-dmx/cueHandlers/Rb3CueHandler'
import { ProcessorManager } from '../../photonics-dmx/processors/ProcessorManager'
import { AudioConfig } from '../../photonics-dmx/listeners/Audio/AudioTypes'
import { Clock } from '../../photonics-dmx/controllers/sequencer/Clock'
import { app } from 'electron'
import { sendToAllWindows } from '../utils/windowUtils'
import { copyDefaultData } from '../utils/copyDefaultData'
import * as path from 'path'
import { EffectLoader, EffectListSummary } from '../../photonics-dmx/cues/node/loader/EffectLoader'

import { ILightingController } from '../../photonics-dmx/controllers/sequencer/interfaces'
import { SenderError, SenderId } from '../../photonics-dmx/senders/BaseSender'
import { LightStateManager } from '../../photonics-dmx/controllers/sequencer/LightStateManager'
import { createSenderErrorHandler } from './senderErrorHandler'
import {
  isSenderErrorHandled,
  markSenderErrorHandled,
  getLastErrorHandledTime,
  removeSenderErrorHandled,
} from '../senderErrorTracking'
import { TestEffectRunner } from './TestEffectRunner'
import { ListenerCoordinator } from './ListenerCoordinator'
import { AudioController } from './AudioController'
import { RENDERER_RECEIVE } from '../../shared/ipcChannels'
import { LightTransitionController } from '../../photonics-dmx/controllers/sequencer/LightTransitionController'
import { YargCueRegistry } from '../../photonics-dmx/cues/registries/YargCueRegistry'
import { AudioCueRegistry } from '../../photonics-dmx/cues/registries/AudioCueRegistry'
import { AudioCueType } from '../../photonics-dmx/cues/types/audioCueTypes'
import {
  NodeCueLoader,
  NodeCueListSummary,
} from '../../photonics-dmx/cues/node/loader/NodeCueLoader'
// Import all cue sets to register with registry
import '../../photonics-dmx/cues'

// Type for Node.js network errors (code, syscall, port, address) used in uncaught exception handling
interface NetworkErrorLike {
  code?: string
  syscall?: string
  port?: number
  address?: string
}

function isNetworkErrorLike(err: unknown): err is NetworkErrorLike {
  return err !== null && typeof err === 'object' && 'code' in err && 'syscall' in err
}

export class ControllerManager {
  private config: ConfigurationManager
  private dmxLightManager: DmxLightManager | null = null
  private lightStateManager: LightStateManager | null = null
  private lightTransitionController: LightTransitionController | null = null
  private sequencer: Sequencer | null = null
  private effectsController: ILightingController | null = null
  private dmxPublisher: DmxPublisher | null = null
  private senderManager: SenderManager | null = null
  private senderErrorTrackingCallback: ((senderId: string) => void) | null = null

  private cueHandler: YargCueHandler | Rb3CueHandler | null = null
  private nodeCueLoader: NodeCueLoader | null = null
  private effectLoader: EffectLoader | null = null

  private readonly testEffectRunner: TestEffectRunner
  private readonly senderErrorHandler: (error: SenderError) => void
  private readonly listenerCoordinator: ListenerCoordinator
  private readonly audioController: AudioController

  private isInitialized = false

  constructor() {
    this.config = new ConfigurationManager()
    this.senderManager = new SenderManager()
    this.senderErrorHandler = createSenderErrorHandler(
      () => this.getSenderManager(),
      sendToAllWindows,
    )
    this.senderManager.onSendError(this.senderErrorHandler)
    this.testEffectRunner = new TestEffectRunner({
      getConfig: () => ({
        getPreference: (key: string) =>
          key === 'effectDebounce' ? this.config.getPreference('effectDebounce') : 0,
      }),
      getCueHandler: () => (this.cueHandler instanceof YargCueHandler ? this.cueHandler : null),
      getEffectsController: () => this.effectsController,
      getDmxLightManager: () => this.dmxLightManager!,
      ensureInitialized: () => this.init(),
      createCueHandler: (dmx, eff) => new YargCueHandler(dmx, eff),
      setCueHandler: (h) => {
        this.cueHandler = h
      },
    })
    this.listenerCoordinator = new ListenerCoordinator({
      getDmxLightManager: () => this.dmxLightManager,
      getEffectsController: () => this.effectsController,
      getPreference: (key: string) => {
        const v = this.config.getPreference(key as keyof AppPreferences)
        return typeof v === 'number' ? v : 0
      },
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
  }

  /**
   * Ensure sender manager exists
   */
  private ensureSenderManager(): void {
    if (this.senderManager === null) {
      this.senderManager = new SenderManager()
      this.senderManager.onSendError(this.senderErrorHandler)
      if (this.senderErrorTrackingCallback) {
        this.senderManager.setOnSenderEnabled(this.senderErrorTrackingCallback)
      }
    }
  }

  /**
   * Initialize all controllers and systems
   */
  public async init(): Promise<void> {
    if (this.isInitialized) return

    this.ensureSenderManager()
    await this.initializeDmxManager()
    await this.initializeSequencer()
    await this.initializeCueRegistry()
    await this.initializeAudioCueRegistry()
    const baseDir = path.join(app.getPath('appData'), 'Photonics.rocks')
    await copyDefaultData(process.resourcesPath, baseDir)
    await this.initializeEffectLoader() // Initialize effects BEFORE node cues
    await this.initializeNodeCueLoader()
    this.applyYargEnabledGroupsFromConfig()
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
    const clockRate = this.config.getClockRate()

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
    this.dmxPublisher = new DmxPublisher(this.senderManager!, this.lightStateManager)

    // Load active rigs and set them up in the publisher
    const activeRigs = this.config.getActiveRigs()
    if (this.dmxPublisher && activeRigs.length > 0) {
      this.dmxPublisher.updateActiveRigs(activeRigs)
    }
  }

  /**
   * Initialize the CueRegistry with enabled groups from configuration
   */
  private async initializeCueRegistry(): Promise<void> {
    const registry = YargCueRegistry.getInstance()

    // Get enabled groups from configuration
    const enabledGroupIds = this.config.getEnabledCueGroups()
    if (enabledGroupIds) {
      registry.setEnabledGroups(enabledGroupIds)
      console.log('CueRegistry initialized with enabled groups:', enabledGroupIds)
    } else {
      // If no preference is set, enable all available groups
      const allGroups = registry.getAllGroups()
      registry.setEnabledGroups(allGroups)
      console.log('CueRegistry initialized with all groups (no preference set):', allGroups)
    }

    // Load cue consistency window from configuration
    const consistencyWindow = this.config.getCueConsistencyWindow()
    registry.setCueConsistencyWindow(consistencyWindow)
    console.log('CueRegistry initialized with consistency window:', consistencyWindow, 'ms')

    // Load cue group selection mode from configuration
    const selectionMode = this.config.getCueGroupSelectionMode()
    registry.setCueGroupSelectionMode(selectionMode)
    console.log('CueRegistry initialized with cue group selection mode:', selectionMode)
  }

  /**
   * Initialize the AudioCueRegistry with enabled groups from configuration
   */
  private async initializeAudioCueRegistry(): Promise<void> {
    const registry = AudioCueRegistry.getInstance()

    const enabledGroupIds = this.config.getEnabledAudioCueGroups()
    if (enabledGroupIds && enabledGroupIds.length > 0) {
      registry.setEnabledGroups(enabledGroupIds)
      console.log('AudioCueRegistry initialized with enabled groups:', enabledGroupIds)
    } else {
      const allGroups = registry.getRegisteredGroups()
      registry.setEnabledGroups(allGroups)
      if (allGroups.length > 0) {
        this.config.setEnabledAudioCueGroups(allGroups)
      }
      console.log('AudioCueRegistry initialized with all groups (no preference set):', allGroups)
    }
  }

  /**
   * Re-apply Yarg enabled groups from configuration after all groups are registered.
   * Node cue groups are registered in initializeNodeCueLoader(), and each registerGroup()
   * adds the group to enabled by default, which would overwrite a saved "disabled" preference.
   * Calling this after the node cue loader ensures the persisted preference wins.
   */
  private applyYargEnabledGroupsFromConfig(): void {
    const registry = YargCueRegistry.getInstance()
    const registeredIds = registry.getAllGroups()
    const enabledGroupIds = this.config.getEnabledCueGroups()

    if (enabledGroupIds !== undefined) {
      const restricted = enabledGroupIds.filter((id) => registeredIds.includes(id))
      registry.setEnabledGroups(restricted)
      console.log('CueRegistry enabled groups re-applied from config:', restricted)
    }
    // If no saved preference, leave registry as-is (all groups enabled from registerGroup);
    // GET_ENABLED_CUE_GROUPS will default to all and persist when the UI first reads.
  }

  private async initializeNodeCueLoader(): Promise<void> {
    if (this.nodeCueLoader) {
      return
    }

    // Ensure effect loader is initialized first
    await this.initializeEffectLoader()

    const baseDir = path.join(app.getPath('appData'), 'Photonics.rocks')
    this.nodeCueLoader = new NodeCueLoader({
      baseDir,
      yargRegistry: YargCueRegistry.getInstance(),
      audioRegistry: AudioCueRegistry.getInstance(),
      effectLoader: this.effectLoader ?? undefined,
    })

    const summary = await this.nodeCueLoader.loadAll()
    console.log(`[NodeCueLoader] Loaded ${summary.loaded} files with ${summary.failed} failures.`)
    if (summary.failed > 0 && summary.errors.length > 0) {
      summary.errors.forEach((err) => console.error('[NodeCueLoader]', err))
    }
    await this.nodeCueLoader.startWatching()

    this.nodeCueLoader.on('changed', (payload: NodeCueListSummary) => {
      sendToAllWindows(RENDERER_RECEIVE.NODE_CUES_CHANGED, payload)
    })
  }

  private async initializeEffectLoader(): Promise<void> {
    if (this.effectLoader) {
      return
    }

    const baseDir = path.join(app.getPath('appData'), 'Photonics.rocks')
    this.effectLoader = new EffectLoader({ baseDir })

    const summary = await this.effectLoader.loadAll()
    console.log(`[EffectLoader] Loaded ${summary.loaded} files with ${summary.failed} failures.`)
    await this.effectLoader.startWatching()

    this.effectLoader.on('changed', async (payload: EffectListSummary) => {
      sendToAllWindows(RENDERER_RECEIVE.EFFECTS_CHANGED, payload)
      if (this.nodeCueLoader) {
        try {
          await this.nodeCueLoader.reload()
        } catch (error) {
          console.error('Failed to reload node cues after effect change:', error)
        }
      }
    })
  }

  /**
   * Initialize network listeners
   */
  private async initializeListeners(): Promise<void> {
    if (!this.dmxLightManager || !this.effectsController) return

    // Create cue handler (default to YARG)
    this.cueHandler = new YargCueHandler(this.dmxLightManager, this.effectsController)
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
   * Switch RB3 processing mode between direct and cue-based
   */
  public async switchRb3Mode(mode: 'direct' | 'cueBased'): Promise<void> {
    await this.listenerCoordinator.switchRb3Mode(mode)
  }

  /**
   * Get current RB3 processing mode
   */
  public getRb3Mode(): 'direct' | 'cueBased' | 'none' {
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

      if (this.senderManager) {
        try {
          await this.senderManager.shutdown()
          console.log('ControllerManager shutdown: sender manager stopped')
        } catch (err) {
          console.error('Error shutting down sender manager:', err)
        }
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
    this.ensureSenderManager()
    return this.senderManager!
  }

  /**
   * Handles uncaught exceptions that are network sender errors.
   * Resolves senderId, performs emergency removal if needed, and delegates to the same
   * senderErrorHandler used for normal sender errors so all error handling is unified.
   * @returns true if the error was handled as a network sender error, false otherwise
   */
  public handleUncaughtException(error: unknown): boolean {
    const isNetworkError =
      isNetworkErrorLike(error) &&
      (error.code === 'EHOSTUNREACH' ||
        error.code === 'EHOSTDOWN' ||
        error.code === 'ENETUNREACH' ||
        error.code === 'ETIMEDOUT') &&
      error.syscall === 'send'

    if (!isNetworkError || !this.senderManager || !this.getIsInitialized()) {
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
        console.error(`Network sender error (${senderId}):`, error)
        sender.stop().catch((stopErr: unknown) => {
          console.error(`Error stopping ${senderId} sender after network error:`, stopErr)
        })
        this.senderErrorHandler(senderError)
      } else {
        console.error(`Network sender error (${senderId}):`, error)
        this.senderManager.markInitFailed(senderId)
        this.senderManager.emitSenderError(senderError)
      }
      return true
    } catch (err) {
      console.error(`Error handling ${senderId} uncaught exception:`, err)
      removeSenderErrorHandled(senderId)
      return false
    }
  }

  /**
   * Set a callback for clearing sender error tracking when a sender is successfully enabled.
   * This is used to allow senders to be re-enabled after network errors.
   * @param callback Function to call with the sender ID when error tracking should be cleared
   */
  public setSenderErrorTrackingCallback(callback: (senderId: string) => void): void {
    this.senderErrorTrackingCallback = callback
    this.ensureSenderManager()
    this.senderManager!.setOnSenderEnabled(callback)
  }

  public getCueHandler(): YargCueHandler | Rb3CueHandler | null {
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
    this.ensureSenderManager()
    return {
      sacn: this.senderManager!.isSenderEnabled('sacn'),
      artnet: this.senderManager!.isSenderEnabled('artnet'),
      enttecpro: this.senderManager!.isSenderEnabled('enttecpro'),
      ipc: this.senderManager!.isSenderEnabled('ipc'),
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
      this.senderManager = null

      // Mark as not initialized
      this.isInitialized = false

      console.log('Controllers shutdown completed, reinitializing')
    } catch (error) {
      console.error('Error shutting down controllers:', error)
    }

    // Reinitialize
    try {
      await this.init()

      // Restore previously active listeners
      if (wasYargEnabled) {
        await this.enableYarg()
      } else if (wasRb3Enabled) {
        await this.enableRb3()
      }

      console.log('Controllers restarted successfully')
    } catch (error) {
      console.error('Error reinitializing controllers:', error)
      throw error
    }
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
}
