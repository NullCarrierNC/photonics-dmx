import React, { useState } from 'react';
import type { VariableDefinition, VariableType, NodeCueFile, NodeCueGroupMeta, YargEffectDefinition, AudioEffectDefinition } from '../../../../../photonics-dmx/cues/types/nodeCueTypes';
import type { EditorDocument } from '../lib/types';
import { COLOR_OPTIONS } from '../../../../../photonics-dmx/constants/options';

type Props = {
  editorDoc: EditorDocument | null;
  selectedCueId: string | null;
  currentEffect?: YargEffectDefinition | AudioEffectDefinition | null;
  onVariablesChange: (groupVars: VariableDefinition[], cueVars: VariableDefinition[]) => void;
  getVariableReferences: (varName: string, scope: 'cue' | 'cue-group') => string[];
};

const VariableRegistry: React.FC<Props> = ({
  editorDoc,
  selectedCueId,
  currentEffect,
  onVariablesChange,
  getVariableReferences
}) => {
  const [showDialog, setShowDialog] = useState<'group' | 'cue' | null>(null);
  const [editingVar, setEditingVar] = useState<VariableDefinition | null>(null);
  const [formData, setFormData] = useState<Partial<VariableDefinition>>({
    name: '',
    type: 'number',
    scope: 'cue',
    initialValue: 0,
    description: '',
    isParameter: false
  });

  const groupVariables = editorDoc?.mode === 'cue' 
    ? (editorDoc.file.group as NodeCueGroupMeta).variables ?? []
    : [];
  const currentCue = editorDoc?.mode === 'cue'
    ? (editorDoc.file as NodeCueFile).cues.find(c => c.id === selectedCueId)
    : null;
  const cueVariables = currentCue?.variables ?? [];

  const isEffectMode = editorDoc?.mode === 'effect';
  
  // For effects, get variables from currentEffect prop
  const effectVariables = isEffectMode && currentEffect
    ? (currentEffect.variables ?? [])
    : [];

  const openDialog = (scope: 'cue' | 'cue-group', existing?: VariableDefinition) => {
    if (existing) {
      setFormData({ ...existing });
      setEditingVar(existing);
    } else {
      setFormData({
        name: '',
        type: 'number',
        scope,
        initialValue: 0,
        description: '',
        isParameter: false
      });
      setEditingVar(null);
    }
    // Map 'cue-group' to 'group' for the dialog state
    setShowDialog(scope === 'cue-group' ? 'group' : 'cue');
  };

  const closeDialog = () => {
    setShowDialog(null);
    setEditingVar(null);
    setFormData({
      name: '',
      type: 'number',
      scope: 'cue',
      initialValue: 0,
      description: '',
      isParameter: false
    });
  };

  const handleSave = () => {
    if (!formData.name || !formData.type || formData.initialValue === undefined) {
      alert('Please fill in all required fields');
      return;
    }

    const newVar: VariableDefinition = {
      name: formData.name,
      type: formData.type as VariableType,
      scope: formData.scope as 'cue' | 'cue-group',
      initialValue: formData.initialValue,
      description: formData.description,
      isParameter: formData.isParameter
    };

    if (showDialog === 'group') {
      let updatedGroupVars = [...groupVariables];
      if (editingVar) {
        const index = updatedGroupVars.findIndex(v => v.name === editingVar.name);
        if (index >= 0) updatedGroupVars[index] = newVar;
      } else {
        // Check for duplicate names
        if (updatedGroupVars.some(v => v.name === newVar.name)) {
          alert(`A group variable named "${newVar.name}" already exists`);
          return;
        }
        updatedGroupVars.push(newVar);
      }
      onVariablesChange(updatedGroupVars, cueVariables);
    } else if (isEffectMode) {
      // Handle effect variables
      let updatedEffectVars = [...effectVariables];
      if (editingVar) {
        const index = updatedEffectVars.findIndex(v => v.name === editingVar.name);
        if (index >= 0) updatedEffectVars[index] = newVar;
      } else {
        // Check for duplicate names
        if (updatedEffectVars.some(v => v.name === newVar.name)) {
          alert(`An effect variable named "${newVar.name}" already exists`);
          return;
        }
        updatedEffectVars.push(newVar);
      }
      onVariablesChange([], updatedEffectVars); // Pass as cue vars for simplicity
    } else {
      let updatedCueVars = [...cueVariables];
      if (editingVar) {
        const index = updatedCueVars.findIndex(v => v.name === editingVar.name);
        if (index >= 0) updatedCueVars[index] = newVar;
      } else {
        // Check for duplicate names
        if (updatedCueVars.some(v => v.name === newVar.name)) {
          alert(`A cue variable named "${newVar.name}" already exists`);
          return;
        }
        updatedCueVars.push(newVar);
      }
      onVariablesChange(groupVariables, updatedCueVars);
    }

    closeDialog();
  };

  const handleDelete = (varName: string, scope: 'cue' | 'cue-group') => {
    const references = getVariableReferences(varName, scope);
    if (references.length > 0) {
      alert(`Cannot delete "${varName}". It is referenced by: ${references.join(', ')}`);
      return;
    }

    if (!confirm(`Delete variable "${varName}"?`)) {
      return;
    }

    if (isEffectMode) {
      const updatedEffectVars = effectVariables.filter(v => v.name !== varName);
      onVariablesChange([], updatedEffectVars);
    } else if (scope === 'cue-group') {
      const updatedGroupVars = groupVariables.filter(v => v.name !== varName);
      onVariablesChange(updatedGroupVars, cueVariables);
    } else {
      const updatedCueVars = cueVariables.filter(v => v.name !== varName);
      onVariablesChange(groupVariables, updatedCueVars);
    }
  };

  const getInitialValueInput = (type: VariableType, value: any, onChange: (val: any) => void) => {
    switch (type) {
      case 'boolean':
        return (
          <select
            className="rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
            value={value === true ? 'true' : 'false'}
            onChange={e => onChange(e.target.value === 'true')}
          >
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
        );
      case 'string':
      case 'cue-type':
        return (
          <input
            type="text"
            className="rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
            value={value ?? ''}
            onChange={e => onChange(e.target.value)}
          />
        );
      case 'color':
        return (
          <select
            className="rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
            value={value ?? 'blue'}
            onChange={e => onChange(e.target.value)}
          >
            {COLOR_OPTIONS.map(color => (
              <option key={color} value={color}>{color}</option>
            ))}
          </select>
        );
      case 'light-array':
        return (
          <div className="text-xs text-gray-500 italic py-1">
            Empty array (populated via config-data node)
          </div>
        );
      case 'number':
      default:
        return (
          <input
            type="number"
            step="0.1"
            className="rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
            value={value ?? 0}
            onChange={e => onChange(parseFloat(e.target.value) || 0)}
          />
        );
    }
  };

  if (!editorDoc) {
    return (
      <div className="p-3">
        <p className="text-xs text-gray-500">No file selected</p>
      </div>
    );
  }

  return (
    <>
      <div className="p-3 overflow-y-auto">
        {isEffectMode ? (
          /* Effect Variables Only */
          <div className="mb-4">
            <div className="flex justify-between items-center mb-2">
              <h4 className="font-medium text-xs text-gray-700 dark:text-gray-300">Effect Variables</h4>
              <button
                className="text-blue-500 text-[10px] hover:underline"
                onClick={() => openDialog('cue')}
              >
                + Add
              </button>
            </div>
            <p className="text-[10px] text-gray-500 mb-2 italic">
              Toggle "Is Parameter" to expose variables as effect inputs
            </p>
            <div className="space-y-1">
              {effectVariables.length === 0 ? (
                <p className="text-[10px] text-gray-500 italic">No effect variables</p>
              ) : (
                effectVariables.map(varDef => (
                  <div
                    key={varDef.name}
                    className="flex items-center gap-2 text-[11px] p-1.5 rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800"
                  >
                      <div className="flex-1 min-w-0">
                        <div className="font-mono font-semibold truncate">
                          {varDef.name}
                          {varDef.isParameter && (
                            <span className="ml-2 text-[10px] px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 rounded">
                              Parameter
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-gray-500">
                          {varDef.type} = {varDef.type === 'light-array' ? '[]' : String(varDef.initialValue)}
                        </div>
                      </div>
                    <button
                      className="text-blue-500 hover:underline text-[10px]"
                      onClick={() => openDialog('cue', varDef)}
                    >
                      Edit
                    </button>
                    <button
                      className="text-red-500 hover:underline text-[10px]"
                      onClick={() => handleDelete(varDef.name, 'cue')}
                    >
                      Del
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : (
          <>
            {/* Group Variables */}
            <div className="mb-4">
              <div className="flex justify-between items-center mb-2">
                <h4 className="font-medium text-xs text-gray-700 dark:text-gray-300">Group Variables</h4>
                <button
                  className="text-blue-500 text-[10px] hover:underline"
                  onClick={() => openDialog('cue-group')}
                >
                  + Add
                </button>
              </div>
              <div className="space-y-1">
                {groupVariables.length === 0 ? (
                  <p className="text-[10px] text-gray-500 italic">No group variables</p>
                ) : (
                  groupVariables.map(varDef => (
                    <div
                      key={varDef.name}
                      className="flex items-center gap-2 text-[11px] p-1.5 rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-mono font-semibold truncate">{varDef.name}</div>
                        <div className="text-[10px] text-gray-500">
                          {varDef.type} = {varDef.type === 'light-array' ? '[]' : String(varDef.initialValue)}
                        </div>
                      </div>
                      <button
                        className="text-blue-500 hover:underline text-[10px]"
                        onClick={() => openDialog('cue-group', varDef)}
                      >
                        Edit
                      </button>
                      <button
                        className="text-red-500 hover:underline text-[10px]"
                        onClick={() => handleDelete(varDef.name, 'cue-group')}
                      >
                        Del
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Cue Variables */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <h4 className="font-medium text-xs text-gray-700 dark:text-gray-300">Cue Variables</h4>
                <button
                  className="text-blue-500 text-[10px] hover:underline disabled:text-gray-400"
                  onClick={() => openDialog('cue')}
                  disabled={!selectedCueId}
                >
                  + Add
                </button>
              </div>
              <div className="space-y-1">
                {!selectedCueId ? (
                  <p className="text-[10px] text-gray-500 italic">Select a cue</p>
                ) : cueVariables.length === 0 ? (
                  <p className="text-[10px] text-gray-500 italic">No cue variables</p>
                ) : (
                  cueVariables.map(varDef => (
                    <div
                      key={varDef.name}
                      className="flex items-center gap-2 text-[11px] p-1.5 rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-mono font-semibold truncate">{varDef.name}</div>
                        <div className="text-[10px] text-gray-500">
                          {varDef.type} = {varDef.type === 'light-array' ? '[]' : String(varDef.initialValue)}
                        </div>
                      </div>
                      <button
                        className="text-blue-500 hover:underline text-[10px]"
                        onClick={() => openDialog('cue', varDef)}
                      >
                        Edit
                      </button>
                      <button
                        className="text-red-500 hover:underline text-[10px]"
                        onClick={() => handleDelete(varDef.name, 'cue')}
                      >
                        Del
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Add/Edit Dialog */}
      {showDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-96 max-w-full">
            <h3 className="font-semibold text-lg mb-4">
              {editingVar ? 'Edit' : 'Add'} {isEffectMode ? 'Effect' : (showDialog === 'group' ? 'Group' : 'Cue')} Variable
            </h3>
            <div className="space-y-3">
              <label className="flex flex-col font-medium text-sm">
                Name
                <input
                  type="text"
                  className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                  value={formData.name ?? ''}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="variableName"
                  pattern="[a-zA-Z_][a-zA-Z0-9_]*"
                  disabled={!!editingVar}
                />
                <span className="text-[10px] text-gray-500 mt-1">
                  Must start with letter or underscore
                </span>
              </label>

              <label className="flex flex-col font-medium text-sm">
                Type
                <select
                  className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                  value={formData.type ?? 'number'}
                  onChange={e => {
                    const newType = e.target.value as VariableType;
                    let newValue: any = 0;
                    if (newType === 'boolean') newValue = false;
                    else if (newType === 'string' || newType === 'cue-type') newValue = '';
                    else if (newType === 'color') newValue = 'blue';
                    else if (newType === 'light-array') newValue = [];
                    setFormData({ ...formData, type: newType, initialValue: newValue });
                  }}
                >
                  <option value="number">Number</option>
                  <option value="boolean">Boolean</option>
                  <option value="string">String</option>
                  <option value="color">Color</option>
                  <option value="light-array">Light Array</option>
                  <option value="cue-type">Cue Type</option>
                </select>
              </label>

              <label className="flex flex-col font-medium text-sm">
                Initial Value
                {getInitialValueInput(
                  formData.type as VariableType,
                  formData.initialValue,
                  val => setFormData({ ...formData, initialValue: val })
                )}
              </label>

              <label className="flex flex-col font-medium text-sm">
                Description (optional)
                <input
                  type="text"
                  className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                  value={formData.description ?? ''}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  placeholder="What this variable is for"
                />
              </label>

              {isEffectMode && (
                <label className="flex items-center gap-2 font-medium text-sm">
                  <input
                    type="checkbox"
                    checked={formData.isParameter ?? false}
                    onChange={e => setFormData({ ...formData, isParameter: e.target.checked })}
                    className="rounded"
                  />
                  <span>Is Parameter</span>
                  <span className="text-[10px] text-gray-500 font-normal">
                    (Expose as effect input)
                  </span>
                </label>
              )}
            </div>

            <div className="flex gap-2 mt-6">
              <button
                className="flex-1 px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-500"
                onClick={handleSave}
              >
                Save
              </button>
              <button
                className="px-3 py-2 rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600"
                onClick={closeDialog}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default VariableRegistry;
