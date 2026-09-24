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
import type { NodeCueFileSummary } from '../../../../../photonics-dmx/cues/node/loader/NodeCueLoader'
import type { NodeCueFile } from '../../../../../photonics-dmx/cues/types/nodeCueTypes'
import type { EditorDocument } from '../lib/types'

const fileSummary = (): NodeCueFileSummary =>
  ({
    path: '/cues/motion-cues.json',
    groupId: 'motion-group',
    mode: 'yarg',
  }) as NodeCueFileSummary

/** A file holding both kinds, with the lighting cue sorting first by name. */
const mixedFile = () => ({
  mode: 'yarg',
  group: { id: 'g', name: 'Group' },
  cues: [
    { id: 'cue-motion-b', kind: 'motion', name: 'Bravo Motion' },
    { id: 'cue-light', kind: 'lighting', name: 'Alpha Lighting' },
    { id: 'cue-motion-a', kind: 'motion', name: 'Alpha Motion' },
  ],
})

const setup = (overrides: Partial<UseCueFileIOParams> = {}) => {
  const mocks = {
    setEditorDoc: jest.fn(),
    setFilename: jest.fn(),
    setSelectedCueId: jest.fn(),
    setMode: jest.fn(),
    setCueKind: jest.fn(),
    setValidationErrors: jest.fn(),
    setIsDirty: jest.fn(),
    loadCueIntoFlow: jest.fn(),
    rememberLastFilePath: jest.fn(),
    clearLastFilePath: jest.fn(),
    onSaveError: jest.fn(),
  }

  const rendered = renderHook(() =>
    useCueFileIO({
      editorDoc: null,
      filename: 'untitled.json',
      selectedCueId: null,
      cueKind: 'lighting',
      getUpdatedDocument: jest.fn<() => null>(() => null),
      refreshFiles: jest.fn(async () => undefined),
      refreshEffectFiles: jest.fn(async () => undefined),
      lastStoredFilePathRef: { current: null as string | null },
      ...mocks,
      ...overrides,
    } as UseCueFileIOParams),
  )

  return { rendered, ...mocks }
}

