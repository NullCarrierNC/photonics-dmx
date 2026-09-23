/** @jest-environment jsdom */
import { afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals'
import { act, cleanup, fireEvent, screen } from '@testing-library/react'
import { EditorView } from '@codemirror/view'
import { forEachDiagnostic } from '@codemirror/lint'
import { renderWithProviders } from '@renderer/tests/helpers/renderWithProviders'
import NodeJsonEditor, { type JsonValidationResult } from './NodeJsonEditor'

type Item = { id: string; name: string }
type ItemFile = { items: Item[] }

const alpha: Item = { id: 'a', name: 'Alpha' }
const bravo: Item = { id: 'b', name: 'Bravo' }

// CodeMirror measures text through Range geometry, which jsdom leaves out.
beforeAll(() => {
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList
  Range.prototype.getBoundingClientRect = () =>
    ({ x: 0, y: 0, width: 0, height: 0, top: 0, right: 0, bottom: 0, left: 0 }) as DOMRect
})

afterEach(() => cleanup())

interface OpenOptions {
  validate?: (file: ItemFile) => Promise<JsonValidationResult>
  reconcile?: (item: Item) => { definition: Item; notices: string[] }
}

function open({ validate, reconcile }: OpenOptions = {}) {
  const onSave = jest.fn()
  const onCancel = jest.fn()
  const onDirtyChange = jest.fn()
  const validateFile = jest.fn(
    validate ?? ((): Promise<JsonValidationResult> => Promise.resolve({ valid: true })),
  )
  const render = (definition: Item, selectedId: string) => (
    <NodeJsonEditor
      definition={definition}
      collectionKey="items"
      selectedId={selectedId}
      buildFile={(item: Item): ItemFile => ({ items: [bravo, item] })}
      validate={validateFile}
      reconcile={reconcile}
      onSave={onSave}
      onCancel={onCancel}
      onDirtyChange={onDirtyChange}
    />
  )
  const { container, rerender } = renderWithProviders(render(alpha, 'a'))
  /** The view on screen now. */
  const current = (): EditorView => {
    const view = EditorView.findFromDOM(container.querySelector('.cm-editor') as HTMLElement)
    if (!view) throw new Error('CodeMirror did not mount')
    return view
  }
  const editor = current()
  const show = (definition: Item, selectedId = 'a'): void => {
    rerender(render(definition, selectedId))
  }
  return { onSave, onCancel, onDirtyChange, validate: validateFile, editor, current, show }
}

function setText(editor: EditorView, text: string): void {
  act(() => {
    editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: text } })
  })
}

const validateButton = () => screen.getByRole('button', { name: 'Validate' })

