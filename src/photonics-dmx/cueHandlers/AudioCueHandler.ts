import { EventEmitter } from 'events'
import { AudioLightingData, AudioConfig } from '../listeners/Audio/AudioTypes'
import { AudioCueData, AudioCueType, AudioMotionCueRef } from '../cues/types/audioCueTypes'
import { IAudioCue } from '../cues/interfaces/IAudioCue'
import { AudioCueRegistry } from '../cues/registries/AudioCueRegistry'
import { ILightingController } from '../controllers/sequencer/interfaces'
import { DmxLightManager } from '../controllers/DmxLightManager'
import { getStrobeStateManager } from '../controllers/StrobeStateManager'
import type { MotionCueChangePayload } from '../../shared/ipc/common'
import type { MotionSelectionCoordinator } from './MotionSelectionCoordinator'
import { createAudioMotionCoordinator } from './audioMotionCoordinator'
import { createLogger } from '../../shared/logger'
const log = createLogger('AudioCueHandler')

/**
 * Stop one cue and take its effects with it. Falls back to plain `onStop` for a cue that predates
 * the forced-removal hook, which keeps the old leave-them-up behaviour rather than throwing.
 */
function stopAndClear(cue: IAudioCue | null): void {
  if (!cue) return
  if (cue.stopAndClearEffects) {
    cue.stopAndClearEffects()
    return
  }
  cue.onStop?.()
}

