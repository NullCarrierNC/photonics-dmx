/** @jest-environment jsdom */
import { describe, expect, it, jest } from '@jest/globals'
import { act, renderHook } from '@testing-library/react'
import { useState } from 'react'
import type { EditorDocument } from '../lib/types'
import type { EffectFile, NodeCueFile } from '../../../../../photonics-dmx/cues/types/nodeCueTypes'
import { useCueMetadata } from './useCueMetadata'

const CUE_FILE = {
  version: 2,
  mode: 'yarg',
  group: { id: 'g1', name: 'Group' },
  cues: [
    { id: 'c1', name: 'One' },
    { id: 'c2', name: 'Two' },
  ],
} as unknown as NodeCueFile

const EFFECT_FILE = {
  version: 2,
  mode: 'yarg',
  group: { id: 'fx', name: 'Effects' },
  effects: [
    { id: 'e1', name: 'Sweep' },
    { id: 'e2', name: 'Chase' },
  ],
} as unknown as EffectFile

const CUE_DOC: EditorDocument = { mode: 'cue', file: CUE_FILE, path: null }
const EFFECT_DOC: EditorDocument = { mode: 'effect', file: EFFECT_FILE, path: null }

function renderMetadata(doc: EditorDocument | null, selectedCueId: string | null) {
  const setIsDirty = jest.fn<(dirty: boolean) => void>()
  const view = renderHook(() => {
    const [editorDoc, setEditorDoc] = useState(doc)
    return {
      editorDoc,
      ...useCueMetadata({ editorDoc, setEditorDoc, selectedCueId, setIsDirty }),
    }
  })
  return { ...view, setIsDirty }
}

describe('useCueMetadata', () => {
  it('merges group changes into the open file and marks it dirty', () => {
    const { result, setIsDirty } = renderMetadata(CUE_DOC, 'c1')
    act(() => result.current.updateGroupMeta({ name: 'Renamed' }))
    expect(result.current.editorDoc?.file.group).toEqual({ id: 'g1', name: 'Renamed' })
    expect(setIsDirty).toHaveBeenCalledWith(true)
  })

  it('changes only the selected cue', () => {
    const { result } = renderMetadata(CUE_DOC, 'c1')
    act(() => result.current.updateCueMetadata({ name: 'First' }))
    const doc = result.current.editorDoc
    if (doc?.mode !== 'cue') throw new Error('expected the cue document')
    const cues = doc.file.cues
    expect(cues.map((cue) => cue.name)).toEqual(['First', 'Two'])
  })

  it('changes only the selected effect', () => {
    const { result } = renderMetadata(EFFECT_DOC, 'e2')
    act(() => result.current.updateEffectMetadata({ name: 'Wipe' }))
    const doc = result.current.editorDoc
    if (doc?.mode !== 'effect') throw new Error('expected the effect document')
    const effects = doc.file.effects
    expect(effects.map((effect) => effect.name)).toEqual(['Sweep', 'Wipe'])
  })

  it.each([
    ['a cue edit on an effect file', EFFECT_DOC, 'e1', 'updateCueMetadata'],
    ['an effect edit on a cue file', CUE_DOC, 'c1', 'updateEffectMetadata'],
    ['a cue edit with nothing selected', CUE_DOC, null, 'updateCueMetadata'],
  ] as const)('ignores %s', (_case, doc, selected, method) => {
    const { result, setIsDirty } = renderMetadata(doc, selected)
    const before = result.current.editorDoc
    act(() => result.current[method]({ name: 'X' }))
    expect(result.current.editorDoc).toBe(before)
    expect(setIsDirty).not.toHaveBeenCalled()
  })

  it('ignores group changes with no file open', () => {
    const { result, setIsDirty } = renderMetadata(null, null)
    act(() => result.current.updateGroupMeta({ name: 'Renamed' }))
    expect(result.current.editorDoc).toBeNull()
    expect(setIsDirty).not.toHaveBeenCalled()
  })
})
