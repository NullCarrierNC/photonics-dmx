import { EventEmitter } from 'events'
import { AudioLightingData, AudioConfig } from '../listeners/Audio/AudioTypes'
import { AudioCueData, AudioCueType, AudioMotionCueRef } from '../cues/types/audioCueTypes'
import { IAudioCue } from '../cues/interfaces/IAudioCue'
import { AudioCueRegistry } from '../cues/registries/AudioCueRegistry'
import { ILightingController } from '../controllers/sequencer/interfaces'
import { DmxLightManager } from '../controllers/DmxLightManager'
import { RENDERER_RECEIVE } from '../../shared/ipcChannels'
import { sendToAllWindows } from '../../main/utils/windowUtils'

export type AudioCueHandlerOptions = {
  getMotionCueMinimumHoldMs?: () => number
  /** Probability (0-100) that an automatic motion cue pick will play on a primary cue change. Defaults to 100 (always). */
  getMotionCueProbabilityPercent?: () => number
}

/**
 * Handler for audio-reactive lighting cues.
 * Primary slot: base look; optional secondary slot: overlays; optional strobe slot: energy-triggered strobes.
 * All three can run concurrently; layers combine in the sequencer.
 */
export class AudioCueHandler extends EventEmitter {
  private registry: AudioCueRegistry
  private currentPrimaryCue: IAudioCue | null = null
  private currentSecondaryCue: IAudioCue | null = null
  private currentStrobeCue: IAudioCue | null = null
  /** Parallel motion layer; refreshed when the primary lighting cue changes. */
  private currentMotionCue: IAudioCue | null = null
  private currentMotionCueStartTime: number | null = null
  private lastPrimaryForMotion: IAudioCue | null = null
  private lastManualMotionRef: AudioMotionCueRef | null | undefined = undefined
  private manualMotionRef: AudioMotionCueRef | null = null
  private lastEmittedMotionKey: string | null = null
  private motionEnabled = true
  private executionCount = 0
  private readonly getMotionCueMinimumHoldMs: () => number
  private readonly getMotionCueProbabilityPercent: () => number

  constructor(
    private lightManager: DmxLightManager,
    private sequencer: ILightingController,
    options?: AudioCueHandlerOptions,
  ) {
    super()
    this.registry = AudioCueRegistry.getInstance()
    this.getMotionCueMinimumHoldMs = options?.getMotionCueMinimumHoldMs ?? (() => 5000)
    this.getMotionCueProbabilityPercent = options?.getMotionCueProbabilityPercent ?? (() => 100)
  }

  public isMotionLayerEnabled(): boolean {
    return this.motionEnabled
  }

  /** Clears motion min-hold timing so the next primary change can re-pick motion immediately. */
  public resetMotionTracking(): void {
    this.currentMotionCueStartTime = null
    this.lastPrimaryForMotion = null
    this.lastManualMotionRef = undefined
  }

  public setMotionEnabled(enabled: boolean): void {
    if (this.motionEnabled === enabled) {
      return
    }
    this.motionEnabled = enabled
    if (!enabled) {
      this.currentMotionCue?.onStop?.()
      this.currentMotionCue = null
      this.currentMotionCueStartTime = null
      this.lastPrimaryForMotion = null
      this.lastManualMotionRef = undefined
      this.emitAudioMotionCueChange(null, 'cleared')
    } else {
      this.lastPrimaryForMotion = null
      this.lastManualMotionRef = undefined
      this.currentMotionCueStartTime = null
    }
  }

  public setManualMotionRef(ref: AudioMotionCueRef | null): void {
    this.manualMotionRef = ref
    this.lastManualMotionRef = undefined
  }

  /**
   * Handle audio data by executing active primary, optional secondary overlay, and optional strobe cues.
   * @param primaryCueType Main cue (wash / rotation); empty string clears primary slot
   * @param secondaryCueType Optional overlay; null clears secondary slot
   * @param strobeCueType Optional strobe overlay; null clears strobe slot
   */
  public async handleAudioData(
    audioData: AudioLightingData,
    config: AudioConfig,
    primaryCueType: AudioCueType,
    secondaryCueType: AudioCueType | null,
    strobeCueType: AudioCueType | null,
    enabledBandCount: number,
    gameModeActive: boolean,
  ): Promise<void> {
    this.assignPrimarySlot(primaryCueType)
    this.assignSecondarySlot(secondaryCueType)
    this.assignStrobeSlot(strobeCueType)

    this.syncMotionWithPrimary(gameModeActive)

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
    await run(this.currentStrobeCue)
    await run(this.currentMotionCue)
  }

