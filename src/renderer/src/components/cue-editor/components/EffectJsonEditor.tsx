import React, { useEffect, useRef, useState, useCallback } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap, lineNumbers } from '@codemirror/view'
import { defaultKeymap } from '@codemirror/commands'
import { json, jsonParseLinter } from '@codemirror/lang-json'
import { oneDark } from '@codemirror/theme-one-dark'
import { linter, lintGutter, setDiagnostics, type Diagnostic } from '@codemirror/lint'
import { ensureSyntaxTree } from '@codemirror/language'
import type {
  AudioEffectDefinition,
  EffectFile,
  YargEffectDefinition,
} from '../../../../../photonics-dmx/cues/types/nodeCueTypes'
import type { EditorDocument } from '../lib/types'
import { validateEffect } from '../../../ipcApi'

/**
 * Resolve a JSON Pointer path (e.g. ["nodes", "events", "0", "type"]) to character
 * positions in the editor by walking the tree.
 */
function resolveJsonPath(
  state: EditorState,
  segments: string[],
): { from: number; to: number } | null {
  const tree = ensureSyntaxTree(state, state.doc.length)
  if (!tree) return null

  const cur = tree.cursor()
  if (cur.name !== 'JsonText') return null
  if (!cur.firstChild()) return null

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    const name = cur.name as string

    if (name === 'Object') {
      if (!cur.firstChild()) return null
      while ((cur.name as string) === '{' || (cur.name as string) === '}') {
        if (!cur.nextSibling()) return null
      }
      let found = false
      while ((cur.name as string) === 'Property') {
        if (!cur.firstChild()) return null
        const key = state.doc.sliceString(cur.from, cur.to).replace(/^"|"$/g, '')
        if (!cur.parent()) return null
        if (key === seg) {
          cur.firstChild()
          cur.nextSibling()
          cur.nextSibling()
          found = true
          break
        }
        if (!cur.nextSibling()) return null
        while ((cur.name as string) === ',') {
          if (!cur.nextSibling()) return null
        }
      }
      if (!found) return null
    } else if (name === 'Array') {
      const index = parseInt(seg, 10)
      if (Number.isNaN(index) || index < 0) return null
      if (!cur.firstChild()) return null
      if ((cur.name as string) === '[' && !cur.nextSibling()) return null
      for (let j = 0; j < index; j++) {
        if (!cur.nextSibling() || (cur.name as string) !== ',') return null
        if (!cur.nextSibling()) return null
      }
    } else {
      return null
    }

    if (i === segments.length - 1) return { from: cur.from, to: cur.to }
  }

  return { from: cur.from, to: cur.to }
}

type EffectJsonEditorProps = {
  effectDefinition: YargEffectDefinition | AudioEffectDefinition
  editorDoc: EditorDocument
  selectedEffectId: string
  onSave: (updatedEffect: YargEffectDefinition | AudioEffectDefinition) => void
  onCancel: () => void
  onDirtyChange?: (dirty: boolean) => void
}

const EffectJsonEditor: React.FC<EffectJsonEditorProps> = ({
  effectDefinition,
  editorDoc,
  selectedEffectId,
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

  const buildFileWithEffect = useCallback(
    (effect: YargEffectDefinition | AudioEffectDefinition): EffectFile => {
      const file = editorDoc.file as EffectFile
      return {
        ...file,
        effects: file.effects.map((e) => (e.id === selectedEffectId ? effect : e)),
      }
    },
    [editorDoc.file, selectedEffectId],
  )

  const handleValidate = useCallback(async () => {
    const view = viewRef.current
    if (!view) return

    const raw = view.state.doc.toString()
    setValidationErrors([])
    view.dispatch(setDiagnostics(view.state, []))

    let parsed: unknown
    try {
      parsed = JSON.parse(raw) as YargEffectDefinition | AudioEffectDefinition
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Invalid JSON'
      setValidationErrors([`Parse error: ${message}`])
      setValidationPassed(false)
      return
    }

    const fileWithEffect = buildFileWithEffect(
      parsed as YargEffectDefinition | AudioEffectDefinition,
    )
    const result = await validateEffect({ content: fileWithEffect })

    if (!result.valid) {
      setValidationErrors(result.errors ?? ['Validation failed'])
      setValidationPassed(false)
      const structured =
        (result as { structuredErrors?: { instancePath: string; message: string }[] })
          .structuredErrors ?? []
      const effectIndex = fileWithEffect.effects.findIndex((e) => e.id === selectedEffectId)
      const effectPrefix = effectIndex >= 0 ? `/effects/${effectIndex}/` : ''
      const diagnostics: Diagnostic[] = []
      for (const err of structured) {
        const pathRelative =
          effectPrefix && err.instancePath.startsWith(effectPrefix)
            ? err.instancePath.slice(effectPrefix.length)
            : err.instancePath
        const segments = pathRelative.split('/').filter(Boolean)
        const pos = resolveJsonPath(view.state, segments)
        if (pos) {
          diagnostics.push({
            from: pos.from,
            to: pos.to,
            severity: 'error',
            message: err.message,
            source: 'schema',
          })
        }
      }
      view.dispatch(setDiagnostics(view.state, diagnostics))
      return
    }

    view.dispatch(setDiagnostics(view.state, []))
    setValidationErrors([])
    setValidationPassed(true)
    setContentChangedAfterValidation(false)
  }, [buildFileWithEffect, selectedEffectId])

  const handleSave = useCallback(() => {
    const view = viewRef.current
    if (!view || !validationPassed) return

    const raw = view.state.doc.toString()
    try {
      const parsed = JSON.parse(raw) as YargEffectDefinition | AudioEffectDefinition
      onSave(parsed)
    } catch {
      setValidationErrors(['Parse error: cannot save invalid JSON'])
    }
  }, [onSave, validationPassed])

  useEffect(() => {
    if (!containerRef.current) return

    const extensions = [
      lineNumbers(),
      json(),
      oneDark,
      keymap.of(defaultKeymap),
      lintGutter(),
      linter(jsonParseLinter()),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          setHasEdits(true)
          if (validationPassedRef.current) {
            setContentChangedAfterValidation(true)
          }
          update.view.dispatch(setDiagnostics(update.state, []))
        }
      }),
    ]

    const initialState = EditorState.create({
      doc: JSON.stringify(effectDefinition, null, 2),
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
  }, [effectDefinition])

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

export default EffectJsonEditor
