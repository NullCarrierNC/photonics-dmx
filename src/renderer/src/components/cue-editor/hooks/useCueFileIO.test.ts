/** @jest-environment jsdom */
import { act, renderHook } from '@testing-library/react'
import { useState } from 'react'
import { resetIpcApiMock } from '@renderer/tests/helpers/ipcApiMock'
import * as ipcApi from '../../../ipcApi'
import { beforeEach, describe, expect, it, jest } from '@jest/globals'

jest.mock(
  '../../../ipcApi',
  () =>
    jest.requireActual<typeof import('@renderer/tests/helpers/ipcApiMock')>(
      '@renderer/tests/helpers/ipcApiMock',
    ).ipcApiMock,
)

const readNodeCueFile = jest.mocked(ipcApi.readNodeCueFile)

import { useCueFileIO, type UseCueFileIOParams } from './useCueFileIO'
import type { NodeCueFile } from '../../../../../photonics-dmx/cues/types/nodeCueTypes'
import type { EditorDocument, EditorMode } from '../lib/types'
import { createDefaultEffectFile, createDefaultFile } from '../lib/cueDefaults'
import {
  cue,
  cueFileOf,
  cueSummary,
  effect,
  effectFileOf,
} from '@renderer/tests/helpers/cueEditorFiles'

const SAVED_PATH = '/cues/motion-cues.json'

const fileSummary = () => cueSummary({ path: SAVED_PATH, groupId: 'motion-group', mode: 'yarg' })

/** A file holding both kinds, with the lighting cue sorting first by name. */
const mixedFile = () =>
  cueFileOf(
    cue('cue-motion-b', 'motion', 'Bravo Motion'),
    cue('cue-light', 'lighting', 'Alpha Lighting'),
    cue('cue-motion-a', 'motion', 'Alpha Motion'),
  )

const effectFile = () =>
  effectFileOf(effect('effect-b', 'Bravo Effect'), effect('effect-a', 'Alpha Effect'))

/** A document open at the saved path, in the given mode, with the items `added` after its own. */
const openAt = (mode: EditorMode, ...added: string[]): EditorDocument => {
  if (mode === 'cue') {
    const file = mixedFile()
    const cues = [...file.cues, ...added.map((id) => cue(id, 'lighting', id))]
    return { mode, path: SAVED_PATH, file: { ...file, cues } }
  }
  const file = effectFile()
  const effects = [...file.effects, ...added.map((id) => effect(id, id))]
  return { mode, path: SAVED_PATH, file: { ...file, effects } }
}

/** The document as version 4 of a shipped library. */
const shipped = (doc: EditorDocument): EditorDocument =>
  doc.mode === 'cue'
    ? { ...doc, file: { ...doc.file, bundled: true, cueVersion: 4 } }
    : { ...doc, file: { ...doc.file, bundled: true, cueVersion: 4 } }

const callbacks = () => ({
  setEditorDoc: jest.fn<UseCueFileIOParams['setEditorDoc']>(),
  setFilename: jest.fn<UseCueFileIOParams['setFilename']>(),
  setSelectedCueId: jest.fn<UseCueFileIOParams['setSelectedCueId']>(),
  setMode: jest.fn<UseCueFileIOParams['setMode']>(),
  setCueKind: jest.fn<UseCueFileIOParams['setCueKind']>(),
  setValidationErrors: jest.fn<UseCueFileIOParams['setValidationErrors']>(),
  setIsDirty: jest.fn<UseCueFileIOParams['setIsDirty']>(),
  loadCueIntoFlow: jest.fn<UseCueFileIOParams['loadCueIntoFlow']>(),
  rememberLastFilePath: jest.fn<UseCueFileIOParams['rememberLastFilePath']>(),
  clearLastFilePath: jest.fn<UseCueFileIOParams['clearLastFilePath']>(),
  onSaveError: jest.fn<(message: string) => void>(),
})

/** The hook's parameters with nothing open, over `mocks` and then `overrides`. */
const params = (
  mocks: ReturnType<typeof callbacks>,
  overrides: Partial<UseCueFileIOParams> = {},
): UseCueFileIOParams => ({
  editorDoc: null,
  filename: 'untitled.json',
  selectedCueId: null,
  cueKind: 'lighting',
  getUpdatedDocument: () => null,
  refreshFiles: jest.fn(async () => undefined),
  refreshEffectFiles: jest.fn(async () => undefined),
  lastStoredFilePathRef: { current: null },
  ...mocks,
  ...overrides,
})