describe('NodeJsonEditor', () => {
  it('opens on the definition as formatted JSON', () => {
    const { editor } = open()
    expect(editor.state.doc.toString()).toBe(JSON.stringify(alpha, null, 2))
  })

  it('validates the definition inside its file and then applies it', async () => {
    const { editor, validate, onSave } = open()
    setText(editor, JSON.stringify({ id: 'a', name: 'Alpha Two' }))

    fireEvent.click(validateButton())
    fireEvent.click(await screen.findByRole('button', { name: 'Apply' }))

    expect(validate).toHaveBeenCalledWith({ items: [bravo, { id: 'a', name: 'Alpha Two' }] })
    expect(onSave).toHaveBeenCalledWith({ id: 'a', name: 'Alpha Two' })
  })

  it('reports text that is not JSON without validating it', () => {
    const { editor, validate } = open()
    setText(editor, '{ "id": ')

    fireEvent.click(validateButton())

    expect(screen.getByText(/^Parse error:/)).toBeInTheDocument()
    expect(validate).not.toHaveBeenCalled()
  })

  it('lists schema errors and marks where each points in the text', async () => {
    const { editor } = open({
      validate: () =>
        Promise.resolve({
          valid: false,
          errors: ['name must be a string'],
          structuredErrors: [{ instancePath: '/items/1/name', message: 'must be string' }],
        }),
    })

    fireEvent.click(validateButton())

    expect(await screen.findByText('name must be a string')).toBeInTheDocument()
    const marked: [string, string][] = []
    forEachDiagnostic(editor.state, (diagnostic, from, to) => {
      marked.push([diagnostic.message, editor.state.sliceDoc(from, to)])
    })
    expect(marked).toEqual([['must be string', '"Alpha"']])
    expect(screen.queryByRole('button', { name: 'Apply' })).toBeNull()
  })

  it('shows warnings and still lets the definition be applied', async () => {
    open({ validate: () => Promise.resolve({ valid: true, warnings: ['never fires'] }) })

    fireEvent.click(validateButton())

    expect(await screen.findByRole('button', { name: 'Apply' })).toBeInTheDocument()
    expect(screen.getByText('never fires')).toBeInTheDocument()
  })

  it('reconciles the definition, rewrites the text and validates the result', async () => {
    const { editor, validate } = open({
      reconcile: (item) => ({
        definition: { ...item, id: 'a2' },
        notices: ['Renamed the id to a2'],
      }),
    })

    fireEvent.click(validateButton())

    expect(await screen.findByRole('button', { name: 'Apply' })).toBeInTheDocument()
    expect(screen.getByText('Renamed the id to a2')).toBeInTheDocument()
    expect(JSON.parse(editor.state.doc.toString())).toEqual({ id: 'a2', name: 'Alpha' })
    expect(validate).toHaveBeenCalledWith({ items: [bravo, { id: 'a2', name: 'Alpha' }] })
  })

  it('goes back to Validate when the text changes after passing', async () => {
    const { editor } = open({
      validate: () => Promise.resolve({ valid: true, warnings: ['never fires'] }),
    })
    fireEvent.click(validateButton())
    await screen.findByRole('button', { name: 'Apply' })

    setText(editor, JSON.stringify({ id: 'a', name: 'Changed' }))

    expect(validateButton()).toBeInTheDocument()
    expect(screen.queryByText('never fires')).toBeNull()
  })

  it('holds Validate while validating and offers no Apply for text typed meanwhile', async () => {
    let finish!: (result: JsonValidationResult) => void
    const { editor, onSave } = open({
      validate: () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    })

    fireEvent.click(validateButton())
    expect(validateButton()).toBeDisabled()
    setText(editor, JSON.stringify({ id: 'a', name: 'Typed meanwhile' }))
    await act(async () => finish({ valid: true }))

    expect(screen.queryByRole('button', { name: 'Apply' })).toBeNull()
    expect(validateButton()).toBeEnabled()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('reports itself dirty once the text is edited', () => {
    const { editor, onDirtyChange } = open()
    expect(onDirtyChange).toHaveBeenLastCalledWith(false)

    setText(editor, '{}')

    expect(onDirtyChange).toHaveBeenLastCalledWith(true)
  })

  it('reports Cancel to its caller', () => {
    const { onCancel } = open()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  describe('when the definition changes underneath it', () => {
    const renamed: Item = { id: 'a', name: 'Alpha Renamed' }
    const lastDirty = (onDirtyChange: jest.Mock): unknown => onDirtyChange.mock.calls.at(-1)?.[0]

    it('keeps unsaved text and says the definition changed', () => {
      const { editor, current, show, onDirtyChange } = open()
      setText(editor, '{ "id": "a", "name": "Typed" }')

      show(renamed)

      expect(current().state.doc.toString()).toBe('{ "id": "a", "name": "Typed" }')
      expect(screen.getByText(/changed outside the JSON editor/)).toBeInTheDocument()
      expect(lastDirty(onDirtyChange)).toBe(true)
    })

    it('takes the new definition while nothing is unsaved', () => {
      const { current, show, onDirtyChange } = open()

      show(renamed)

      expect(current().state.doc.toString()).toBe(JSON.stringify(renamed, null, 2))
      expect(lastDirty(onDirtyChange)).toBe(false)
    })

    it('leaves the text alone for the same definition in a new object', () => {
      const { editor, current, show } = open()
      setText(editor, '{ "id": "a", "name": "Typed" }')

      show({ ...alpha })

      expect(current().state.doc.toString()).toBe('{ "id": "a", "name": "Typed" }')
      expect(screen.queryByText(/changed outside the JSON editor/)).not.toBeInTheDocument()
    })

    it('reloads the current definition on request and drops the edits', () => {
      const { editor, current, show, onDirtyChange } = open()
      setText(editor, '{ "id": "a", "name": "Typed" }')
      show(renamed)

      fireEvent.click(screen.getByRole('button', { name: 'Reload' }))

      expect(current().state.doc.toString()).toBe(JSON.stringify(renamed, null, 2))
      expect(lastDirty(onDirtyChange)).toBe(false)
    })

    it('opens a different definition fresh', () => {
      const { editor, current, show, onDirtyChange } = open()
      setText(editor, '{ "id": "a", "name": "Typed" }')

      show(bravo, 'b')

      expect(current().state.doc.toString()).toBe(JSON.stringify(bravo, null, 2))
      expect(lastDirty(onDirtyChange)).toBe(false)
    })
  })
})
