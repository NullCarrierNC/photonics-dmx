import React, { useId } from 'react'
import { AUDIO_EVENT_EXECUTION_POLICIES } from '../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import type {
  NetEventNode,
  AudioEventExecutionPolicy,
  AudioEventNode,
  AudioEventType,
  AudioEventNodeUnion,
  AudioTriggerNode,
} from '../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import type { NodeCueMode } from '../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import type { NetEventType } from '../../../../../../photonics-dmx/types'
import {
  YARG_EVENT_OPTIONS_CATEGORIZED,
  RB3_EVENT_OPTIONS_CATEGORIZED,
  AUDIO_EVENT_OPTIONS,
} from '../../lib/options'
import AudioTriggerEditor, { AUDIO_TRIGGER_DEFAULTS } from './AudioTriggerEditor'
import {
  AUDIO_EVENT_EXECUTION_POLICY_DOCS,
  AUDIO_EVENT_PROPERTY_DOCS,
  AUDIO_EVENT_TYPE_DOCS,
  DOC_BLOCK_CLASS,
} from './eventNodeDocs'
import { unlistedIssue } from '../../../../../../photonics-dmx/cues/node/cueValueRules'
import FieldIssue, { issueAttributes } from '../shared/FieldIssue'
import { DraftNumberField } from '../../../controls/DraftField'

interface EventNodeEditorProps {
  node: NetEventNode | AudioEventNodeUnion
  activeMode: NodeCueMode
  updateYargNode: (updates: Partial<NetEventNode>) => void
  updateAudioNode: (updates: Partial<AudioEventNode | AudioTriggerNode>) => void
}

const EventNodeEditor: React.FC<EventNodeEditorProps> = ({
  node,
  activeMode,
  updateYargNode,
  updateAudioNode,
}) => {
  // RB3 nodes are YARG-shaped, so anything that isn't audio reads/writes the YARG event fields.
  const eventType =
    activeMode === 'audio'
      ? (node as AudioEventNodeUnion).eventType
      : (node as NetEventNode).eventType
  const isTrigger = activeMode === 'audio' && eventType === 'audio-trigger'
  const trigger = isTrigger ? (node as AudioTriggerNode) : null
  // Cue-called runs the graph on every audio frame and an edge on every trigger, so both take a
  // policy for a graph still running from the last one.
  const audioEvent = node as AudioEventNode
  const runsGraph =
    eventType === 'cue-called' ||
    (eventType !== 'cue-started' && audioEvent.triggerMode !== 'level')
  const executionPolicy = audioEvent.executionPolicy ?? 'continuous'
  const eventTypeIssueId = useId()
  const offeredEventTypes =
    activeMode === 'audio'
      ? AUDIO_EVENT_OPTIONS.map((option) => option.value)
      : (activeMode === 'rb3' ? RB3_EVENT_OPTIONS_CATEGORIZED : YARG_EVENT_OPTIONS_CATEGORIZED)
          .flatMap((category) => category.events)
          .map((event) => event.value)
  const eventTypeIssue = unlistedIssue(eventType, offeredEventTypes)

  return (
    <div className="space-y-2 text-xs">
      <label className="flex flex-col font-medium">
        Event Type
        <select
          aria-label="Event Type"
          className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
          value={eventType}
          {...issueAttributes(eventTypeIssue, eventTypeIssueId)}
          onChange={(event) => {
            if (activeMode !== 'audio') {
              updateYargNode({ eventType: event.target.value as NetEventType })
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
          {eventTypeIssue && (
            <option value={eventType} disabled>
              {eventType}
            </option>
          )}
          {activeMode === 'audio'
            ? AUDIO_EVENT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))
            : (activeMode === 'rb3'
                ? RB3_EVENT_OPTIONS_CATEGORIZED
                : YARG_EVENT_OPTIONS_CATEGORIZED
              ).map((category) => (
                <optgroup key={category.category} label={category.category}>
                  {category.events.map((event) => (
                    <option key={event.value} value={event.value}>
                      {event.label}
                    </option>
                  ))}
                </optgroup>
              ))}
        </select>
        <FieldIssue issue={eventTypeIssue} id={eventTypeIssueId} />
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
      {activeMode !== 'audio' && /^led-[1-8]$/.test(eventType) && (
        <div className="space-y-1">
          <label className="flex items-center gap-2 font-medium cursor-pointer">
            <input
              type="checkbox"
              checked={(node as NetEventNode).triggerOnColorChange ?? false}
              onChange={(e) => updateYargNode({ triggerOnColorChange: e.target.checked })}
              className="rounded"
            />
            Trigger on colour change
          </label>
          <p className="text-[10px] text-gray-500 dark:text-gray-400">
            Also fire while this LED stays lit but its colour changes, not just on the on-edge.
            Useful for lighting that holds every LED on and only swaps colours.
          </p>
        </div>
      )}
      {activeMode === 'audio' && isTrigger && trigger && (
        <AudioTriggerEditor trigger={trigger} updateAudioNode={updateAudioNode} />
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
              step={0.01}
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
            <DraftNumberField
              aria-label="Cooldown (ms)"
              min={0}
              step={10}
              // A time in ms keeps the fraction the author types.
              decimals={3}
              className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
              value={(node as AudioEventNode).cooldownMs ?? 0}
              onCommit={(cooldownMs) => updateAudioNode({ cooldownMs })}
            />
            <div className={DOC_BLOCK_CLASS}>
              Minimum time (ms) before this event can fire again after a trigger. 0 = no limit.
              <span className="mt-0.5 block font-medium text-gray-700 dark:text-gray-300">
                Best used for: Smoothing out noisy peaks in energy, HFC, or centroid events.
              </span>
            </div>
          </label>
          {runsGraph && (
            <label className="flex flex-col font-medium">
              While running
              <select
                className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                value={executionPolicy}
                onChange={(event) =>
                  updateAudioNode({
                    executionPolicy: event.target.value as AudioEventExecutionPolicy,
                  })
                }>
                {AUDIO_EVENT_EXECUTION_POLICIES.map((policy) => (
                  <option key={policy} value={policy}>
                    {AUDIO_EVENT_EXECUTION_POLICY_DOCS[policy].label}
                  </option>
                ))}
              </select>
              <div className={DOC_BLOCK_CLASS}>
                What happens when this event fires again before the graph it started has finished.{' '}
                {AUDIO_EVENT_EXECUTION_POLICY_DOCS[executionPolicy].description}
              </div>
            </label>
          )}
        </>
      )}
    </div>
  )
}

export default EventNodeEditor