const setup = (overrides: Partial<UseCueFileIOParams> = {}) => {
  const mocks = callbacks()
  const rendered = renderHook(() => useCueFileIO(params(mocks, overrides)))
  return { rendered, ...mocks }
}

describe('useCueFileIO selectFile', () => {
  beforeEach(() => {
    resetIpcApiMock()
  })

  it('synchronises cue kind from the preferred cue', async () => {
    readNodeCueFile.mockResolvedValue(mixedFile())
    const { rendered, setCueKind, setSelectedCueId, loadCueIntoFlow } = setup()

    await act(async () => {
      await rendered.result.current.selectFile(fileSummary(), 'cue-motion-b')
    })

    expect(setCueKind).toHaveBeenCalledWith('motion')
    expect(setSelectedCueId).toHaveBeenCalledWith('cue-motion-b')
    expect(loadCueIntoFlow).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'cue-motion-b', kind: 'motion' }),
    )
  })

  it('keeps the active kind when a mixed file is opened with no preferred cue', async () => {
    readNodeCueFile.mockResolvedValue(mixedFile())
    const { rendered, setCueKind, setSelectedCueId } = setup({ cueKind: 'motion' })

    await act(async () => {
      await rendered.result.current.selectFile(fileSummary())
    })

    // The alphabetically first cue in this file is a lighting cue, so a correct pick has to
    // come from the motion subset rather than the whole list.
    expect(setCueKind).not.toHaveBeenCalledWith('lighting')
    expect(setCueKind).toHaveBeenCalledWith('motion')
    expect(setSelectedCueId).toHaveBeenCalledWith('cue-motion-a')
  })

  it('falls back across kinds when the file holds none of the active kind', async () => {
    readNodeCueFile.mockResolvedValue(cueFileOf(cue('cue-motion', 'motion', 'Motion Cue')))
    const { rendered, setCueKind, setSelectedCueId } = setup({ cueKind: 'lighting' })

    await act(async () => {
      await rendered.result.current.selectFile(fileSummary())
    })

    expect(setCueKind).toHaveBeenCalledWith('motion')
    expect(setSelectedCueId).toHaveBeenCalledWith('cue-motion')
  })

  it('prefers the kind override over the active kind', async () => {
    readNodeCueFile.mockResolvedValue(mixedFile())
    const { rendered, setCueKind, setSelectedCueId } = setup({ cueKind: 'lighting' })

    await act(async () => {
      await rendered.result.current.selectFile(fileSummary(), undefined, 'motion')
    })

    expect(setCueKind).toHaveBeenCalledWith('motion')
    expect(setSelectedCueId).toHaveBeenCalledWith('cue-motion-a')
  })

  it('ignores a superseded read so the newest selection wins', async () => {
    let resolveFirst: (value: NodeCueFile) => void = () => {}
    readNodeCueFile
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirst = resolve
        }),
      )
      .mockResolvedValueOnce(cueFileOf(cue('second-cue', 'lighting', 'Second')))

    const { rendered, setSelectedCueId } = setup()

    await act(async () => {
      const stale = rendered.result.current.selectFile(fileSummary())
      await rendered.result.current.selectFile({ ...fileSummary(), path: '/cues/second.json' })
      resolveFirst(cueFileOf(cue('first-cue', 'lighting', 'First')))
      await stale
    })

    expect(setSelectedCueId).toHaveBeenCalledWith('second-cue')
    expect(setSelectedCueId).not.toHaveBeenCalledWith('first-cue')
  })

  it('reports a read failure to the caller', async () => {
    readNodeCueFile.mockRejectedValue(new Error('disk gone') as never)
    const { rendered, onSaveError, setEditorDoc } = setup()

    await act(async () => {
      await rendered.result.current.selectFile(fileSummary())
    })

    expect(onSaveError).toHaveBeenCalledWith(expect.stringContaining('disk gone'))
    expect(setEditorDoc).not.toHaveBeenCalled()
  })
})

