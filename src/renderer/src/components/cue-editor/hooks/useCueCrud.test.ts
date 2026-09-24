/** @jest-environment jsdom */
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, jest } from '@jest/globals'

jest.mock(
  '../../../ipcApi',
  () =>
    jest.requireActual<typeof import('@renderer/tests/helpers/ipcApiMock')>(
      '@renderer/tests/helpers/ipcApiMock',
    ).ipcApiMock,
)

import { useCueCrud } from './useCueCrud'
import type { EditorDocument } from '../lib/types'
import { resolveCueKindSelection } from '../lib/cueKindSync'
import * as ipcApi from '../../../ipcApi'
import { resetIpcApiMock } from '@renderer/tests/helpers/ipcApiMock'
import type { UseCueCrudParams } from './useCueCrud'
import type { EffectFile, NodeCueFile } from '../../../../../photonics-dmx/cues/types/nodeCueTypes'
import { getLastActiveMode, getLastFilePathForMode } from './useLastCueFilePath'

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
      rememberLastFilePath: jest.fn(),
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

const effectDoc = (effects?: Array<Record<string, unknown>>): EditorDocument =>
  ({
    mode: 'effect',
    path: '/effects/file.json',
    file: {
      mode: 'yarg',
      group: { id: 'fx', name: 'Effects' },
      effects: effects ?? [
        { id: 'e1', name: 'Bravo' },
        { id: 'e2', name: 'Alpha' },
      ],
    },
  }) as unknown as EditorDocument

const NEW_FILE = {
  groupId: 'stage',
  groupName: 'Stage',
  groupDescription: 'Big show',
  itemName: 'Opener',
  itemDescription: 'First up',
}

type CrudOverrides = Partial<
  Pick<UseCueCrudParams, 'editorDoc' | 'selectedCueId' | 'files' | 'effectFiles'>
>

function renderCrud(overrides: CrudOverrides = {}) {
  const props = {
    editorDoc: null,
    setEditorDoc: jest.fn(),
    selectedCueId: null,
    setSelectedCueId: jest.fn(),
    setFilename: jest.fn(),
    mode: 'yarg' as const,
    cueKind: 'lighting' as const,
    files: [],
    effectFiles: [],
    setValidationErrors: jest.fn(),
    setIsDirty: jest.fn(),
    setCueKind: jest.fn(),
    loadCueIntoFlow: jest.fn(),
    rememberLastFilePath: jest.fn(),
    refreshFiles: jest.fn(async () => undefined),
    refreshEffectFiles: jest.fn(async () => undefined),
    onError: jest.fn(),
    ...overrides,
  }
  const { result } = renderHook(() => useCueCrud(props))
  return { result, ...props }
}

/** The document most recently handed to setEditorDoc. */
function lastDoc(setEditorDoc: jest.Mock): EditorDocument {
  return setEditorDoc.mock.calls[setEditorDoc.mock.calls.length - 1]![0] as EditorDocument
}

