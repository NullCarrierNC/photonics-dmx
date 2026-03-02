import React, { useState, useEffect } from 'react'
import type { EffectFileSummary } from '../../../../../photonics-dmx/cues/node/loader/EffectLoader'
import type { EffectReference } from '../../../../../photonics-dmx/cues/types/nodeCueTypes'
import type { EditorDocument } from '../lib/types'
import { listEffectFiles, readEffectFile } from '../../../ipcApi'

type EffectDefinition = {
  id: string
  name: string
  description: string
}

type Props = {
  editorDoc: EditorDocument | null
  selectedCueId: string | null
  onEffectsChange: (effects: EffectReference[]) => void
}

const EffectRegistry: React.FC<Props> = ({ editorDoc, selectedCueId, onEffectsChange }) => {
  const [showDialog, setShowDialog] = useState<boolean>(false)
  const [editingEffect, setEditingEffect] = useState<EffectReference | null>(null)
  const [formData, setFormData] = useState<Partial<EffectReference>>({
    effectId: '',
    effectFileId: '',
    name: '',
  })
  const [availableFiles, setAvailableFiles] = useState<EffectFileSummary[]>([])
  const [availableEffects, setAvailableEffects] = useState<EffectDefinition[]>([])
  const [selectedFile, setSelectedFile] = useState<string>('')
  const [loadingEffects, setLoadingEffects] = useState(false)

  // Load available effect files when dialog opens
  useEffect(() => {
    if (showDialog && !editingEffect) {
      loadEffectFiles()
    }
  }, [showDialog, editingEffect])

  // Load effects from selected file
  useEffect(() => {
    if (selectedFile) {
      loadEffectsFromFile(selectedFile)
    } else {
      setAvailableEffects([])
    }
  }, [selectedFile])

  const loadEffectFiles = async () => {
    try {
      const summary = await listEffectFiles()
      const allFiles = [...summary.yarg, ...summary.audio].sort((a, b) =>
        (a.groupName ?? '').localeCompare(b.groupName ?? '', undefined, { sensitivity: 'base' }),
      )
      setAvailableFiles(allFiles)
    } catch (error) {
      console.error('Failed to load effect files', error)
    }
  }

  const loadEffectsFromFile = async (filePath: string) => {
    setLoadingEffects(true)
    try {
      const file = await readEffectFile(filePath)
      const effects = file.effects
        .map((e) => ({
          id: e.id,
          name: e.name,
          description: e.description,
        }))
        .sort((a, b) =>
          (a.name ?? '').localeCompare(b.name ?? '', undefined, { sensitivity: 'base' }),
        )
      setAvailableEffects(effects)
    } catch (error) {
      console.error('Failed to load effects from file', error)
      setAvailableEffects([])
    } finally {
      setLoadingEffects(false)
    }
  }

  // Effects are only available in cue mode (cues can reference effects)
  const currentCue =
    editorDoc?.mode === 'cue' && editorDoc.file
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any -- cue file shape
        (editorDoc.file as any).cues?.find((c: any) => c.id === selectedCueId)
      : null
  const cueEffects = currentCue?.effects ?? []

  const openDialog = (existing?: EffectReference) => {
    if (existing) {
      setFormData({ ...existing })
      setEditingEffect(existing)
    } else {
      setFormData({
        effectId: '',
        effectFileId: '',
        name: '',
      })
      setEditingEffect(null)
      setSelectedFile('')
    }
    setShowDialog(true)
  }

  const closeDialog = () => {
    setShowDialog(false)
    setEditingEffect(null)
    setFormData({
      effectId: '',
      effectFileId: '',
      name: '',
    })
    setSelectedFile('')
    setAvailableEffects([])
  }

  const handleFileSelect = (filePath: string) => {
    setSelectedFile(filePath)
    const file = availableFiles.find((f) => f.path === filePath)
    if (file) {
      setFormData({
        ...formData,
        effectFileId: file.groupId,
        effectId: '',
        name: '',
      })
    }
  }

  const handleEffectSelect = (effectId: string) => {
    const effect = availableEffects.find((e) => e.id === effectId)
    if (effect) {
      setFormData({
        ...formData,
        effectId: effect.id, // Use the actual effect ID
        name: effect.name,
      })
    }
  }

  const handleSave = () => {
    if (!formData.effectId || !formData.effectFileId || !formData.name) {
      alert('Please fill in all required fields')
      return
    }

    const newEffect: EffectReference = {
      effectId: formData.effectId,
      effectFileId: formData.effectFileId,
      name: formData.name,
    }

    const updatedEffects = [...cueEffects]
    if (editingEffect) {
      const index = updatedEffects.findIndex((e) => e.effectId === editingEffect.effectId)
      if (index >= 0) updatedEffects[index] = newEffect
    } else {
      // Check for duplicate IDs
      if (updatedEffects.some((e) => e.effectId === newEffect.effectId)) {
        alert(`An effect with ID "${newEffect.effectId}" already exists`)
        return
      }
      updatedEffects.push(newEffect)
    }

    onEffectsChange(updatedEffects)
    closeDialog()
  }

  const handleDelete = (effectId: string) => {
    if (
      !confirm(
        `Delete effect reference "${effectId}"? This will not delete the effect file itself.`,
      )
    ) {
      return
    }

    const updatedEffects = cueEffects.filter((e) => e.effectId !== effectId)
    onEffectsChange(updatedEffects)
  }

  if (editorDoc?.mode !== 'cue') {
    return (
      <div className="p-3 text-xs text-gray-500">
        Effect references are only available in cue mode. Effects themselves are standalone and do
        not reference other effects.
      </div>
    )
  }

  return (
    <div className="p-3 space-y-3">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-sm">Effect References</h3>
        <button
          className="px-2 py-1 text-xs bg-cyan-600 text-white rounded hover:bg-cyan-700"
          onClick={() => openDialog()}>
          + Import Effect
        </button>
      </div>

      <div className="space-y-1 max-h-[400px] overflow-y-auto">
        {cueEffects.length === 0 ? (
          <p className="text-xs text-gray-500 italic">No effects imported yet</p>
        ) : (
          cueEffects.map((effect) => (
            <div
              key={effect.effectId}
              className="flex justify-between items-start p-2 bg-cyan-50 dark:bg-cyan-900/20 rounded text-xs border border-cyan-200 dark:border-cyan-800">
              <div className="flex-1">
                <div className="font-semibold text-cyan-800 dark:text-cyan-200">{effect.name}</div>
                <div className="text-[10px] text-gray-600 dark:text-gray-400 mt-0.5">
                  From: {effect.effectFileId}
                </div>
              </div>
              <div className="flex gap-1">
                <button
                  className="px-2 py-0.5 bg-cyan-600 text-white rounded hover:bg-cyan-700"
                  onClick={() => openDialog(effect)}>
                  Edit
                </button>
                <button
                  className="px-2 py-0.5 bg-red-600 text-white rounded hover:bg-red-700"
                  onClick={() => handleDelete(effect.effectId)}>
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {showDialog && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={closeDialog}>
          <div
            className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-4 max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-3">
              {editingEffect ? 'Edit Effect Reference' : 'Import Effect'}
            </h3>
            <div className="space-y-3">
              {!editingEffect && (
                <>
                  <label className="flex flex-col text-xs font-medium">
                    Select Effect File *
                    <select
                      className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-700 dark:border-gray-600"
                      value={selectedFile}
                      onChange={(e) => handleFileSelect(e.target.value)}>
                      <option value="">-- Choose an effect file --</option>
                      {availableFiles.map((file) => (
                        <option key={file.path} value={file.path}>
                          {file.groupName} ({file.mode.toUpperCase()}) - {file.effectCount}{' '}
                          effect(s)
                        </option>
                      ))}
                    </select>
                    <span className="text-[10px] text-gray-500 mt-0.5">
                      Select the file containing the effect you want to import
                    </span>
                  </label>

                  <label className="flex flex-col text-xs font-medium">
                    Select Effect *
                    <select
                      className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-700 dark:border-gray-600"
                      value={availableEffects.find((e) => e.name === formData.name)?.id || ''}
                      onChange={(e) => handleEffectSelect(e.target.value)}
                      disabled={!selectedFile || loadingEffects}>
                      <option value="">
                        {loadingEffects ? '-- Loading effects...' : '-- Choose an effect --'}
                      </option>
                      {availableEffects.map((effect) => (
                        <option key={effect.id} value={effect.id}>
                          {effect.name} {effect.description && `- ${effect.description}`}
                        </option>
                      ))}
                    </select>
                    <span className="text-[10px] text-gray-500 mt-0.5">
                      Select which effect from the file to import
                    </span>
                  </label>
                </>
              )}

              <label className="flex flex-col text-xs font-medium">
                Effect ID *
                <input
                  type="text"
                  className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-700 dark:border-gray-600"
                  value={formData.effectId || ''}
                  onChange={(e) => setFormData({ ...formData, effectId: e.target.value })}
                  placeholder="e.g., strobe-1"
                  disabled={!!editingEffect}
                />
                <span className="text-[10px] text-gray-500 mt-0.5">
                  Unique identifier for referencing this effect (defaults to effect name)
                </span>
              </label>

              <label className="flex flex-col text-xs font-medium">
                Display Name *
                <input
                  type="text"
                  className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-700 dark:border-gray-600"
                  value={formData.name || ''}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Strobe Effect"
                />
                <span className="text-[10px] text-gray-500 mt-0.5">
                  Display name for this effect reference
                </span>
              </label>

              {editingEffect && (
                <label className="flex flex-col text-xs font-medium">
                  Effect File ID
                  <input
                    type="text"
                    className="mt-1 rounded border px-2 py-1 bg-gray-100 dark:bg-gray-600 dark:border-gray-600 cursor-not-allowed"
                    value={formData.effectFileId || ''}
                    disabled
                  />
                  <span className="text-[10px] text-gray-500 mt-0.5">
                    Cannot be changed after import
                  </span>
                </label>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button
                className="px-3 py-1 text-xs border rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                onClick={closeDialog}>
                Cancel
              </button>
              <button
                className="px-3 py-1 text-xs bg-cyan-600 text-white rounded hover:bg-cyan-700"
                onClick={handleSave}>
                {editingEffect ? 'Save' : 'Import'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default EffectRegistry
