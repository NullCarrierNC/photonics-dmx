import React, { useMemo, useState } from 'react'

export type ImportRigSummary = {
  /** New templates that will be added to My Lights. */
  templatesToAddCount: number
  /** Templates reused from existing My Lights (matched by id or identical settings). */
  templatesReusedCount: number
  /** Rig lights whose fixture wasn't included in the file; they'll be imported unlinked. */
  orphanCount: number
}

type Props = {
  isOpen: boolean
  sourceBasename: string
  defaultName: string
  existingRigNamesLower: ReadonlySet<string>
  summary: ImportRigSummary
  onCancel: () => void
  onSave: (rigName: string) => void
}

const ImportRigModal: React.FC<Props> = ({
  isOpen,
  sourceBasename,
  defaultName,
  existingRigNamesLower,
  summary,
  onCancel,
  onSave,
}) => {
  const [rigName, setRigName] = useState(() => defaultName)

  const trimmed = rigName.trim()
  const nameTaken = useMemo(
    () => trimmed.length > 0 && existingRigNamesLower.has(trimmed.toLowerCase()),
    [existingRigNamesLower, trimmed],
  )

  const handleSave = () => {
    if (!trimmed) return
    onSave(trimmed)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.metaKey) {
      handleSave()
    } else if (e.key === 'Escape') {
      onCancel()
    }
  }

  if (!isOpen) return null

  const { templatesToAddCount, templatesReusedCount, orphanCount } = summary

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onCancel}>
      <div
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-[500px] max-w-[90vw]"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}>
        <h2 className="text-lg font-bold mb-1">Import Layout</h2>
        <p className="text-xs text-gray-500 mb-4">From {sourceBasename}</p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold mb-1">
              Rig name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={rigName}
              onChange={(e) => setRigName(e.target.value)}
              aria-invalid={nameTaken}
              className={`w-full px-3 py-2 border rounded bg-white dark:bg-gray-700 text-sm ${
                nameTaken
                  ? 'border-amber-500 dark:border-amber-500'
                  : 'border-gray-300 dark:border-gray-600'
              }`}
              spellCheck={false}
            />
            {nameTaken ? (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                You already have a layout with this name. A number will be appended to keep it
                unique.
              </p>
            ) : (
              <p className="text-xs text-gray-500 mt-1">
                The imported layout is added as a new layout; your other layouts are untouched.
              </p>
            )}
          </div>

          <div className="rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-3 text-sm space-y-1">
            <div className="font-semibold text-gray-700 dark:text-gray-300">Light templates</div>
            <p className="text-gray-600 dark:text-gray-400">
              {templatesToAddCount === 0
                ? 'No new light templates: all are already in My Lights.'
                : `${templatesToAddCount} new template${templatesToAddCount === 1 ? '' : 's'} will be added to My Lights.`}
            </p>
            {templatesReusedCount > 0 && (
              <p className="text-gray-600 dark:text-gray-400">
                {templatesReusedCount} reused from your existing My Lights (not duplicated).
              </p>
            )}
            {orphanCount > 0 && (
              <p className="text-amber-600 dark:text-amber-400">
                {orphanCount} light{orphanCount === 1 ? '' : 's'} reference a fixture not included
                in this file and will be imported unlinked.
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
            disabled={!trimmed}
            className="px-4 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed">
            Import
          </button>
        </div>
      </div>
    </div>
  )
}

export default ImportRigModal
