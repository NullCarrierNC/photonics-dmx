import {
  CueData,
  CueType,
  DrumNoteType,
  InstrumentNoteType,
  isStrobeCueType,
} from '../cues/types/cueTypes'
import type { CueRuntime } from './CueRuntime'
import type { SongEventCondition } from '../controllers/sequencer/interfaces'
import { createLogger } from '../../shared/logger'

const log = createLogger('CompositeCueRuntime')

/**
 * Control / non-look cue types the secondary consumes without making a play-or-suppress decision.
 * The composite must not gate the primary on them, because the decision it would read is stale.
 * Strobes are handled separately, keyed off isStrobeCueType.
 */
export const CONTROL_CUE_TYPES: ReadonlySet<CueType> = new Set<CueType>([
  CueType.Blackout_Fast,
  CueType.Blackout_Slow,
  CueType.Blackout_Spotlight,
  CueType.NoCue,
  CueType.Strobe_Off,
  CueType.Keyframe_First,
  CueType.Keyframe_Next,
  CueType.Keyframe_Previous,
])

/**
 * A second consumer of one cue stream, running alongside the primary rather than through it. It
 * decides for itself whether a look plays, and the composite reads that decision to know whether
 * the primary should be suppressed for the same cue.
 */
export interface SecondaryCueRuntime {
  handleCue(cueType: CueType, parameters: CueData): Promise<void> | void
  stopActiveCue(): void
  /** Whether the last dispatch played, and whether it wants the primary suppressed for that cue. */
  getLastDispatchDecision(): { plays: boolean; suppress: boolean }
  /** Advance to a different cue group, e.g. when the primary domain rotates its own group. */
  rotateCueGroup(): void
  notifySongStart?(): void
  notifySongEnd?(): void
  handleBeat?(): void
  handleMeasure?(): void
  handleKeyframeFirst?(): void
  handleKeyframeNext?(): void
  handleKeyframePrevious?(): void
  handleDrumNote?(noteType: DrumNoteType, data: CueData): void
  handleGuitarNote?(noteType: InstrumentNoteType, data: CueData): void
  handleBassNote?(noteType: InstrumentNoteType, data: CueData): void
  handleKeysNote?(noteType: InstrumentNoteType, data: CueData): void
  handleVocalNote?(data: CueData): void
}

/** Policy the owner supplies to decide how the two consumers share a cue. */
export interface CompositeCueRuntimeHooks {
  /** Called instead of the primary's handleCue when the secondary's look runs solo. */
  suppressPrimary?: () => void | Promise<void>
  /** Hold or release an occluding overlay on the primary's output while the secondary strobes. */
  mutePrimary?: (on: boolean) => void
  /** Whether the primary plays an active strobe cue. Defaults to true. */
  shouldPlayPrimaryStrobe?: () => boolean
  /** Whether to hold the mute overlay while the secondary strobes. Defaults to false. */
  shouldMuteForSecondaryStrobe?: () => boolean
}

/**
 * Tees one cue stream to a primary runtime and a secondary consumer, so a listener still sees a
 * single {@link CueRuntime}. Without hooks both branches simply run concurrently.
 *
 * With `suppressPrimary` wired, a secondary look that wins its own play decision runs solo: the
 * secondary decides first, and the primary cue is either dispatched or replaced by the suppress
 * callback. Strobes take their own path so the strobe policy, not the look decision, is the
 * authority on which side plays.
 */
export class CompositeCueRuntime implements CueRuntime {
  constructor(
    private readonly primary: CueRuntime,
    private readonly secondary: SecondaryCueRuntime,
    private readonly hooks: CompositeCueRuntimeHooks = {},
  ) {}

  /** Whether the occluding overlay is currently held over the primary for a secondary strobe. */
  private mutedForStrobe = false

  /** Hold or release the overlay, skipping the work when it is already in that state. */
  private setMuted(on: boolean): void {
    if (!this.hooks.mutePrimary || this.mutedForStrobe === on) return
    this.mutedForStrobe = on
    this.hooks.mutePrimary(on)
  }

  public notifySongStart(): void {
    this.primary.notifySongStart()
    this.secondary.notifySongStart?.()
  }

  public notifySongEnd(): void {
    this.primary.notifySongEnd()
    this.secondary.notifySongEnd?.()
  }

  /**
   * A domain that rotates its primary group on a timer arrives here. The primary re-picks its
   * motion, and the secondary rotates its own group on the same cadence so both change together
   * even though they draw from separate group pools.
   */
  public requestMotionRepick(): void {
    this.primary.requestMotionRepick?.()
    this.secondary.rotateCueGroup()
  }

  /** Forwards to the primary only: the secondary has no sequencer consuming song-event waits. */
  public handleSongEvent(condition: SongEventCondition): void {
    this.primary.handleSongEvent?.(condition)
  }

  public stopActiveCue(): void {
    this.primary.stopActiveCue?.()
    this.secondary.stopActiveCue()
  }

