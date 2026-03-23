import { AudioLightingData, AudioConfig, AudioGameModeConfig } from '../listeners/Audio/AudioTypes'

import { AudioCueHandler } from '../cueHandlers/AudioCueHandler'
import { AudioGameModeManager } from './AudioGameModeManager'
import { DmxLightManager } from '../controllers/DmxLightManager'
import { ILightingController } from '../controllers/sequencer/interfaces'
import { AudioCueType } from '../cues/types/audioCueTypes'
import { AudioCueRegistry } from '../cues/registries/AudioCueRegistry'
import { getIntensityScale } from '../cues/audio/utils/bandUtils'

/**
 * AudioCueProcessor - Processes audio data using cue-based system
 *
 * This processor receives audio analysis data from the renderer process (via IPC)
 * and delegates to the AudioCueHandler to execute the active audio cue.
 */
export class AudioCueProcessor {
  private config: AudioConfig
  private isActive = false
  private cueHandler: AudioCueHandler
  private currentPrimaryCueType: AudioCueType
  private currentSecondaryCueType: AudioCueType | null
  private registry: AudioCueRegistry
  private gameModeManager: AudioGameModeManager | null = null

  constructor(
    lightManager: DmxLightManager,
    private sequencer: ILightingController,
    audioConfig: AudioConfig,
    preferredCueType?: AudioCueType,
    preferredSecondaryCueType?: AudioCueType | null,
  ) {
    this.config = audioConfig
    this.registry = AudioCueRegistry.getInstance()
    this.currentPrimaryCueType = this.selectActiveCueType(preferredCueType)
    this.currentSecondaryCueType = preferredSecondaryCueType ?? null
    this.cueHandler = new AudioCueHandler(lightManager, sequencer)
    this.cueHandler.syncSlots(this.currentPrimaryCueType, this.currentSecondaryCueType)
  }

  /**
   * Start processing audio data
   */
  public start(): void {
    if (this.isActive) {
      console.warn('AudioCueProcessor: Already active')
      return
    }
    this.isActive = true
    console.log(
      'AudioCueProcessor: Started with primary:',
      this.currentPrimaryCueType,
      'secondary:',
      this.currentSecondaryCueType,
    )
  }

  /**
   * Stop processing audio data
   */
  public stop(): void {
    if (!this.isActive) return

    this.isActive = false
    this.cueHandler.stop()

    // Clear all audio-related effects
    // Remove effects from layers 0-7 (frequency band layers)
    for (let layer = 0; layer < 8; layer++) {
      this.sequencer.removeEffectByLayer(layer, true)
    }

    console.log('AudioCueProcessor: Stopped')
  }

  /**
   * Update configuration
   */
  public updateConfig(config: AudioConfig): void {
    this.config = config
    console.log('AudioCueProcessor: Configuration updated')
  }

  /**
   * Process audio data received from renderer via IPC
   * This is called by ControllerManager when it receives audio:data from renderer
   */
  private lastBeatTimestamp = 0

  public processAudioData(data: AudioLightingData): void {
    if (!this.isActive) return

    const now = Date.now()
    if (data.beatDetected && now - this.lastBeatTimestamp >= 100) {
      this.lastBeatTimestamp = now
      this.sequencer.onBeat()
    }

    const processedData =
      this.config.linearResponse === false ? this.applyDiscreteResponse(data) : data

    if (this.gameModeManager) {
      this.gameModeManager.processFrame(processedData)
    }

    const primary = this.gameModeManager
      ? this.gameModeManager.getActivePrimaryCue()
      : this.currentPrimaryCueType
    const secondary = this.gameModeManager
      ? this.gameModeManager.getActiveSecondaryCue()
      : this.currentSecondaryCueType

    void this.cueHandler
      .handleAudioData(processedData, this.config, primary, secondary, this.config.bands.length)
      .catch((err) => console.error('AudioCueProcessor: handleAudioData error', err))
  }

  /**
   * Check if processor is active
   */
  public isProcessing(): boolean {
    return this.isActive
  }

  /**
   * Shutdown and cleanup
   */
  public shutdown(): void {
    this.disableGameMode()
    this.stop()
    this.cueHandler.destroy()
    console.log('AudioCueProcessor: Shutdown complete')
  }

  /**
   * Enables Game Mode: automatic cue cycling and optional strobes (managed by AudioGameModeManager).
   */
  public enableGameMode(config: AudioGameModeConfig): void {
    this.disableGameMode()
    this.gameModeManager = new AudioGameModeManager(config)
    this.gameModeManager.start()
    this.cueHandler.syncSlots(
      this.gameModeManager.getActivePrimaryCue(),
      this.gameModeManager.getActiveSecondaryCue(),
    )
    console.log('AudioCueProcessor: Game Mode enabled')
  }

