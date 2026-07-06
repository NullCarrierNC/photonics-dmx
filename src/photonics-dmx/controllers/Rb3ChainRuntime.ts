import { CueData, CueType, DrumNoteType, InstrumentNoteType } from '../cues/types/cueTypes'
import { YargCueRuntime } from '../listeners/YARG/YargNetworkListener'
import type { SongEventCondition } from './sequencer/interfaces'
import { ChainFanout } from './ChainFanout'

/**
 * Dispatch surface the RB3 cue-mode processor drives, fanning each event to every rig chain's
 * `rb3CueHandler` — the RB3 domain's own per-rig handlers, separate from the YARG listener's
 * `yargCueHandler` slot. Song-event edges go straight to each sequencer, matching the YARG path.
 *
 * Implements {@link YargCueRuntime} so the processor stays domain-agnostic (the laser branch wraps
 * this same runtime with its composite tee). Chains without an RB3 handler are skipped silently.
 */
export class Rb3ChainRuntime implements YargCueRuntime {
  constructor(private readonly fanout: ChainFanout) {}

  public notifySongStart(): void {
    for (const c of this.fanout.getChains()) c.rb3CueHandler?.notifySongStart()
  }

  public notifySongEnd(): void {
    for (const c of this.fanout.getChains()) c.rb3CueHandler?.notifySongEnd()
  }

  public handleBeat(): void {
    for (const c of this.fanout.getChains()) c.rb3CueHandler?.handleBeat()
  }

  public handleMeasure(): void {
    for (const c of this.fanout.getChains()) c.rb3CueHandler?.handleMeasure()
  }

  public handleKeyframeFirst(): void {
    for (const c of this.fanout.getChains()) c.rb3CueHandler?.handleKeyframeFirst()
  }

  public handleKeyframeNext(): void {
    for (const c of this.fanout.getChains()) c.rb3CueHandler?.handleKeyframeNext()
  }

  public handleKeyframePrevious(): void {
    for (const c of this.fanout.getChains()) c.rb3CueHandler?.handleKeyframePrevious()
  }

  public async handleCue(cueType: CueType, parameters: CueData): Promise<void> {
    await Promise.allSettled(
      this.fanout.getChains().map((c) => c.rb3CueHandler?.handleCue(cueType, parameters)),
    )
  }

  public handleDrumNote(noteType: DrumNoteType, data: CueData): void {
    for (const c of this.fanout.getChains()) c.rb3CueHandler?.handleDrumNote(noteType, data)
  }

  public handleGuitarNote(noteType: InstrumentNoteType, data: CueData): void {
    for (const c of this.fanout.getChains()) c.rb3CueHandler?.handleGuitarNote(noteType, data)
  }

  public handleBassNote(noteType: InstrumentNoteType, data: CueData): void {
    for (const c of this.fanout.getChains()) c.rb3CueHandler?.handleBassNote(noteType, data)
  }

  public handleKeysNote(noteType: InstrumentNoteType, data: CueData): void {
    for (const c of this.fanout.getChains()) c.rb3CueHandler?.handleKeysNote(noteType, data)
  }

  public handleVocalNote(data: CueData): void {
    for (const c of this.fanout.getChains()) c.rb3CueHandler?.handleVocalNote(data)
  }

  public handleSongEvent(condition: SongEventCondition): void {
    for (const c of this.fanout.getChains()) c.sequencer.handleSongEvent(condition)
  }
}
