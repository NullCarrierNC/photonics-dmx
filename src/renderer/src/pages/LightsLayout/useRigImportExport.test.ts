/** @jest-environment jsdom */
/**
 * Rig import, export, duplicate and delete from the Light Layout page, against the shared ipcApi
 * mock. The rig helpers run for real, so expectations about a summary come from the same helpers.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { act, renderHook } from '@testing-library/react'
import { useState } from 'react'
import { resetIpcApiMock } from '@renderer/tests/helpers/ipcApiMock'
import * as ipcApi from '../../ipcApi'
import {
  ConfigStrobeType,
  FixtureTypes,
  type DmxFixture,
  type DmxLight,
  type DmxRig,
  type LightingConfiguration,
} from '../../../../photonics-dmx/types'
import {
  countOrphanLights,
  reconcileImportedTemplates,
  suggestUniqueName,
} from '../../../../photonics-dmx/helpers/rigImportExport'
import type { ConfirmOptions } from '../../hooks/useConfirm'
import { useRigImportExport } from './useRigImportExport'

jest.mock(
  '../../ipcApi',
  () =>
    jest.requireActual<typeof import('@renderer/tests/helpers/ipcApiMock')>(
      '@renderer/tests/helpers/ipcApiMock',
    ).ipcApiMock,
)

const TEMPLATE: DmxFixture = {
  id: 't1',
  position: 0,
  fixture: FixtureTypes.RGB,
  label: 'PAR',
  name: 'PAR',
  isStrobeEnabled: false,
  channels: { masterDimmer: 1, red: 2, green: 3, blue: 4 } as unknown as DmxFixture['channels'],
}

const NEW_TEMPLATE: DmxFixture = {
  ...TEMPLATE,
  id: 't2',
  name: 'Wash',
  label: 'Wash',
  channels: { masterDimmer: 10, red: 11, green: 12, blue: 13 } as unknown as DmxFixture['channels'],
}

function light(id: string, fixtureId: string): DmxLight {
  return { ...TEMPLATE, id, fixtureId, position: 1, group: 'front', universe: 1, mount: 'floor' }
}

function rig(id: string, name: string, extra: Partial<DmxRig> = {}): DmxRig {
  return {
    id,
    name,
    active: true,
    config: {
      numLights: 1,
      lightLayout: { id: 'front', label: 'Front' },
      strobeType: ConfigStrobeType.None,
      frontLights: [light(`${id}-l1`, 't1')],
      backLights: [],
      strobeLights: [],
    },
    ...extra,
  }
}

const RIG_A = rig('a', 'Rig A')
const RIG_B = rig('b', 'Rig B')
const RIG_C = rig('c', 'Rig C')

interface Options {
  rigs?: DmxRig[]
  activeRigId?: string | null
  isDirty?: boolean
  proceed?: boolean
  confirmed?: boolean
}

function renderRigs(options: Options = {}) {
  const showToast = jest.fn<(message: string, type?: string, duration?: number) => void>()
  const confirm = jest.fn(async (_request: ConfirmOptions) => options.confirmed ?? true)
  const onBeforeDiscardingUnsaved = jest.fn(async () => options.proceed ?? true)
  const setMyFixtureLibrary = jest.fn()
  const view = renderHook(() => {
    const [rigs, setRigs] = useState(options.rigs ?? [RIG_A, RIG_B])
    const [activeRigId, setActiveRigId] = useState<string | null>(
      options.activeRigId === undefined ? 'a' : options.activeRigId,
    )
    const [rigName, setRigName] = useState('')
    const [config, setActiveLightsConfig] = useState<LightingConfiguration | null>(null)
    return {
      rigs,
      activeRigId,
      rigName,
      config,
      ...useRigImportExport({
        rigs,
        setRigs,
        activeRigId,
        setActiveRigId,
        setRigName,
        setActiveLightsConfig,
        myFixtureLibrary: [TEMPLATE],
        setMyFixtureLibrary,
        onBeforeDiscardingUnsaved,
        isDirty: options.isDirty ?? false,
        showToast,
        confirm,
      }),
    }
  })
  return { ...view, showToast, confirm, onBeforeDiscardingUnsaved, setMyFixtureLibrary }
}

type View = ReturnType<typeof renderRigs>

async function run(view: View, action: (current: View['result']['current']) => Promise<void>) {
  await act(async () => {
    await action(view.result.current)
  })
}

/** The rig most recently handed to saveDmxRig. */
function savedRig(): DmxRig {
  const calls = jest.mocked(ipcApi.saveDmxRig).mock.calls
  return calls[calls.length - 1]![0]
}

