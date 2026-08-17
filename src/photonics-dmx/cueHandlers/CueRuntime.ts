import { CueData, CueType, DrumNoteType, InstrumentNoteType } from '../cues/types/cueTypes'
import type { SongEventCondition } from '../controllers/sequencer/interfaces'

/**
 * The dispatch surface a listener or processor drives, independent of which game feeds it. The YARG
 * network listener and the RB3 StageKit cue processor both consume this, and it is implemented by
 * the per-rig fan-out and by composites that tee one cue stream to more than one consumer.
 *
 * Song-event and motion-repick advancement are optional so a runtime that has no use for them needs
 * no empty implementation.
 */
export interface CueRuntime {
  notifySongStart(): void
  notifySongEnd(): void
  handleBeat(): void
  handleMeasure(): void
  handleKeyframeFirst(): void
  handleKeyframeNext(): void
  handleKeyframePrevious(): void
  handleCue(cueType: CueType, parameters: CueData): Promise<void>
  handleDrumNote(noteType: DrumNoteType, data: CueData): void
  handleGuitarNote(noteType: InstrumentNoteType, data: CueData): void
  handleBassNote(noteType: InstrumentNoteType, data: CueData): void
  handleKeysNote(noteType: InstrumentNoteType, data: CueData): void
  handleVocalNote(data: CueData): void
  /** Stop the active strobe slot, leaving per-frame edge baselines intact. */
  stopActiveStrobe(): void
  /**
   * Stop any active strobe and clear per-frame edge baselines at a session boundary, so the next
   * session's first frame compares against a clean baseline rather than a stale one. Required rather
   * than optional: a runtime that wraps another (see CompositeCueRuntime) has to forward both of
   * these, and as optional members a missing forward is a silent no-op instead of a type error.
   */
  resetSessionState(): void
  /**
   * Advance action-timing waits gated on a song event (e.g. an RB3 `led-3` / `fog-on` edge). Typed
   * off the sequencer union so the two can't drift.
   */
  handleSongEvent?(condition: SongEventCondition): void
  /**
   * Force a motion-cue re-pick on every chain. The RB3 cue-mode processor calls it when its
   * switch-timer has elapsed and Light 1 changes state (RB3 has no beat to key motion selection on).
   */
  requestMotionRepick?(): void
  /** Stop whatever this runtime is currently playing, without tearing the runtime down. */
  stopActiveCue?(): void
  /**
   * Called when the feeding listener is disabled or fails to start, so a runtime holding state of
   * its own (a composite's secondary, for instance) can clear it. Plain runtimes need not implement
   * it: the per-chain handlers are stopped through their own shutdown path.
   */
  onDisable?(): void
}
