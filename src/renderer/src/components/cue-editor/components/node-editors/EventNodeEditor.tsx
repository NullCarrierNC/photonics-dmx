import React from 'react'
import type {
  YargEventNode,
  AudioEventNode,
  AudioEventType,
  AudioEventNodeUnion,
  AudioTriggerNode,
} from '../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import type { NodeCueMode } from '../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import type { YargEventType } from '../../../../../../photonics-dmx/types'
import { YARG_EVENT_OPTIONS_CATEGORIZED, AUDIO_EVENT_OPTIONS } from '../../lib/options'

/** Documentation for each audio event type: what it does and when to use it. */
const AUDIO_EVENT_TYPE_DOCS: Record<AudioEventType, { description: string; bestUsedFor: string }> =
  {
    'none': {
      description: 'No event (placeholder or action timing only).',
      bestUsedFor: 'Action wait conditions; not used as a graph entry point.',
    },
    'delay': {
      description: 'Time-based delay (used for action timing).',
      bestUsedFor: 'Action wait conditions; not used as a graph entry point.',
    },
    'audio-beat': {
      description: 'Fires when the in-app beat detector detects a beat (onset + tempo gating).',
      bestUsedFor: 'Kick/snare-style triggers, BPM-locked effects, and general rhythm response.',
    },
    'audio-energy': {
      description:
        'Overall energy level (0–1) of the audio. Use threshold and edge/level mode to gate or scale.',
      bestUsedFor:
        'Volume-reactive intensity, gates that open when the room gets loud, or level-based fading.',
    },
    'audio-trigger': {
      description:
        'Band trigger: fires when energy in a configurable frequency range exceeds the threshold (power level 0–1). Has enter, during, and exit phases.',
      bestUsedFor:
        'Reacting to specific instruments or frequency bands (e.g. bass, vocals, hi-hat) without affecting the rest of the mix.',
    },
    'audio-centroid': {
      description:
        'Spectral centroid (0–1): perceived brightness of the sound. Higher = more high-frequency content.',
      bestUsedFor:
        'Mapping brightness to colour temperature or intensity; “brighter” sounds drive cooler or stronger looks.',
    },
    'audio-flatness': {
      description:
        'Spectral flatness (0–1): noise-like (1) vs tonal (0). Tonal = pitched; flat = noise or unpitched.',
      bestUsedFor:
        'Differentiating vocals/instruments from noise or percussion; texture-based colour or intensity changes.',
    },
    'audio-hfc': {
      description:
        'High-frequency content (0–1): weighted emphasis on higher bins. Strong on transients and cymbals.',
      bestUsedFor:
        'Hi-hat/cymbal hits, percussion accents, and transient-heavy material without triggering on every beat.',
    },
  }