  /**
   * Both strobe paths drop together and the overlay is lifted with them. `handleCue` only releases it
   * on Strobe_Off / blackout / NoCue, so a strobe stopped here (a fallback cue, a session boundary)
   * would otherwise leave the primary held black with no cue coming to clear it.
   */
  public stopActiveStrobe(): void {
    this.primary.stopActiveStrobe()
    this.secondary.stopActiveCue()
    this.setMuted(false)
  }

  public resetSessionState(): void {
    this.primary.resetSessionState()
    this.secondary.stopActiveCue()
    this.setMuted(false)
  }

  public onDisable(): void {
    this.secondary.stopActiveCue()
  }

  public handleBeat(): void {
    this.primary.handleBeat()
    this.secondary.handleBeat?.()
  }

  public handleMeasure(): void {
    this.primary.handleMeasure()
    this.secondary.handleMeasure?.()
  }

  public handleKeyframeFirst(): void {
    this.primary.handleKeyframeFirst()
    this.secondary.handleKeyframeFirst?.()
  }

  public handleKeyframeNext(): void {
    this.primary.handleKeyframeNext()
    this.secondary.handleKeyframeNext?.()
  }

  public handleKeyframePrevious(): void {
    this.primary.handleKeyframePrevious()
    this.secondary.handleKeyframePrevious?.()
  }

  public async handleCue(cueType: CueType, parameters: CueData): Promise<void> {
    const activeStrobe = isStrobeCueType(cueType) && cueType !== CueType.Strobe_Off

    // A secondary strobe ends on Strobe_Off or a blackout/NoCue, so lift any held overlay and let
    // the primary show again from its natural state.
    if (
      cueType === CueType.Strobe_Off ||
      cueType === CueType.Blackout_Fast ||
      cueType === CueType.Blackout_Slow ||
      cueType === CueType.Blackout_Spotlight ||
      cueType === CueType.NoCue
    ) {
      this.setMuted(false)
    }

    if (activeStrobe) {
      await this.dispatchSecondary(cueType, parameters)
      try {
        if (this.hooks.shouldPlayPrimaryStrobe?.() ?? true) {
          await this.primary.handleCue(cueType, parameters)
        }
      } catch (err) {
        log.error(`Primary cue runtime failed handling '${cueType}':`, err)
      }
      if (this.hooks.shouldMuteForSecondaryStrobe?.() ?? false) {
        this.setMuted(true)
      }
      return
    }

    // No solo gating: no suppress callback wired, or a control cue whose decision would be stale.
    if (this.hooks.suppressPrimary === undefined || CONTROL_CUE_TYPES.has(cueType)) {
      const [primary, secondary] = await Promise.allSettled([
        this.primary.handleCue(cueType, parameters),
        Promise.resolve(this.secondary.handleCue(cueType, parameters)),
      ])
      if (primary.status === 'rejected') {
        log.error(`Primary cue runtime failed handling '${cueType}':`, primary.reason)
      }
      if (secondary.status === 'rejected') {
        log.error(`Secondary cue runtime failed handling '${cueType}':`, secondary.reason)
      }
      return
    }

    // A secondary look: it decides first (recording whether it plays and wants the primary
    // suppressed), then the primary is either suppressed or dispatched. The secondary's
    // bookkeeping is synchronous, so awaiting it first adds no meaningful latency.
    await this.dispatchSecondary(cueType, parameters)
    const suppress = this.secondary.getLastDispatchDecision().suppress
    try {
      if (suppress) {
        await this.hooks.suppressPrimary()
      } else {
        await this.primary.handleCue(cueType, parameters)
      }
    } catch (err) {
      log.error(`Primary cue runtime failed handling '${cueType}':`, err)
    }
  }

  private async dispatchSecondary(cueType: CueType, parameters: CueData): Promise<void> {
    try {
      await this.secondary.handleCue(cueType, parameters)
    } catch (err) {
      log.error(`Secondary cue runtime failed handling '${cueType}':`, err)
    }
  }

  public handleDrumNote(noteType: DrumNoteType, data: CueData): void {
    this.primary.handleDrumNote(noteType, data)
    this.secondary.handleDrumNote?.(noteType, data)
  }

  public handleGuitarNote(noteType: InstrumentNoteType, data: CueData): void {
    this.primary.handleGuitarNote(noteType, data)
    this.secondary.handleGuitarNote?.(noteType, data)
  }

  public handleBassNote(noteType: InstrumentNoteType, data: CueData): void {
    this.primary.handleBassNote(noteType, data)
    this.secondary.handleBassNote?.(noteType, data)
  }

  public handleKeysNote(noteType: InstrumentNoteType, data: CueData): void {
    this.primary.handleKeysNote(noteType, data)
    this.secondary.handleKeysNote?.(noteType, data)
  }

  public handleVocalNote(data: CueData): void {
    this.primary.handleVocalNote(data)
    this.secondary.handleVocalNote?.(data)
  }
}
