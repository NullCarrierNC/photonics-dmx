import React, { useMemo, useState } from 'react'
import type { EffectMode, NodeCueMode } from '../../../../../photonics-dmx/cues/types/nodeCueTypes'

type Props = {
  isOpen: boolean
  isEffectMode: boolean
  mode: NodeCueMode | EffectMode
  sourceBasename: string
  defaultGroupId: string
  existingGroupIds: ReadonlySet<string>
  existingFilenamesLower: ReadonlySet<string>
  onCancel: () => void
  onSave: (filename: string, groupId: string) => void
}

function ensureJsonBasename(raw: string): string {
  const stripped = raw.trim().replace(/^.*[/\\]/, '')
  if (!stripped) {
    return 'imported.json'
  }
  return stripped.toLowerCase().endsWith('.json') ? stripped : `${stripped}.json`
}

const ImportCueFileModal: React.FC<Props> = ({
  isOpen,
  isEffectMode,
  mode,
  sourceBasename,
  defaultGroupId,
  existingGroupIds,
  existingFilenamesLower,
  onCancel,
  onSave,
}) => {
  const [filename, setFilename] = useState(() => ensureJsonBasename(sourceBasename))
  const [groupId, setGroupId] = useState(() => defaultGroupId)

  const normalizedFilename = ensureJsonBasename(filename)
  const filenameLower = normalizedFilename.toLowerCase()
  const filenameTaken = useMemo(
    () => filenameLower.length > 0 && existingFilenamesLower.has(filenameLower),
    [existingFilenamesLower, filenameLower],
  )

  const groupIdNormalized = groupId.trim().toLowerCase()
  const groupIdTaken = useMemo(
    () => groupIdNormalized.length > 0 && existingGroupIds.has(groupIdNormalized),
    [existingGroupIds, groupIdNormalized],
  )

  const fileTypeLabel = isEffectMode ? 'Effect' : 'Cue'

  const handleSave = () => {
    const f = ensureJsonBasename(filename)
    const g = groupId.trim()
    if (!f || !g || filenameTaken || groupIdTaken) {
      return
    }
    onSave(f, g)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.metaKey) {
      handleSave()
    } else if (e.key === 'Escape') {
      onCancel()
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onCancel}>
      <div
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-[500px] max-w-[90vw]"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}>
        <h2 className="text-lg font-bold mb-4">
          Import {fileTypeLabel} File ({mode.toUpperCase()})
        </h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold mb-1">
              Save as filename <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              className={`w-full px-3 py-2 border rounded bg-white dark:bg-gray-700 text-sm ${
                filenameTaken
                  ? 'border-red-500 dark:border-red-500'
                  : 'border-gray-300 dark:border-gray-600'
              }`}
              spellCheck={false}
            />
            {filenameTaken ? (
              <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                A {fileTypeLabel.toLowerCase()} file with this name already exists. Choose a
                different filename.
              </p>
            ) : (
              <p className="text-xs text-gray-500 mt-1">
                Default is the imported file name; `.json` is added if omitted.
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1">
              {isEffectMode ? 'Effect' : 'Cue'} group ID <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              aria-invalid={groupIdTaken}
              className={`w-full px-3 py-2 border rounded bg-white dark:bg-gray-700 text-sm ${
                groupIdTaken
                  ? 'border-red-500 dark:border-red-500'
                  : 'border-gray-300 dark:border-gray-600'
              }`}
              spellCheck={false}
            />
            {groupIdTaken ? (
              <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                This group ID is already used by another {fileTypeLabel.toLowerCase()} file in{' '}
                {mode.toUpperCase()} mode. Choose a different ID.
              </p>
            ) : (
              <p className="text-xs text-gray-500 mt-1">
                A new ID avoids registry conflicts with existing groups. You can edit it before
                saving.
              </p>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={
              !ensureJsonBasename(filename).trim() ||
              !groupId.trim() ||
              filenameTaken ||
              groupIdTaken
            }
            className="px-4 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed">
            Import
          </button>
        </div>
      </div>
    </div>
  )
}

export default ImportCueFileModal