/** Documentation for non-trigger audio event properties (threshold, trigger mode). */
const AUDIO_EVENT_PROPERTY_DOCS = {
  threshold: {
    description:
      'Value (0–1) that the event source is compared against. In edge mode the event fires when the value crosses above this; in level mode the output is active while the value is at or above it.',
    bestUsedFor:
      'Tune to avoid false triggers (raise) or to catch quieter hits (lower). Start around 0.4–0.6 and adjust to the room.',
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
const AUDIO_TRIGGER_PROPERTY_DOCS = {
  label: {
    description: 'Display name shown on the trigger node in the canvas.',
    bestUsedFor: 'Identifying triggers at a glance (e.g. “Bass”, “Vocals”, “Hi-hat”).',
  },
  frequencyRange: {
    description:
      'Min and max frequency (Hz) defining the band. Energy is summed only in this range (20–20000 Hz).',
    bestUsedFor:
      'Targeting instruments: e.g. 80–250 bass, 250–2000 vocals, 2000–8000 hi-hat/cymbals.',
  },
  threshold: {
    description:
      'Power level (0–1) the band energy must exceed to trigger. Higher = needs more energy to fire. Matches the Audio Preview EQ bar scale.',
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
  color: {
    description: 'Colour used for the trigger node on the canvas (visual only).',
    bestUsedFor: 'Quickly telling triggers apart by band or purpose.',
  },
} as const

const DOC_BLOCK_CLASS =
  'mt-1 mb-2.5 rounded border border-gray-200 bg-gray-50 px-2 py-1 text-[10px] text-gray-600 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-400'

const DEFAULT_TRIGGER_COLOR = '#60a5fa'

const AUDIO_TRIGGER_DEFAULTS: Omit<AudioTriggerNode, 'id' | 'type'> = {
  eventType: 'audio-trigger',
  frequencyRange: { minHz: 120, maxHz: 500 },
  threshold: 0.5,
  hysteresis: 0.05,
  holdMs: 0,
  color: DEFAULT_TRIGGER_COLOR,
  nodeLabel: 'Audio Trigger',
  outputs: ['enter', 'during', 'exit'],
}

interface EventNodeEditorProps {
  node: YargEventNode | AudioEventNodeUnion
  activeMode: NodeCueMode
  updateYargNode: (updates: Partial<YargEventNode>) => void
  updateAudioNode: (updates: Partial<AudioEventNode | AudioTriggerNode>) => void
}

const EventNodeEditor: React.FC<EventNodeEditorProps> = ({
  node,
  activeMode,
  updateYargNode,
  updateAudioNode,
}) => {
  const eventType =
    activeMode === 'yarg'
      ? (node as YargEventNode).eventType
      : (node as AudioEventNodeUnion).eventType
  const isTrigger = activeMode === 'audio' && eventType === 'audio-trigger'
  const trigger = isTrigger ? (node as AudioTriggerNode) : null

  return (
    <div className="space-y-2 text-xs">
      <label className="flex flex-col font-medium">
        Event Type
        <select
          className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
          value={eventType}
          onChange={(event) => {
            if (activeMode === 'yarg') {
              updateYargNode({ eventType: event.target.value as YargEventType })
            } else {
              const newType = event.target.value as AudioEventType
              if (newType === 'audio-trigger') {
                updateAudioNode({
                  ...AUDIO_TRIGGER_DEFAULTS,
                  eventType: 'audio-trigger',
                })
              } else {
                updateAudioNode({
                  threshold: 0.5,
                  triggerMode: 'edge',
                  eventType: newType,
                })
              }
            }
          }}>
          {activeMode === 'yarg'
            ? YARG_EVENT_OPTIONS_CATEGORIZED.map((category) => (
                <optgroup key={category.category} label={category.category}>
                  {category.events.map((event) => (
                    <option key={event.value} value={event.value}>
                      {event.label}
                    </option>
                  ))}
                </optgroup>
              ))
            : AUDIO_EVENT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
        </select>
        {activeMode === 'audio' && AUDIO_EVENT_TYPE_DOCS[eventType as AudioEventType] && (
          <div className="mt-1.5 mb-2.5 rounded border border-gray-200 bg-gray-50 px-2 py-1.5 text-[10px] text-gray-600 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-400">
            <p className="font-medium text-gray-700 dark:text-gray-300">What it does</p>
            <p className="mt-0.5">
              {AUDIO_EVENT_TYPE_DOCS[eventType as AudioEventType].description}
            </p>
            <p className="mt-1 font-medium text-gray-700 dark:text-gray-300">Best used for</p>
            <p className="mt-0.5">
              {AUDIO_EVENT_TYPE_DOCS[eventType as AudioEventType].bestUsedFor}
            </p>
          </div>
        )}
      </label>
      {activeMode === 'audio' && isTrigger && trigger && (
        <>
          <label className="flex flex-col font-medium">
            Label
            <input
              type="text"
              className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
              value={trigger.nodeLabel ?? ''}
              onChange={(e) => updateAudioNode({ nodeLabel: e.target.value })}
              placeholder="Audio Trigger"
            />
            <div className={DOC_BLOCK_CLASS}>
              {AUDIO_TRIGGER_PROPERTY_DOCS.label.description}
              <span className="mt-0.5 block font-medium text-gray-700 dark:text-gray-300">
                Best used for: {AUDIO_TRIGGER_PROPERTY_DOCS.label.bestUsedFor}
              </span>
            </div>
          </label>
          <label className="flex flex-col font-medium">
            Frequency range (Hz)
            <div className="mt-1 flex gap-1">
              <input
                type="number"
                min={20}
                max={20000}
                step={10}
                className="w-full rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                value={trigger.frequencyRange?.minHz ?? 120}
                onChange={(e) =>
                  updateAudioNode({
                    frequencyRange: {
                      ...trigger.frequencyRange,
                      minHz: Number(e.target.value),
                      maxHz: trigger.frequencyRange?.maxHz ?? 500,
                    },
                  })
                }
              />
              <span className="self-center">–</span>
              <input
                type="number"
                min={20}
                max={20000}
                step={10}
                className="w-full rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                value={trigger.frequencyRange?.maxHz ?? 500}
                onChange={(e) =>
                  updateAudioNode({
                    frequencyRange: {
                      ...trigger.frequencyRange,
                      minHz: trigger.frequencyRange?.minHz ?? 120,
                      maxHz: Number(e.target.value),
                    },
                  })
                }
              />
            </div>
            <div className={DOC_BLOCK_CLASS}>
              {AUDIO_TRIGGER_PROPERTY_DOCS.frequencyRange.description}
              <span className="mt-0.5 block font-medium text-gray-700 dark:text-gray-300">
                Best used for: {AUDIO_TRIGGER_PROPERTY_DOCS.frequencyRange.bestUsedFor}
              </span>
            </div>
          </label>
          <label className="flex flex-col font-medium">
            Threshold
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              className="mt-1"
              value={trigger.threshold ?? 0.5}
              onChange={(e) => updateAudioNode({ threshold: Number(e.target.value) })}
            />
            <span className="text-[10px] text-gray-500 dark:text-gray-400">
              {(trigger.threshold ?? 0.5).toFixed(2)}
            </span>
            <div className={DOC_BLOCK_CLASS}>
              {AUDIO_TRIGGER_PROPERTY_DOCS.threshold.description}
              <span className="mt-0.5 block font-medium text-gray-700 dark:text-gray-300">
                Best used for: {AUDIO_TRIGGER_PROPERTY_DOCS.threshold.bestUsedFor}
              </span>
            </div>
          </label>
          <label className="flex flex-col font-medium">
            Hysteresis
            <input
              type="range"
              min={0}
              max={0.5}
              step={0.01}
              className="mt-1"
              value={trigger.hysteresis ?? 0}
              onChange={(e) => updateAudioNode({ hysteresis: Number(e.target.value) })}
            />
            <span className="text-[10px] text-gray-500 dark:text-gray-400">
              {(trigger.hysteresis ?? 0).toFixed(2)}
            </span>
            <div className={DOC_BLOCK_CLASS}>
              {AUDIO_TRIGGER_PROPERTY_DOCS.hysteresis.description}
              <span className="mt-0.5 block font-medium text-gray-700 dark:text-gray-300">
                Best used for: {AUDIO_TRIGGER_PROPERTY_DOCS.hysteresis.bestUsedFor}
              </span>
            </div>
          </label>
          <label className="flex flex-col font-medium">
            Hold time (ms)
            <input
              type="number"
              min={0}
              step={10}
              className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
              value={trigger.holdMs ?? 0}
              onChange={(e) =>
                updateAudioNode({ holdMs: Math.max(0, Number(e.target.value) || 0) })
              }
            />
            <div className={DOC_BLOCK_CLASS}>
              {AUDIO_TRIGGER_PROPERTY_DOCS.holdMs.description}
              <span className="mt-0.5 block font-medium text-gray-700 dark:text-gray-300">
                Best used for: {AUDIO_TRIGGER_PROPERTY_DOCS.holdMs.bestUsedFor}
              </span>
            </div>
          </label>
          <label className="flex flex-col font-medium">
            Colour
            <div className="mt-1 flex items-center gap-2">
              <input
                type="color"
                className="h-8 w-12 cursor-pointer rounded border border-gray-300 dark:border-gray-600"
                value={trigger.color ?? DEFAULT_TRIGGER_COLOR}
                onChange={(e) => updateAudioNode({ color: e.target.value })}
              />
              <input
                type="text"
                className="flex-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700 font-mono text-[10px]"
                value={trigger.color ?? DEFAULT_TRIGGER_COLOR}
                onChange={(e) => updateAudioNode({ color: e.target.value })}
              />
            </div>
            <div className={DOC_BLOCK_CLASS}>
              {AUDIO_TRIGGER_PROPERTY_DOCS.color.description}
              <span className="mt-0.5 block font-medium text-gray-700 dark:text-gray-300">
                Best used for: {AUDIO_TRIGGER_PROPERTY_DOCS.color.bestUsedFor}
              </span>
            </div>
          </label>
        </>
      )}
      {activeMode === 'audio' && !isTrigger && (
        <>
          <label className="flex flex-col font-medium">
            Label
            <input
              type="text"
              className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
              value={(node as AudioEventNode).label ?? ''}
              onChange={(e) => updateAudioNode({ label: e.target.value || undefined })}
              placeholder="e.g. Kick, Brightness"
            />
            <div className={DOC_BLOCK_CLASS}>
              Display name shown on the event node in the canvas.
              <span className="mt-0.5 block font-medium text-gray-700 dark:text-gray-300">
                Best used for: Identifying events at a glance when you have multiple of the same
                type.
              </span>
            </div>
          </label>
          <label className="flex flex-col font-medium">
            Threshold
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              className="mt-1"
              value={(node as AudioEventNode).threshold ?? 0.5}
              onChange={(e) => updateAudioNode({ threshold: Number(e.target.value) })}
            />
            <span className="text-[10px] text-gray-500 dark:text-gray-400">
              {((node as AudioEventNode).threshold ?? 0.5).toFixed(2)}
            </span>
            <div className={DOC_BLOCK_CLASS}>
              {AUDIO_EVENT_PROPERTY_DOCS.threshold.description}
              <span className="mt-0.5 block font-medium text-gray-700 dark:text-gray-300">
                Best used for: {AUDIO_EVENT_PROPERTY_DOCS.threshold.bestUsedFor}
              </span>
            </div>
          </label>
          <label className="flex flex-col font-medium">
            Trigger Mode
            <select
              className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
              value={(node as AudioEventNode).triggerMode}
              onChange={(event) =>
                updateAudioNode({
                  triggerMode: event.target.value as 'edge' | 'level',
                })
              }>
              <option value="edge">Edge</option>
              <option value="level">Level</option>
            </select>
            <div className={DOC_BLOCK_CLASS}>
              {(node as AudioEventNode).triggerMode === 'level'
                ? AUDIO_EVENT_PROPERTY_DOCS.triggerMode.level.description
                : AUDIO_EVENT_PROPERTY_DOCS.triggerMode.edge.description}
              <span className="mt-0.5 block font-medium text-gray-700 dark:text-gray-300">
                Best used for:{' '}
                {(node as AudioEventNode).triggerMode === 'level'
                  ? AUDIO_EVENT_PROPERTY_DOCS.triggerMode.level.bestUsedFor
                  : AUDIO_EVENT_PROPERTY_DOCS.triggerMode.edge.bestUsedFor}
              </span>
            </div>
          </label>
          <label className="flex flex-col font-medium">
            Cooldown (ms)
            <input
              type="number"
              min={0}
              step={10}
              className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
              value={(node as AudioEventNode).cooldownMs ?? 0}
              onChange={(e) =>
                updateAudioNode({ cooldownMs: Math.max(0, Number(e.target.value) || 0) })
              }
            />
            <div className={DOC_BLOCK_CLASS}>
              Minimum time (ms) before this event can fire again after a trigger. 0 = no limit.
              <span className="mt-0.5 block font-medium text-gray-700 dark:text-gray-300">
                Best used for: Smoothing out noisy peaks in energy, HFC, or centroid events.
              </span>
            </div>
          </label>
        </>
      )}
    </div>
  )
}

export default EventNodeEditor