describe('useCueCrud new files', () => {
  beforeEach(() => {
    resetIpcApiMock()
    jest.mocked(ipcApi.validateNodeCue).mockResolvedValue({
      valid: true,
      data: {} as NodeCueFile,
      errors: [],
      mode: 'yarg',
    })
    jest.mocked(ipcApi.validateEffect).mockResolvedValue({
      valid: true,
      data: {} as EffectFile,
      errors: [],
      mode: 'yarg',
    })
    jest
      .mocked(ipcApi.saveNodeCueFile)
      .mockResolvedValue({ success: true, path: '/cues/stage.json' })
    jest.mocked(ipcApi.saveEffectFile).mockResolvedValue({ success: true, path: '/fx/stage.json' })
  })

  it('saves a new cue file named for its group and opens its first cue', async () => {
    const crud = renderCrud()
    await act(async () => {
      await crud.result.current.handleCreateNewFile(NEW_FILE)
    })

    const saved = jest.mocked(ipcApi.saveNodeCueFile).mock.calls[0]![0]
    expect(saved.filename).toBe('stage.json')
    expect(saved.content.group).toMatchObject({
      id: 'stage',
      name: 'Stage',
      description: 'Big show',
    })
    expect(saved.content.cues[0]).toMatchObject({ name: 'Opener', description: 'First up' })
    expect(lastDoc(crud.setEditorDoc)).toEqual({
      mode: 'cue',
      file: saved.content,
      path: '/cues/stage.json',
    })
    expect(crud.setSelectedCueId).toHaveBeenCalledWith(saved.content.cues[0]!.id)
    expect(crud.setFilename).toHaveBeenCalledWith('stage.json')
    expect(crud.setIsDirty).toHaveBeenCalledWith(false)
    expect(crud.refreshFiles).toHaveBeenCalled()
  })

  it('saves a new effect file while effects are open', async () => {
    const crud = renderCrud({ editorDoc: effectDoc() })
    await act(async () => {
      await crud.result.current.handleCreateNewFile(NEW_FILE)
    })

    const saved = jest.mocked(ipcApi.saveEffectFile).mock.calls[0]![0]
    expect(saved.content.effects[0]).toMatchObject({ name: 'Opener', description: 'First up' })
    expect(lastDoc(crud.setEditorDoc)).toMatchObject({ mode: 'effect', path: '/fx/stage.json' })
    expect(crud.refreshEffectFiles).toHaveBeenCalled()
    expect(ipcApi.saveNodeCueFile).not.toHaveBeenCalled()
  })

  it.each([
    ['cue', null, '/cues/stage.json', 'yarg-cue'],
    ['effect', effectDoc(), '/fx/stage.json', 'yarg-effect'],
  ] as const)(
    'remembers a new %s file as the one to reopen',
    async (_kind, editorDoc, path, modeKey) => {
      localStorage.clear()
      const crud = renderCrud({ editorDoc })
      await act(async () => {
        await crud.result.current.handleCreateNewFile(NEW_FILE)
      })

      expect(crud.rememberLastFilePath).toHaveBeenCalledWith(path)
      expect(getLastActiveMode()).toBe(modeKey)
      expect(getLastFilePathForMode(modeKey)).toBe(path)
    },
  )

  it('refuses a group id another file of the same mode already uses', async () => {
    const crud = renderCrud({
      files: [{ mode: 'yarg', groupId: ' Stage ' }] as unknown as UseCueCrudParams['files'],
    })
    await act(async () => {
      await crud.result.current.handleCreateNewFile(NEW_FILE)
    })

    expect(crud.onError).toHaveBeenCalledWith(
      'Cue group ID "stage" is already in use. Choose a different ID.',
    )
    expect(ipcApi.saveNodeCueFile).not.toHaveBeenCalled()
  })

  it('allows a group id that only a file of another mode uses', async () => {
    const crud = renderCrud({
      files: [{ mode: 'audio', groupId: 'stage' }] as unknown as UseCueCrudParams['files'],
    })
    await act(async () => {
      await crud.result.current.handleCreateNewFile(NEW_FILE)
    })
    expect(ipcApi.saveNodeCueFile).toHaveBeenCalledTimes(1)
  })

  it('reports validation errors and saves nothing', async () => {
    jest.mocked(ipcApi.validateNodeCue).mockResolvedValue({ valid: false, errors: ['bad group'] })
    const crud = renderCrud()
    await act(async () => {
      await crud.result.current.handleCreateNewFile(NEW_FILE)
    })

    expect(crud.setValidationErrors).toHaveBeenCalledWith(['bad group'])
    expect(crud.onError).toHaveBeenCalledWith('Failed to create cue file: bad group')
    expect(ipcApi.saveNodeCueFile).not.toHaveBeenCalled()
  })

  it('reports a validation call that rejects', async () => {
    jest.mocked(ipcApi.validateNodeCue).mockRejectedValue(new Error('channel gone'))
    const crud = renderCrud()
    await act(async () => {
      await crud.result.current.handleCreateNewFile(NEW_FILE)
    })

    expect(crud.onError).toHaveBeenCalledWith('Failed to create cue file: Error: channel gone')
    expect(ipcApi.saveNodeCueFile).not.toHaveBeenCalled()
  })

  it('reports a refused save and opens nothing', async () => {
    jest.mocked(ipcApi.saveNodeCueFile).mockResolvedValue({ success: false, error: 'disk full' })
    const crud = renderCrud()
    await act(async () => {
      await crud.result.current.handleCreateNewFile(NEW_FILE)
    })

    expect(crud.onError).toHaveBeenCalledWith('Failed to save: disk full')
    expect(crud.setEditorDoc).not.toHaveBeenCalled()
  })
})

