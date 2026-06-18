import { AudioCueType, AudioMotionCueRef } from '../cues/types/audioCueTypes'
import { AudioConfig, AudioLightingData } from '../listeners/Audio/AudioTypes'
import { CueData, CueType, DrumNoteType, InstrumentNoteType } from '../cues/types/cueTypes'
import { YargCueRuntime } from '../listeners/YARG/YargNetworkListener'
import { Rb3MenuCueDispatch } from '../cueHandlers/Rb3MenuCueHandler'
import { RigChain } from './RigChain'

/**
 * Listener / processor surface that dispatches the same incoming event to every active rig
 * chain's matching cue handler. The cue resolution itself happens per chain — same cue
 * definition, but each chain's handler runs the cue against its own sequencer and light
 * manager, so the cue scales to the rig it lives on.
 *
 * Implements {@link YargCueRuntime} (the contract `YargNetworkListener` consumes) and
 * {@link Rb3MenuCueDispatch} (the contract the RB3 StageKit processor consumes) directly.
 * Audio is exposed via a dedicated set of `audio*` methods because the `AudioCueHandler`
 * surface is broader than the cue-handler interface the YARG side uses.
 *
 * Chains without a handler for a given event class (e.g. a chain whose YARG listener hasn't
 * been enabled yet) are skipped silently for that event.
 */
export class ChainFanout implements YargCueRuntime, Rb3MenuCueDispatch {
  private chains: RigChain[] = []

  public setChains(chains: RigChain[]): void {
    this.chains = chains
  }

  public getChains(): RigChain[] {
    return this.chains
  }

  // ── YARG (YargCueRuntime) ─────────────────────────────────────────────────────────────

  public notifySongStart(): void {
    for (const c of this.chains) c.yargCueHandler?.notifySongStart()
  }

  public notifySongEnd(): void {
    for (const c of this.chains) c.yargCueHandler?.notifySongEnd()
  }

  public handleBeat(): void {
    for (const c of this.chains) c.yargCueHandler?.handleBeat()
  }

  public handleMeasure(): void {
    for (const c of this.chains) c.yargCueHandler?.handleMeasure()
  }

  public handleKeyframeFirst(): void {
    for (const c of this.chains) c.yargCueHandler?.handleKeyframeFirst()
  }

  public handleKeyframeNext(): void {
    for (const c of this.chains) c.yargCueHandler?.handleKeyframeNext()
  }

  public handleKeyframePrevious(): void {
    for (const c of this.chains) c.yargCueHandler?.handleKeyframePrevious()
  }

  public async handleCue(cueType: CueType, parameters: CueData): Promise<void> {
    // Fire all chain handlers concurrently; each chain awaits its own cue's effect chain.
    // Errors on any chain are isolated so a rig with an unloadable cue doesn't block siblings.
    await Promise.allSettled(
      this.chains.map((c) => c.yargCueHandler?.handleCue(cueType, parameters)),
    )
  }

  public handleDrumNote(noteType: DrumNoteType, data: CueData): void {
    for (const c of this.chains) c.yargCueHandler?.handleDrumNote(noteType, data)
  }

  public handleGuitarNote(noteType: InstrumentNoteType, data: CueData): void {
    for (const c of this.chains) c.yargCueHandler?.handleGuitarNote(noteType, data)
  }

  public handleBassNote(noteType: InstrumentNoteType, data: CueData): void {
    for (const c of this.chains) c.yargCueHandler?.handleBassNote(noteType, data)
  }

  public handleKeysNote(noteType: InstrumentNoteType, data: CueData): void {
    for (const c of this.chains) c.yargCueHandler?.handleKeysNote(noteType, data)
  }

  public handleVocalNote(data: CueData): void {
    for (const c of this.chains) c.yargCueHandler?.handleVocalNote(data)
  }

  // ── Audio ─────────────────────────────────────────────────────────────────────────────

  public audioSetMotionEnabled(enabled: boolean): void {
    for (const c of this.chains) c.audioCueHandler?.setMotionEnabled(enabled)
  }

  public audioSetManualMotionRef(ref: AudioMotionCueRef | null): void {
    for (const c of this.chains) c.audioCueHandler?.setManualMotionRef(ref)
  }

  public audioResetMotionTracking(): void {
    for (const c of this.chains) c.audioCueHandler?.resetMotionTracking()
  }

