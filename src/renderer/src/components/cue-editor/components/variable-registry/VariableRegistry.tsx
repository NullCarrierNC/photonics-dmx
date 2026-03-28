import React, { useState } from 'react'
import type {
  VariableDefinition,
  VariableType,
  NodeCueFile,
  NodeCueGroupMeta,
  YargEffectDefinition,
  AudioEffectDefinition,
  EffectFile,
  NodeCueMode,
} from '../../../../../../photonics-dmx/cues/types/nodeCueTypes'
import type { EditorDocument } from '../../lib/types'
import VariableList from './VariableList'
import VariableFormDialog from './VariableFormDialog'
import VariableReferenceModal from '../VariableReferenceModal'

type VariableRegistryProps = {
  editorDoc: EditorDocument | null
  selectedCueId: string | null
  currentEffect?: YargEffectDefinition | AudioEffectDefinition | null
  onVariablesChange: (groupVars: VariableDefinition[], cueVars: VariableDefinition[]) => void
  getVariableReferences: (varName: string, scope: 'cue' | 'cue-group') => string[]
}

const VariableRegistry: React.FC<VariableRegistryProps> = ({
  editorDoc,
  selectedCueId,
  currentEffect,
  onVariablesChange,
  getVariableReferences,
}) => {
  const [showDialog, setShowDialog] = useState<'group' | 'cue' | null>(null)
  const [editingVar, setEditingVar] = useState<VariableDefinition | null>(null)
  const [referenceModal, setReferenceModal] = useState<{
    varName: string
    references: string[]
  } | null>(null)
  const [formData, setFormData] = useState<Partial<VariableDefinition>>({
    name: '',
    type: 'number',
    scope: 'cue',
    initialValue: 0,
    description: '',
    isParameter: false,
  })

  const groupVariables =
    editorDoc?.mode === 'cue' ? (editorDoc.file.group as NodeCueGroupMeta).variables ?? [] : []
  const currentCue =
    editorDoc?.mode === 'cue'
      ? (editorDoc.file as NodeCueFile).cues.find((c) => c.id === selectedCueId)
      : null
  const cueVariables = currentCue?.variables ?? []

  const isEffectMode = editorDoc?.mode === 'effect'
  const activeMode: NodeCueMode = editorDoc?.file
    ? (editorDoc.file as NodeCueFile | EffectFile).mode
    : 'yarg'

  const effectVariables = isEffectMode && currentEffect ? currentEffect.variables ?? [] : []

  const openDialog = (scope: 'cue' | 'cue-group', existing?: VariableDefinition) => {
    if (existing) {
      setFormData({ ...existing })
      setEditingVar(existing)
    } else {
      setFormData({
        name: '',
        type: 'number',
        scope,
        initialValue: 0,
        description: '',
        isParameter: false,
      })
      setEditingVar(null)
    }
    setShowDialog(scope === 'cue-group' ? 'group' : 'cue')
  }

  const closeDialog = () => {
    setShowDialog(null)
    setEditingVar(null)
    setFormData({
      name: '',
      type: 'number',
      scope: 'cue',
      initialValue: 0,
      description: '',
      isParameter: false,
    })
  }

  const handleSave = () => {
    if (!formData.name || !formData.type || formData.initialValue === undefined) {
      alert('Please fill in all required fields')
      return
    }

    const newVar: VariableDefinition = {
      name: formData.name,
      type: formData.type as VariableType,
      scope: formData.scope as 'cue' | 'cue-group',
      initialValue: formData.initialValue,
      description: formData.description,
      isParameter: formData.isParameter,
    }

    if (showDialog === 'group') {
      const updatedGroupVars = [...groupVariables]
      if (editingVar) {
        const index = updatedGroupVars.findIndex((v) => v.name === editingVar.name)
        if (index >= 0) updatedGroupVars[index] = newVar
      } else {
        if (updatedGroupVars.some((v) => v.name === newVar.name)) {
          alert(`A group variable named "${newVar.name}" already exists`)
          return
        }
        updatedGroupVars.push(newVar)
      }
      onVariablesChange(updatedGroupVars, cueVariables)
    } else if (isEffectMode) {
      const updatedEffectVars = [...effectVariables]
      if (editingVar) {
        const index = updatedEffectVars.findIndex((v) => v.name === editingVar.name)
        if (index >= 0) updatedEffectVars[index] = newVar
      } else {
        if (updatedEffectVars.some((v) => v.name === newVar.name)) {
          alert(`An effect variable named "${newVar.name}" already exists`)
          return
        }
        updatedEffectVars.push(newVar)
      }
      onVariablesChange([], updatedEffectVars)
    } else {
      const updatedCueVars = [...cueVariables]
      if (editingVar) {
        const index = updatedCueVars.findIndex((v) => v.name === editingVar.name)
        if (index >= 0) updatedCueVars[index] = newVar
      } else {
        if (updatedCueVars.some((v) => v.name === newVar.name)) {
          alert(`A cue variable named "${newVar.name}" already exists`)
          return
        }
        updatedCueVars.push(newVar)
      }
      onVariablesChange(groupVariables, updatedCueVars)
    }

    closeDialog()
  }

  const handleDelete = (varName: string, scope: 'cue' | 'cue-group') => {
    const references = getVariableReferences(varName, scope)
    if (references.length > 0) {
      setReferenceModal({ varName, references })
      return
    }

    if (!confirm(`Delete variable "${varName}"?`)) {
      return
    }

    if (isEffectMode) {
      const updatedEffectVars = effectVariables.filter((v) => v.name !== varName)
      onVariablesChange([], updatedEffectVars)
    } else if (scope === 'cue-group') {
      const updatedGroupVars = groupVariables.filter((v) => v.name !== varName)
      onVariablesChange(updatedGroupVars, cueVariables)
    } else {
      const updatedCueVars = cueVariables.filter((v) => v.name !== varName)
      onVariablesChange(groupVariables, updatedCueVars)
    }
  }

  if (!editorDoc) {
    return (
      <div className="p-3">
        <p className="text-xs text-gray-500">No file selected</p>
      </div>
    )
  }

  const scopeLabel = isEffectMode ? 'Effect' : showDialog === 'group' ? 'Group' : 'Cue'
  const fullTitle = `${editingVar ? 'Edit' : 'Add'} ${scopeLabel} Variable`

  return (
    <>
      <div className="p-3 overflow-y-auto">
        {isEffectMode ? (
          <div className="mb-4">
            <div className="flex justify-between items-center mb-2">
              <h4 className="font-medium text-xs text-gray-700 dark:text-gray-300">
                Effect Variables
              </h4>
              <button
                className="text-blue-500 text-[10px] hover:underline"
                onClick={() => openDialog('cue')}>
                + Add
              </button>
            </div>
            <p className="text-[10px] text-gray-500 mb-2 italic">
              Toggle "Is Parameter" to expose variables as effect inputs
            </p>
            <VariableList
              variables={effectVariables}
              onEdit={(v) => openDialog('cue', v)}
              onDelete={(name) => handleDelete(name, 'cue')}
              showParameterBadge
            />
          </div>
        ) : (
          <>
            <div className="mb-4">
              <div className="flex justify-between items-center mb-2">
                <h4 className="font-medium text-xs text-gray-700 dark:text-gray-300">
                  Group Variables
                </h4>
                <button
                  className="text-blue-500 text-[10px] hover:underline"
                  onClick={() => openDialog('cue-group')}>
                  + Add
                </button>
              </div>
              <VariableList
                variables={groupVariables}
                onEdit={(v) => openDialog('cue-group', v)}
                onDelete={(name) => handleDelete(name, 'cue-group')}
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <h4 className="font-medium text-xs text-gray-700 dark:text-gray-300">
                  Cue Variables
                </h4>
                <button
                  className="text-blue-500 text-[10px] hover:underline disabled:text-gray-400"
                  onClick={() => openDialog('cue')}
                  disabled={!selectedCueId}>
                  + Add
                </button>
              </div>
              {!selectedCueId ? (
                <p className="text-[10px] text-gray-500 italic">Select a cue</p>
              ) : (
                <VariableList
                  variables={cueVariables}
                  onEdit={(v) => openDialog('cue', v)}
                  onDelete={(name) => handleDelete(name, 'cue')}
                />
              )}
            </div>
          </>
        )}
      </div>

      <VariableFormDialog
        isOpen={!!showDialog}
        title={fullTitle}
        formData={formData}
        onFormDataChange={setFormData}
        onSave={handleSave}
        onCancel={closeDialog}
        activeMode={activeMode}
        isEffectMode={isEffectMode}
        editingVar={editingVar}
      />

      <VariableReferenceModal
        isOpen={!!referenceModal}
        variableName={referenceModal?.varName ?? ''}
        references={referenceModal?.references ?? []}
        onClose={() => setReferenceModal(null)}
      />
    </>
  )
}

export default VariableRegistry