const PICKED = {
  success: true as const,
  sourceBasename: 'club.json',
  rig: { ...rig('x', 'Rig A'), config: { ...RIG_A.config, frontLights: [light('x-l1', 't2')] } },
  templates: [TEMPLATE, NEW_TEMPLATE],
  repairs: [] as string[],
}

beforeEach(() => {
  resetIpcApiMock()
})

describe('useRigImportExport export', () => {
  it('exports the active rig', async () => {
    jest.mocked(ipcApi.exportRig).mockResolvedValue({ success: true, path: '/rigs/a.json' })
    const view = renderRigs()
    await run(view, (h) => h.handleExport())
    expect(ipcApi.exportRig).toHaveBeenCalledWith('a')
    expect(view.showToast).toHaveBeenCalledWith('Rig exported.', 'success', 3500)
  })

  it('says unsaved edits stay out of the export', async () => {
    jest.mocked(ipcApi.exportRig).mockResolvedValue({ success: true, path: '/rigs/a.json' })
    const view = renderRigs({ isDirty: true })
    await run(view, (h) => h.handleExport())
    expect(view.showToast).toHaveBeenCalledWith(
      'Exported the last saved version (unsaved edits not included).',
      'success',
      3500,
    )
  })

  it('stays quiet when the save dialog is cancelled', async () => {
    jest.mocked(ipcApi.exportRig).mockResolvedValue({
      success: false,
      error: 'User cancelled export.',
      cancelled: true,
    })
    const view = renderRigs()
    await run(view, (h) => h.handleExport())
    expect(view.showToast).not.toHaveBeenCalled()
  })

  it('reports an export that failed', async () => {
    jest.mocked(ipcApi.exportRig).mockResolvedValue({ success: false, error: 'disk full' })
    const view = renderRigs()
    await run(view, (h) => h.handleExport())
    expect(view.showToast).toHaveBeenCalledWith('disk full', 'error', 5000)
  })

  it('does nothing without an active rig', async () => {
    const view = renderRigs({ activeRigId: null })
    await run(view, (h) => h.handleExport())
    expect(ipcApi.exportRig).not.toHaveBeenCalled()
  })
})

describe('useRigImportExport import', () => {
  it('stops when the user keeps their unsaved edits', async () => {
    const view = renderRigs({ proceed: false })
    await run(view, (h) => h.handleImport())
    expect(ipcApi.pickRigImportFile).not.toHaveBeenCalled()
  })

  it('stays quiet when the file picker is cancelled', async () => {
    jest.mocked(ipcApi.pickRigImportFile).mockResolvedValue({
      success: false,
      error: 'User cancelled import.',
      cancelled: true,
    })
    const view = renderRigs()
    await run(view, (h) => h.handleImport())
    expect(view.showToast).not.toHaveBeenCalled()
    expect(view.result.current.pendingImport).toBeNull()
  })

  it('reports a file it could not use', async () => {
    jest.mocked(ipcApi.pickRigImportFile).mockResolvedValue({ success: false, error: 'bad json' })
    const view = renderRigs()
    await run(view, (h) => h.handleImport())
    expect(view.showToast).toHaveBeenCalledWith('bad json', 'error', 5000)
  })

  it('warns about fixture values the file held that were reset', async () => {
    jest.mocked(ipcApi.pickRigImportFile).mockResolvedValue({
      ...PICKED,
      repairs: ['templates[0].channels.blue is missing'],
    })
    const view = renderRigs()
    await run(view, (h) => h.handleImport())
    expect(view.showToast).toHaveBeenCalledWith(
      expect.stringContaining('templates[0].channels.blue is missing'),
      'warning',
      8000,
    )
    expect(view.result.current.pendingImport).not.toBeNull()
  })

  it('holds a picked rig for confirmation with a summary and a free name', async () => {
    jest.mocked(ipcApi.pickRigImportFile).mockResolvedValue(PICKED)
    const view = renderRigs()
    await run(view, (h) => h.handleImport())

    const expected = reconcileImportedTemplates(PICKED.templates, [TEMPLATE])
    const pending = view.result.current.pendingImport!
    expect(pending.sourceBasename).toBe('club.json')
    expect(pending.summary).toEqual({
      templatesToAddCount: expected.templatesToAdd.length,
      templatesReusedCount: expected.reusedCount,
      orphanCount: countOrphanLights(PICKED.rig, expected.fixtureIdMap),
    })
    expect(pending.defaultName).toBe(suggestUniqueName('Rig A', new Set(['rig a', 'rig b'])))
    expect(pending.defaultName).not.toBe('Rig A')
  })

  it('forgets a held import when it is cleared', async () => {
    jest.mocked(ipcApi.pickRigImportFile).mockResolvedValue(PICKED)
    const view = renderRigs()
    await run(view, (h) => h.handleImport())
    act(() => view.result.current.clearPendingImport())
    expect(view.result.current.pendingImport).toBeNull()
  })
})

