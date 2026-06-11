import type { VENUE_SIZES } from '../cues/types/cueTypes'

export type VenueSize = (typeof VENUE_SIZES)[number]

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