  public audioIsMotionLayerEnabled(): boolean {
    // Motion-enabled state is identical across chains (set by the same call). Read off the
    // first chain that has a handler; default to true if no audio handlers exist.
    for (const c of this.chains) {
      if (c.audioCueHandler) return c.audioCueHandler.isMotionLayerEnabled()
    }
    return true
  }

  public audioSyncSlots(
    primaryCueType: AudioCueType,
    secondaryCueType: AudioCueType | null,
    strobeCueType: AudioCueType | null = null,
    gameModeActive = false,
  ): void {
    for (const c of this.chains) {
      c.audioCueHandler?.syncSlots(primaryCueType, secondaryCueType, strobeCueType, gameModeActive)
    }
  }

  public async audioHandleData(
    audioData: AudioLightingData,
    config: AudioConfig,
    primaryCueType: AudioCueType,
    secondaryCueType: AudioCueType | null,
    strobeCueType: AudioCueType | null,
    enabledBandCount: number,
    gameModeActive: boolean,
  ): Promise<void> {
    await Promise.allSettled(
      this.chains.map((c) =>
        c.audioCueHandler?.handleAudioData(
          audioData,
          config,
          primaryCueType,
          secondaryCueType,
          strobeCueType,
          enabledBandCount,
          gameModeActive,
        ),
      ),
    )
  }

  public audioStop(): void {
    for (const c of this.chains) c.audioCueHandler?.stop()
  }

  public audioClearCurrentCue(): void {
    for (const c of this.chains) c.audioCueHandler?.clearCurrentCue()
  }

  public audioDestroy(): void {
    for (const c of this.chains) c.audioCueHandler?.destroy()
  }

  /** Notify every chain's sequencer of an incoming beat (audio path triggers this when a
   *  beat is detected in the audio frame). */
  public audioOnBeat(): void {
    for (const c of this.chains) c.sequencer.onBeat()
  }

  /** Remove a layered effect from every chain's sequencer. Used by the audio processor to
   *  clean up frequency-band layers when audio stops. */
  public audioRemoveEffectByLayer(layer: number, shouldRemoveTransitions = false): void {
    for (const c of this.chains) c.sequencer.removeEffectByLayer(layer, shouldRemoveTransitions)
  }

  // ── YARG direct-sequencer fanout (used by simulation / test-effect paths) ─────────────
  //
  // These methods bypass the cue handler and drive each chain's sequencer directly. They
  // exist because the simulation IPC path historically ticked the primary sequencer (e.g.
  // `lighting.onBeat()`) without going through a handler — to keep those callers
  // multi-rig-correct without forcing them to also wire up handlers, the fanout offers a
  // direct-sequencer surface that mirrors the audio path's `audioOnBeat` / `audioRemove*`.

  public yargOnBeat(): void {
    for (const c of this.chains) c.sequencer.onBeat()
  }

  public yargOnMeasure(): void {
    for (const c of this.chains) c.sequencer.onMeasure()
  }

  public yargOnKeyframe(): void {
    for (const c of this.chains) c.sequencer.onKeyframe()
  }

  /** Schedule the next-frame pan/tilt clear on every chain's sequencer. Used when a motion
   *  cue stops without a replacement so fixtures fall back to their home position. */
  public yargSchedulePanTiltClear(): void {
    for (const c of this.chains) c.sequencer.schedulePanTiltClear()
  }

  /** Cancel a pending pan/tilt clear on every chain's sequencer. Used when a new motion
   *  cue starts before the deferred clear fires. */
  public yargCancelPanTiltClear(): void {
    for (const c of this.chains) c.sequencer.cancelPanTiltClear()
  }

  /** Stop the currently-active YARG cue on every chain's handler (no-op for chains
   *  without a handler attached). Mirrors `YargCueHandler.stopActiveCue`. */
  public yargStopActiveCue(): void {
    for (const c of this.chains) c.yargCueHandler?.stopActiveCue()
  }

  /**
   * Blackout every chain's sequencer sequentially so per-chain fades start in chain order
   * and don't race each other. Errors on any chain don't block the others (mirrors the
   * `Promise.allSettled` pattern used elsewhere in the fanout).
   */
  public async yargBlackout(durationMs: number): Promise<void> {
    await Promise.allSettled(this.chains.map((c) => c.sequencer.blackout(durationMs)))
  }

  // ── RB3 menu (Rb3MenuCueDispatch) ─────────────────────────────────────────────────────

  public playMenuFrame(): void {
    for (const c of this.chains) c.rb3MenuCueHandler?.playMenuFrame()
  }

  public clear(): void {
    for (const c of this.chains) c.rb3MenuCueHandler?.clear()
  }
}