export type AudioCueHandlerOptions = {
  /**
   * The audio input's motion decision, shared by every chain's handler so all rigs run the same
   * motion cue. A handler built without one decides for itself.
   */
  motionCoordinator?: MotionSelectionCoordinator<IAudioCue>
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
  private readonly motionCoordinator: MotionSelectionCoordinator<IAudioCue>
  /** The motion cue this chain last applied, so a change to nothing homes its heads once. */
  private appliedMotionCue: IAudioCue | null = null
  private executionCount = 0

  constructor(
    private lightManager: DmxLightManager,
    private sequencer: ILightingController,
    options?: AudioCueHandlerOptions,
  ) {
    super()
    this.registry = AudioCueRegistry.getInstance()
    this.motionCoordinator = options?.motionCoordinator ?? createAudioMotionCoordinator()
  }

  public isMotionLayerEnabled(): boolean {
    return this.motionCoordinator.isMotionEnabled()
  }

  /** Clears motion min-hold timing so the next primary change can re-pick motion immediately. */
  public resetMotionTracking(): void {
    this.motionCoordinator.resetTracking()
  }

  public setMotionEnabled(enabled: boolean): void {
    this.motionCoordinator.setMotionEnabled(enabled)
  }

  public setManualMotionRef(ref: AudioMotionCueRef | null): void {
    this.motionCoordinator.setManualMotionRef(ref)
  }

  /**
   * Handle audio data by executing active primary, optional secondary overlay, and optional strobe cues.
   * @param primaryCueType Main cue (wash / rotation); empty string clears primary slot
   * @param secondaryCueType Optional overlay; null clears secondary slot
   * @param strobeCueType Optional strobe overlay; null clears strobe slot
   * @param dispatchToken One object per fan-out call, shared by every chain so they apply the same
   *   motion decision. A direct caller leaves it out and gets a decision of its own.
   */
  public async handleAudioData(
    audioData: AudioLightingData,
    config: AudioConfig,
    primaryCueType: AudioCueType,
    secondaryCueType: AudioCueType | null,
    strobeCueType: AudioCueType | null,
    enabledBandCount: number,
    gameModeActive: boolean,
    dispatchToken: object = {},
  ): Promise<void> {
    this.assignPrimarySlot(primaryCueType)
    this.assignSecondarySlot(secondaryCueType)
    this.assignStrobeSlot(strobeCueType)

    this.syncMotionWithPrimary(primaryCueType, gameModeActive, dispatchToken)

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
    await run(this.appliedMotionCue)
  }

  /** The motion cue the audio input runs, as the renderer should show it. */
  public getRunningMotionCue(): MotionCueChangePayload {
    return this.motionCoordinator.getRunningMotionRef()
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
      log.warn(`Audio cue not found: ${cueType}`)
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
    dispatchToken: object = {},
  ): void {
    this.assignPrimarySlot(primaryCueType)
    this.assignSecondarySlot(secondaryCueType)
    this.assignStrobeSlot(strobeCueType)
    this.syncMotionWithPrimary(primaryCueType, gameModeActive, dispatchToken)
  }

  /**
   * Bring this chain's motion cue in line with the shared decision. A change of primary cue picks
   * again once the current motion has held for the minimum time, and in game mode picks at once and
   * ignores the manual ref. With no primary cue, or motion off, the motion cue stops.
   */
  private syncMotionWithPrimary(
    primaryCueType: AudioCueType,
    gameModeActive: boolean,
    dispatchToken: object,
  ): void {
    const cueKey = this.currentPrimaryCue ? primaryCueType : ''
    if (!this.motionCoordinator.isMotionEnabled() || !this.currentPrimaryCue) {
      this.motionCoordinator.clear(dispatchToken, cueKey)
    } else {
      this.motionCoordinator.select(dispatchToken, {
        cueKey,
        bypassMinHold: gameModeActive,
        ignoreManualRef: gameModeActive,
        pickAfterHold: true,
      })
    }
    this.applyMotionCue(this.motionCoordinator.getCurrent())
  }

  /**
   * Record which motion cue this chain runs. A change to a cue cancels a pending pan/tilt clear so
   * the new motion is not homed on its first frame. A change to nothing homes this chain's heads.
   */
  private applyMotionCue(motionCue: IAudioCue | null): void {
    if (motionCue === this.appliedMotionCue) {
      return
    }
    if (motionCue) {
      this.sequencer.cancelPanTiltClear()
    } else {
      this.sequencer.schedulePanTiltClear()
    }
    this.appliedMotionCue = motionCue
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
      log.warn(`Audio cue not found: ${cueType}`)
      // Clear the existing overlay when the requested cue is unavailable, matching
      // assignPrimarySlot — otherwise a stale secondary keeps running indefinitely.
      if (this.currentSecondaryCue) {
        this.currentSecondaryCue.onStop?.()
        this.currentSecondaryCue = null
      }
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
        getStrobeStateManager().setActive(null, 'audio')
      }
      return
    }

    const cue = this.registry.getCueImplementation(cueType)
    if (!cue) {
      log.warn(`Audio cue not found: ${cueType}`)
      // Clear the running strobe when the requested cue is unavailable (mirror the null branch and
      // assignSecondarySlot) — otherwise a stale strobe keeps running with the strobe manager active.
      if (this.currentStrobeCue) {
        this.currentStrobeCue.onStop?.()
        this.currentStrobeCue = null
        getStrobeStateManager().setActive(null, 'audio')
      }
      return
    }

    if (this.currentStrobeCue !== cue) {
      this.currentStrobeCue?.onStop?.()
      this.currentStrobeCue = cue
    }
    // Audio strobe cues aren't bucketed into discrete slow/medium/fast/fastest speeds the way YARG
    // cues are; map any active audio strobe to the medium slot. A future refinement could let each
    // audio strobe cue declare its preferred slot.
    getStrobeStateManager().setActive('medium', 'audio')
  }

  /**
   * Stop all active cues
   */
  public stop(): void {
    this.clearCurrentCue()
  }

  /**
   * End the running audio look. Every slot is stopped with its effects taken off the sequencer:
   * unlike a cue change, nothing is coming to replace the look, so a primary cue's usual
   * leave-the-effects-up behaviour would strand it lit on whatever layers it authored.
   */
  public clearCurrentCue(): void {
    stopAndClear(this.currentPrimaryCue)
    this.currentPrimaryCue = null
    stopAndClear(this.currentSecondaryCue)
    this.currentSecondaryCue = null
    if (this.currentStrobeCue) {
      stopAndClear(this.currentStrobeCue)
      this.currentStrobeCue = null
    }
    // Unconditional: an interrupted audio strobe (processing stops with no explicit clear) must
    // not leave the process-wide StrobeStateManager stuck on a slot.
    getStrobeStateManager().setActive(null, 'audio')
    // The motion cue is shared by every chain, and clearing it takes its effects off each one.
    this.motionCoordinator.stop(stopAndClear)
    this.motionCoordinator.resetTracking()
    this.appliedMotionCue = null
    this.executionCount = 0
  }

  /**
   * Cleanup
   */
  public destroy(): void {
    this.clearCurrentCue()
  }
}
