/** @jest-environment jsdom */
/**
 * The cue editor's file state: the mode it opens in, the file lists main keeps current, importing
 * a file and switching modes. Opening and saving files belong to useCueFileIO and have their own
 * suite.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { act, renderHook, waitFor } from '@testing-library/react'
import { resetIpcApiMock } from '@renderer/tests/helpers/ipcApiMock'
import * as ipcApi from '../../../ipcApi'
import { RENDERER_RECEIVE } from '../../../../../shared/ipcChannels'
import { getLastActiveMode, setLastActiveMode, type EditorModeKey } from './useLastCueFilePath'
import { isCueTypeSelectable, suggestNonConflictingGroupId } from '../lib/cueUtils'
import type { EditorDocument } from '../lib/types'
import type { NodeCueFileSummary } from '../../../../../photonics-dmx/cues/node/loader/NodeCueLoader'
import type { EffectFileSummary } from '../../../../../photonics-dmx/cues/node/loader/EffectLoader'
import type { NodeCueFile } from '../../../../../photonics-dmx/cues/types/nodeCueTypes'
import { useCueFiles } from './useCueFiles'
import {
  emitIpc,
  ipcSubscribers,
  resetIpcListenerStub,
} from '@renderer/tests/helpers/ipcListenerStub'

jest.mock(
  '../../../ipcApi',
  () =>
    jest.requireActual<typeof import('@renderer/tests/helpers/ipcApiMock')>(
      '@renderer/tests/helpers/ipcApiMock',
    ).ipcApiMock,
)

jest.mock(
  '../../../utils/ipcHelpers',
  () =>
    jest.requireActual<typeof import('@renderer/tests/helpers/ipcListenerStub')>(
      '@renderer/tests/helpers/ipcListenerStub',
    ).ipcListenerStub,
)

function cueSummary(mode: string, groupId: string): NodeCueFileSummary {
  return {
    mode,
    groupId,
    path: `/cues/${mode}/${groupId.toLowerCase()}.json`,
  } as unknown as NodeCueFileSummary
}

function effectSummary(mode: string, groupId: string): EffectFileSummary {
  return { mode, groupId, path: `/fx/${mode}/${groupId}.json` } as unknown as EffectFileSummary
}

const CUE_LISTS = {
  yarg: [cueSummary('yarg', 'stage'), cueSummary('yarg', ' Club ')],
  audio: [cueSummary('audio', 'disco')],
  rb3: [cueSummary('rb3', 'mirror')],
}
const EFFECT_LISTS = { yarg: [effectSummary('yarg', 'core')], audio: [] }
const CUE_TYPES = ['Default', 'Menu', 'Chorus', 'Verse']

const OPEN_DOC = {
  mode: 'cue',
  path: '/cues/yarg/stage.json',
  file: {
    mode: 'yarg',
    group: { id: 'stage', name: 'Stage' },
    cues: [
      {
        id: 'l1',
        kind: 'lighting',
        name: 'Wash',
        nodes: { events: [], actions: [] },
        connections: [],
      },
      {
        id: 'm1',
        kind: 'motion',
        name: 'Sweep',
        nodes: { events: [], actions: [] },
        connections: [],
      },
    ],
  },
} as unknown as EditorDocument

const IMPORTED = {
  bundled: true,
  cueVersion: 4,
  mode: 'yarg',
  group: { id: 'Stage', name: 'Imported' },
  cues: [],
} as unknown as NodeCueFile

beforeEach(() => {
  resetIpcApiMock()
  window.localStorage.clear()
  resetIpcListenerStub()
  jest.mocked(ipcApi.listNodeCueFiles).mockResolvedValue(CUE_LISTS)
  jest.mocked(ipcApi.listEffectFiles).mockResolvedValue(EFFECT_LISTS)
  jest.mocked(ipcApi.getNodeCueTypes).mockResolvedValue(CUE_TYPES)
})

function renderFiles() {
  const loadCueIntoFlow = jest.fn()
  const onError = jest.fn<(message: string) => void>()
  const onSaveSuccess = jest.fn<(message: string) => void>()
  const view = renderHook(() =>
    useCueFiles({ loadCueIntoFlow, getUpdatedDocument: () => null, onError, onSaveSuccess }),
  )
  return { ...view, loadCueIntoFlow, onError, onSaveSuccess }
}

type View = ReturnType<typeof renderFiles>

/** Resolves once the file lists have arrived. */
async function renderLoaded(): Promise<View> {
  const view = renderFiles()
  await waitFor(() => expect(view.result.current.files.length).toBeGreaterThan(0))
  return view
}

