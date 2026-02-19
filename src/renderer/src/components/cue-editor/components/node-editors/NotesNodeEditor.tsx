import React from 'react'
import type { NotesNode } from '../../../../../../photonics-dmx/cues/types/nodeCueTypes'

interface NotesNodeEditorProps {
  node: NotesNode
  updateNode: (updates: Partial<NotesNode>) => void
}

const NotesNodeEditor: React.FC<NotesNodeEditorProps> = ({ node, updateNode }) => {
  return (
    <div className="space-y-2 text-xs">
      <label className="flex flex-col font-medium">
        Style
        <select
          className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
          value={node.style ?? 'notes'}
          onChange={(event) =>
            updateNode({ style: event.target.value as 'notes' | 'info' | 'important' })
          }>
          <option value="info">Info</option>
          <option value="notes">Notes</option>
          <option value="important">Important</option>
        </select>
      </label>
      <label className="flex flex-col font-medium">
        Title
        <input
          type="text"
          className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
          value={node.title || ''}
          onChange={(event) => updateNode({ title: event.target.value })}
          placeholder="Optional title..."
        />
      </label>
      <label className="flex flex-col font-medium">
        Note
        <textarea
          className="mt-1 rounded border px-2 py-1 bg-gray-50 dark:bg-gray-800 dark:border-gray-700 resize-y min-h-[100px]"
          value={node.note || ''}
          onChange={(event) => updateNode({ note: event.target.value })}
          placeholder="Enter your note here..."
        />
      </label>
      <p className="text-[10px] text-gray-500">
        Notes are for documentation only and do not affect cue execution.
      </p>
    </div>
  )
}

export default NotesNodeEditor
