/** @jest-environment jsdom */
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, jest } from '@jest/globals'

jest.mock('../../../ipcApi', () => ({
  validateNodeCue: jest.fn(),
  validateEffect: jest.fn(),
  saveNodeCueFile: jest.fn(),
  saveEffectFile: jest.fn(),
}))

import { useCueCrud } from './useCueCrud'
import type { EditorDocument } from '../lib/types'
import { resolveCueKindSelection } from '../lib/cueKindSync'

const cueDoc = (cues?: Array<Record<string, unknown>>): EditorDocument =>
  ({
    mode: 'cue',
    path: '/cues/file.json',
    file: {
      mode: 'yarg',
      group: { id: 'g', name: 'Group' },
      cues: cues ?? [
        { id: 'light-1', kind: 'lighting', name: 'Lighting A' },
        { id: 'motion-1', kind: 'motion', name: 'Motion A' },
        { id: 'motion-2', kind: 'motion', name: 'Motion B' },
      ],
    },
  }) as unknown as EditorDocument

/** One motion cue only, so deleting it must fall back across kinds. */
const singleMotionDoc = (): EditorDocument =>
  cueDoc([
    { id: 'motion-1', kind: 'motion', name: 'Motion A' },
    { id: 'light-b', kind: 'lighting', name: 'Bravo' },
    { id: 'light-a', kind: 'lighting', name: 'Alpha' },
  ])

const setup = (
  cueKind: 'lighting' | 'motion' = 'motion',
  doc: EditorDocument = cueDoc(),
  selectedCueId: string | null = 'motion-1',
) => {
  const editorDoc: EditorDocument | null = doc
  const setEditorDoc = jest.fn()
  const setSelectedCueId = jest.fn()
  const setCueKind = jest.fn()
  const setFilename = jest.fn()
  const setValidationErrors = jest.fn()
  const setIsDirty = jest.fn()
  const loadCueIntoFlow = jest.fn()

  const rendered = renderHook(() =>
    useCueCrud({
      editorDoc,
      setEditorDoc,
      selectedCueId,
      setSelectedCueId,
      setFilename,
      mode: 'yarg',
      cueKind,
      files: [],
      effectFiles: [],
      setValidationErrors,
      setIsDirty,
      setCueKind,
      loadCueIntoFlow,
      refreshFiles: jest.fn(async () => undefined),
      refreshEffectFiles: jest.fn(async () => undefined),
    }),
  )

  return {
    rendered,
    setEditorDoc,
    setSelectedCueId,
    setCueKind,
    loadCueIntoFlow,
    setIsDirty,
  }
}

describe('useCueCrud removeCue', () => {
  it('reselects another cue of the same kind when deleting the selected cue', () => {
    const { rendered, setSelectedCueId, setCueKind, loadCueIntoFlow } = setup('motion')

    act(() => rendered.result.current.removeCue('motion-1'))

    expect(setCueKind).toHaveBeenCalledWith('motion')
    expect(setSelectedCueId).toHaveBeenCalledWith('motion-2')
    expect(loadCueIntoFlow).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'motion-2', kind: 'motion' }),
    )
  })

  it('synchronises kind and selection when deleting the last cue of a kind', () => {
    const { rendered, setEditorDoc, setSelectedCueId, setCueKind, loadCueIntoFlow } = setup(
      'motion',
      singleMotionDoc(),
    )

    act(() => rendered.result.current.removeCue('motion-1'))

    // Alphabetical, not file order: 'light-a' sorts ahead of 'light-b'.
    expect(setCueKind).toHaveBeenCalledWith('lighting')
    expect(setSelectedCueId).toHaveBeenCalledWith('light-a')
    expect(loadCueIntoFlow).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'light-a', kind: 'lighting' }),
    )

    // Kind and selection agree, so the editor is not left in a clearable state.
    const updatedDoc = setEditorDoc.mock.calls.at(-1)?.[0] as EditorDocument
    expect(resolveCueKindSelection('cue', updatedDoc, 'lighting', 'light-a')).toEqual({
      action: 'none',
    })
  })

  it('leaves selection and canvas alone when deleting a cue that is not open', () => {
    const { rendered, setEditorDoc, setSelectedCueId, loadCueIntoFlow, setIsDirty } =
      setup('motion')

    act(() => rendered.result.current.removeCue('motion-2'))

    expect(setEditorDoc).toHaveBeenCalled()
    expect(setIsDirty).toHaveBeenCalledWith(true)
    // Unsaved edits to the open cue live in the flow, so it must not be reloaded.
    expect(setSelectedCueId).not.toHaveBeenCalled()
    expect(loadCueIntoFlow).not.toHaveBeenCalled()
  })
})
