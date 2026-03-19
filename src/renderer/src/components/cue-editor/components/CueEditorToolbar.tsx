import React from 'react'
import { useAtom } from 'jotai'
import { liveMonitorEnabledAtom } from '@renderer/atoms'

export type CueTypeMode = 'yarg' | 'audio'

type CueEditorToolbarProps = {
  cueMode: CueTypeMode
  isEffectMode: boolean
  onCueModeChange: (mode: CueTypeMode) => void
  onEffectToggle: (isEffect: boolean) => void
  onNewFile: () => void
  onSave: () => void
  onImport: () => void
  onExport: () => void
  onDelete: () => void
  hasEditorDoc: boolean
  hasFile: boolean
  newFileLabel: string
  importLabel: string
  exportLabel: string
  deleteLabel: string
}

const primaryButton = 'px-3 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-500'
const secondaryButton =
  'px-3 py-1 text-xs rounded bg-gray-200 dark:bg-gray-800 dark:text-gray-100 hover:bg-gray-300 dark:hover:bg-gray-700'
const dangerButton = 'px-3 py-1 text-xs rounded bg-red-600 text-white hover:bg-red-500'

const segmentActive =
  'px-3 py-1 text-xs border border-gray-300 dark:border-gray-600 bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-medium'
const segmentInactive =
  'px-3 py-1 text-xs border border-l-0 border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
const segmentLeft = 'rounded-l'
const segmentRight = 'rounded-r'

const CueEditorToolbar: React.FC<CueEditorToolbarProps> = ({
  cueMode,
  isEffectMode,
  onCueModeChange,
  onEffectToggle,
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
  deleteLabel,
}) => {
  const [liveMonitor, setLiveMonitor] = useAtom(liveMonitorEnabledAtom)
  return (
    <div className="relative flex justify-between items-center gap-4 flex-wrap">
      <span className="absolute left-1/2 -translate-x-1/2 text-sm font-semibold text-gray-700 dark:text-gray-200 pointer-events-none select-none">
        {isEffectMode ? 'Effect Editor' : 'Cue Editor'}
      </span>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-0">
          <button
            type="button"
            className={`${cueMode === 'yarg' ? segmentActive : segmentInactive} ${segmentLeft}`}
            onClick={() => onCueModeChange('yarg')}>
            YARG
          </button>
          <button
            type="button"
            className={`${cueMode === 'audio' ? segmentActive : segmentInactive} ${segmentRight}`}
            onClick={() => onCueModeChange('audio')}>
            Audio
          </button>
        </div>
        {cueMode === 'audio' && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
              Live Monitor
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={liveMonitor}
              onClick={() => setLiveMonitor(!liveMonitor)}
              className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 ${
                liveMonitor ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-600'
              }`}>
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-transform ${
                  liveMonitor ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
        )}
        <div className="flex items-center gap-2">
          <span
            className={`text-xs font-medium ${!isEffectMode ? 'text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'}`}>
            Cues
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={isEffectMode}
            onClick={() => onEffectToggle(!isEffectMode)}
            className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 ${
              isEffectMode ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-600'
            }`}>
            <span
              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-transform ${
                isEffectMode ? 'translate-x-4' : 'translate-x-0.5'
              }`}
            />
          </button>
          <span
            className={`text-xs font-medium ${isEffectMode ? 'text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'}`}>
            Effects
          </span>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          className={`${primaryButton} ${!hasEditorDoc ? 'opacity-50 cursor-not-allowed' : ''}`}
          onClick={onSave}
          disabled={!hasEditorDoc}>
          Save
        </button>
        <button className={secondaryButton} onClick={onNewFile}>
          {newFileLabel}
        </button>
        <button className={secondaryButton} onClick={onImport}>
          {importLabel}
        </button>
        <button
          className={`${secondaryButton} ${!hasFile ? 'opacity-50 cursor-not-allowed' : ''}`}
          onClick={onExport}
          disabled={!hasFile}>
          {exportLabel}
        </button>
        <button
          className={`${dangerButton} ${!hasFile ? 'opacity-50 cursor-not-allowed' : ''}`}
          onClick={onDelete}
          disabled={!hasFile}>
          {deleteLabel}
        </button>
      </div>
    </div>
  )
}

export default CueEditorToolbar
