import { CueData, CueType, DrumNoteType, InstrumentNoteType } from '../cues/types/cueTypes'
import type { NetCueMode } from '../cues/types/nodeCueTypes'
import type { CueRuntime } from '../cueHandlers/CueRuntime'
import type { CueHandler } from '../cueHandlers/CueHandler'
import type { SongEventCondition } from './sequencer/interfaces'
import { ChainFanout } from './ChainFanout'

/**
 * Dispatch surface for one net domain, fanning each event to that domain's cue handler on every
 * rig chain. Each domain keeps its own handler slot, so a YARG runtime and an RB3 runtime drive the
 * same rigs without sharing cue state. Song-event edges go straight to each sequencer, since the
 * condition is already resolved and needs no handler.
 *
 * Chains without a handler for this domain are skipped silently.
 */
export class ChainCueRuntime implements CueRuntime {
  constructor(
    private readonly fanout: ChainFanout,
    private readonly domain: NetCueMode,
  ) {}

  /** This domain's handler on every chain that has one. */
  private handlers(): CueHandler[] {
    const out: CueHandler[] = []
    for (const c of this.fanout.getChains()) {
      const handler = c.cueHandlers[this.domain]
      if (handler) out.push(handler)
    }
    return out
  }

  public notifySongStart(): void {
    for (const h of this.handlers()) h.notifySongStart()
  }

  public notifySongEnd(): void {
    for (const h of this.handlers()) h.notifySongEnd()
  }

  public handleBeat(): void {
    for (const h of this.handlers()) h.handleBeat()
  }

  public handleMeasure(): void {
    for (const h of this.handlers()) h.handleMeasure()
  }

  public handleKeyframeFirst(): void {
    for (const h of this.handlers()) h.handleKeyframeFirst()
  }

  public handleKeyframeNext(): void {
    for (const h of this.handlers()) h.handleKeyframeNext()
  }

  public handleKeyframePrevious(): void {
    for (const h of this.handlers()) h.handleKeyframePrevious()
  }

  public async handleCue(cueType: CueType, parameters: CueData): Promise<void> {
    // Fire all chain handlers concurrently; each chain awaits its own cue's effect chain.
    // Errors on any chain are isolated so a rig with an unloadable cue doesn't block siblings.
    await Promise.allSettled(this.handlers().map((h) => h.handleCue(cueType, parameters)))
  }

  public stopActiveCue(): void {
    for (const h of this.handlers()) h.stopActiveCue()
  }

  public stopActiveStrobe(): void {
    for (const h of this.handlers()) h.stopActiveStrobe()
  }

  public resetSessionState(): void {
    for (const h of this.handlers()) h.resetSessionState()
  }

  public handleDrumNote(noteType: DrumNoteType, data: CueData): void {
    for (const h of this.handlers()) h.handleDrumNote(noteType, data)
  }

  public handleGuitarNote(noteType: InstrumentNoteType, data: CueData): void {
    for (const h of this.handlers()) h.handleGuitarNote(noteType, data)
  }

  public handleBassNote(noteType: InstrumentNoteType, data: CueData): void {
    for (const h of this.handlers()) h.handleBassNote(noteType, data)
  }

  public handleKeysNote(noteType: InstrumentNoteType, data: CueData): void {
    for (const h of this.handlers()) h.handleKeysNote(noteType, data)
  }

  public handleVocalNote(data: CueData): void {
    for (const h of this.handlers()) h.handleVocalNote(data)
  }

  public handleSongEvent(condition: SongEventCondition): void {
    for (const c of this.fanout.getChains()) c.sequencer.handleSongEvent(condition)
  }

  public requestMotionRepick(): void {
    for (const h of this.handlers()) h.requestMotionRepick()
  }
}
