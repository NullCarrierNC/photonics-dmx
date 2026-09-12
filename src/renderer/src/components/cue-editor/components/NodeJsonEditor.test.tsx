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
  const { container } = renderWithProviders(
    <NodeJsonEditor
      definition={alpha}
      collectionKey="items"
      selectedId="a"
      buildFile={(item: Item): ItemFile => ({ items: [bravo, item] })}
      validate={validateFile}
      reconcile={reconcile}
      onSave={onSave}
      onCancel={onCancel}
      onDirtyChange={onDirtyChange}
    />,
  )
  const editor = EditorView.findFromDOM(container.querySelector('.cm-editor') as HTMLElement)
  if (!editor) throw new Error('CodeMirror did not mount')
  return { onSave, onCancel, onDirtyChange, validate: validateFile, editor }
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
})