describe('useCueFileIO handleReload', () => {
  beforeEach(() => {
    resetIpcApiMock()
  })

  const openDoc = (selectedCueId: string | null): Partial<UseCueFileIOParams> => ({
    editorDoc: openAt('cue'),
    filename: 'motion-cues.json',
    selectedCueId,
    lastStoredFilePathRef: { current: SAVED_PATH },
  })

  it('synchronises cue kind before selection and flow updates on reload', async () => {
    readNodeCueFile.mockResolvedValue(cueFileOf(cue('cue-motion', 'motion', 'Motion Cue')))

    const { rendered, setCueKind, setSelectedCueId, loadCueIntoFlow } = setup(openDoc('cue-motion'))

    await act(async () => {
      await rendered.result.current.handleReload()
    })

    expect(setCueKind).toHaveBeenCalledWith('motion')
    expect(setCueKind.mock.invocationCallOrder[0]).toBeLessThan(
      setSelectedCueId.mock.invocationCallOrder[0],
    )
    expect(setSelectedCueId.mock.invocationCallOrder[0]).toBeLessThan(
      loadCueIntoFlow.mock.invocationCallOrder[0],
    )
  })

  it('prefers the active kind when the selected cue is gone', async () => {
    readNodeCueFile.mockResolvedValue(mixedFile())

    const { rendered, setCueKind, setSelectedCueId } = setup({
      ...openDoc('deleted-cue'),
      cueKind: 'motion',
    })

    await act(async () => {
      await rendered.result.current.handleReload()
    })

    expect(setSelectedCueId).toHaveBeenCalledWith('cue-motion-a')
    expect(setCueKind).toHaveBeenCalledWith('motion')
  })
})

