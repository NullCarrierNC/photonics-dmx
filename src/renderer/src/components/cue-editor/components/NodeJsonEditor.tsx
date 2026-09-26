import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { Annotation, EditorState } from '@codemirror/state'
import { EditorView, keymap, lineNumbers } from '@codemirror/view'
import { defaultKeymap } from '@codemirror/commands'
import { json, jsonParseLinter } from '@codemirror/lang-json'
import { oneDark } from '@codemirror/theme-one-dark'
import { linter, lintGutter, setDiagnostics, type Diagnostic } from '@codemirror/lint'
import { ensureSyntaxTree } from '@codemirror/language'

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

/** What a validation channel answers, as far as the editor reads it. */
export type JsonValidationResult = {
  valid: boolean
  errors?: string[]
  structuredErrors?: { instancePath: string; message: string }[]
  /** Cue validation reports these. Effect validation has none, so an effect shows no warnings. */
  warnings?: string[]
}

/** Marks a document replace that brings in the definition from outside, which is not an edit. */
const externalSync = Annotation.define<boolean>()

const formatDefinition = (definition: unknown): string => JSON.stringify(definition, null, 2)

export type NodeJsonEditorProps<
  K extends string,
  D extends { id: string },
  F extends Record<K, D[]>,
> = {
  definition: D
  /** The array in the file holding the definitions, for pointing schema errors at the edited one. */
  collectionKey: K
  selectedId: string
  /** The whole file with the edited definition in place, for validation. */
  buildFile: (definition: D) => F
  validate: (file: F) => Promise<JsonValidationResult>
  /** Adjusts a parsed definition before validation, with notices to show the author. */
  reconcile?: (definition: D) => { definition: D; notices: string[] }
  onSave: (definition: D) => void
  onCancel: () => void
  onDirtyChange?: (dirty: boolean) => void
}

/**
 * The JSON editor behind the cue and effect editors: edit one definition as text, validate it inside
 * its file, and apply it once it passes. Schema errors are pointed back at the spot in the text they
 * came from, and warnings are shown without blocking the save. A different selected definition
 * opens fresh, with nothing unsaved.
 */
function NodeJsonEditor<K extends string, D extends { id: string }, F extends Record<K, D[]>>(
  props: NodeJsonEditorProps<K, D, F>,
): JSX.Element {
  return <DefinitionTextEditor key={props.selectedId} {...props} />
}

function DefinitionTextEditor<
  K extends string,
  D extends { id: string },
  F extends Record<K, D[]>,
