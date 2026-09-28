import {
  CueData,
  CueType,
  DrumNoteType,
  InstrumentNoteType,
  StrobeState,
  defaultCueData,
  isStrobeCueType,
  ledAggregateMask,
} from '../cues/types/cueTypes'
import type { CueHandler } from '../cueHandlers/CueHandler'
import type { NetCueMode } from '../cues/types/nodeCueTypes'
import type { LedBanks, VenueSize } from './types'

/** Live, persistent frame state shared across dispatched frames. */
export interface FrameState {
  cue: CueType
  venue: VenueSize
  bpm: number
  /** Whether any vocal/harmony part is currently sounding (drives vocal note-on/off edges). */
  vocalActive: boolean
  /** RB3 only: the four StageKit LED bank masks the cue mirrors. */
  ledBanks?: LedBanks
  /** RB3 only: whether the fog machine is running. */
  fogState?: boolean
}

const LED_BANK_ORDER = ['red', 'green', 'blue', 'yellow'] as const

/** Per-frame transient signals (reset every frame). */
export interface FrameTransient {
  beat?: 'Strong' | 'Measure'
  keyframe?: 'First' | 'Next' | 'Previous'
  drumNotes?: DrumNoteType[]
  guitarNotes?: InstrumentNoteType[]
  bassNotes?: InstrumentNoteType[]
  keysNotes?: InstrumentNoteType[]
}

/** What the simulator's run loop drives, whatever the cue domain. */
export interface SimDriver {
  /** Send one frame built from the live state plus this frame's transient signals. */
  dispatch(transient?: FrameTransient): Promise<void>
  /** Stop every running cue, so the next frame starts the next cue fresh. */
  stopCues(): void
  shutdown(): void
}

const STROBE_STATE_BY_CUE: Partial<Record<CueType, StrobeState>> = {
  [CueType.Strobe_Slow]: 'Strobe_Slow',
  [CueType.Strobe_Medium]: 'Strobe_Medium',
  [CueType.Strobe_Fast]: 'Strobe_Fast',
  [CueType.Strobe_Fastest]: 'Strobe_Fastest',
}

/**
 * Synthesises one {@link CueData} frame from the live {@link FrameState} plus a per-frame
 * {@link FrameTransient}, then dispatches it to the {@link CueHandler} in the same order
 * as {@link YargNetworkListener.processCueData}: primary cue or strobe slot -> beat/measure ->
 * keyframe -> instrument notes -> vocal note edge.
 *
 * Frames carry `trackMode: 'simulated'` + `simulationCueGroup`, pinning cue resolution to the
 * library under test (see {@link CueRegistry.getCueImplementationFromGroup}). A `tracked` driver
 * sends them as live input does, so the handler runs its motion cue too, and the caller pins the
 * registry to the library instead.
 */
export class FrameDriver implements SimDriver {
  constructor(
    private readonly handler: CueHandler,
    private readonly getState: () => FrameState,
    private readonly simulationCueGroup: string,
    private readonly domain: NetCueMode = 'yarg',
    private readonly tracked = false,
  ) {}

  public async dispatch(transient: FrameTransient = {}): Promise<void> {
    const state = this.getState()
    const cueIsStrobe = isStrobeCueType(state.cue)
    const frame = this.buildFrame(state, transient, cueIsStrobe)

    // A strobe cue rides the dedicated strobe slot; everything else is a primary/secondary
    // look. Strobe_Off carries no implementation (handled internally by the handler). The
    // frame's timing events follow the cue without waiting on it, matching the listener.
    const cueDispatched =
      !cueIsStrobe || state.cue !== CueType.Strobe_Off
        ? this.handler.handleCue(state.cue, frame)
        : Promise.resolve()

    if (transient.beat === 'Strong') {
      this.handler.handleBeat()
    } else if (transient.beat === 'Measure') {
      this.handler.handleMeasure()
    }

    switch (transient.keyframe) {
      case 'First':
        this.handler.handleKeyframeFirst()
        break
      case 'Next':
        this.handler.handleKeyframeNext()
        break
      case 'Previous':
        this.handler.handleKeyframePrevious()
        break
    }
    await cueDispatched

    for (const note of frame.drumNotes) {
      if (note !== DrumNoteType.None) {
        this.handler.handleDrumNote(note, frame)
      }
    }
    for (const note of frame.guitarNotes) {
      if (note !== InstrumentNoteType.None) {
        this.handler.handleGuitarNote(note, frame)
      }
    }
    for (const note of frame.bassNotes) {
      if (note !== InstrumentNoteType.None) {
        this.handler.handleBassNote(note, frame)
      }
    }
    for (const note of frame.keysNotes) {
      if (note !== InstrumentNoteType.None) {
        this.handler.handleKeysNote(note, frame)
      }
    }

    this.handler.handleVocalNote(frame)
  }

