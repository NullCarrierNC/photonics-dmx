import React from 'react';
import type {
  AudioNodeCueDefinition,
  NodeCueMode,
  NodeCueGroupMeta,
  YargNodeCueDefinition,
  YargEffectDefinition,
  AudioEffectDefinition,
  EffectGroupMeta
} from '../../../../../photonics-dmx/cues/types/nodeCueTypes';
import type { CueType } from '../../../../../photonics-dmx/cues/types/cueTypes';
import type { EditorMode } from '../lib/types';

type Props = {
  filename: string;
  group: NodeCueGroupMeta | EffectGroupMeta | null;
  currentCue: YargNodeCueDefinition | AudioNodeCueDefinition | null;
  currentEffect?: YargEffectDefinition | AudioEffectDefinition | null;
  availableCueTypes: string[];
  activeMode: NodeCueMode;
  editorMode: EditorMode;
  onGroupChange: (updates: Partial<NodeCueGroupMeta | EffectGroupMeta>) => void;
  onCueMetadataChange: (updates: Partial<YargNodeCueDefinition & AudioNodeCueDefinition>) => void;
  onEffectMetadataChange?: (updates: Partial<YargEffectDefinition> & Partial<AudioEffectDefinition>) => void;
};

const CueMetadataForm: React.FC<Props> = ({
  filename,
  group,
  currentCue,
  currentEffect,
  availableCueTypes,
  activeMode,
  editorMode,
  onGroupChange,
  onCueMetadataChange,
  onEffectMetadataChange
}) => {
  const isEffectMode = editorMode === 'effect';
  const itemLabel = isEffectMode ? 'Effect' : 'Cue';
  const currentItem = isEffectMode ? currentEffect : currentCue;
  
  return (
    <div className="p-3 border-b border-gray-200 dark:border-gray-800 space-y-2">
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col text-xs font-medium">
          Filename
          <input
            className="mt-1 rounded border px-2 py-1 bg-gray-100 dark:bg-gray-700 dark:border-gray-600 text-gray-600 dark:text-gray-400 cursor-not-allowed"
            value={filename}
            readOnly
            title="Filename is set when creating the file and cannot be changed"
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

      {currentItem && (
        <div className="grid grid-cols-2 gap-3 text-xs">
          <label className="flex flex-col font-medium">
            {itemLabel} Name
            <input
              className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
              value={currentItem.name}
              onChange={event => {
                if (isEffectMode && onEffectMetadataChange) {
                  onEffectMetadataChange({ name: event.target.value });
                } else {
                  onCueMetadataChange({ name: event.target.value });
                }
              }}
            />
          </label>
          <label className="flex flex-col font-medium">
            {itemLabel} Description
            <input
              className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
              value={currentItem.description ?? ''}
              onChange={event => {
                if (isEffectMode && onEffectMetadataChange) {
                  onEffectMetadataChange({ description: event.target.value });
                } else {
                  onCueMetadataChange({ description: event.target.value });
                }
              }}
            />
          </label>
          {!isEffectMode && activeMode === 'yarg' && (
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
          )}
          {!isEffectMode && activeMode === 'audio' && (
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
};

export default CueMetadataForm;
