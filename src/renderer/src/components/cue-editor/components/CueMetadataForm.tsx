import React from 'react';
import type {
  AudioNodeCueDefinition,
  NodeCueMode,
  NodeCueGroupMeta,
  YargNodeCueDefinition
} from '../../../../../photonics-dmx/cues/types/nodeCueTypes';
import type { CueType } from '../../../../../photonics-dmx/cues/types/cueTypes';

type Props = {
  filename: string;
  group: NodeCueGroupMeta | null;
  currentCue: YargNodeCueDefinition | AudioNodeCueDefinition | null;
  availableCueTypes: string[];
  activeMode: NodeCueMode;
  onFilenameChange: (value: string) => void;
  onGroupChange: (updates: Partial<NodeCueGroupMeta>) => void;
  onCueMetadataChange: (updates: Partial<YargNodeCueDefinition & AudioNodeCueDefinition>) => void;
};

const CueMetadataForm: React.FC<Props> = ({
  filename,
  group,
  currentCue,
  availableCueTypes,
  activeMode,
  onFilenameChange,
  onGroupChange,
  onCueMetadataChange
}) => (
  <div className="p-3 border-b border-gray-200 dark:border-gray-800 space-y-2">
    <div className="grid grid-cols-2 gap-3">
      <label className="flex flex-col text-xs font-medium">
        Filename
        <input
          className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
          value={filename}
          onChange={event => onFilenameChange(event.target.value)}
        />
      </label>
      <label className="flex flex-col text-xs font-medium">
        Group ID
        <input
          className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
          value={group?.id ?? ''}
          onChange={event => onGroupChange({ id: event.target.value })}
        />
      </label>
      <label className="flex flex-col text-xs font-medium">
        Group Name
        <input
          className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
          value={group?.name ?? ''}
          onChange={event => onGroupChange({ name: event.target.value })}
        />
      </label>
      <label className="flex flex-col text-xs font-medium">
        Group Description
        <input
          className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
          value={group?.description ?? ''}
          onChange={event => onGroupChange({ description: event.target.value })}
        />
      </label>
    </div>

    {currentCue && (
      <div className="grid grid-cols-2 gap-3 text-xs">
        <label className="flex flex-col font-medium">
          Cue Name
          <input
            className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
            value={currentCue.name}
            onChange={event => onCueMetadataChange({ name: event.target.value })}
          />
        </label>
        <label className="flex flex-col font-medium">
          Cue Description
          <input
            className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
            value={currentCue.description ?? ''}
            onChange={event => onCueMetadataChange({ description: event.target.value })}
          />
        </label>
        {activeMode === 'yarg' ? (
          <>
            <label className="flex flex-col font-medium">
              Cue Type
              <select
                className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                value={(currentCue as YargNodeCueDefinition).cueType}
                onChange={event => onCueMetadataChange({ cueType: event.target.value as CueType })}
              >
                {availableCueTypes.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col font-medium">
              Cue Style
              <select
                className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                value={(currentCue as YargNodeCueDefinition).style}
                onChange={event => onCueMetadataChange({ style: event.target.value as 'primary' | 'secondary' })}
              >
                <option value="primary">Primary</option>
                <option value="secondary">Secondary</option>
              </select>
            </label>
          </>
        ) : (
          <label className="flex flex-col font-medium">
            Cue Identifier
            <input
              className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
              value={(currentCue as AudioNodeCueDefinition).cueTypeId}
              onChange={event => onCueMetadataChange({ cueTypeId: event.target.value })}
            />
          </label>
        )}
      </div>
    )}
  </div>
);

export default CueMetadataForm;