describe('useRigImportExport commit', () => {
  async function pickedView(): Promise<View> {
    jest.mocked(ipcApi.pickRigImportFile).mockResolvedValue(PICKED)
    const view = renderRigs()
    await run(view, (h) => h.handleImport())
    return view
  }

  it('imports one rig when the import is confirmed twice while it saves', async () => {
    const view = await pickedView()
    let answerSave: (value: unknown) => void = () => {}
    jest.mocked(ipcApi.saveDmxRig).mockReturnValue(
      new Promise((resolve) => {
        answerSave = resolve
      }) as never,
    )

    await act(async () => {
      void view.result.current.commitPendingImport('Club')
      void view.result.current.commitPendingImport('Club')
    })
    await act(async () => {
      answerSave({ success: true })
    })

    expect(ipcApi.saveMyLights).toHaveBeenCalledTimes(1)
    expect(ipcApi.saveDmxRig).toHaveBeenCalledTimes(1)
  })

  it('saves new templates before the rig, then selects the saved rig', async () => {
    const view = await pickedView()
    jest.mocked(ipcApi.getDmxRigs).mockImplementation(async () => [RIG_A, RIG_B, savedRig()])
    await run(view, (h) => h.commitPendingImport('Club'))

    const templatesSave = jest.mocked(ipcApi.saveMyLights).mock
    expect(templatesSave.calls[0]![0].map((t) => t.name)).toEqual(['PAR', 'Wash'])
    expect(templatesSave.invocationCallOrder[0]!).toBeLessThan(
      jest.mocked(ipcApi.saveDmxRig).mock.invocationCallOrder[0]!,
    )
    expect(savedRig().name).toBe('Club')
    expect(view.result.current.activeRigId).toBe(savedRig().id)
    expect(view.result.current.rigName).toBe('Club')
    expect(view.result.current.pendingImport).toBeNull()
    expect(view.showToast).toHaveBeenCalledWith('Layout imported: Club', 'success', 4000)
  })

  it('keeps the import when its templates cannot be saved', async () => {
    const view = await pickedView()
    jest.mocked(ipcApi.saveMyLights).mockResolvedValue({ success: false, error: 'no space' })
    await run(view, (h) => h.commitPendingImport('Club'))

    expect(view.showToast).toHaveBeenCalledWith('no space', 'error', 5000)
    expect(ipcApi.saveDmxRig).not.toHaveBeenCalled()
    expect(view.result.current.pendingImport).not.toBeNull()
  })

  it('keeps the import when the rig cannot be saved', async () => {
    const view = await pickedView()
    jest.mocked(ipcApi.saveDmxRig).mockResolvedValue({ success: false, error: 'bad rig' })
    await run(view, (h) => h.commitPendingImport('Club'))

    expect(view.showToast).toHaveBeenCalledWith('bad rig', 'error', 5000)
    expect(view.result.current.pendingImport).not.toBeNull()
  })

  it('selects the local copy when the saved rigs cannot be read back', async () => {
    const view = await pickedView()
    jest.mocked(ipcApi.getDmxRigs).mockRejectedValue(new Error('offline'))
    await run(view, (h) => h.commitPendingImport('Club'))

    expect(view.result.current.rigs.map((r) => r.name)).toEqual(['Rig A', 'Rig B', 'Club'])
    expect(view.result.current.activeRigId).toBe(savedRig().id)
  })
})

