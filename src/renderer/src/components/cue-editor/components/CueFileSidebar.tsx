import React from 'react';
import type { NodeCueFileSummary } from '../../../../../photonics-dmx/cues/node/loader/NodeCueLoader';
import type { NodeCueMode, YargNodeCueDefinition, AudioNodeCueDefinition } from '../../../../../photonics-dmx/cues/types/nodeCueTypes';
import type { EditorDocument } from '../lib/types';

type Props = {
  mode: NodeCueMode;
  fileList: NodeCueFileSummary[];
  editorDoc: EditorDocument | null;
  selectedCueId: string | null;
  onSelectFile: (file: NodeCueFileSummary) => void;
  onReload: () => void;
  onNewFile: () => void;
  onAddCue: () => void;
  onRemoveCue: (cueId: string) => void;
  onSelectCue: (cue: YargNodeCueDefinition | AudioNodeCueDefinition | null) => void;
};

const CueFileSidebar: React.FC<Props> = ({
  mode,
  fileList,
  editorDoc,
  selectedCueId,
  onSelectFile,
  onReload,
  onNewFile,
  onAddCue,
  onRemoveCue,
  onSelectCue
}) => (
  <aside className="bg-white dark:bg-gray-900 rounded-lg shadow-inner p-3 overflow-y-auto">
    <div className="flex items-center justify-between mb-3">
      <h3 className="font-semibold">Files ({mode.toUpperCase()})</h3>
      <button className="text-xs text-blue-500 hover:underline" onClick={onReload}>Reload</button>
    </div>
    <div className="space-y-2">
      {fileList.length === 0 && (
        <p className="text-xs text-gray-500">No files found. Create one to get started.</p>
      )}
      {fileList.map(file => (
        <button
          key={file.path}
          className={`w-full text-left border rounded px-2 py-1 text-xs ${editorDoc?.path === file.path ? 'border-blue-500 bg-blue-50 dark:bg-blue-900 dark:border-blue-400' : 'border-gray-200 dark:border-gray-700'}`}
          onClick={() => onSelectFile(file)}
        >
          <div className="font-semibold truncate">{file.groupName}</div>
          <div className="text-[10px] text-gray-500 truncate">{file.path}</div>
          <div className="text-[10px] text-gray-500">{file.cueCount} cue(s)</div>
        </button>
      ))}
    </div>
    <div className="mt-4 border-t border-gray-200 dark:border-gray-800 pt-4">
      <div className="flex justify-between items-center mb-2">
        <h3 className="font-semibold text-sm">Cue List</h3>
        <button
          className="text-blue-500 text-xs hover:underline"
          onClick={onAddCue}
        >
          + Add Cue
        </button>
      </div>
      <div className="space-y-1 text-xs">
        {editorDoc?.file.cues.map(cue => (
          <div key={cue.id} className="flex items-center gap-2">
            <button
              className={`flex-1 text-left px-2 py-1 rounded border ${selectedCueId === cue.id ? 'border-blue-500 bg-blue-50 dark:bg-blue-900 dark:border-blue-400' : 'border-gray-200 dark:border-gray-700'}`}
              onClick={() => onSelectCue(cue as any)}
            >
              {cue.name}
            </button>
            <button
              className="text-[11px] text-red-500 hover:underline disabled:text-gray-400"
              onClick={() => onRemoveCue(cue.id)}
              disabled={(editorDoc?.file.cues.length ?? 0) <= 1}
              title={(editorDoc?.file.cues.length ?? 0) <= 1 ? 'At least one cue is required' : 'Remove cue'}
            >
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
    <div className="flex gap-2 mt-4">
      <button className="border px-2 py-1 rounded text-xs" onClick={onNewFile}>New File</button>
    </div>
  </aside>
);

export default CueFileSidebar;