describe('useCueCrud additions and effect removal', () => {
  it('starts an untitled file when a cue is added with nothing open', () => {
    const crud = renderCrud()
    act(() => crud.result.current.handleAddCue())

    const cues = (lastDoc(crud.setEditorDoc).file as { cues: Array<{ id: string }> }).cues
    const added = cues[cues.length - 1]!
    expect(crud.setFilename).toHaveBeenCalledWith('untitled.json')
    expect(crud.setSelectedCueId).toHaveBeenCalledWith(added.id)
    expect(crud.loadCueIntoFlow).toHaveBeenCalledWith(added)
    expect(crud.setIsDirty).toHaveBeenCalledWith(true)
  })

  it('appends a cue to the open file', () => {
    const crud = renderCrud({ editorDoc: cueDoc() })
    act(() => crud.result.current.handleAddCue())
    const cues = (lastDoc(crud.setEditorDoc).file as { cues: Array<{ id: string }> }).cues
    expect(cues.slice(0, 3).map((cue) => cue.id)).toEqual(['light-1', 'motion-1', 'motion-2'])
    expect(cues).toHaveLength(4)
  })

  it('appends an effect to the open effect file', () => {
    const crud = renderCrud({ editorDoc: effectDoc() })
    act(() => crud.result.current.handleAddEffect())
    const effects = (lastDoc(crud.setEditorDoc).file as { effects: Array<{ id: string }> }).effects
    expect(effects).toHaveLength(3)
    expect(crud.setSelectedCueId).toHaveBeenCalledWith(effects[2]!.id)
  })

  it.each([
    ['a cue to an effect file', 'handleAddCue', effectDoc()],
    ['an effect to a cue file', 'handleAddEffect', cueDoc()],
  ] as const)('refuses to add %s', (_case, method, doc) => {
    const crud = renderCrud({ editorDoc: doc })
    act(() => crud.result.current[method]())
    expect(crud.setEditorDoc).not.toHaveBeenCalled()
  })

  it('opens the first remaining effect by name when the open one is removed', () => {
    const crud = renderCrud({ editorDoc: effectDoc(), selectedCueId: 'e1' })
    act(() => crud.result.current.removeEffect('e1'))
    expect(crud.setSelectedCueId).toHaveBeenCalledWith('e2')
    expect(crud.loadCueIntoFlow).toHaveBeenCalledWith({ id: 'e2', name: 'Alpha' })
    expect(crud.setIsDirty).toHaveBeenCalledWith(true)
  })

  it('leaves the canvas alone when an effect that is not open is removed', () => {
    const crud = renderCrud({ editorDoc: effectDoc(), selectedCueId: 'e1' })
    act(() => crud.result.current.removeEffect('e2'))
    expect(crud.setSelectedCueId).not.toHaveBeenCalled()
    expect(crud.loadCueIntoFlow).not.toHaveBeenCalled()
  })

  it.each([
    ['effect', 'removeEffect', effectDoc([{ id: 'only', name: 'Only' }])],
    ['cue', 'removeCue', cueDoc([{ id: 'only', kind: 'lighting', name: 'Only' }])],
  ] as const)('keeps the last %s in a file', (_case, method, doc) => {
    const crud = renderCrud({ editorDoc: doc, selectedCueId: 'only' })
    act(() => crud.result.current[method]('only'))
    expect(crud.setEditorDoc).not.toHaveBeenCalled()
  })
})