describe('useCueFileIO handleSave', () => {
  beforeEach(() => {
    resetIpcApiMock()
  })

  const openCueDoc = (): Partial<UseCueFileIOParams> => ({
    editorDoc: openAt('cue'),
    filename: 'motion-cues.json',
    selectedCueId: 'cue-light',
    cueKind: 'lighting',
    getUpdatedDocument: () => openAt('cue'),
    lastStoredFilePathRef: { current: SAVED_PATH },
  })

  it('leaves the file dirty when it was edited while the save ran', async () => {
    jest.mocked(ipcApi.validateNodeCue).mockResolvedValue({ valid: true, errors: [] } as never)
    jest
      .mocked(ipcApi.saveNodeCueFile)
      .mockResolvedValue({ success: true, path: SAVED_PATH } as never)
    const edited: EditorDocument = { mode: 'cue', path: SAVED_PATH, file: cueFileOf() }
    const getUpdatedDocument = jest.fn<UseCueFileIOParams['getUpdatedDocument']>()
    getUpdatedDocument.mockReturnValueOnce(openAt('cue')).mockReturnValue(edited)
    const { rendered, setIsDirty } = setup({ ...openCueDoc(), getUpdatedDocument })

    await act(async () => {
      await rendered.result.current.handleSave()
    })

    expect(setIsDirty).toHaveBeenLastCalledWith(true)
  })

  it.each([
    ['cue', 'saveNodeCueFile', 'validateNodeCue'],
    ['effect', 'saveEffectFile', 'validateEffect'],
  ] as const)(
    'keeps an edit made while the %s file saved in the open document',
    async (docMode, save, validate) => {
      jest.mocked(ipcApi[validate]).mockResolvedValue({ valid: true, errors: [] } as never)
      jest.mocked(ipcApi[save]).mockResolvedValue({ success: true, path: SAVED_PATH } as never)
      const edited = openAt(docMode, 'item-new')
      const getUpdatedDocument = jest.fn<UseCueFileIOParams['getUpdatedDocument']>()
      getUpdatedDocument.mockReturnValueOnce(openAt(docMode)).mockReturnValue(edited)
      const { rendered, setEditorDoc, setIsDirty } = setup({
        ...openCueDoc(),
        editorDoc: openAt(docMode),
        getUpdatedDocument,
      })

      let saved: boolean | undefined
      await act(async () => {
        saved = await rendered.result.current.handleSave()
      })

      expect(saved).toBe(true)
      expect(setEditorDoc).toHaveBeenLastCalledWith(edited)
      expect(setIsDirty).toHaveBeenLastCalledWith(true)
    },
  )

  it('leaves a file opened while the save ran as it is', async () => {
    jest.mocked(ipcApi.validateNodeCue).mockResolvedValue({ valid: true, errors: [] } as never)
    let answerSave: (value: { success: true; path: string }) => void = () => {}
    jest.mocked(ipcApi.saveNodeCueFile).mockReturnValue(
      new Promise((resolve) => {
        answerSave = resolve
      }),
    )
    const mocks = callbacks()
    const saving = params(mocks, openCueDoc())
    const other: EditorDocument = { mode: 'cue', path: '/cues/other.json', file: mixedFile() }
    const { result, rerender } = renderHook((props) => useCueFileIO(props), {
      initialProps: saving,
    })

    let pending: Promise<boolean> = Promise.resolve(false)
    await act(async () => {
      pending = result.current.handleSave()
    })
    rerender({ ...saving, editorDoc: other, getUpdatedDocument: () => other })
    await act(async () => {
      answerSave({ success: true, path: SAVED_PATH })
      await pending
    })

    expect(ipcApi.saveNodeCueFile).toHaveBeenCalledTimes(1)
    expect(mocks.setEditorDoc).not.toHaveBeenCalled()
    expect(mocks.setIsDirty).not.toHaveBeenCalled()
    expect(mocks.rememberLastFilePath).not.toHaveBeenCalled()
  })

  it.each([
    ['cue', 'Select a cue'],
    ['effect', 'Select an effect'],
  ] as const)('says so when no %s in the file is selected', async (docMode, message) => {
    const { rendered, onSaveError } = setup({
      ...openCueDoc(),
      editorDoc: openAt(docMode),
      selectedCueId: 'not-in-file',
      getUpdatedDocument: () => null,
    })

    let saved: boolean | undefined
    await act(async () => {
      saved = await rendered.result.current.handleSave()
    })

    expect(saved).toBe(false)
    expect(onSaveError).toHaveBeenCalledWith(expect.stringContaining(message))
    expect(ipcApi.saveNodeCueFile).not.toHaveBeenCalled()
    expect(ipcApi.saveEffectFile).not.toHaveBeenCalled()
  })

  it('marks the file clean when nothing changed while the save ran', async () => {
    jest.mocked(ipcApi.validateNodeCue).mockResolvedValue({ valid: true, errors: [] } as never)
    jest
      .mocked(ipcApi.saveNodeCueFile)
      .mockResolvedValue({ success: true, path: SAVED_PATH } as never)
    const { rendered, setIsDirty } = setup(openCueDoc())

    await act(async () => {
      await rendered.result.current.handleSave()
    })

    expect(setIsDirty).toHaveBeenLastCalledWith(false)
  })

  it('says so when the cue saved but its group could not be turned on', async () => {
    jest.mocked(ipcApi.validateNodeCue).mockResolvedValue({ valid: true, errors: [] } as never)
    jest.mocked(ipcApi.saveNodeCueFile).mockResolvedValue({
      success: true,
      path: SAVED_PATH,
      groupEnableError: 'disk full',
    } as never)
    const { rendered, onSaveError, setIsDirty } = setup(openCueDoc())

    await act(async () => {
      await rendered.result.current.handleSave()
    })

    expect(onSaveError).toHaveBeenCalledWith(expect.stringContaining('disk full'))
    expect(setIsDirty).toHaveBeenLastCalledWith(false)
  })

  it.each([
    ['cue', 'saveNodeCueFile', 'validateNodeCue'],
    ['effect', 'saveEffectFile', 'validateEffect'],
  ] as const)(
    'keeps the shipped marker when a %s file saves in place',
    async (docMode, save, validate) => {
      jest.mocked(ipcApi[validate]).mockResolvedValue({ valid: true, errors: [] } as never)
      jest.mocked(ipcApi[save]).mockResolvedValue({ success: true, path: SAVED_PATH } as never)
      const doc = shipped(openAt(docMode))
      const { rendered, setEditorDoc, setIsDirty } = setup({
        ...openCueDoc(),
        editorDoc: doc,
        getUpdatedDocument: () => doc,
      })

      await act(async () => {
        await rendered.result.current.handleSave()
      })

      const sent = jest.mocked(ipcApi[save]).mock.calls[0][0]
      expect(sent.content).toMatchObject({ bundled: true, cueVersion: 4 })
      expect(setEditorDoc).toHaveBeenLastCalledWith(doc)
      expect(setIsDirty).toHaveBeenLastCalledWith(false)
    },
  )

  it.each([
    [
      'cue',
      'saveNodeCueFile',
      'validateNodeCue',
      (): EditorDocument => ({
        mode: 'cue',
        path: null,
        file: createDefaultFile('yarg', 'lighting'),
      }),
    ],
    [
      'effect',
      'saveEffectFile',
      'validateEffect',
      (): EditorDocument => ({ mode: 'effect', path: null, file: createDefaultEffectFile('yarg') }),
    ],
  ] as const)(
    "saves a new %s document as the user's file",
    async (_mode, save, validate, create) => {
      jest.mocked(ipcApi[validate]).mockResolvedValue({ valid: true, errors: [] } as never)
      jest
        .mocked(ipcApi[save])
        .mockResolvedValue({ success: true, path: '/cues/new.json' } as never)
      const doc = create()
      const { rendered } = setup({
        editorDoc: doc,
        filename: `${doc.file.group.id}.json`,
        getUpdatedDocument: () => doc,
      })

      await act(async () => {
        await rendered.result.current.handleSave()
      })

      const [sent] = jest.mocked(ipcApi[save]).mock.calls[0]
      expect(sent.createOnly).toBe(true)
      expect(sent.content).toMatchObject({ bundled: false })
    },
  )

  it('reports a validation call that rejects', async () => {
    jest.mocked(ipcApi.validateNodeCue).mockRejectedValue(new Error('channel gone') as never)
    const { rendered, onSaveError } = setup(openCueDoc())

    let saved: boolean | undefined
    await act(async () => {
      saved = await rendered.result.current.handleSave()
    })

    expect(saved).toBe(false)
    expect(onSaveError).toHaveBeenCalledWith(expect.stringContaining('channel gone'))
    expect(ipcApi.saveNodeCueFile).not.toHaveBeenCalled()
  })
})

