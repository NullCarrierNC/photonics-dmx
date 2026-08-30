import { AudioCueType, AudioMotionCueRef } from '../cues/types/audioCueTypes'
import { AudioConfig, AudioLightingData } from '../listeners/Audio/AudioTypes'
import { CueData, CueType, DrumNoteType, InstrumentNoteType } from '../cues/types/cueTypes'
import type { CueRuntime } from '../cueHandlers/CueRuntime'
import { Rb3MenuCueDispatch } from '../cueHandlers/Rb3MenuCueHandler'
import type { SongEventCondition } from './sequencer/interfaces'
import { RigChain } from './RigChain'
import { ChainCueRuntime } from './ChainCueRuntime'
import type { NetCueMode } from '../cues/types/nodeCueTypes'

/**
 * Listener / processor surface that dispatches the same incoming event to every active rig
 * chain's matching cue handler. The cue resolution itself happens per chain — same cue
 * definition, but each chain's handler runs the cue against its own sequencer and light
 * manager, so the cue scales to the rig it lives on.
 *
 * Implements {@link CueRuntime} (the contract `YargNetworkListener` consumes) and
 * {@link Rb3MenuCueDispatch} (the contract the RB3 StageKit processor consumes) directly.
 * Audio is exposed via a dedicated set of `audio*` methods because the `AudioCueHandler`
 * surface is broader than the cue-handler interface the YARG side uses.
 *
 * Chains without a handler for a given event class (e.g. a chain whose YARG listener hasn't
 * been enabled yet) are skipped silently for that event.
 */
export class ChainFanout implements CueRuntime, Rb3MenuCueDispatch {
  private chains: RigChain[] = []

  public setChains(chains: RigChain[]): void {
    this.chains = chains
  }

  public getChains(): RigChain[] {
    return this.chains
  }

  // ── Game domains (CueRuntime) ────────────────────────────────────────────────────────
  //
  // One runtime per net domain, each fanning to that domain's handler slot on every chain.
  // The fanout itself implements CueRuntime for the YARG domain, which is what the YARG
  // network listener and the simulation paths consume.

  private readonly runtimes: Record<NetCueMode, ChainCueRuntime> = {
    yarg: new ChainCueRuntime(this, 'yarg'),
    rb3: new ChainCueRuntime(this, 'rb3'),
  }

  /** The dispatch surface for one net domain. */
  public cueRuntime(domain: NetCueMode): ChainCueRuntime {
    return this.runtimes[domain]
  }

  public notifySongStart(): void {
    this.runtimes.yarg.notifySongStart()
  }

  public notifySongEnd(): void {
    this.runtimes.yarg.notifySongEnd()
  }

  public handleBeat(): void {
    this.runtimes.yarg.handleBeat()
  }

  public handleMeasure(): void {
    this.runtimes.yarg.handleMeasure()
  }

  public handleKeyframeFirst(): void {
    this.runtimes.yarg.handleKeyframeFirst()
  }

  public handleKeyframeNext(): void {
    this.runtimes.yarg.handleKeyframeNext()
  }

  public handleKeyframePrevious(): void {
    this.runtimes.yarg.handleKeyframePrevious()
  }

  public async handleCue(cueType: CueType, parameters: CueData): Promise<void> {
    await this.runtimes.yarg.handleCue(cueType, parameters)
  }

  public handleDrumNote(noteType: DrumNoteType, data: CueData): void {
    this.runtimes.yarg.handleDrumNote(noteType, data)
  }

  public handleGuitarNote(noteType: InstrumentNoteType, data: CueData): void {
    this.runtimes.yarg.handleGuitarNote(noteType, data)
  }

  public handleBassNote(noteType: InstrumentNoteType, data: CueData): void {
    this.runtimes.yarg.handleBassNote(noteType, data)
  }

  public handleKeysNote(noteType: InstrumentNoteType, data: CueData): void {
    this.runtimes.yarg.handleKeysNote(noteType, data)
  }

  public handleVocalNote(data: CueData): void {
    this.runtimes.yarg.handleVocalNote(data)
  }

  public stopActiveStrobe(): void {
    this.runtimes.yarg.stopActiveStrobe()
  }

  public resetSessionState(): void {
    this.runtimes.yarg.resetSessionState()
  }

  /** Advance every chain's action-timing waits gated on a song-event condition (RB3 led/fog edges).
   *  Goes straight to each sequencer - the condition is already resolved, so no cue handler is needed. */
  public handleSongEvent(condition: SongEventCondition): void {
    for (const c of this.chains) c.sequencer.handleSongEvent(condition)
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

  // ── Direct-sequencer fanout (used by simulation / test-effect paths) ─────────────────
  //
  // These methods bypass the cue handler and drive each chain's sequencer directly, so they
  // serve every domain. They exist because the simulation IPC path ticks the primary sequencer
  // (e.g. `lighting.onBeat()`) without going through a handler; the fanout offers a
  // direct-sequencer surface that mirrors the audio path's `audioOnBeat` / `audioRemove*`.

  public onBeat(): void {
    for (const c of this.chains) c.sequencer.onBeat()
  }

  public onMeasure(): void {
    for (const c of this.chains) c.sequencer.onMeasure()
  }

  public onKeyframe(): void {
    for (const c of this.chains) c.sequencer.onKeyframe()
  }

  /** Schedule the next-frame pan/tilt clear on every chain's sequencer. Used when a motion
   *  cue stops without a replacement so fixtures fall back to their home position. */
  public schedulePanTiltClear(): void {
    for (const c of this.chains) c.sequencer.schedulePanTiltClear()
  }

  /** Cancel a pending pan/tilt clear on every chain's sequencer. Used when a new motion
   *  cue starts before the deferred clear fires. */
  public cancelPanTiltClear(): void {
    for (const c of this.chains) c.sequencer.cancelPanTiltClear()
  }

  /** Stop the currently-active cue for one domain on every chain's handler (no-op for chains
   *  without a handler attached). Mirrors `CueHandler.stopActiveCue`. */
  public stopActiveCue(domain: NetCueMode = 'yarg'): void {
    for (const c of this.chains) c.cueHandlers[domain]?.stopActiveCue()
  }

  /**
   * Blackout every chain's sequencer sequentially so per-chain fades start in chain order
   * and don't race each other. Errors on any chain don't block the others (mirrors the
   * `Promise.allSettled` pattern used elsewhere in the fanout).
   */
  public async blackout(durationMs: number): Promise<void> {
    await Promise.allSettled(this.chains.map((c) => c.sequencer.blackout(durationMs)))
  }

  /**
   * Mute / unmute the DMX lights on every chain with a held occluding overlay.
   *
   * Unlike a blackout this leaves the running cue alone: it keeps advancing on its own layers and
   * reappears at its natural state the instant the overlay is released. The overlay is owned by each
   * sequencer's system-effects controller rather than submitted as an ordinary effect, so it sits
   * above every cue layer and survives the blackout paths that wipe layers underneath it.
   */
  public muteLighting(on: boolean): void {
    for (const c of this.chains) c.sequencer.holdOcclusion(on)
  }

  // ── RB3 menu (Rb3MenuCueDispatch) ─────────────────────────────────────────────────────

  public playMenuFrame(): void {
    for (const c of this.chains) c.rb3MenuCueHandler?.playMenuFrame()
  }

  public clear(): void {
    for (const c of this.chains) c.rb3MenuCueHandler?.clear()
  }
}
