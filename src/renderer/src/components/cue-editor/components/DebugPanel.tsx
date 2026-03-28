import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useAtom } from 'jotai'
import type { IpcEventMap } from '../../../../../shared/ipcTypes'
import { RENDERER_RECEIVE } from '../../../../../shared/ipcChannels'
import { addIpcListener, removeIpcListener } from '../../../utils/ipcHelpers'
import { showNodeIdsAtom } from '../../../atoms'

type DebugLogEntry = IpcEventMap['node-cues:debug-log']

const MAX_ENTRIES = 200

const formatValue = (value: unknown): string => {
  if (value === undefined) return '<undefined>'
  if (value === null) return 'null'
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

interface DebugPanelProps {
  className?: string
}

const DebugPanel: React.FC<DebugPanelProps> = ({ className }) => {
  const [showNodeIds, setShowNodeIds] = useAtom(showNodeIdsAtom)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [entries, setEntries] = useState<DebugLogEntry[]>([])

  const appendEntry = useCallback((entry: DebugLogEntry) => {
    setEntries((prev) => {
      const next = [...prev, entry]
      if (next.length > MAX_ENTRIES) {
        next.splice(0, next.length - MAX_ENTRIES)
      }
      return next
    })
  }, [])

  const handleDebugLog = useCallback(
    (payload: DebugLogEntry) => {
      if (!payload) return
      appendEntry(payload)
    },
    [appendEntry],
  )

  const handleRuntimeError = useCallback(
    (message: string) => {
      if (typeof message !== 'string') return
      appendEntry({ message, variables: [], timestamp: Date.now() })
    },
    [appendEntry],
  )

  useEffect(() => {
    addIpcListener(RENDERER_RECEIVE.DEBUG_LOG, handleDebugLog)
    return () => removeIpcListener(RENDERER_RECEIVE.DEBUG_LOG, handleDebugLog)
  }, [handleDebugLog])

  useEffect(() => {
    addIpcListener(RENDERER_RECEIVE.NODE_CUE_RUNTIME_ERROR, handleRuntimeError)
    return () => removeIpcListener(RENDERER_RECEIVE.NODE_CUE_RUNTIME_ERROR, handleRuntimeError)
  }, [handleRuntimeError])

  const outputRows = useMemo(
    () =>
      entries.map((entry) => ({
        key: `${entry.timestamp}-${entry.message}`,
        entry,
      })),
    [entries],
  )

  const copyOutput = useCallback(async () => {
    const lines: string[] = []
    for (const entry of entries) {
      lines.push(entry.message)
      for (const variable of entry.variables) {
        lines.push(`${variable.name}: ${formatValue(variable.value)}`)
      }
      lines.push('')
    }
    const text = lines.join('\n').trim()
    if (!text) {
      return
    }
    try {
      await navigator.clipboard.writeText(text)
    } catch (error) {
      console.warn('Failed to copy debug output:', error)
    }
  }, [entries])

  return (
    <div
      className={`border-t border-gray-200 dark:border-gray-700 pt-3 flex flex-col ${className ?? ''}`}>
      <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300 cursor-pointer mb-2">
        <input
          type="checkbox"
          checked={showNodeIds}
          onChange={(e) => setShowNodeIds(e.target.checked)}
        />
        Show Node IDs
      </label>
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">Debug Panel</h3>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="text-xs text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
            onClick={() => setEntries([])}>
            Clear
          </button>
          <button
            type="button"
            className="text-xs text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
            onClick={copyOutput}>
            Copy
          </button>
          <button
            type="button"
            className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-200"
            onClick={() => setIsCollapsed((prev) => !prev)}>
            {isCollapsed ? 'Expand' : 'Collapse'}
          </button>
        </div>
      </div>
      {!isCollapsed && (
        <div className="mt-2 flex-1 min-h-0 overflow-y-auto rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-2 space-y-2 text-xs">
          {entries.length === 0 && <div className="text-gray-500">No debug output yet.</div>}
          {outputRows.map(({ key, entry }) => (
            <div key={key} className="space-y-1">
              <hr className="mt-2 mb-1" />
              <div className="font-semibold text-red-500">{entry.message}</div>
              {entry.variables.map((variable) => {
                const formattedValue = formatValue(variable.value)
                const isMultiLine = formattedValue.includes('\n')
                return (
                  <div key={variable.name} style={{ fontFamily: '"Courier New", monospace' }}>
                    {isMultiLine ? (
                      <pre
                        className="whitespace-pre-wrap"
                        style={{ fontFamily: '"Courier New", monospace' }}>
                        {variable.name}: {formattedValue}
                      </pre>
                    ) : (
                      <span>
                        {variable.name}: {formattedValue}
                      </span>
                    )}
                  </div>
                )
              })}
              <hr className="mt-2 mb-2" />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default DebugPanel