describe('useCueFileIO delete and export', () => {
  beforeEach(() => {
    resetIpcApiMock()
  })

  const openCueDoc = (): Partial<UseCueFileIOParams> => ({
    editorDoc: openAt('cue'),
    filename: 'motion-cues.json',
    selectedCueId: 'cue-light',
  })
  it('keeps the file open and says why when the delete is refused', async () => {
    jest
      .mocked(ipcApi.deleteNodeCueFile)
      .mockResolvedValue({ success: false, error: 'file is read-only' } as never)
    const { rendered, onSaveError, setEditorDoc } = setup(openCueDoc())

    await act(async () => {
      await rendered.result.current.handleDelete()
    })

    expect(onSaveError).toHaveBeenCalledWith(expect.stringContaining('file is read-only'))
    expect(setEditorDoc).not.toHaveBeenCalled()
  })

  it('says why when the export is refused', async () => {
    jest
      .mocked(ipcApi.exportNodeCueFile)
      .mockResolvedValue({ success: false, error: 'disk full' } as never)
    const { rendered, onSaveError } = setup(openCueDoc())

    await act(async () => {
      await rendered.result.current.handleExport()
    })

    expect(onSaveError).toHaveBeenCalledWith(expect.stringContaining('disk full'))
  })

  it('says nothing when the export dialog is dismissed', async () => {
    jest.mocked(ipcApi.exportNodeCueFile).mockResolvedValue({
      success: false,
      error: 'User cancelled export.',
      cancelled: true,
    } as never)
    const { rendered, onSaveError } = setup(openCueDoc())

    await act(async () => {
      await rendered.result.current.handleExport()
    })

    expect(onSaveError).not.toHaveBeenCalled()
  })
})

describe('useCueFileIO revertCurrentFileToDisk', () => {
  beforeEach(() => {
    resetIpcApiMock()
  })

  const openDoc = (selectedCueId: string | null): Partial<UseCueFileIOParams> => ({
    editorDoc: openAt('cue'),
    filename: 'motion-cues.json',
    selectedCueId,
    cueKind: 'motion',
    lastStoredFilePathRef: { current: SAVED_PATH },
  })

  it('keeps the selected cue and reloads it when it survives the revert', async () => {
    readNodeCueFile.mockResolvedValue(mixedFile())
    const { rendered, setCueKind, setSelectedCueId, loadCueIntoFlow, setIsDirty } = setup(
      openDoc('cue-motion-b'),
    )

    await act(async () => {
      await rendered.result.current.revertCurrentFileToDisk()
    })

    expect(setSelectedCueId).toHaveBeenCalledWith('cue-motion-b')
    expect(setCueKind).toHaveBeenCalledWith('motion')
    expect(loadCueIntoFlow).toHaveBeenCalledWith(expect.objectContaining({ id: 'cue-motion-b' }))
    expect(setIsDirty).toHaveBeenCalledWith(false)
  })

  it('reselects the first cue of the active kind when the selection is gone', async () => {
    readNodeCueFile.mockResolvedValue(mixedFile())
    const { rendered, setSelectedCueId, loadCueIntoFlow } = setup(openDoc('unsaved-cue'))

    await act(async () => {
      await rendered.result.current.revertCurrentFileToDisk()
    })

    expect(setSelectedCueId).toHaveBeenCalledWith('cue-motion-a')
    expect(loadCueIntoFlow).toHaveBeenCalledWith(expect.objectContaining({ id: 'cue-motion-a' }))
  })
})

