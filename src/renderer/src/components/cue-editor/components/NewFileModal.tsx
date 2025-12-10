import React, { useState } from 'react';

type Props = {
  isOpen: boolean;
  isEffectMode: boolean;
  mode: 'yarg' | 'audio';
  onCancel: () => void;
  onSave: (metadata: { groupId: string; groupName: string; groupDescription: string; itemName: string; itemDescription: string }) => void;
};

const NewFileModal: React.FC<Props> = ({ isOpen, isEffectMode, mode, onCancel, onSave }) => {
  const [groupId, setGroupId] = useState('');
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [itemName, setItemName] = useState('');
  const [itemDescription, setItemDescription] = useState('');

  const fileTypeLabel = isEffectMode ? 'Effect' : 'Cue';
  const groupLabel = isEffectMode ? 'Effect Group' : 'Cue Group';

  const handleSave = () => {
    if (!groupId.trim() || !groupName.trim() || !itemName.trim()) {
      alert('Please fill in all required fields (Group ID, Group Name, and Item Name)');
      return;
    }
    onSave({ groupId, groupName, groupDescription, itemName, itemDescription });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.metaKey) {
      handleSave();
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onCancel}>
      <div 
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-[500px] max-w-[90vw]"
        onClick={e => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <h2 className="text-lg font-bold mb-4">Create New {fileTypeLabel} File ({mode.toUpperCase()})</h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold mb-1">
              {groupLabel} ID <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={groupId}
              onChange={e => setGroupId(e.target.value)}
              placeholder="e.g., my-custom-effects"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-sm"
              autoFocus
            />
            <p className="text-xs text-gray-500 mt-1">
              Used as the filename (e.g., my-custom-effects.json)
            </p>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1">
              {groupLabel} Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={groupName}
              onChange={e => setGroupName(e.target.value)}
              placeholder="e.g., My Custom Effects"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1">
              {groupLabel} Description
            </label>
            <textarea
              value={groupDescription}
              onChange={e => setGroupDescription(e.target.value)}
              placeholder={`Description of this ${groupLabel.toLowerCase()}`}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-sm"
            />
          </div>

          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <label className="block text-sm font-semibold mb-1">
              First {fileTypeLabel} Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={itemName}
              onChange={e => setItemName(e.target.value)}
              placeholder={`e.g., My First ${fileTypeLabel}`}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1">
              First {fileTypeLabel} Description
            </label>
            <textarea
              value={itemDescription}
              onChange={e => setItemDescription(e.target.value)}
              placeholder={`Description of this ${fileTypeLabel.toLowerCase()}`}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-sm"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-500"
          >
            Save
          </button>
        </div>

        <p className="text-xs text-gray-500 mt-3">
          Press <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded border border-gray-300 dark:border-gray-600">Cmd+Enter</kbd> to save, <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded border border-gray-300 dark:border-gray-600">Esc</kbd> to cancel
        </p>
      </div>
    </div>
  );
};

export default NewFileModal;
