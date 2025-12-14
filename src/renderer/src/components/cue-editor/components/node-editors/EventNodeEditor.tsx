import React from 'react';
import type { YargEventNode, AudioEventNode, AudioEventType } from '../../../../../../photonics-dmx/cues/types/nodeCueTypes';
import type { NodeCueMode } from '../../../../../../photonics-dmx/cues/types/nodeCueTypes';
import type { WaitCondition } from '../../../../../../photonics-dmx/types';
import { YARG_EVENT_OPTIONS, AUDIO_EVENT_OPTIONS } from '../../lib/options';

interface EventNodeEditorProps {
  node: YargEventNode | AudioEventNode;
  activeMode: NodeCueMode;
  updateYargNode: (updates: Partial<YargEventNode>) => void;
  updateAudioNode: (updates: Partial<AudioEventNode>) => void;
}

const EventNodeEditor: React.FC<EventNodeEditorProps> = ({
  node,
  activeMode,
  updateYargNode,
  updateAudioNode
}) => {
  const eventOptions = activeMode === 'yarg' ? YARG_EVENT_OPTIONS : AUDIO_EVENT_OPTIONS;
  const eventType = activeMode === 'yarg' 
    ? (node as YargEventNode).eventType 
    : (node as AudioEventNode).eventType;

  return (
    <div className="space-y-2 text-xs">
      <label className="flex flex-col font-medium">
        Event Type
        <select
          className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
          value={eventType}
          onChange={event => {
            if (activeMode === 'yarg') {
              updateYargNode({ eventType: event.target.value as WaitCondition });
            } else {
              updateAudioNode({ eventType: event.target.value as AudioEventType });
            }
          }}
        >
          {eventOptions.map(option => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
      {activeMode === 'audio' && (
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
              onChange={event => updateAudioNode({ threshold: Number(event.target.value) })}
            />
          </label>
          <label className="flex flex-col font-medium">
            Trigger Mode
            <select
              className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
              value={(node as AudioEventNode).triggerMode}
              onChange={event => updateAudioNode({
                triggerMode: event.target.value as 'edge' | 'level'
              })}
            >
              <option value="edge">Edge</option>
              <option value="level">Level</option>
            </select>
          </label>
        </>
      )}
    </div>
  );
};

export default EventNodeEditor;
