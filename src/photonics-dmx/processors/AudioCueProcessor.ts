import {
  AudioLightingData,
  AudioConfig,
  AudioGameModeConfig,
  AudioGameModeSchedulePayload,
} from '../listeners/Audio/AudioTypes'
import { DEFAULT_AUDIO_CONFIG, DEFAULT_AUDIO_IDLE_DETECTION } from '../listeners/Audio'

import { AudioCueHandler } from '../cueHandlers/AudioCueHandler'
import { pickStrobeCueType } from './audioStrobeHelpers'
import { AudioGameModeManager } from './AudioGameModeManager'
import { AudioIdleController } from './AudioIdleController'
import { AUDIO_IDLE_EFFECT_NAME, AUDIO_IDLE_LAYER } from './audioIdleConstants'
import { DmxLightManager } from '../controllers/DmxLightManager'
import { ILightingController } from '../controllers/sequencer/interfaces'
import { AudioCueType, AudioMotionCueRef } from '../cues/types/audioCueTypes'
import { AudioCueRegistry } from '../cues/registries/AudioCueRegistry'
import { getIntensityScale } from '../cues/audio/utils/bandUtils'
import { getColor } from '../helpers/dmxHelpers'
import { getEffectSingleColor } from '../effects/effectSingleColor'
import { createLogger } from '../../shared/logger'
import type { RuntimeBroadcaster } from '../runtime/broadcaster'
const log = createLogger('AudioCueProcessor')

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
  private strobeActive = false
  private strobeCueType: AudioCueType | null = null
  private onStrobeStateChange: ((active: boolean) => void) | null = null
  private onGameModeCueChange: ((cueType: AudioCueType) => void) | null = null
  private onGameModeScheduleChange: ((info: AudioGameModeSchedulePayload) => void) | null = null
  private readonly lightManager: DmxLightManager
  private readonly idleController = new AudioIdleController()
  private idleLookActive = false
  private idleSuppressedMotion = false

  constructor(
    lightManager: DmxLightManager,
    private sequencer: ILightingController,
    runtimeBroadcaster: RuntimeBroadcaster,
    audioConfig: AudioConfig,
    preferredCueType?: AudioCueType,
    preferredSecondaryCueType?: AudioCueType | null,
    getMotionCueMinimumHoldMs?: () => number,
    getMotionCueProbabilityPercent?: () => number,
  ) {
    this.lightManager = lightManager
    this.config = this.mergeAudioConfig(audioConfig)
    this.registry = AudioCueRegistry.getInstance()
    this.currentPrimaryCueType = this.selectActiveCueType(preferredCueType)
    this.currentSecondaryCueType = preferredSecondaryCueType ?? null
    this.cueHandler = new AudioCueHandler(lightManager, sequencer, {
      getMotionCueMinimumHoldMs,
      getMotionCueProbabilityPercent,
      runtimeBroadcaster,
    })
    this.cueHandler.syncSlots(this.currentPrimaryCueType, this.currentSecondaryCueType, null, false)
  }

  private mergeAudioConfig(patch: AudioConfig): AudioConfig {
    return {
      ...DEFAULT_AUDIO_CONFIG,
      ...patch,
      idleDetection: {
        ...DEFAULT_AUDIO_IDLE_DETECTION,
        ...patch.idleDetection,
      },
    }
  }

  public setMotionEnabled(enabled: boolean): void {
    this.cueHandler.setMotionEnabled(enabled)
  }

  public setManualMotionRef(ref: AudioMotionCueRef | null): void {
    this.cueHandler.setManualMotionRef(ref)
  }

  /**
   * Start processing audio data
   */
  public start(): void {
    if (this.isActive) {
      log.warn('AudioCueProcessor: Already active')
      return
    }
    this.isActive = true
    this.registry.onMotionSongStart()
    log.info(
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

    this.tearDownIdleState()
    this.isActive = false
    if (this.strobeActive) {
      this.strobeActive = false
      this.strobeCueType = null
      this.onStrobeStateChange?.(false)
    } else {
      this.strobeCueType = null
    }
    this.cueHandler.stop()
    this.registry.onMotionSongEnd()

    // Clear all audio-related effects
    // Remove effects from layers 0-7 (frequency band layers)
    for (let layer = 0; layer < 8; layer++) {
      this.sequencer.removeEffectByLayer(layer, true)
    }

    log.info('AudioCueProcessor: Stopped')
  }

  /**
   * Update configuration
   */
  public updateConfig(config: AudioConfig): void {
    this.config = this.mergeAudioConfig(config)
    log.info('AudioCueProcessor: Configuration updated')
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

    const gameModeActive = this.gameModeManager != null
    const idleTransition = this.idleController.update({
      overallLevel: processedData.overallLevel,
      gameModeActive,
      nowMs: now,
      config: this.config.idleDetection,
    })
    if (idleTransition === 'enter') {
      this.applyIdleLook()
    }
    if (idleTransition === 'exit') {
      this.clearIdleLook()
    }

    if (this.idleController.getState() === 'idle') {
      return
    }

    if (this.gameModeManager) {
      this.gameModeManager.processFrame(processedData)
    }

    const primary = this.gameModeManager
      ? this.gameModeManager.getActivePrimaryCue()
      : this.currentPrimaryCueType
    const baseSecondary = this.gameModeManager ? null : this.currentSecondaryCueType

    this.evaluateStrobe(processedData)
    const strobe = this.strobeActive && this.strobeCueType ? this.strobeCueType : null

    void this.cueHandler
      .handleAudioData(
        processedData,
        this.config,
        primary,
        baseSecondary,
        strobe,
        this.config.bands.length,
        gameModeActive,
      )
      .catch((err) => log.error('AudioCueProcessor: handleAudioData error', err))
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
    log.info('AudioCueProcessor: Shutdown complete')
  }

  /**
   * Enables Game Mode: automatic primary cue cycling (managed by AudioGameModeManager).
   */
  public enableGameMode(config: AudioGameModeConfig): void {
    this.disableGameMode()
    this.idleController.reset()
    this.gameModeManager = new AudioGameModeManager(config)
    this.gameModeManager.setOnCueSwitch((cueType) => {
      this.onGameModeCueChange?.(cueType)
    })
    this.gameModeManager.setOnScheduleChange((info) => {
      this.onGameModeScheduleChange?.(info)
    })
    this.gameModeManager.start()
    this.cueHandler.syncSlots(this.gameModeManager.getActivePrimaryCue(), null, null, true)
    log.info('AudioCueProcessor: Game Mode enabled')
  }

  /**
   * Disables Game Mode and restores manual primary/secondary cue slots.
   */
  public disableGameMode(): void {
    if (!this.gameModeManager) {
      return
    }
    this.tearDownIdleState()
    this.gameModeManager.stop()
    this.gameModeManager.setOnCueSwitch(null)
    this.gameModeManager.setOnScheduleChange(null)
    this.gameModeManager = null
    this.cueHandler.syncSlots(
      this.currentPrimaryCueType,
      this.currentSecondaryCueType,
      this.getStrobeSlotSyncType(),
      false,
    )
    log.info('AudioCueProcessor: Game Mode disabled')
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
      this.cueHandler.syncSlots(this.gameModeManager.getActivePrimaryCue(), null, null, true)
      return
    }

    const selected = this.selectActiveCueType(this.currentPrimaryCueType)
    if (selected !== this.currentPrimaryCueType) {
      log.info(
        `AudioCueProcessor: Switching primary cue from ${this.currentPrimaryCueType} to ${selected}`,
      )
      this.currentPrimaryCueType = selected
    }
    if (
      this.currentSecondaryCueType &&
      !this.registry.getCueImplementation(this.currentSecondaryCueType)
    ) {
      log.info(`AudioCueProcessor: Clearing unavailable secondary ${this.currentSecondaryCueType}`)
      this.currentSecondaryCueType = null
    }
    this.cueHandler.syncSlots(
      this.currentPrimaryCueType,
      this.currentSecondaryCueType,
      this.getStrobeSlotSyncType(),
      false,
    )
  }

  /**
   * Force the primary cue type when it is available
   */
  public setActiveCueType(cueType: AudioCueType): boolean {
    const cue = this.registry.getCueImplementation(cueType)
    if (!cue) {
      log.warn(`AudioCueProcessor: Requested cue ${cueType} is not available in enabled groups`)
      return false
    }

    if (this.currentPrimaryCueType !== cueType) {
      this.currentPrimaryCueType = cueType
      if (!this.gameModeManager) {
        this.cueHandler.syncSlots(
          this.currentPrimaryCueType,
          this.currentSecondaryCueType,
          this.getStrobeSlotSyncType(),
          false,
        )
        log.info(`AudioCueProcessor: Active primary cue set to ${cueType}`)
      }
    }
    return true
  }

  /**
   * Optional overlay; null clears the secondary slot (strobe slot is unchanged).
   */
  public setActiveSecondaryCueType(cueType: AudioCueType | null): boolean {
    if (this.gameModeManager) {
      this.currentSecondaryCueType = cueType
      return true
    }
    if (cueType == null || cueType === '') {
      if (this.currentSecondaryCueType != null) {
        this.currentSecondaryCueType = null
        this.cueHandler.syncSlots(
          this.currentPrimaryCueType,
          null,
          this.getStrobeSlotSyncType(),
          false,
        )
      }
      return true
    }
    const cue = this.registry.getCueImplementation(cueType)
    if (!cue) {
      log.warn(
        `AudioCueProcessor: Requested secondary cue ${cueType} is not available in enabled groups`,
      )
      return false
    }
    if (this.currentSecondaryCueType !== cueType) {
      this.currentSecondaryCueType = cueType
      this.cueHandler.syncSlots(
        this.currentPrimaryCueType,
        this.currentSecondaryCueType,
        this.getStrobeSlotSyncType(),
        false,
      )
      log.info(`AudioCueProcessor: Active secondary cue set to ${cueType}`)
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
      return null
    }
    return this.currentSecondaryCueType
  }

  /**
   * Manual secondary overlay cue (not strobes). Null in Game Mode.
   */
  public getEffectiveSecondaryCueType(): AudioCueType | null {
    if (this.gameModeManager) {
      return null
    }
    return this.currentSecondaryCueType
  }

  /**
   * Energy-triggered strobe cue type when strobing; null otherwise.
   */
  public getEffectiveStrobeCueType(): AudioCueType | null {
    if (this.strobeActive && this.strobeCueType) {
      return this.strobeCueType
    }
    return null
  }

  private getStrobeSlotSyncType(): AudioCueType | null {
    return this.strobeActive && this.strobeCueType ? this.strobeCueType : null
  }

  public setOnStrobeStateChange(cb: ((active: boolean) => void) | null): void {
    this.onStrobeStateChange = cb
  }

  public setOnGameModeCueChange(cb: ((cueType: AudioCueType) => void) | null): void {
    this.onGameModeCueChange = cb
  }

  public setOnGameModeScheduleChange(
    cb: ((info: AudioGameModeSchedulePayload) => void) | null,
  ): void {
    this.onGameModeScheduleChange = cb
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

  private tearDownIdleState(): void {
    this.clearIdleLook()
    this.idleController.reset()
  }

  private applyIdleLook(): void {
    if (this.idleLookActive) {
      return
    }
    this.idleSuppressedMotion = this.cueHandler.isMotionLayerEnabled()
    if (this.idleSuppressedMotion) {
      this.cueHandler.setMotionEnabled(false)
    }
    const lights = this.lightManager.getLights(['front', 'back'], ['all'])
    const { idleColor, idleBrightness } = this.config.idleDetection
    const color = getColor(idleColor, idleBrightness)
    const effect = getEffectSingleColor({
      color,
      duration: 400,
      lights,
      layer: AUDIO_IDLE_LAYER,
    })
    void this.sequencer.setEffect(AUDIO_IDLE_EFFECT_NAME, effect, true)
    this.idleLookActive = true
  }

  private clearIdleLook(): void {
    const hadIdle = this.idleLookActive || this.idleSuppressedMotion
    if (this.idleLookActive) {
      this.sequencer.removeEffect(AUDIO_IDLE_EFFECT_NAME, AUDIO_IDLE_LAYER)
      this.idleLookActive = false
    }
    if (this.idleSuppressedMotion) {
      this.cueHandler.setMotionEnabled(true)
      this.idleSuppressedMotion = false
    }
    if (hadIdle) {
      this.cueHandler.resetMotionTracking()
    }
  }

  private evaluateStrobe(audioData: AudioLightingData): void {
    const strobeBefore = this.strobeActive

    if (!this.config.strobeEnabled) {
      if (this.strobeActive) {
        this.strobeCueType = null
        this.strobeActive = false
      }
      if (strobeBefore !== this.strobeActive) {
        this.onStrobeStateChange?.(this.strobeActive)
      }
      return
    }

    const energy = audioData.energy
    const above = energy > this.config.strobeTriggerThreshold

    if (above && !this.strobeActive) {
      const prob = this.config.strobeProbability ?? 100
      if (prob < 100 && Math.random() * 100 >= prob) {
        return
      }
      const available = this.registry.getAvailableCueTypes()
      const all = available.length > 0 ? available : this.registry.getAvailableCueTypes(true)
      const chosen = pickStrobeCueType(this.registry, all)
      if (chosen && this.registry.getCueImplementation(chosen)) {
        this.strobeCueType = chosen
        this.strobeActive = true
      }
    } else if (!above && this.strobeActive) {
      this.strobeCueType = null
      this.strobeActive = false
    }

    if (strobeBefore !== this.strobeActive) {
      this.onStrobeStateChange?.(this.strobeActive)
    }
  }
}
