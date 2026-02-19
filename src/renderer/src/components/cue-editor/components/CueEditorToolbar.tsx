import React from 'react';

export type EditorDropdownMode = 'yarg' | 'audio' | 'yarg-effect' | 'audio-effect';

type CueEditorToolbarProps = {
  dropdownValue: EditorDropdownMode;
  onModeChange: (value: EditorDropdownMode) => void;
  onNewFile: () => void;
  onSave: () => void;
  onImport: () => void;
  onExport: () => void;
  onDelete: () => void;
  hasEditorDoc: boolean;
  hasFile: boolean;
  newFileLabel: string;
  importLabel: string;
  exportLabel: string;
  deleteLabel: string;
};

const primaryButton =
  'px-3 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-500';
const secondaryButton =
  'px-3 py-1 text-xs rounded bg-gray-200 dark:bg-gray-800 dark:text-gray-100 hover:bg-gray-300 dark:hover:bg-gray-700';
const dangerButton =
  'px-3 py-1 text-xs rounded bg-red-600 text-white hover:bg-red-500';

const CueEditorToolbar: React.FC<CueEditorToolbarProps> = ({
  dropdownValue,
  onModeChange,
  onNewFile,
  onSave,
  onImport,
  onExport,
  onDelete,
  hasEditorDoc,
  hasFile,
  newFileLabel,
  importLabel,
  exportLabel,
  deleteLabel
}) => (
  <div className="flex justify-between items-center gap-4">
    <div className="flex items-center gap-2">
      <label className="font-semibold text-base">Mode</label>
      <select
        value={dropdownValue}
        onChange={event => onModeChange(event.target.value as EditorDropdownMode)}
        className="rounded border border-gray-300 px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-600"
      >
        <optgroup label="Cues">
          <option value="yarg">YARG Node Cues</option>
          <option value="audio">Audio Node Cues</option>
        </optgroup>
        <optgroup label="Effects">
          <option value="yarg-effect">YARG Effects</option>
          <option value="audio-effect">Audio Effects</option>
        </optgroup>
      </select>
    </div>
    <div className="flex gap-2">
      <button className={secondaryButton} onClick={onNewFile}>
        {newFileLabel}
      </button>
      <button
        className={`${primaryButton} ${!hasEditorDoc ? 'opacity-50 cursor-not-allowed' : ''}`}
        onClick={onSave}
        disabled={!hasEditorDoc}
      >
        Save
      </button>
      <button className={secondaryButton} onClick={onImport}>
        {importLabel}
      </button>
      <button
        className={`${secondaryButton} ${!hasFile ? 'opacity-50 cursor-not-allowed' : ''}`}
        onClick={onExport}
        disabled={!hasFile}
      >
        {exportLabel}
      </button>
      <button
        className={`${dangerButton} ${!hasFile ? 'opacity-50 cursor-not-allowed' : ''}`}
        onClick={onDelete}
        disabled={!hasFile}
      >
        {deleteLabel}
      </button>
    </div>
  </div>
);

export default CueEditorToolbar;
