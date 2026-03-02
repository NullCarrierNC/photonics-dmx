import React, { useState } from 'react'
import type { NodeCueFileSummary } from '../../../../../photonics-dmx/cues/node/loader/NodeCueLoader'
import type { EffectFileSummary } from '../../../../../photonics-dmx/cues/node/loader/EffectLoader'
import type {
  NodeCueMode,
  YargNodeCueDefinition,
  AudioNodeCueDefinition,
  NodeCueFile,
  EffectFile,
} from '../../../../../photonics-dmx/cues/types/nodeCueTypes'
import type { EditorDocument } from '../lib/types'

type Props = {
  mode: NodeCueMode
  fileList: NodeCueFileSummary[]
  effectFileList: EffectFileSummary[]
  editorDoc: EditorDocument | null
  selectedCueId: string | null
  onSelectFile: (file: NodeCueFileSummary) => void
  onSelectEffectFile: (file: EffectFileSummary) => void
  onReload: () => void
  onAddCue: () => void
  onAddEffect: () => void
  onRemoveCue: (cueId: string) => void
  onRemoveEffect: (effectId: string) => void
  onSelectCue: (cue: YargNodeCueDefinition | AudioNodeCueDefinition | null) => void
}

const CueFileSidebar: React.FC<Props> = ({
  mode,
  fileList,
  effectFileList,
  editorDoc,
  selectedCueId,
  onSelectFile,
  onSelectEffectFile,
  onReload,
  onAddCue,
  onAddEffect,
  onRemoveCue,
  onRemoveEffect,
  onSelectCue,
}) => {
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null)

  const isEffectMode = editorDoc?.mode === 'effect'
  const listLabel = isEffectMode ? 'Effect List' : 'Cue List'
  const addLabel = isEffectMode ? '+ Add Effect' : '+ Add Cue'
  const itemCountLabel = isEffectMode ? 'effect(s)' : 'cue(s)'

  // Get the items list based on mode, sorted alphabetically by name
  const rawItems = editorDoc
    ? isEffectMode
      ? (editorDoc.file as EffectFile).effects
      : (editorDoc.file as NodeCueFile).cues
    : []
  const items = [...rawItems].sort((a, b) =>
    (a.name ?? '').localeCompare(b.name ?? '', undefined, { sensitivity: 'base' }),
  )

  // Use the appropriate file list based on editor mode, sorted alphabetically by group name
  const displayFileList = [...(isEffectMode ? effectFileList : fileList)].sort((a, b) =>
    (a.groupName ?? '').localeCompare(b.groupName ?? '', undefined, { sensitivity: 'base' }),
  )

  return (
    <aside className="bg-white dark:bg-gray-900 rounded-lg shadow-inner p-3 overflow-hidden flex flex-col flex-1 min-h-0">
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <h3 className="font-semibold">Files ({mode.toUpperCase()})</h3>
        <button className="text-xs text-blue-500 hover:underline" onClick={onReload}>
          Reload
        </button>
      </div>
      <div className="space-y-2 overflow-y-auto flex-1 min-h-0">
        {displayFileList.length === 0 && (
          <p className="text-xs text-gray-500">No files found. Create one to get started.</p>
        )}
        {displayFileList.map((file) => (
          <button
            key={file.path}
            className={`w-full text-left border rounded px-2 py-1 text-xs ${editorDoc?.path === file.path ? 'border-blue-500 bg-blue-50 dark:bg-blue-900 dark:border-blue-400' : 'border-gray-200 dark:border-gray-700'}`}
            onClick={() =>
              isEffectMode
                ? onSelectEffectFile(file as EffectFileSummary)
                : onSelectFile(file as NodeCueFileSummary)
            }>
            <div
              className={`font-semibold truncate ${file.bundled === true ? 'text-yellow-600 dark:text-yellow-400' : ''}`}>
              {file.groupName}
            </div>
            <div className="text-[10px] text-gray-500">
              {isEffectMode
                ? (file as EffectFileSummary).effectCount
                : (file as NodeCueFileSummary).cueCount}{' '}
              {itemCountLabel}
            </div>
          </button>
        ))}
      </div>
      <div className="mt-4 border-t border-gray-200 dark:border-gray-800 pt-4 flex-1 min-h-0 flex flex-col overflow-hidden">
        <div className="flex justify-between items-center mb-2 flex-shrink-0">
          <h3 className="font-semibold text-sm">{listLabel}</h3>
          <button
            className="text-blue-500 text-xs hover:underline"
            onClick={isEffectMode ? onAddEffect : onAddCue}>
            {addLabel}
          </button>
        </div>
        <div className="space-y-1 text-xs overflow-y-auto flex-1 min-h-0">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-2">
              <button
                className={`flex-1 text-left px-2 py-1 rounded border ${selectedCueId === item.id ? 'border-blue-500 bg-blue-50 dark:bg-blue-900 dark:border-blue-400' : 'border-gray-200 dark:border-gray-700'}`}
                onClick={() =>
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- file summary to cue type
                  onSelectCue(item as any)
                }>
                {item.name}
              </button>
              <button
                className="text-[11px] text-red-500 hover:underline disabled:text-gray-400"
                onClick={() => setPendingRemoveId(item.id)}
                disabled={items.length <= 1}
                title={
                  items.length <= 1
                    ? `At least one ${isEffectMode ? 'effect' : 'cue'} is required`
                    : `Remove ${isEffectMode ? 'effect' : 'cue'}`
                }>
                Remove
              </button>
            </div>
          ))}
        </div>
      </div>

      {pendingRemoveId !== null &&
        (() => {
          const target = items.find((i) => i.id === pendingRemoveId)
          return (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
              role="dialog"
              aria-modal="true"
              aria-labelledby="remove-confirm-title">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-4 max-w-sm text-sm space-y-3">
                <p id="remove-confirm-title" className="font-semibold">
                  Remove {isEffectMode ? 'effect' : 'cue'}?
                </p>
                <p className="text-gray-600 dark:text-gray-400">
                  Remove <span className="font-medium">{target?.name ?? pendingRemoveId}</span> from
                  this file?
                </p>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (isEffectMode) {
                        onRemoveEffect(pendingRemoveId)
                      } else {
                        onRemoveCue(pendingRemoveId)
                      }
                      setPendingRemoveId(null)
                    }}
                    className="px-3 py-1.5 text-sm font-medium rounded text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500">
                    Remove
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingRemoveId(null)}
                    className="px-3 py-1.5 text-sm font-medium rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-400">
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )
        })()}
    </aside>
  )
}

export default CueFileSidebar