async function run(view: View, action: (current: View['result']['current']) => Promise<void>) {
  await act(async () => {
    await action(view.result.current)
  })
}

describe('useCueFiles opening state', () => {
  it.each<[string, EditorModeKey | null, string, string, string]>([
    ['nothing stored', null, 'yarg', 'lighting', 'cue'],
    ['an audio motion cue', 'audio-motion-cue', 'audio', 'motion', 'cue'],
    ['an rb3 cue', 'rb3-cue', 'rb3', 'lighting', 'cue'],
    ['a yarg effect', 'yarg-effect', 'yarg', 'lighting', 'effect'],
  ])('opens on the last mode used: %s', async (_case, stored, mode, cueKind, editorMode) => {
    if (stored) setLastActiveMode(stored)
    const view = await renderLoaded()
    expect(view.result.current.mode).toBe(mode)
    expect(view.result.current.cueKind).toBe(cueKind)
    expect(view.result.current.editorMode).toBe(editorMode)
  })

  it('lists every file and groups them by mode', async () => {
    const view = await renderLoaded()
    const paths = (list: Array<{ path: string }>) => list.map((f) => f.path)
    expect(paths(view.result.current.groupedFiles.yarg)).toEqual([
      '/cues/yarg/stage.json',
      '/cues/yarg/ club .json',
    ])
    expect(paths(view.result.current.groupedFiles.audio)).toEqual(['/cues/audio/disco.json'])
    expect(paths(view.result.current.groupedFiles.rb3)).toEqual(['/cues/rb3/mirror.json'])
    expect(paths(view.result.current.groupedEffectFiles.yarg)).toEqual(['/fx/yarg/core.json'])
  })

  it('offers only the selectable cue types of the mode', async () => {
    const view = await renderLoaded()
    await waitFor(() =>
      expect(view.result.current.availableCueTypes).toEqual(CUE_TYPES.filter(isCueTypeSelectable)),
    )
    expect(ipcApi.getNodeCueTypes).toHaveBeenCalledWith('yarg', 'lighting')
  })

  it('knows the group ids a new file of the mode may not reuse', async () => {
    const view = await renderLoaded()
    expect([...view.result.current.existingGroupIdsForNewFileModal]).toEqual(['stage', 'club'])
  })
})

describe('useCueFiles file lists from main', () => {
  it('replaces the lists main reports and stops listening on unmount', async () => {
    const view = await renderLoaded()

    act(() =>
      emitIpc(RENDERER_RECEIVE.NODE_CUES_CHANGED, {
        yarg: [],
        audio: [cueSummary('audio', 'rock')],
        rb3: [],
      }),
    )
    act(() =>
      emitIpc(RENDERER_RECEIVE.EFFECTS_CHANGED, {
        yarg: [],
        audio: [effectSummary('audio', 'pulse')],
      }),
    )
    expect(view.result.current.files.map((f) => f.path)).toEqual(['/cues/audio/rock.json'])
    expect(view.result.current.effectFiles.map((f) => f.path)).toEqual(['/fx/audio/pulse.json'])

    view.unmount()
    expect(ipcSubscribers(RENDERER_RECEIVE.NODE_CUES_CHANGED)).toEqual([])
    expect(ipcSubscribers(RENDERER_RECEIVE.EFFECTS_CHANGED)).toEqual([])
  })
})

