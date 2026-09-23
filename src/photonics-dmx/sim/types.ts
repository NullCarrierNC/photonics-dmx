import type { VENUE_SIZES } from '../cues/types/cueTypes'
import type { NetCueMode } from '../cues/types/nodeCueTypes'

export type VenueSize = (typeof VENUE_SIZES)[number]

/** The cue domain a simulated library belongs to. */
export type SimDomain = NetCueMode | 'audio'

/** A single scheduled scenario step, applied at `at` ms after the run starts. */
export interface ScenarioEntry {
  /** Milliseconds from the start of the run. */
  at: number
  /**
   * One-shot YARG event to inject on this frame, e.g. `keyframe-next`, `measure`,
   * `drum-red`, `guitar-blue`, `vocal-note`, `vocal-note-off`.
   */
  event?: string
  /** Change the live beats-per-minute from this point on (0 disables auto beats). */
  bpm?: number
  /** Change the venue size from this point on. */
  venue?: VenueSize
  /** Switch the cue under test from this point on (stops the previous cue first). */
  cue?: string
  /**
   * Play this secondary cue over the running primary from this point on. The primary keeps running
   * and the frames carry the secondary, as YARG sends them. An empty string puts the primary
   * back in the frames. On an audio library a strobe cue fills the strobe slot and any other cue
   * the secondary.
   */
  secondary?: string
  /** Audio only: the input level from 0 to 1 from this point on. */
  level?: number
  /** RB3 only: set the StageKit LED bank masks the cue mirrors from this point on. */
  ledBanks?: LedBanks
  /** RB3 only: set the fog machine state from this point on. */
  fog?: boolean
}

/** The four StageKit LED bank masks, one bit per ring position. */
export interface LedBanks {
  red: number
  green: number
  blue: number
  yellow: number
}

/** Per-light colour observation captured from the LightStateManager at a point in time. */
export interface SimLightSample {
  red: number
  green: number
  blue: number
  intensity: number
  opacity: number
  blendMode: string
}

/** One recorded row of the simulation: every light's state plus any events that fired. */
export interface SimSample {
  timeMs: number
  /** Keyed by light id; null when the light has no state yet (never been driven). */
  lights: Record<string, SimLightSample | null>
  /** Scenario-driven events/state changes attributed to this row (for annotation). */
  events: string[]
}

/** Ordered light ids per physical group, for rendering rows in a stable order. */
export interface SimLightOrder {
  front: string[]
  back: string[]
  strobe: string[]
}

/** The full result of a simulation run. */
export interface SimTimeline {
  cue: string
  library: string
  venue: VenueSize
  bpm: number
  durationMs: number
  sampleIntervalMs: number
  frameRateHz: number
  lightOrder: SimLightOrder
  samples: SimSample[]
}