  public stopCues(): void {
    this.handler.stopActiveCue()
  }

  public shutdown(): void {
    this.handler.shutdown()
  }

  private buildFrame(state: FrameState, transient: FrameTransient, cueIsStrobe: boolean): CueData {
    if (this.domain === 'rb3') {
      return this.buildRb3Frame(state, transient, cueIsStrobe)
    }
    return {
      ...defaultCueData,
      datagramVersion: 1,
      platform: 'Windows',
      currentScene: 'Gameplay',
      pauseState: 'Unpaused',
      venueSize: state.venue,
      beatsPerMinute: state.bpm,
      songSection: 'Verse',
      guitarNotes: transient.guitarNotes ?? [],
      bassNotes: transient.bassNotes ?? [],
      drumNotes: transient.drumNotes ?? [],
      keysNotes: transient.keysNotes ?? [],
      vocalNote: state.vocalActive ? 1 : 0,
      harmony0Note: 0,
      harmony1Note: 0,
      harmony2Note: 0,
      lightingCue: cueIsStrobe ? CueType.NoCue : state.cue,
      strobeState: cueIsStrobe ? STROBE_STATE_BY_CUE[state.cue] ?? 'Strobe_Off' : 'Strobe_Off',
      beat: transient.beat ?? 'Off',
      keyframe: transient.keyframe ?? 'Off',
      bonusEffect: false,
      trackMode: this.tracked ? 'tracked' : 'simulated',
      simulationCueGroup: this.simulationCueGroup,
    }
  }

  /**
   * The RB3 cue-mode frame: one always-on `RB3` cue carrying the accumulated StageKit LED banks,
   * mirroring {@link Rb3StageKitCueProcessor.buildFrame}. `ledColor` names the first lit bank in
   * red/green/blue/yellow order, which is the deterministic stand-in for the processor's
   * most-recently-updated colour.
   */
  private buildRb3Frame(
    state: FrameState,
    transient: FrameTransient,
    cueIsStrobe: boolean,
  ): CueData {
    const banks = state.ledBanks ?? { red: 0, green: 0, blue: 0, yellow: 0 }
    const aggregate = ledAggregateMask({ ledBanks: banks })
    const positions: number[] = []
    for (let i = 0; i < 8; i++) {
      if (aggregate & (1 << i)) positions.push(i)
    }
    return {
      ...defaultCueData,
      currentScene: 'Gameplay',
      venueSize: state.venue,
      beatsPerMinute: state.bpm,
      lightingCue: CueType.RB3,
      fogState: state.fogState ?? false,
      strobeState: cueIsStrobe ? STROBE_STATE_BY_CUE[state.cue] ?? 'Strobe_Off' : 'Strobe_Off',
      ledBanks: banks,
      ledColor: LED_BANK_ORDER.find((colour) => banks[colour] !== 0) ?? 'off',
      ledPositions: positions,
      beat: transient.beat ?? 'Off',
      keyframe: transient.keyframe ?? 'Off',
      trackMode: this.tracked ? 'tracked' : 'simulated',
      simulationCueGroup: this.simulationCueGroup,
    }
  }
}
