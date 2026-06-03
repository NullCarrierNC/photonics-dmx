import React from 'react'

type CueEditorWarningsProps = {
  warnings: string[]
}

/**
 * Non-blocking, informational warnings shown beneath the editor (e.g. timing nodes wired under a
 * level-mode trigger). Unlike validation errors, these never gate saving.
 */
const CueEditorWarnings: React.FC<CueEditorWarningsProps> = ({ warnings }) => {
  if (warnings.length === 0) return null
  return (
    <div className="p-3 text-xs text-amber-700 dark:text-amber-300 border-t border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40">
      <p className="font-semibold mb-1">Warnings</p>
      <ul className="list-disc list-inside space-y-1">
        {warnings.map((warning) => (
          <li key={warning}>{warning}</li>
        ))}
      </ul>
    </div>
  )
}

export default CueEditorWarnings
