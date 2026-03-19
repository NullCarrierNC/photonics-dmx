import React from 'react'
import type {
  YargEventNode,
  AudioEventNode,
  AudioEventType,
  AudioEventNodeUnion,
  AudioTriggerNode,
  AudioTriggerBalance,
} from '../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import type { NodeCueMode } from '../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import type { YargEventType } from '../../../../../../photonics-dmx/types'
import { YARG_EVENT_OPTIONS_CATEGORIZED, AUDIO_EVENT_OPTIONS } from '../../lib/options'

const AUDIO_TRIGGER_BALANCE_OPTIONS: { value: AudioTriggerBalance; label: string }[] = [
  { value: 'left', label: 'Left' },
  { value: 'stereo', label: 'Stereo' },
  { value: 'right', label: 'Right' },
]

const DEFAULT_TRIGGER_COLOR = '#60a5fa'

const AUDIO_TRIGGER_DEFAULTS: Omit<AudioTriggerNode, 'id' | 'type'> = {
  eventType: 'audio-trigger',
  frequencyRange: { minHz: 120, maxHz: 500 },
  sensitivity: 0.5,
  balance: 'stereo',
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
          </label>
          <label className="flex flex-col font-medium">
            Frequency range (Hz)
            <div className="mt-1 flex gap-1">
              <input
                type="number"
                min={120}
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
                min={120}
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
          </label>
          <label className="flex flex-col font-medium">
            Sensitivity
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              className="mt-1"
              value={trigger.sensitivity ?? 0.5}
              onChange={(e) => updateAudioNode({ sensitivity: Number(e.target.value) })}
            />
            <span className="text-[10px] text-gray-500 dark:text-gray-400">
              {(trigger.sensitivity ?? 0.5).toFixed(2)}
            </span>
          </label>
          <label className="flex flex-col font-medium">
            Balance
            <select
              className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
              value={trigger.balance ?? 'stereo'}
              onChange={(e) => updateAudioNode({ balance: e.target.value as AudioTriggerBalance })}>
              {AUDIO_TRIGGER_BALANCE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
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
          </label>
        </>
      )}
      {activeMode === 'audio' && !isTrigger && (
        <>
          <label className="flex flex-col font-medium">
            Threshold
            <input
              type="number"
              min={0}
              max={1}
              step={0.05}
              className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
              value={(node as AudioEventNode).threshold ?? 0.5}
              onChange={(event) => updateAudioNode({ threshold: Number(event.target.value) })}
            />
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
          </label>
        </>
      )}
    </div>
  )
}

export default EventNodeEditor
