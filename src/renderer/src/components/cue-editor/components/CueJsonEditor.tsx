import React, { useEffect, useRef, useState, useCallback } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { defaultKeymap } from '@codemirror/commands'
import { json } from '@codemirror/lang-json'
import { oneDark } from '@codemirror/theme-one-dark'
import type {
  AudioNodeCueDefinition,
  NodeCueFile,
  YargNodeCueDefinition,
} from '../../../../../photonics-dmx/cues/types/nodeCueTypes'
import type { EditorDocument } from '../lib/types'
import { validateNodeCue } from '../../../ipcApi'

type CueJsonEditorProps = {
  cueDefinition: YargNodeCueDefinition | AudioNodeCueDefinition
  editorDoc: EditorDocument
  selectedCueId: string
  onSave: (updatedCue: YargNodeCueDefinition | AudioNodeCueDefinition) => void
  onCancel: () => void
  onDirtyChange?: (dirty: boolean) => void
}

const CueJsonEditor: React.FC<CueJsonEditorProps> = ({
  cueDefinition,
  editorDoc,
  selectedCueId,
  onSave,
  onCancel,
  onDirtyChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const [hasEdits, setHasEdits] = useState(false)
  const [validationPassed, setValidationPassed] = useState(false)
  const validationPassedRef = useRef(false)
  const [contentChangedAfterValidation, setContentChangedAfterValidation] = useState(false)
  const [validationErrors, setValidationErrors] = useState<string[]>([])

  useEffect(() => {
    onDirtyChange?.(hasEdits)
  }, [hasEdits, onDirtyChange])

  useEffect(() => {
    validationPassedRef.current = validationPassed
  }, [validationPassed])

  const showSaveButton = validationPassed && !contentChangedAfterValidation

  const buildFileWithCue = useCallback(
    (cue: YargNodeCueDefinition | AudioNodeCueDefinition): NodeCueFile => {
      const file = editorDoc.file as NodeCueFile
      return {
        ...file,
        cues: file.cues.map((c) => (c.id === selectedCueId ? cue : c)),
      }
    },
    [editorDoc.file, selectedCueId],
  )

  const handleValidate = useCallback(async () => {
    const view = viewRef.current
    if (!view) return

    const raw = view.state.doc.toString()
    setValidationErrors([])

    let parsed: unknown
    try {
      parsed = JSON.parse(raw) as YargNodeCueDefinition | AudioNodeCueDefinition
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Invalid JSON'
      setValidationErrors([`Parse error: ${message}`])
      setValidationPassed(false)
      return
    }

    const fileWithCue = buildFileWithCue(parsed as YargNodeCueDefinition | AudioNodeCueDefinition)
    const result = await validateNodeCue({ content: fileWithCue })

    if (!result.valid) {
      setValidationErrors(result.errors ?? ['Validation failed'])
      setValidationPassed(false)
      return
    }

    setValidationErrors([])
    setValidationPassed(true)
    setContentChangedAfterValidation(false)
  }, [buildFileWithCue])

  const handleSave = useCallback(() => {
    const view = viewRef.current
    if (!view || !validationPassed) return

    const raw = view.state.doc.toString()
    try {
      const parsed = JSON.parse(raw) as YargNodeCueDefinition | AudioNodeCueDefinition
      onSave(parsed)
    } catch {
      setValidationErrors(['Parse error: cannot save invalid JSON'])
    }
  }, [onSave, validationPassed])

  useEffect(() => {
    if (!containerRef.current) return

    const extensions = [
      json(),
      oneDark,
      keymap.of(defaultKeymap),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          setHasEdits(true)
          if (validationPassedRef.current) {
            setContentChangedAfterValidation(true)
          }
        }
      }),
    ]

    const initialState = EditorState.create({
      doc: JSON.stringify(cueDefinition, null, 2),
      extensions,
    })

    const view = new EditorView({
      state: initialState,
      parent: containerRef.current,
    })
    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [cueDefinition])

  return (
    <div className="flex-1 min-h-0 relative flex flex-col rounded-b-lg overflow-hidden bg-[#282c34]">
      <div className="flex items-center justify-end gap-2 px-2 py-1.5 bg-[#21252b] border-b border-[#181a1f] shrink-0">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-sm font-medium rounded text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500">
          Cancel
        </button>
        {showSaveButton ? (
          <button
            type="button"
            onClick={handleSave}
            className="px-3 py-1.5 text-sm font-medium rounded text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500">
            Save
          </button>
        ) : (
          <button
            type="button"
            onClick={handleValidate}
            className="px-3 py-1.5 text-sm font-medium rounded text-white bg-orange-500 hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-400">
            Validate
          </button>
        )}
      </div>
      <div ref={containerRef} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden" />
      {validationErrors.length > 0 && (
        <div className="px-3 py-2 text-xs text-red-200 bg-red-900/50 border-t border-red-800 overflow-auto max-h-24">
          {validationErrors.map((msg, i) => (
            <div key={i}>{msg}</div>
          ))}
        </div>
      )}
    </div>
  )
}

export default CueJsonEditor