>({
  definition,
  collectionKey,
  selectedId,
  buildFile,
  validate,
  reconcile,
  onSave,
  onCancel,
  onDirtyChange,
}: NodeJsonEditorProps<K, D, F>): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const [hasEdits, setHasEdits] = useState(false)
  const definitionText = useMemo(() => formatDefinition(definition), [definition])
  /**
   * The definition text the editor last took in, so a new object with the same content is ignored.
   */
  const [syncedText, setSyncedText] = useState(definitionText)
  const initialTextRef = useRef(definitionText)
  // The definition changed from outside while the text held unsaved edits.
  const changedOutside = hasEdits && definitionText !== syncedText
  const [validationPassed, setValidationPassed] = useState(false)
  const [validating, setValidating] = useState(false)
  const validationPassedRef = useRef(false)
  const [contentChangedAfterValidation, setContentChangedAfterValidation] = useState(false)
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [notices, setNotices] = useState<string[]>([])

  useEffect(() => {
    onDirtyChange?.(hasEdits)
  }, [hasEdits, onDirtyChange])

  /** Replace the text with `next` as the definition, leaving nothing unsaved. */
  const takeDefinition = useCallback((view: EditorView, next: string) => {
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: next },
      annotations: externalSync.of(true),
    })
    setSyncedText(next)
    setHasEdits(false)
    setValidationPassed(false)
    setContentChangedAfterValidation(false)
    setValidationErrors([])
    setNotices([])
  }, [])

  useEffect(() => {
    validationPassedRef.current = validationPassed
  }, [validationPassed])

  const showSaveButton = validationPassed && !contentChangedAfterValidation

  const handleValidate = useCallback(async () => {
    const view = viewRef.current
    if (!view) return

    const raw = view.state.doc.toString()
    setValidationErrors([])
    setNotices([])
    view.dispatch(setDiagnostics(view.state, []))

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Invalid JSON'
      setValidationErrors([`Parse error: ${message}`])
      setValidationPassed(false)
      return
    }

    const fail = (message: string): void => {
      setValidating(false)
      setValidationErrors([`Validation failed: ${message}`])
      setValidationPassed(false)
    }

    // The schema judges the fields. A definition that is not an object never reaches it, since
    // the reconcile step and the file builder read fields off it.
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      fail('the definition must be a JSON object')
      return
    }

    let fileWithDefinition: F
    try {
      let definition = parsed as D
      if (reconcile) {
        const reconciled = reconcile(definition)
        if (reconciled.notices.length > 0) {
          // Rewrite the editor text with the reconciled definition before validation passes, so
          // the doc-change listener does not flip contentChangedAfterValidation.
          view.dispatch({
            changes: {
              from: 0,
              to: view.state.doc.length,
              insert: JSON.stringify(reconciled.definition, null, 2),
            },
          })
          setNotices(reconciled.notices)
        }
        definition = reconciled.definition
      }
      fileWithDefinition = buildFile(definition)
    } catch (e) {
      fail(e instanceof Error ? e.message : String(e))
      return
    }

    const validatedText = view.state.doc.toString()
    setValidating(true)
    let result: JsonValidationResult
    try {
      result = await validate(fileWithDefinition)
    } catch (e) {
      fail(e instanceof Error ? e.message : String(e))
      return
    }
    setValidating(false)
    // Text typed while the validation ran is not what it judged, so that text is validated again.
    if (view.state.doc.toString() !== validatedText) {
      setValidationPassed(false)
      return
    }

    if (!result.valid) {
      setValidationErrors(result.errors ?? ['Validation failed'])
      setValidationPassed(false)
      const index = fileWithDefinition[collectionKey].findIndex((d) => d.id === selectedId)
      const prefix = index >= 0 ? `/${collectionKey}/${index}/` : ''
      const diagnostics: Diagnostic[] = []
      for (const err of result.structuredErrors ?? []) {
        const pathRelative =
          prefix && err.instancePath.startsWith(prefix)
            ? err.instancePath.slice(prefix.length)
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
    // Warnings do not block a save: the definition is valid, but something in it will not fire.
    // They share the notice line with any reconcile notices, so the author sees them before saving.
    const warnings = result.warnings ?? []
    if (warnings.length > 0) {
      setNotices((current) => [...current, ...warnings])
    }
    setValidationPassed(true)
    setContentChangedAfterValidation(false)
  }, [buildFile, collectionKey, reconcile, selectedId, validate])

  const handleSave = useCallback(() => {
    const view = viewRef.current
    if (!view || !validationPassed) return

    const raw = view.state.doc.toString()
    try {
      onSave(JSON.parse(raw) as D)
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
        if (update.transactions.some((tr) => tr.annotation(externalSync))) {
          return
        }
        if (update.docChanged) {
          setHasEdits(true)
          if (validationPassedRef.current) {
            setContentChangedAfterValidation(true)
            setNotices([])
          }
          update.view.dispatch(setDiagnostics(update.state, []))
        }
      }),
    ]

    const initialState = EditorState.create({ doc: initialTextRef.current, extensions })

    const view = new EditorView({
      state: initialState,
      parent: containerRef.current,
    })
    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [])

  // The definition can change from outside, from the metadata form above for one. Clean text takes
  // the change. Unsaved text is kept, and the author is told and offered a reload.
  useEffect(() => {
    const view = viewRef.current
    if (view && !hasEdits && definitionText !== syncedText) {
      takeDefinition(view, definitionText)
    }
  }, [definitionText, hasEdits, syncedText, takeDefinition])

  const handleReload = useCallback(() => {
    const view = viewRef.current
    if (view) takeDefinition(view, definitionText)
  }, [definitionText, takeDefinition])

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
            Apply
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void handleValidate()}
            disabled={validating}
            className="px-3 py-1.5 text-sm font-medium rounded text-white bg-orange-500 hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-400">
            Validate
          </button>
        )}
      </div>
      <div ref={containerRef} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden" />
      {changedOutside && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-amber-100 bg-amber-900/50 border-t border-amber-800">
          <span>
            This definition changed outside the JSON editor. Reload to take the change and drop the
            unsaved text.
          </span>
          <button
            type="button"
            onClick={handleReload}
            className="px-2 py-1 rounded text-white bg-amber-600 hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500">
            Reload
          </button>
        </div>
      )}
      {notices.length > 0 && (
        <div className="px-3 py-2 text-xs text-blue-100 bg-blue-900/50 border-t border-blue-800 overflow-auto max-h-24">
          {notices.map((msg, i) => (
            <div key={i}>{msg}</div>
          ))}
        </div>
      )}
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

export default NodeJsonEditor
