/**
 * Author-facing documentation for the audio event types and their properties, and the shared
 * class the editors render it with.
 */
import type { AudioEventType } from '../../../../../../photonics-dmx/cues/types/nodeCueTypes'

/** Documentation for each audio event type: what it does and when to use it. */
export const AUDIO_EVENT_TYPE_DOCS: Record<
  AudioEventType,
  { description: string; bestUsedFor: string }
> = {
  'none': {
    description: 'No event (placeholder or action timing only).',
    bestUsedFor: 'Action wait conditions; not used as a graph entry point.',
  },
  'delay': {
    description: 'Time-based delay (used for action timing).',
    bestUsedFor: 'Action wait conditions; not used as a graph entry point.',
  },
  'cue-started': {
    description:
      'Runs once when the cue becomes active (first audio execute). Use for setup; not amplitude-driven.',
    bestUsedFor:
      'One-time initialization: config-data, math offsets, and variables before beat-driven effect raisers.',
  },
  'cue-called': {
    description:
      'Runs on every audio execute while the cue is active (same cadence as the audio processor).',
    bestUsedFor:
      'Sustain or re-apply effects each frame (e.g. hold set-position until the next beat when paired with waitUntil beat).',
  },
  'beat': {
    description: 'Fires when the in-app beat detector detects a beat (onset + tempo gating).',
    bestUsedFor: 'Kick/snare-style triggers, BPM-locked effects, and general rhythm response.',
  },
  'audio-energy': {
    description:
      'Overall energy level (0-1) of the audio. Use threshold and edge/level mode to gate or scale.',
    bestUsedFor:
      'Volume-reactive intensity, gates that open when the room gets loud, or level-based fading.',
  },
  'audio-trigger': {
    description:
      'Band trigger: fires when energy in a configurable frequency range exceeds the threshold (power level 0-1). Has enter, during, and exit phases.',
    bestUsedFor:
      'Reacting to specific instruments or frequency bands (e.g. bass, vocals, hi-hat) without affecting the rest of the mix.',
  },
  'audio-centroid': {
    description:
      'Spectral centroid (0-1): perceived brightness of the sound. Higher = more high-frequency content.',
    bestUsedFor:
      'Mapping brightness to colour temperature or intensity; “brighter” sounds drive cooler or stronger looks.',
  },
  'audio-flatness': {
    description:
      'Spectral flatness (0-1): noise-like (1) vs tonal (0). Tonal = pitched; flat = noise or unpitched.',
    bestUsedFor:
      'Differentiating vocals/instruments from noise or percussion; texture-based colour or intensity changes.',
  },
  'audio-hfc': {
    description:
      'High-frequency content (0-1): weighted emphasis on higher bins. Strong on transients and cymbals.',
    bestUsedFor:
      'Hi-hat/cymbal hits, percussion accents, and transient-heavy material without triggering on every beat.',
  },
}

/** Documentation for non-trigger audio event properties (threshold, trigger mode). */
export const AUDIO_EVENT_PROPERTY_DOCS = {
  threshold: {
    description:
      'Value (0-1) that the event source is compared against. In edge mode the event fires when the value crosses above this; in level mode the output is active while the value is at or above it.',
    bestUsedFor:
      'Tune to avoid false triggers (raise) or to catch quieter hits (lower). Start around 0.4-0.6 and adjust to the room.',
  },
  triggerMode: {
    edge: {
      description: 'Fires once when the value crosses above the threshold (rising edge).',
      bestUsedFor: 'Discrete hits: beats, kicks, claps. One trigger per peak.',
    },
    level: {
      description:
        'Output is active while the value is at or above the threshold; intensity can scale with how far above the threshold.',
      bestUsedFor:
        'Continuous response: hold effects while loud, or scale effect strength with level.',
    },
  },
} as const

/** Documentation for audio-trigger node properties. */
export const AUDIO_TRIGGER_PROPERTY_DOCS = {
  label: {
    description: 'Display name shown on the trigger node in the canvas.',
    bestUsedFor: 'Identifying triggers at a glance (e.g. “Bass”, “Vocals”, “Hi-hat”).',
  },
  frequencyRange: {
    description:
      'Min and max frequency (Hz) defining the band. Energy is summed only in this range (20-20000 Hz).',
    bestUsedFor:
      'Targeting instruments: e.g. 80-250 bass, 250-2000 vocals, 2000-8000 hi-hat/cymbals.',
  },
  threshold: {
    description:
      'Power level (0-1) the band energy must exceed to trigger. Higher = needs more energy to fire. Matches the Audio Preview EQ bar scale.',
    bestUsedFor:
      'Reduce false triggers by raising; catch quieter parts of the mix by lowering. Align with the EQ bar for the same band (e.g. 50% = fires when bar passes 50%).',
  },
  hysteresis: {
    description:
      'Release margin below threshold. Trigger deactivates when energy drops below (threshold − hysteresis). Prevents chatter.',
    bestUsedFor: 'Stopping rapid enter/exit when the signal hovers near the threshold.',
  },
  holdMs: {
    description: 'Minimum time (ms) the trigger stays active after entering. 0 = no minimum hold.',
    bestUsedFor: 'Avoiding flicker from very short transients.',
  },
  smoothing: {
    description:
      'Band energy smoothing (0-1). 0 = raw/immediate response; 1 = maximum smoothing (slow, analogue-style response). Ignored when Attack/Release are set.',
    bestUsedFor:
      'Vintage light organ look: raise; beat detection or strobes: lower. Uses higher values for smoother, less flickery brightness.',
  },
  attackMs: {
    description:
      'Rising-edge time constant (ms). Smaller = snappier fade-up. Setting Attack or Release switches to asymmetric (fast-up/slow-down) smoothing and overrides Smoothing.',
    bestUsedFor: 'Asymetric fade in vs. fade out. Eg. Light-organ with quick in, but longer out.',
  },
  releaseMs: {
    description:
      'Falling-edge time constant (ms). Larger = slower fade-down. Setting Attack or Release switches to asymmetric (fast-up/slow-down) smoothing and overrides Smoothing.',
    bestUsedFor: 'Asymetric fade out vs. fade in. Eg. Light-organ with quick in, but longer out.',
  },
  color: {
    description: 'Colour used for the trigger node on the canvas (visual only).',
    bestUsedFor: 'Quickly telling triggers apart by band or purpose.',
  },
} as const

export const DOC_BLOCK_CLASS =
  'mt-1 mb-2.5 rounded border border-gray-200 bg-gray-50 px-2 py-1 text-[10px] text-gray-600 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-400'
