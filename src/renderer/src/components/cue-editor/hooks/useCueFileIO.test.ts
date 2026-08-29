/** @jest-environment jsdom */
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, jest } from '@jest/globals'

const readNodeCueFile = jest.fn()
jest.mock('../../../ipcApi', () => ({
  readNodeCueFile: (...args: unknown[]) => readNodeCueFile(...args),
  readEffectFile: jest.fn(),
  saveNodeCueFile: jest.fn(),
  saveEffectFile: jest.fn(),
  deleteNodeCueFile: jest.fn(),
  deleteEffectFile: jest.fn(),
  exportNodeCueFile: jest.fn(),
  exportEffectFile: jest.fn(),
  validateNodeCue: jest.fn(),
  validateEffect: jest.fn(),
}))

import { useCueFileIO, type UseCueFileIOParams } from './useCueFileIO'
import type { NodeCueFileSummary } from '../../../../../photonics-dmx/cues/node/loader/NodeCueLoader'

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
    jest.clearAllMocks()
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
    jest.clearAllMocks()
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

describe('useCueFileIO revertCurrentFileToDisk', () => {
  beforeEach(() => {
    jest.clearAllMocks()
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