describe('useCueFiles import', () => {
  it('holds a picked cue file with a group id no file of its mode uses', async () => {
    jest.mocked(ipcApi.pickNodeCueImportFile).mockResolvedValue({
      success: true,
      sourceBasename: 'stage.json',
      mode: 'yarg',
      content: IMPORTED,
    })
    const view = await renderLoaded()
    await run(view, (h) => h.handleImport())

    expect(view.result.current.pendingImport).toMatchObject({
      kind: 'cue',
      saveMode: 'yarg',
      sourceBasename: 'stage.json',
      suggestedGroupId: suggestNonConflictingGroupId('Stage', new Set(['stage', 'club'])),
    })
    expect([...view.result.current.existingFilenamesLowerForImportModal]).toEqual([
      'stage.json',
      ' club .json',
    ])
  })

  it('stays quiet when the import picker is cancelled', async () => {
    jest.mocked(ipcApi.pickNodeCueImportFile).mockResolvedValue({
      success: false,
      error: 'User cancelled import.',
      cancelled: true,
    })
    const view = await renderLoaded()
    await run(view, (h) => h.handleImport())
    expect(view.onError).not.toHaveBeenCalled()
    expect(view.result.current.pendingImport).toBeNull()
  })

  it('reports an import file it could not use', async () => {
    jest
      .mocked(ipcApi.pickNodeCueImportFile)
      .mockResolvedValue({ success: false, error: 'bad json' })
    const view = await renderLoaded()
    await run(view, (h) => h.handleImport())
    expect(view.onError).toHaveBeenCalledWith('bad json')
  })

  it('saves an rb3 import as rb3 under the chosen group id, without bundled markers', async () => {
    jest.mocked(ipcApi.pickNodeCueImportFile).mockResolvedValue({
      success: true,
      sourceBasename: 'stage.json',
      mode: 'rb3',
      content: IMPORTED,
    })
    jest.mocked(ipcApi.validateNodeCue).mockResolvedValue({
      valid: true,
      data: IMPORTED,
      errors: [],
      mode: 'rb3',
    })
    jest
      .mocked(ipcApi.saveNodeCueFile)
      .mockResolvedValue({ success: true, path: '/cues/rb3/new.json' })
    const view = await renderLoaded()
    await run(view, (h) => h.handleImport())
    await run(view, (h) => h.commitPendingImport('new.json', '  fresh '))

    const saved = jest.mocked(ipcApi.saveNodeCueFile).mock.calls[0]![0]
    expect(saved.mode).toBe('rb3')
    expect(saved.filename).toBe('new.json')
    expect(saved.content.mode).toBe('rb3')
    expect(saved.content.group.id).toBe('fresh')
    expect(saved.content).not.toHaveProperty('bundled')
    expect(saved.content).not.toHaveProperty('cueVersion')
    expect(view.onSaveSuccess).toHaveBeenCalledWith('Cue imported: new.json')
    expect(view.result.current.pendingImport).toBeNull()
  })

  it('keeps an import that fails validation and says why', async () => {
    jest.mocked(ipcApi.pickNodeCueImportFile).mockResolvedValue({
      success: true,
      sourceBasename: 'stage.json',
      mode: 'yarg',
      content: IMPORTED,
    })
    jest.mocked(ipcApi.validateNodeCue).mockResolvedValue({ valid: false, errors: ['no cues'] })
    const view = await renderLoaded()
    await run(view, (h) => h.handleImport())
    await run(view, (h) => h.commitPendingImport('new.json', 'fresh'))

    expect(view.onError).toHaveBeenCalledWith('Import validation failed: no cues')
    expect(ipcApi.saveNodeCueFile).not.toHaveBeenCalled()
    expect(view.result.current.pendingImport).not.toBeNull()
  })
})

describe('useCueFiles mode switching', () => {
  it('clears the editor for a mode with no file of its own', async () => {
    const view = await renderLoaded()
    act(() => view.result.current.setEditorDoc(OPEN_DOC))
    act(() => view.result.current.handleModeChange('audio-effect'))

    expect(view.result.current.mode).toBe('audio')
    expect(view.result.current.editorMode).toBe('effect')
    expect(view.result.current.editorDoc).toBeNull()
    expect(view.loadCueIntoFlow).toHaveBeenLastCalledWith(null)
    expect(getLastActiveMode()).toBe('audio-effect')
  })

  it('stays in the open file when it holds cues of the kind switched to', async () => {
    const view = await renderLoaded()
    act(() => view.result.current.setEditorDoc(OPEN_DOC))
    act(() => view.result.current.setSelectedCueId('l1'))
    act(() => view.result.current.handleModeChange('yarg-motion-cue'))

    expect(view.result.current.cueKind).toBe('motion')
    expect(view.result.current.selectedCueId).toBe('m1')
    expect(view.result.current.editorDoc).toBe(OPEN_DOC)
    expect(view.result.current.currentCueDefinition?.id).toBe('m1')
    expect(view.result.current.currentEffectDefinition).toBeNull()
  })
})
