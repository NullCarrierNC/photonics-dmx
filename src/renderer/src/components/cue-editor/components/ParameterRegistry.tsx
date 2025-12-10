import React, { useState } from 'react';
import type { EffectParameterDefinition, EffectFile, VariableType } from '../../../../../photonics-dmx/cues/types/nodeCueTypes';
import type { EditorDocument } from '../lib/types';

type Props = {
  editorDoc: EditorDocument | null;
  selectedEffectId: string | null;
  onParametersChange: (parameters: EffectParameterDefinition[]) => void;
};

const ParameterRegistry: React.FC<Props> = ({
  editorDoc,
  selectedEffectId,
  onParametersChange
}) => {
  const [showDialog, setShowDialog] = useState<boolean>(false);
  const [editingParam, setEditingParam] = useState<EffectParameterDefinition | null>(null);
  const [formData, setFormData] = useState<Partial<EffectParameterDefinition>>({
    name: '',
    type: 'number',
    description: ''
  });

  // Parameters are only available in effect mode
  const currentEffect = editorDoc?.mode === 'effect' && editorDoc.file
    ? (editorDoc.file as EffectFile).effects?.find(e => e.id === selectedEffectId)
    : null;
  const effectParameters = currentEffect?.parameters ?? [];

  const openDialog = (existing?: EffectParameterDefinition) => {
    if (existing) {
      setFormData({ ...existing });
      setEditingParam(existing);
    } else {
      setFormData({
        name: '',
        type: 'number',
        description: ''
      });
      setEditingParam(null);
    }
    setShowDialog(true);
  };

  const closeDialog = () => {
    setShowDialog(false);
    setEditingParam(null);
    setFormData({
      name: '',
      type: 'number',
      description: ''
    });
  };

  const handleSave = () => {
    if (!formData.name || !formData.type) {
      alert('Please fill in all required fields');
      return;
    }

    const newParam: EffectParameterDefinition = {
      name: formData.name,
      type: formData.type as VariableType,
      description: formData.description
    };

    let updatedParams = [...effectParameters];
    if (editingParam) {
      const index = updatedParams.findIndex(p => p.name === editingParam.name);
      if (index >= 0) updatedParams[index] = newParam;
    } else {
      // Check for duplicate names
      if (updatedParams.some(p => p.name === newParam.name)) {
        alert(`A parameter named "${newParam.name}" already exists`);
        return;
      }
      updatedParams.push(newParam);
    }

    onParametersChange(updatedParams);
    closeDialog();
  };

  const handleDelete = (paramName: string) => {
    if (!confirm(`Delete parameter "${paramName}"? This may break parameter mappings.`)) {
      return;
    }

    const updatedParams = effectParameters.filter(p => p.name !== paramName);
    onParametersChange(updatedParams);
  };

  if (editorDoc?.mode !== 'effect') {
    return (
      <div className="p-3 text-xs text-gray-500">
        Effect parameters are only available in effect mode. Use the Variables tab for cue-level variables.
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-sm">Effect Parameters</h3>
        <button
          className="px-2 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-700"
          onClick={() => openDialog()}
        >
          + Add Parameter
        </button>
      </div>

      <div className="text-[10px] text-gray-600 dark:text-gray-400 bg-purple-50 dark:bg-purple-900/20 p-2 rounded border border-purple-200 dark:border-purple-800">
        <strong>Effect Parameters</strong> define the inputs this effect accepts from cues.
        They are mapped to local effect variables via the Effect Listener node.
      </div>

      <div className="space-y-1 max-h-[400px] overflow-y-auto">
        {effectParameters.length === 0 ? (
          <p className="text-xs text-gray-500 italic">No parameters defined yet</p>
        ) : (
          effectParameters.map(param => (
            <div
              key={param.name}
              className="flex justify-between items-start p-2 bg-purple-50 dark:bg-purple-900/20 rounded text-xs border border-purple-200 dark:border-purple-800"
            >
              <div className="flex-1">
                <div className="font-semibold text-purple-800 dark:text-purple-200">
                  {param.name}
                  <span className="ml-2 text-[10px] font-normal text-gray-600 dark:text-gray-400">
                    ({param.type})
                  </span>
                </div>
                {param.description && (
                  <div className="text-[10px] text-gray-600 dark:text-gray-400 mt-0.5">
                    {param.description}
                  </div>
                )}
              </div>
              <div className="flex gap-1">
                <button
                  className="px-2 py-0.5 bg-purple-600 text-white rounded hover:bg-purple-700"
                  onClick={() => openDialog(param)}
                >
                  Edit
                </button>
                <button
                  className="px-2 py-0.5 bg-red-600 text-white rounded hover:bg-red-700"
                  onClick={() => handleDelete(param.name)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {showDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-4 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-3">
              {editingParam ? 'Edit Parameter' : 'Add Parameter'}
            </h3>
            <div className="space-y-3">
              <label className="flex flex-col text-xs font-medium">
                Parameter Name *
                <input
                  type="text"
                  className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-700 dark:border-gray-600"
                  value={formData.name || ''}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., intensity"
                  disabled={!!editingParam}
                />
                <span className="text-[10px] text-gray-500 mt-0.5">
                  Name must be unique within this effect
                </span>
              </label>
              <label className="flex flex-col text-xs font-medium">
                Type *
                <select
                  className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-700 dark:border-gray-600"
                  value={formData.type || 'number'}
                  onChange={e => setFormData({ ...formData, type: e.target.value as VariableType })}
                >
                  <option value="number">number</option>
                  <option value="boolean">boolean</option>
                  <option value="string">string</option>
                </select>
              </label>
              <label className="flex flex-col text-xs font-medium">
                Description
                <input
                  type="text"
                  className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-700 dark:border-gray-600"
                  value={formData.description || ''}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Optional description"
                />
              </label>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button
                className="px-3 py-1 text-xs border rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                onClick={closeDialog}
              >
                Cancel
              </button>
              <button
                className="px-3 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-700"
                onClick={handleSave}
              >
                {editingParam ? 'Save' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ParameterRegistry;
