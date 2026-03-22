import { AudioLightingData, AudioConfig } from '../listeners/Audio/AudioTypes'

import { AudioCueHandler } from '../cueHandlers/AudioCueHandler'
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
    void this.cueHandler
      .handleAudioData(
        processedData,
        this.config,
        this.currentPrimaryCueType,
        this.currentSecondaryCueType,
        this.config.bands.length,
      )
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
    this.stop()
    this.cueHandler.destroy()
    console.log('AudioCueProcessor: Shutdown complete')
  }

  /**
   * Re-evaluate which cue type should be active based on enabled audio cue groups
   */
  public refreshCueSelection(): void {
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
      this.cueHandler.syncSlots(this.currentPrimaryCueType, this.currentSecondaryCueType)
      console.log(`AudioCueProcessor: Active primary cue set to ${cueType}`)
    }
    return true
  }

  /**
   * Optional overlay or strobe; null clears the secondary and strobe slots.
   */
  public setActiveSecondaryCueType(cueType: AudioCueType | null): boolean {
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
    return this.currentPrimaryCueType
  }

  public getSecondaryCueType(): AudioCueType | null {
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
