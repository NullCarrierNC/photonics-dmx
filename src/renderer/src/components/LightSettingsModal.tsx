import React, { useEffect, useRef } from 'react'
import LightSettings from './LightSettings'
import type { DmxFixture } from '../../../photonics-dmx/types'

interface LightSettingsModalProps {
  isOpen: boolean
  /** The working copy being edited. Edits are reported through {@link onChange}. */
  light: DmxFixture | null
  onChange: (light: DmxFixture | null) => void
  onSave: () => void
  /** Backdrop click, Escape and the Cancel button all route here. */
  onCancel: () => void
  /** Omitted for a light that has not been saved yet, which has nothing to delete. */
  onDelete?: () => void
}

/**
 * Modal wrapper around {@link LightSettings}.
 *
 * Purely presentational: dismissal from any source reports `onCancel` and the page decides whether
 * that needs confirming, so the discard rules live next to the state that knows if anything changed.
 */
const LightSettingsModal: React.FC<LightSettingsModalProps> = ({
  isOpen,
  light,
  onChange,
  onSave,
  onCancel,
  onDelete,
}) => {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return
    panelRef.current?.focus()
  }, [isOpen])

  if (!isOpen || !light) return null

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onCancel()
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onCancel}
      role="presentation">
      <div
        ref={panelRef}
        // Tall form (type, name, base channels, added channels, strobe values, moving-head config),
        // so it scrolls inside the viewport rather than running off the bottom of it.
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        role="dialog"
        aria-modal="true"
        aria-labelledby="light-settings-title"
        tabIndex={-1}>
        <h2
          id="light-settings-title"
          className="text-xl font-bold mb-4 text-gray-900 dark:text-gray-100">
          {onDelete ? `Edit ${light.name}` : 'Add Light'}
        </h2>

        <LightSettings currentLight={light} setCurrentLight={onChange} />

        <div className="flex flex-wrap gap-2 justify-between items-center mt-6 pt-3 border-t border-gray-200 dark:border-gray-600">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onSave}
              className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 text-sm">
              Save
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 bg-gray-400 text-white rounded hover:bg-gray-500 text-sm">
              Cancel
            </button>
          </div>
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 text-sm">
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default LightSettingsModal