  private emitAudioMotionCueChange(
    ref: AudioMotionCueRef | null,
    source: 'manual' | 'auto' | 'cleared',
    manualFallback?: boolean,
  ): void {
    const key = ref ? `${ref.groupId}:${ref.cueId}` : 'null'
    if (key === this.lastEmittedMotionKey && source !== 'cleared' && manualFallback !== true) {
      return
    }
    this.lastEmittedMotionKey = key
    sendToAllWindows(RENDERER_RECEIVE.AUDIO_MOTION_CUE_CHANGE, {
      ref,
      source,
      manualFallback: manualFallback === true,
    })
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
  public syncSlots(
    primaryCueType: AudioCueType,
    secondaryCueType: AudioCueType | null,
    strobeCueType: AudioCueType | null = null,
    gameModeActive = false,
  ): void {
    this.assignPrimarySlot(primaryCueType)
    this.assignSecondarySlot(secondaryCueType)
    this.assignStrobeSlot(strobeCueType)
    this.syncMotionWithPrimary(gameModeActive)
  }

  private syncMotionWithPrimary(gameModeActive: boolean): void {
    if (!this.motionEnabled) {
      if (this.currentMotionCue) {
        this.currentMotionCue.onStop?.()
        this.currentMotionCue = null
        this.currentMotionCueStartTime = null
        this.emitAudioMotionCueChange(null, 'cleared')
      }
      return
    }

    const primaryChanged = this.currentPrimaryCue !== this.lastPrimaryForMotion
    const manualChanged = this.manualMotionRef !== this.lastManualMotionRef
    if (!primaryChanged && !manualChanged) {
      return
    }

    const bypassMinHold = manualChanged || gameModeActive
    if (primaryChanged && !bypassMinHold) {
      const minHold = this.getMotionCueMinimumHoldMs()
      const now = Date.now()
      const heldLongEnough =
        this.currentMotionCueStartTime == null || now - this.currentMotionCueStartTime >= minHold
      if (!heldLongEnough) {
        return
      }
    }

    this.lastPrimaryForMotion = this.currentPrimaryCue
    this.lastManualMotionRef = this.manualMotionRef

    if (!this.currentPrimaryCue) {
      if (this.currentMotionCue) {
        this.currentMotionCue.onStop?.()
        this.currentMotionCue = null
        this.currentMotionCueStartTime = null
        this.emitAudioMotionCueChange(null, 'cleared')
      }
      return
    }

    let motionCue: IAudioCue | null = null
    let source: 'manual' | 'auto' = 'auto'
    let manualFallback = false

    const usingManualRef = this.manualMotionRef != null && !gameModeActive
    if (!usingManualRef) {
      const probability = this.getMotionCueProbabilityPercent()
      if (probability < 100 && Math.random() * 100 >= probability) {
        if (this.currentMotionCue) {
          this.currentMotionCue.onStop?.()
          this.currentMotionCue = null
          this.currentMotionCueStartTime = null
          this.sequencer.schedulePanTiltClear()
          this.emitAudioMotionCueChange(null, 'cleared')
        }
        return
      }
    }

    if (usingManualRef) {
      motionCue = this.registry.getMotionCueImplementation(this.manualMotionRef!)
      if (motionCue) {
        source = 'manual'
      } else {
        manualFallback = true
        motionCue = this.registry.getRandomMotionCue()
        source = 'auto'
        sendToAllWindows(RENDERER_RECEIVE.DEBUG_LOG, {
          message:
            'Selected audio motion cue is unavailable (disabled or unknown); using a random motion program.',
          variables: [],
          timestamp: Date.now(),
        })
      }
    } else {
      motionCue = this.registry.getRandomMotionCue()
      source = 'auto'
    }

    const nowMs = Date.now()
    if (motionCue && this.currentMotionCue !== motionCue) {
      const prev = this.currentMotionCue
      this.currentMotionCue?.onStop?.()
      this.currentMotionCue = motionCue
      if (prev !== motionCue) {
        this.currentMotionCueStartTime = nowMs
      }
      const ref = this.registry.findAudioMotionCueRef(motionCue)
      if (ref) {
        this.emitAudioMotionCueChange(ref, source, manualFallback)
      }
    } else if (!motionCue) {
      if (this.currentMotionCue) {
        this.currentMotionCue.onStop?.()
        this.currentMotionCue = null
        this.currentMotionCueStartTime = null
        this.emitAudioMotionCueChange(null, 'cleared')
      }
    }
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

  private assignStrobeSlot(cueType: AudioCueType | null): void {
    if (cueType == null || cueType === '') {
      if (this.currentStrobeCue) {
        this.currentStrobeCue.onStop?.()
        this.currentStrobeCue = null
      }
      return
    }

    const cue = this.registry.getCueImplementation(cueType)
    if (!cue) {
      console.warn(`Audio cue not found: ${cueType}`)
      return
    }

    if (this.currentStrobeCue !== cue) {
      this.currentStrobeCue?.onStop?.()
      this.currentStrobeCue = cue
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
    this.currentStrobeCue?.onStop?.()
    this.currentStrobeCue = null
    this.currentMotionCue?.onStop?.()
    this.currentMotionCue = null
    this.currentMotionCueStartTime = null
    this.lastPrimaryForMotion = null
    this.lastManualMotionRef = undefined
    this.executionCount = 0
    this.lastEmittedMotionKey = null
  }

  /**
   * Cleanup
   */
  public destroy(): void {
    this.clearCurrentCue()
  }
}