describe('useCueFileIO with another file opened meanwhile', () => {
  beforeEach(() => {
    resetIpcApiMock()
  })

  const cueFile = (id: string): NodeCueFile => ({
    version: 1,
    mode: 'yarg',
    group: { id, name: id },
    cues: [],
  })
  const docAt = (id: string): EditorDocument => ({
    mode: 'cue',
    path: `/cues/${id}.json`,
    file: cueFile(id),
  })
  const summaryAt = (id: string) =>
    cueSummary({ path: `/cues/${id}.json`, groupId: id, mode: 'yarg' })

  /** The hook over real document and dirty state, as the editor holds them. */
  function useEditor(refreshFiles: () => Promise<void>) {
    const [editorDoc, setEditorDoc] = useState<EditorDocument | null>(docAt('a'))
    const [filename, setFilename] = useState('a.json')
    const [isDirty, setIsDirty] = useState(false)
    const [selectedCueId, setSelectedCueId] = useState<string | null>(null)
    const io = useCueFileIO({
      editorDoc,
      setEditorDoc,
      filename,
      setFilename,
      selectedCueId,
      setSelectedCueId,
      cueKind: 'lighting',
      setMode: jest.fn(),
      setCueKind: jest.fn(),
      setValidationErrors: jest.fn(),
      setIsDirty,
      loadCueIntoFlow: jest.fn(),
      getUpdatedDocument: () => null,
      rememberLastFilePath: jest.fn(),
      clearLastFilePath: jest.fn(),
      refreshFiles,
      refreshEffectFiles: async () => undefined,
      lastStoredFilePathRef: { current: null },
    })
    return { io, editorDoc, isDirty, setEditorDoc, setIsDirty }
  }

  it('leaves a file opened and edited during a delete open and dirty', async () => {
    let answerDelete: (value: { success: true; path: string }) => void = () => undefined
    jest.mocked(ipcApi.deleteNodeCueFile).mockReturnValue(
      new Promise((resolve) => {
        answerDelete = resolve
      }),
    )
    const refreshFiles = jest.fn(async () => undefined)
    const { result } = renderHook(() => useEditor(refreshFiles))

    let deleting: Promise<void> = Promise.resolve()
    act(() => {
      deleting = result.current.io.handleDelete()
    })
    act(() => {
      result.current.setEditorDoc(docAt('b'))
      result.current.setIsDirty(true)
    })
    await act(async () => {
      answerDelete({ success: true, path: '/cues/a.json' })
      await deleting
    })

    expect(result.current.editorDoc?.path).toBe('/cues/b.json')
    expect(result.current.isDirty).toBe(true)
    expect(refreshFiles).toHaveBeenCalled()
  })

  it('keeps a file selected while a reload refreshes the list', async () => {
    readNodeCueFile.mockImplementation(async (path) => cueFile(path.includes('/b.') ? 'b' : 'a'))
    let finishRefresh: () => void = () => undefined
    const refreshFiles = () =>
      new Promise<void>((resolve) => {
        finishRefresh = resolve
      })
    const { result } = renderHook(() => useEditor(refreshFiles))

    let reloading: Promise<void> = Promise.resolve()
    act(() => {
      reloading = result.current.io.handleReload()
    })
    await act(async () => {
      await result.current.io.selectFile(summaryAt('b'))
    })
    await act(async () => {
      finishRefresh()
      await reloading
    })

    expect(result.current.editorDoc?.path).toBe('/cues/b.json')
  })
})
