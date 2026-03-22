import { EventEmitter } from 'events'
import { AudioLightingData, AudioConfig } from '../listeners/Audio/AudioTypes'
import { AudioCueData, AudioCueType } from '../cues/types/audioCueTypes'
import { IAudioCue } from '../cues/interfaces/IAudioCue'
import { AudioCueRegistry } from '../cues/registries/AudioCueRegistry'
import { ILightingController } from '../controllers/sequencer/interfaces'
import { DmxLightManager } from '../controllers/DmxLightManager'

/**
 * Handler for audio-reactive lighting cues.
 * Primary slot: base look; optional secondary slot: overlays (e.g. strobes) layered via effect parameters such as layer.
 */
export class AudioCueHandler extends EventEmitter {
  private registry: AudioCueRegistry
  private currentPrimaryCue: IAudioCue | null = null
  private currentSecondaryCue: IAudioCue | null = null
  private executionCount = 0

  constructor(
    private lightManager: DmxLightManager,
    private sequencer: ILightingController,
  ) {
    super()
    this.registry = AudioCueRegistry.getInstance()
  }

  /**
   * Handle audio data by executing active primary and optional secondary overlay cues.
   * @param primaryCueType Main cue (wash / rotation); empty string clears primary slot
   * @param secondaryCueType Optional overlay; null clears secondary slot
   */
  public async handleAudioData(
    audioData: AudioLightingData,
    config: AudioConfig,
    primaryCueType: AudioCueType,
    secondaryCueType: AudioCueType | null,
    enabledBandCount: number,
  ): Promise<void> {
    this.assignPrimarySlot(primaryCueType)
    this.assignSecondarySlot(secondaryCueType)

    this.executionCount++

    const cueData: AudioCueData = {
      audioData,
      config,
      enabledBandCount,
      timestamp: Date.now(),
      executionCount: this.executionCount,
    }

    const ran = new Set<IAudioCue>()
    const run = async (cue: IAudioCue | null): Promise<void> => {
      if (!cue || ran.has(cue)) return
      ran.add(cue)
      await cue.execute(cueData, this.sequencer, this.lightManager)
    }
    await run(this.currentPrimaryCue)
    await run(this.currentSecondaryCue)
  }

  private assignPrimarySlot(cueType: AudioCueType): void {
    if (!cueType) {
      if (this.currentPrimaryCue) {
        this.currentPrimaryCue.onStop?.()
        this.currentPrimaryCue = null
      }
      return
    }

    const cue = this.registry.getCueImplementation(cueType)
    if (!cue) {
      console.warn(`Audio cue not found: ${cueType}`)
      if (this.currentPrimaryCue) {
        this.currentPrimaryCue.onStop?.()
        this.currentPrimaryCue = null
      }
      return
    }

    if (this.currentPrimaryCue !== cue) {
      this.currentPrimaryCue?.onStop?.()
      this.currentPrimaryCue = cue
    }
  }

  /**
   * Apply slot assignments immediately (e.g. after config changes) without waiting for the next audio frame.
   */
  public syncSlots(primaryCueType: AudioCueType, secondaryCueType: AudioCueType | null): void {
    this.assignPrimarySlot(primaryCueType)
    this.assignSecondarySlot(secondaryCueType)
  }

  private assignSecondarySlot(cueType: AudioCueType | null): void {
    if (cueType == null || cueType === '') {
      if (this.currentSecondaryCue) {
        this.currentSecondaryCue.onStop?.()
        this.currentSecondaryCue = null
      }
      return
    }

    const cue = this.registry.getCueImplementation(cueType)
    if (!cue) {
      console.warn(`Audio cue not found: ${cueType}`)
      return
    }

    if (this.currentSecondaryCue !== cue) {
      this.currentSecondaryCue?.onStop?.()
      this.currentSecondaryCue = cue
    }
  }

  /**
   * Stop all active cues
   */
  public stop(): void {
    this.clearCurrentCue()
  }

  public clearCurrentCue(): void {
    this.currentPrimaryCue?.onStop?.()
    this.currentPrimaryCue = null
    this.currentSecondaryCue?.onStop?.()
    this.currentSecondaryCue = null
    this.executionCount = 0
  }

  /**
   * Cleanup
   */
  public destroy(): void {
    this.currentPrimaryCue?.onDestroy?.()
    this.currentPrimaryCue = null
    this.currentSecondaryCue?.onDestroy?.()
    this.currentSecondaryCue = null
    this.executionCount = 0
  }
}