describe('useRigImportExport duplicate', () => {
  it('duplicates once when Duplicate is clicked twice while it saves', async () => {
    const view = renderRigs()
    let answerSave: (value: unknown) => void = () => {}
    jest.mocked(ipcApi.saveDmxRig).mockReturnValue(
      new Promise((resolve) => {
        answerSave = resolve
      }) as never,
    )

    await act(async () => {
      void view.result.current.handleDuplicate()
      void view.result.current.handleDuplicate()
    })
    await act(async () => {
      answerSave({ success: true })
    })

    expect(ipcApi.saveDmxRig).toHaveBeenCalledTimes(1)
  })

  it('duplicates the active rig and selects the copy', async () => {
    jest.mocked(ipcApi.getDmxRigs).mockImplementation(async () => [RIG_A, RIG_B, savedRig()])
    const view = renderRigs()
    await run(view, (h) => h.handleDuplicate())

    const copy = savedRig()
    expect(copy.id).not.toBe('a')
    expect(view.result.current.activeRigId).toBe(copy.id)
    expect(view.showToast).toHaveBeenCalledWith(`Rig duplicated: ${copy.name}`, 'success', 4000)
  })

  it('reports a copy that could not be saved', async () => {
    jest.mocked(ipcApi.saveDmxRig).mockResolvedValue({ success: false, error: 'bad rig' })
    const view = renderRigs()
    await run(view, (h) => h.handleDuplicate())
    expect(view.showToast).toHaveBeenCalledWith('bad rig', 'error', 5000)
  })

  it('reports having nothing to duplicate', async () => {
    const view = renderRigs({ activeRigId: 'missing' })
    await run(view, (h) => h.handleDuplicate())
    expect(view.showToast).toHaveBeenCalledWith('No rig selected to duplicate.', 'error', 4000)
  })

  it('stops when the user keeps their unsaved edits', async () => {
    const view = renderRigs({ proceed: false })
    await run(view, (h) => h.handleDuplicate())
    expect(ipcApi.saveDmxRig).not.toHaveBeenCalled()
  })
})

describe('useRigImportExport delete', () => {
  it('keeps the last layout', async () => {
    const view = renderRigs({ rigs: [RIG_A] })
    await run(view, (h) => h.handleDelete())
    expect(view.showToast).toHaveBeenCalledWith('You need at least one layout.', 'info', 4000)
    expect(view.confirm).not.toHaveBeenCalled()
  })

  it('deletes nothing when the prompt is declined', async () => {
    const view = renderRigs({ confirmed: false })
    await run(view, (h) => h.handleDelete())
    expect(view.confirm).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Delete rig', danger: true }),
    )
    expect(ipcApi.deleteDmxRig).not.toHaveBeenCalled()
  })

  it('deletes the rig and selects a survivor from the saved list', async () => {
    jest.mocked(ipcApi.getDmxRigs).mockResolvedValue([RIG_B, RIG_C])
    const view = renderRigs({ rigs: [RIG_A, RIG_B, RIG_C] })
    await run(view, (h) => h.handleDelete())

    expect(ipcApi.deleteDmxRig).toHaveBeenCalledWith('a')
    expect(ipcApi.saveDmxRig).not.toHaveBeenCalled()
    expect(view.result.current.rigs).toEqual([RIG_B, RIG_C])
    expect(view.result.current.activeRigId).toBe('b')
    expect(view.showToast).toHaveBeenCalledWith('Rig deleted: Rig A', 'success', 4000)
  })

  it('clears the routing of the only rig left', async () => {
    const routed = rig('b', 'Rig B', { outputs: ['sacn'] })
    const view = renderRigs({ rigs: [RIG_A, routed] })
    await run(view, (h) => h.handleDelete())
    expect(savedRig()).toEqual(RIG_B)
  })

  it('leaves an unrouted survivor as it is', async () => {
    const view = renderRigs()
    await run(view, (h) => h.handleDelete())
    expect(ipcApi.saveDmxRig).not.toHaveBeenCalled()
  })

  it('falls back to the local list when the saved rigs cannot be read back', async () => {
    jest.mocked(ipcApi.getDmxRigs).mockRejectedValue(new Error('offline'))
    const view = renderRigs()
    await run(view, (h) => h.handleDelete())
    expect(view.result.current.rigs).toEqual([RIG_B])
    expect(view.result.current.activeRigId).toBe('b')
  })

  it('reports a refused delete and keeps the rigs', async () => {
    jest.mocked(ipcApi.deleteDmxRig).mockResolvedValue({ success: false, error: 'locked' })
    const view = renderRigs()
    await run(view, (h) => h.handleDelete())
    expect(view.showToast).toHaveBeenCalledWith('locked', 'error', 5000)
    expect(view.result.current.rigs).toEqual([RIG_A, RIG_B])
  })
})
