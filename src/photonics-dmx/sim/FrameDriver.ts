import {
  CueData,
  CueType,
  DrumNoteType,
  InstrumentNoteType,
  StrobeState,
  defaultCueData,
  isStrobeCueType,
} from '../cues/types/cueTypes'
import type { YargCueHandler } from '../cueHandlers/YargCueHandler'
import type { VenueSize } from './types'

/** Live, persistent frame state shared across dispatched frames. */
export interface FrameState {
  cue: CueType
  venue: VenueSize
  bpm: number
  /** Whether any vocal/harmony part is currently sounding (drives vocal note-on/off edges). */
  vocalActive: boolean
}

/** Per-frame transient signals (reset every frame). */
export interface FrameTransient {
  beat?: 'Strong' | 'Measure'
  keyframe?: 'First' | 'Next' | 'Previous'
  drumNotes?: DrumNoteType[]
  guitarNotes?: InstrumentNoteType[]
  bassNotes?: InstrumentNoteType[]
  keysNotes?: InstrumentNoteType[]
}

const STROBE_STATE_BY_CUE: Partial<Record<CueType, StrobeState>> = {
  [CueType.Strobe_Slow]: 'Strobe_Slow',
  [CueType.Strobe_Medium]: 'Strobe_Medium',
  [CueType.Strobe_Fast]: 'Strobe_Fast',
  [CueType.Strobe_Fastest]: 'Strobe_Fastest',
}

/**
 * Synthesises one {@link CueData} frame from the live {@link FrameState} plus a per-frame
 * {@link FrameTransient}, then dispatches it to the {@link YargCueHandler} in the same order
 * as {@link YargNetworkListener.processCueData}: beat/measure -> keyframe -> primary cue ->
 * strobe slot -> instrument notes -> vocal note edge.
 *
 * Frames carry `trackMode: 'simulated'` + `simulationCueGroup`, pinning cue resolution to the
 * library under test (see {@link YargCueRegistry.getCueImplementationFromGroup}).
 */
export class FrameDriver {
  constructor(
    private readonly handler: YargCueHandler,
    private readonly getState: () => FrameState,
    private readonly simulationCueGroup: string,
  ) {}

  public async dispatch(transient: FrameTransient = {}): Promise<void> {
    const state = this.getState()
    const cueIsStrobe = isStrobeCueType(state.cue)
    const frame = this.buildFrame(state, transient, cueIsStrobe)

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

    // A strobe cue rides the dedicated strobe slot; everything else is a primary/secondary
    // look. Strobe_Off carries no implementation (handled internally by the handler).
    if (!cueIsStrobe) {
      await this.handler.handleCue(state.cue, frame)
    } else if (state.cue !== CueType.Strobe_Off) {
      await this.handler.handleCue(state.cue, frame)
    }

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

  private buildFrame(state: FrameState, transient: FrameTransient, cueIsStrobe: boolean): CueData {
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
      trackMode: 'simulated',
      simulationCueGroup: this.simulationCueGroup,
    }
  }
}