describe('useCueFileIO selectFile', () => {
  beforeEach(() => {
    resetIpcApiMock()
  })

  it('synchronises cue kind from the preferred cue', async () => {
    readNodeCueFile.mockResolvedValue(mixedFile() as never)
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
    readNodeCueFile.mockResolvedValue(mixedFile() as never)
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
    readNodeCueFile.mockResolvedValue({
      mode: 'yarg',
      group: { id: 'g', name: 'Group' },
      cues: [{ id: 'cue-motion', kind: 'motion', name: 'Motion Cue' }],
    } as never)
    const { rendered, setCueKind, setSelectedCueId } = setup({ cueKind: 'lighting' })

    await act(async () => {
      await rendered.result.current.selectFile(fileSummary())
    })

    expect(setCueKind).toHaveBeenCalledWith('motion')
    expect(setSelectedCueId).toHaveBeenCalledWith('cue-motion')
  })

  it('prefers the kind override over the active kind', async () => {
    readNodeCueFile.mockResolvedValue(mixedFile() as never)
    const { rendered, setCueKind, setSelectedCueId } = setup({ cueKind: 'lighting' })

    await act(async () => {
      await rendered.result.current.selectFile(fileSummary(), undefined, 'motion')
    })

    expect(setCueKind).toHaveBeenCalledWith('motion')
    expect(setSelectedCueId).toHaveBeenCalledWith('cue-motion-a')
  })

  it('ignores a superseded read so the newest selection wins', async () => {
    let resolveFirst: (value: unknown) => void = () => {}
    readNodeCueFile
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirst = resolve
        }) as never,
      )
      .mockResolvedValueOnce({
        mode: 'yarg',
        group: { id: 'g', name: 'Group' },
        cues: [{ id: 'second-cue', kind: 'lighting', name: 'Second' }],
      } as never)

    const { rendered, setSelectedCueId } = setup()

    await act(async () => {
      const stale = rendered.result.current.selectFile(fileSummary())
      await rendered.result.current.selectFile({
        ...fileSummary(),
        path: '/cues/second.json',
      } as NodeCueFileSummary)
      resolveFirst({
        mode: 'yarg',
        group: { id: 'g', name: 'Group' },
        cues: [{ id: 'first-cue', kind: 'lighting', name: 'First' }],
      })
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

  const openDoc = (selectedCueId: string | null) => ({
    editorDoc: {
      mode: 'cue',
      path: '/cues/motion-cues.json',
      file: mixedFile(),
    },
    filename: 'motion-cues.json',
    selectedCueId,
    lastStoredFilePathRef: { current: '/cues/motion-cues.json' as string | null },
  })

  it('synchronises cue kind before selection and flow updates on reload', async () => {
    readNodeCueFile.mockResolvedValue({
      mode: 'yarg',
      group: { id: 'g', name: 'Group' },
      cues: [{ id: 'cue-motion', kind: 'motion', name: 'Motion Cue' }],
    } as never)

    const { rendered, setCueKind, setSelectedCueId, loadCueIntoFlow } = setup({
      ...openDoc('cue-motion'),
    } as Partial<UseCueFileIOParams>)

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
    readNodeCueFile.mockResolvedValue(mixedFile() as never)

    const { rendered, setCueKind, setSelectedCueId } = setup({
      ...openDoc('deleted-cue'),
      cueKind: 'motion',
    } as Partial<UseCueFileIOParams>)

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

  const openCueDoc = (): Partial<UseCueFileIOParams> =>
    ({
      editorDoc: {
        mode: 'cue',
        path: '/cues/motion-cues.json',
        file: mixedFile(),
      },
      filename: 'motion-cues.json',
      selectedCueId: 'cue-light',
      cueKind: 'lighting',
      getUpdatedDocument: jest.fn(() => mixedFile()),
      lastStoredFilePathRef: { current: '/cues/motion-cues.json' as string | null },
    }) as unknown as Partial<UseCueFileIOParams>

  it('leaves the file dirty when it was edited while the save ran', async () => {
    jest.mocked(ipcApi.validateNodeCue).mockResolvedValue({ valid: true, errors: [] } as never)
    jest
      .mocked(ipcApi.saveNodeCueFile)
      .mockResolvedValue({ success: true, path: '/cues/motion-cues.json' } as never)
    const edited = { ...mixedFile(), cues: [] }
    const getUpdatedDocument = jest.fn(() => mixedFile() as unknown)
    getUpdatedDocument.mockReturnValueOnce(mixedFile()).mockReturnValue(edited)
    const { rendered, setIsDirty } = setup({
      ...openCueDoc(),
      getUpdatedDocument: getUpdatedDocument as never,
    })

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
      jest
        .mocked(ipcApi[save])
        .mockResolvedValue({ success: true, path: '/cues/motion-cues.json' } as never)
      const added = { ...mixedFile(), cues: [...mixedFile().cues, { id: 'cue-new', name: 'New' }] }
      const getUpdatedDocument = jest.fn(() => mixedFile() as unknown)
      getUpdatedDocument.mockReturnValueOnce(mixedFile()).mockReturnValue(added)
      const { rendered, setEditorDoc, setIsDirty } = setup({
        ...openCueDoc(),
        editorDoc: { mode: docMode, path: '/cues/motion-cues.json', file: mixedFile() },
        getUpdatedDocument: getUpdatedDocument as never,
      } as unknown as Partial<UseCueFileIOParams>)

      let saved: boolean | undefined
      await act(async () => {
        saved = await rendered.result.current.handleSave()
      })

      expect(saved).toBe(true)
      expect(setEditorDoc).toHaveBeenLastCalledWith({
        mode: docMode,
        path: '/cues/motion-cues.json',
        file: expect.objectContaining({
          bundled: false,
          cues: expect.arrayContaining([expect.objectContaining({ id: 'cue-new' })]),
        }),
      })
      expect(setIsDirty).toHaveBeenLastCalledWith(true)
    },
  )

  it('leaves a file opened while the save ran as it is', async () => {
    jest.mocked(ipcApi.validateNodeCue).mockResolvedValue({ valid: true, errors: [] } as never)
    let answerSave: (value: unknown) => void = () => {}
    jest.mocked(ipcApi.saveNodeCueFile).mockReturnValue(
      new Promise((resolve) => {
        answerSave = resolve
      }) as never,
    )
    const mocks = {
      setEditorDoc: jest.fn(),
      setIsDirty: jest.fn(),
      rememberLastFilePath: jest.fn(),
    }
    const saving = {
      ...openCueDoc(),
      ...mocks,
      refreshFiles: jest.fn(async () => undefined),
    } as unknown as UseCueFileIOParams
    const other = { mode: 'cue', path: '/cues/other.json', file: mixedFile() }
    const { result, rerender } = renderHook((params) => useCueFileIO(params), {
      initialProps: saving,
    })

    let pending: Promise<boolean> = Promise.resolve(false)
    await act(async () => {
      pending = result.current.handleSave()
    })
    rerender({
      ...saving,
      editorDoc: other,
      getUpdatedDocument: () => other.file,
    } as unknown as UseCueFileIOParams)
    await act(async () => {
      answerSave({ success: true, path: '/cues/motion-cues.json' })
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
      editorDoc: { mode: docMode, path: '/cues/motion-cues.json', file: mixedFile() },
      selectedCueId: 'not-in-file',
      getUpdatedDocument: jest.fn(() => null) as never,
    } as unknown as Partial<UseCueFileIOParams>)

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
      .mockResolvedValue({ success: true, path: '/cues/motion-cues.json' } as never)
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
      path: '/cues/motion-cues.json',
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
    "saves a shipped %s file as the user's own and keeps it clean",
    async (docMode, save, validate) => {
      jest.mocked(ipcApi[validate]).mockResolvedValue({ valid: true, errors: [] } as never)
      jest
        .mocked(ipcApi[save])
        .mockResolvedValue({ success: true, path: '/cues/motion-cues.json' } as never)
      const shipped = { ...mixedFile(), bundled: true, cueVersion: 4 }
      const { rendered, setEditorDoc, setIsDirty } = setup({
        ...openCueDoc(),
        editorDoc: { mode: docMode, path: '/cues/motion-cues.json', file: shipped },
        getUpdatedDocument: jest.fn(() => shipped) as never,
      } as unknown as Partial<UseCueFileIOParams>)

      await act(async () => {
        await rendered.result.current.handleSave()
      })

      const sent = jest.mocked(ipcApi[save]).mock.calls[0][0] as { content: { bundled?: boolean } }
      expect(sent.content.bundled).toBe(false)
      expect(setEditorDoc).toHaveBeenLastCalledWith(
        expect.objectContaining({ file: expect.objectContaining({ bundled: false }) }),
      )
      expect(setIsDirty).toHaveBeenLastCalledWith(false)
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

  const openCueDoc = (): Partial<UseCueFileIOParams> =>
    ({
      editorDoc: { mode: 'cue', path: '/cues/motion-cues.json', file: mixedFile() },
      filename: 'motion-cues.json',
      selectedCueId: 'cue-light',
    }) as unknown as Partial<UseCueFileIOParams>

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

  const openDoc = (selectedCueId: string | null) =>
    ({
      editorDoc: {
        mode: 'cue',
        path: '/cues/motion-cues.json',
        file: mixedFile(),
      },
      filename: 'motion-cues.json',
      selectedCueId,
      cueKind: 'motion',
      lastStoredFilePathRef: { current: '/cues/motion-cues.json' as string | null },
    }) as Partial<UseCueFileIOParams>

  it('keeps the selected cue and reloads it when it survives the revert', async () => {
    readNodeCueFile.mockResolvedValue(mixedFile() as never)
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
    readNodeCueFile.mockResolvedValue(mixedFile() as never)
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
  const summaryAt = (id: string): NodeCueFileSummary => ({
    path: `/cues/${id}.json`,
    groupId: id,
    groupName: id,
    cueCount: 0,
    lightingCueCount: 0,
    motionCueCount: 0,
    mode: 'yarg',
    updatedAt: 0,
  })

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