  /**
   * Disables Game Mode and restores manual primary/secondary cue slots.
   */
  public disableGameMode(): void {
    if (!this.gameModeManager) {
      return
    }
    this.gameModeManager.stop()
    this.gameModeManager = null
    this.cueHandler.syncSlots(this.currentPrimaryCueType, this.currentSecondaryCueType)
    console.log('AudioCueProcessor: Game Mode disabled')
  }

  public updateGameModeConfig(config: AudioGameModeConfig): void {
    this.gameModeManager?.updateConfig(config)
  }

  public isGameModeEnabled(): boolean {
    return this.gameModeManager != null
  }

  /**
   * Manual primary cue (preferences / manual mode); not the running Game Mode cue.
   */
  public getManualPrimaryCueType(): AudioCueType {
    return this.currentPrimaryCueType
  }

  /**
   * Re-evaluate which cue type should be active based on enabled audio cue groups
   */
  public refreshCueSelection(): void {
    if (this.gameModeManager) {
      this.gameModeManager.start()
      this.cueHandler.syncSlots(
        this.gameModeManager.getActivePrimaryCue(),
        this.gameModeManager.getActiveSecondaryCue(),
      )
      return
    }

    const selected = this.selectActiveCueType(this.currentPrimaryCueType)
    if (selected !== this.currentPrimaryCueType) {
      console.log(
        `AudioCueProcessor: Switching primary cue from ${this.currentPrimaryCueType} to ${selected}`,
      )
      this.currentPrimaryCueType = selected
    }
    if (
      this.currentSecondaryCueType &&
      !this.registry.getCueImplementation(this.currentSecondaryCueType)
    ) {
      console.log(
        `AudioCueProcessor: Clearing unavailable secondary ${this.currentSecondaryCueType}`,
      )
      this.currentSecondaryCueType = null
    }
    this.cueHandler.syncSlots(this.currentPrimaryCueType, this.currentSecondaryCueType)
  }

  /**
   * Force the primary cue type when it is available
   */
  public setActiveCueType(cueType: AudioCueType): boolean {
    const cue = this.registry.getCueImplementation(cueType)
    if (!cue) {
      console.warn(`AudioCueProcessor: Requested cue ${cueType} is not available in enabled groups`)
      return false
    }

    if (this.currentPrimaryCueType !== cueType) {
      this.currentPrimaryCueType = cueType
      if (!this.gameModeManager) {
        this.cueHandler.syncSlots(this.currentPrimaryCueType, this.currentSecondaryCueType)
        console.log(`AudioCueProcessor: Active primary cue set to ${cueType}`)
      }
    }
    return true
  }

  /**
   * Optional overlay or strobe; null clears the secondary and strobe slots.
   */
  public setActiveSecondaryCueType(cueType: AudioCueType | null): boolean {
    if (this.gameModeManager) {
      this.currentSecondaryCueType = cueType
      return true
    }
    if (cueType == null || cueType === '') {
      if (this.currentSecondaryCueType != null) {
        this.currentSecondaryCueType = null
        this.cueHandler.syncSlots(this.currentPrimaryCueType, null)
      }
      return true
    }
    const cue = this.registry.getCueImplementation(cueType)
    if (!cue) {
      console.warn(
        `AudioCueProcessor: Requested secondary cue ${cueType} is not available in enabled groups`,
      )
      return false
    }
    if (this.currentSecondaryCueType !== cueType) {
      this.currentSecondaryCueType = cueType
      this.cueHandler.syncSlots(this.currentPrimaryCueType, this.currentSecondaryCueType)
      console.log(`AudioCueProcessor: Active secondary cue set to ${cueType}`)
    }
    return true
  }

  /**
   * Primary cue type being executed (base look)
   */
  public getCurrentCueType(): AudioCueType {
    if (this.gameModeManager) {
      return this.gameModeManager.getActivePrimaryCue()
    }
    return this.currentPrimaryCueType
  }

  public getSecondaryCueType(): AudioCueType | null {
    if (this.gameModeManager) {
      return this.gameModeManager.getActiveSecondaryCue()
    }
    return this.currentSecondaryCueType
  }

  /**
   * Determine which cue type should be used
   */
  private selectActiveCueType(preferredCueType?: AudioCueType): AudioCueType {
    if (preferredCueType) {
      const preferred = this.registry.getCueImplementation(preferredCueType)
      if (preferred) {
        return preferredCueType
      }
    }

    const availableCueTypes = this.registry.getAvailableCueTypes()
    if (availableCueTypes.length > 0) {
      return availableCueTypes[0]
    }

    // Fallback to first cue from any registered group
    const allCueTypes = this.registry.getAvailableCueTypes(true)
    if (allCueTypes.length > 0) {
      return allCueTypes[0]
    }

    return ''
  }

  private applyDiscreteResponse(audioData: AudioLightingData): AudioLightingData {
    const mapValue = (value: number) => getIntensityScale(value, false)
    return {
      ...audioData,
      overallLevel: mapValue(audioData.overallLevel),
      energy: mapValue(audioData.energy),
    }
  }
}
