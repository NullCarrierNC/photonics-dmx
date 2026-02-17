import React from 'react';
import type { CueDataLogicNode, ConfigDataProperty } from '../../../../../../../photonics-dmx/cues/types/nodeCueTypes';
import type { NodeCueMode } from '../../../../../../../photonics-dmx/cues/types/nodeCueTypes';
import type { LogicEditorCommonProps } from './LogicNodeEditorShared';

export interface CueDataLogicEditorProps extends LogicEditorCommonProps {
  node: CueDataLogicNode;
  activeMode: NodeCueMode;
}

const CueDataLogicEditor: React.FC<CueDataLogicEditorProps> = ({
  node,
  activeMode,
  availableVariables,
  updateNode
}) => {
  const cueDataProperties = activeMode === 'yarg' ? [
    { id: 'cue-name', label: 'Cue Name', type: 'string' },
    { id: 'cue-type', label: 'Cue Type', type: 'string' },
    { id: 'previous-cue', label: 'Previous Cue', type: 'cue-type' },
    { id: 'execution-count', label: 'Execution Count', type: 'number' },
    { id: 'bpm', label: 'BPM', type: 'number' },
    { id: 'beat-duration-ms', label: 'Beat Duration (ms)', type: 'number' },
    { id: 'song-section', label: 'Song Section', type: 'string' },
    { id: 'current-scene', label: 'Current Scene', type: 'string' },
    { id: 'beat-type', label: 'Beat Type', type: 'string' },
    { id: 'keyframe', label: 'Keyframe', type: 'string' },
    { id: 'venue-size', label: 'Venue Size', type: 'string' },
    { id: 'guitar-note-count', label: 'Guitar Note Count', type: 'number' },
    { id: 'bass-note-count', label: 'Bass Note Count', type: 'number' },
    { id: 'drum-note-count', label: 'Drum Note Count', type: 'number' },
    { id: 'keys-note-count', label: 'Keys Note Count', type: 'number' },
    { id: 'total-score', label: 'Total Score', type: 'number' },
    { id: 'performer', label: 'Performer', type: 'number' },
    { id: 'bonus-effect', label: 'Bonus Effect', type: 'boolean' },
    { id: 'fog-state', label: 'Fog State', type: 'boolean' },
    { id: 'time-since-cue-start', label: 'Time Since Cue Start', type: 'number' },
    { id: 'time-since-last-cue', label: 'Time Since Last Cue', type: 'number' }
  ] : [
    { id: 'cue-name', label: 'Cue Name', type: 'string' },
    { id: 'cue-type-id', label: 'Cue Type ID', type: 'string' },
    { id: 'execution-count', label: 'Execution Count', type: 'number' },
    { id: 'timestamp', label: 'Timestamp', type: 'number' },
    { id: 'overall-level', label: 'Overall Audio Level', type: 'number' },
    { id: 'bpm', label: 'BPM', type: 'number' },
    { id: 'beat-detected', label: 'Beat Detected', type: 'boolean' },
    { id: 'energy', label: 'Energy', type: 'number' },
    { id: 'freq-range1', label: 'Frequency Range 1', type: 'number' },
    { id: 'freq-range2', label: 'Frequency Range 2', type: 'number' },
    { id: 'freq-range3', label: 'Frequency Range 3', type: 'number' },
    { id: 'freq-range4', label: 'Frequency Range 4', type: 'number' },
    { id: 'freq-range5', label: 'Frequency Range 5', type: 'number' },
    { id: 'enabled-band-count', label: 'Enabled Band Count', type: 'number' }
  ];

  return (
    <div className="space-y-2 text-xs">
      <label className="flex flex-col font-medium">
        Data Property
        <select
          className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
          value={node.dataProperty ?? ''}
          onChange={event => updateNode({ dataProperty: event.target.value as ConfigDataProperty || undefined })}
        >
          <option value="">-- Select Property --</option>
          {cueDataProperties.map(prop => (
            <option key={prop.id} value={prop.id}>
              {prop.label} ({prop.type})
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col font-medium">
        Assign To Variable (optional)
        <select
          className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
          value={node.assignTo ?? ''}
          onChange={event => updateNode({ assignTo: event.target.value || undefined })}
        >
          <option value="">-- None --</option>
          {availableVariables.map(v => (
            <option key={v.name} value={v.name}>
              {v.name} ({v.type}, {v.scope})
            </option>
          ))}
        </select>
      </label>
    </div>
  );
};

export default CueDataLogicEditor;
