/** @jest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { act, renderHook, waitFor } from '@testing-library/react'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

const dialogPick: { path: string | null } = { path: null }

jest.mock('electron', () => ({
  dialog: {
    showOpenDialog: jest.fn(async () =>
      dialogPick.path
        ? { canceled: false, filePaths: [dialogPick.path] }
        : { canceled: true, filePaths: [] },
    ),
    showSaveDialog: jest.fn(async () => ({ canceled: true })),
  },
  app: { getPath: () => os.tmpdir() },
}))
jest.mock('../../utils/windowUtils', () => ({
  sendToAllWindows: jest.fn(),
  hasBrowserWindows: () => false,
  mainRuntimeBroadcaster: { emit: jest.fn() },
}))
jest.mock(
  '../../../renderer/src/utils/ipcHelpers',
  () =>
    jest.requireActual<typeof import('@renderer/tests/helpers/ipcListenerStub')>(
      '@renderer/tests/helpers/ipcListenerStub',
    ).ipcListenerStub,
)

import { setupNodeCueHandlers } from '../../ipc/node-cue-handlers'
import { setupEffectHandlers } from '../../ipc/effect-handlers'
import { EFFECTS, NODE_CUES } from '../../../shared/ipcChannels'
import { NodeCueLoader } from '../../../photonics-dmx/cues/node/loader/NodeCueLoader'
import { EffectLoader } from '../../../photonics-dmx/cues/node/loader/EffectLoader'
import { CueRegistry } from '../../../photonics-dmx/cues/registries/CueRegistry'
import { AudioCueRegistry } from '../../../photonics-dmx/cues/registries/AudioCueRegistry'
import { getCueRegistry } from '../../../photonics-dmx/cues/registries/cueRegistries'
import { noopRuntimeBroadcaster } from '../../../photonics-dmx/runtime/broadcaster'
import type { EffectFile, NodeCueFile } from '../../../photonics-dmx/cues/types/nodeCueTypes'
import { useCueFiles } from '../../../renderer/src/components/cue-editor/hooks/useCueFiles'
import { setLastActiveMode } from '../../../renderer/src/components/cue-editor/hooks/useLastCueFilePath'
import {
  createDefaultEffectFile,
  createDefaultFile,
} from '../../../renderer/src/components/cue-editor/lib/cueDefaults'
import type { EditorDocument } from '../../../renderer/src/components/cue-editor/lib/types'
import { resetIpcListenerStub } from '@renderer/tests/helpers/ipcListenerStub'

type Main = {
  base: string
  cues: NodeCueLoader
  effects: EffectLoader
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
  errors: string[]
}

let base: string

beforeEach(() => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), 'cue-file-overwrites-'))
  window.localStorage.clear()
  resetIpcListenerStub()
  dialogPick.path = null
})

afterEach(() => {
  fs.rmSync(base, { recursive: true, force: true })
})

async function bootMain(): Promise<Main> {
  const yarg = CueRegistry.getInstance()
  yarg.reset()
  const audio = AudioCueRegistry.getInstance()
  audio.reset()
  getCueRegistry('rb3').reset()
  const effects = new EffectLoader({ baseDir: base })
  const cues = new NodeCueLoader({
    runtimeBroadcaster: noopRuntimeBroadcaster(),
    baseDir: base,
    effectLoader: effects,
    registries: { yarg, rb3: getCueRegistry('rb3'), audio },
  })
  await effects.loadAll()
  await cues.loadAll()
  const handlers = new Map<string, (...args: unknown[]) => Promise<unknown>>()
  const ipcMain = {
    handle: (channel: string, fn: (...args: unknown[]) => Promise<unknown>) =>
      handlers.set(channel, fn),
    on: jest.fn(),
  }
  const manager = {
    getNodeCueLoader: () => cues,
    getEffectLoader: () => effects,
    getConfig: () => ({
      getPreference: () => undefined,
      updateCueDomain: async () => {},
    }),
    refreshAudioCueSelection: () => {},
  }
  setupNodeCueHandlers(ipcMain as never, manager as never)
  setupEffectHandlers(ipcMain as never, manager as never)
  const invoke = async (channel: string, ...args: unknown[]): Promise<unknown> => {
    const handler = handlers.get(channel)
    if (!handler) throw new Error(`no handler for ${channel}`)
    return handler({ sender: {} }, ...args)
  }
  Object.assign(window, { api: { invoke, receive: () => () => {}, send: () => {} } })
  return { base, cues, effects, invoke, errors: [] }
}

const cueDir = (mode: string): string => path.join(base, 'node-data', 'cues', mode)
const fxDir = (mode: string): string => path.join(base, 'node-data', 'effects', mode)
const readGroup = (filePath: string): { id: string; name: string } =>
  JSON.parse(fs.readFileSync(filePath, 'utf-8')).group

function renderEditor(m: Main, edit: (doc: EditorDocument) => EditorDocument = (d) => d) {
  const docRef: { current: EditorDocument | null } = { current: null }
  return renderHook(() => {
    const files = useCueFiles({
      loadCueIntoFlow: () => {},
      getUpdatedDocument: () => (docRef.current ? edit(docRef.current) : null),
      onError: (message) => m.errors.push(message),
      onSaveSuccess: () => {},
    })
    docRef.current = files.editorDoc
    return files
  })
}

function userCueFile(mode: 'yarg' | 'audio', groupId: string, name: string): NodeCueFile {
  const file = createDefaultFile(mode, 'lighting')
  file.group.id = groupId
  file.group.name = name
  return file
}

function userEffectFile(mode: 'yarg' | 'audio', groupId: string, name: string): EffectFile {
  const file = createDefaultEffectFile(mode)
  file.group.id = groupId
  file.group.name = name
  return file
}

describe('cue editor paths that create a file leave an existing file alone', () => {
  it('Add Cue with nothing open starts a document holding one cue', async () => {
    const m = await bootMain()
    setLastActiveMode('yarg-cue')
    const view = renderEditor(m)
    await waitFor(() => expect(view.result.current.editorMode).toBe('cue'))

    act(() => view.result.current.handleAddCue())

    const doc = view.result.current.editorDoc
    expect(doc?.mode === 'cue' ? doc.file.cues.length : null).toBe(1)
  })

  it('Add Cue with nothing open saves each new document as its own file', async () => {
    const m = await bootMain()
    setLastActiveMode('yarg-cue')
    const view = renderEditor(m)
    await waitFor(() => expect(view.result.current.editorMode).toBe('cue'))

    act(() => view.result.current.handleAddCue())
    await act(async () => {
      await view.result.current.handleSave()
    })
    const firstPath = view.result.current.editorDoc?.path
    expect(firstPath).toBeTruthy()
    const firstGroup = readGroup(firstPath!)

    act(() => view.result.current.handleModeChange('yarg-motion-cue'))
    await waitFor(() => expect(view.result.current.editorDoc).toBeNull())
    act(() => view.result.current.handleAddCue())
    await act(async () => {
      await view.result.current.handleSave()
    })

    expect(fs.readdirSync(cueDir('yarg'))).toHaveLength(2)
    expect(readGroup(firstPath!)).toEqual(firstGroup)
  })

  it('New File refuses a group id that is the basename of another file', async () => {
    const m = await bootMain()
    await m.cues.saveFile('yarg', 'show.json', userCueFile('yarg', 'friday-show', 'Friday show'))
    setLastActiveMode('yarg-cue')
    const view = renderEditor(m)
    await waitFor(() => expect(view.result.current.files.length).toBeGreaterThan(0))

    expect(view.result.current.existingFilenamesLowerForNewFileModal.has('show.json')).toBe(true)
    await act(async () => {
      await view.result.current.handleCreateNewFile({
        groupId: 'show',
        groupName: 'Scratch',
        groupDescription: '',
        itemName: 'x',
        itemDescription: '',
      })
    })

    expect(readGroup(path.join(cueDir('yarg'), 'show.json')).id).toBe('friday-show')
    expect(m.errors.join('\n')).toMatch(/show\.json/)
  })

  it('an import from another platform tab checks names against the folder it saves into', async () => {
    const m = await bootMain()
    await m.cues.saveFile('audio', 'disco.json', userCueFile('audio', 'disco-mine', 'My disco'))
    const source = path.join(base, 'shared-pack')
    fs.mkdirSync(source)
    fs.writeFileSync(
      path.join(source, 'disco.json'),
      JSON.stringify(userCueFile('audio', 'disco', 'Shared disco pack')),
    )
    dialogPick.path = path.join(source, 'disco.json')
    setLastActiveMode('yarg-cue')
    const view = renderEditor(m)
    await waitFor(() => expect(view.result.current.files.length).toBeGreaterThan(0))

    await act(async () => {
      await view.result.current.handleImport()
    })
    const pending = view.result.current.pendingImport
    expect(pending?.saveMode).toBe('audio')
    expect(view.result.current.existingFilenamesLowerForImportModal.has('disco.json')).toBe(true)

    await act(async () => {
      await view.result.current.commitPendingImport('disco.json', pending!.suggestedGroupId)
    })

    expect(readGroup(path.join(cueDir('audio'), 'disco.json')).name).toBe('My disco')
    expect(m.errors.join('\n')).toMatch(/disco\.json/)
  })

  it('an effect file whose mode differs from its folder is refused on open', async () => {
    const m = await bootMain()
    await m.effects.saveFile('audio', 'pulse.json', userEffectFile('audio', 'keepme', 'Keep me'))
    fs.mkdirSync(fxDir('yarg'), { recursive: true })
    fs.writeFileSync(
      path.join(fxDir('yarg'), 'pulse.json'),
      JSON.stringify(userEffectFile('audio', 'misplaced', 'Misplaced')),
    )
    await m.effects.loadAll()
    setLastActiveMode('yarg-effect')
    const view = renderEditor(m)
    await waitFor(() => expect(view.result.current.effectFiles.length).toBeGreaterThan(1))
    const misplaced = view.result.current.effectFiles.find((f) =>
      f.path.endsWith(path.join('yarg', 'pulse.json')),
    )!

    await act(async () => {
      await view.result.current.selectEffectFile(misplaced)
    })
    await act(async () => {
      await view.result.current.handleSave()
    })

    expect(misplaced.errors?.length).toBeGreaterThan(0)
    expect(view.result.current.editorDoc).toBeNull()
    expect(readGroup(path.join(fxDir('audio'), 'pulse.json')).id).toBe('keepme')
  })

  it('the Effects tab with nothing open creates and imports effect files', async () => {
    const m = await bootMain()
    await m.effects.saveFile('yarg', 'my-fx.json', userEffectFile('yarg', 'my-fx', 'Mine'))
    setLastActiveMode('yarg-effect')
    const view = renderEditor(m)
    await waitFor(() => expect(view.result.current.effectFiles.length).toBeGreaterThan(0))
    expect(view.result.current.editorMode).toBe('effect')
    expect(view.result.current.editorDoc).toBeNull()

    await act(async () => {
      await view.result.current.handleCreateNewFile({
        groupId: 'strobes',
        groupName: 'Strobes',
        groupDescription: '',
        itemName: 'Fast strobe',
        itemDescription: '',
      })
    })
    expect(fs.existsSync(path.join(fxDir('yarg'), 'strobes.json'))).toBe(true)
    expect(fs.existsSync(cueDir('yarg')) ? fs.readdirSync(cueDir('yarg')) : []).toEqual([])
    expect(view.result.current.editorDoc?.mode).toBe('effect')

    act(() => view.result.current.handleModeChange('audio-effect'))
    await waitFor(() => expect(view.result.current.editorDoc).toBeNull())
    dialogPick.path = path.join(fxDir('yarg'), 'my-fx.json')
    await act(async () => {
      await view.result.current.handleImport()
    })
    expect(view.result.current.pendingImport?.kind).toBe('effect')
  })

  it('plain Save of an open file replaces that file', async () => {
    const m = await bootMain()
    await m.cues.saveFile('yarg', 'show.json', userCueFile('yarg', 'show', 'Before'))
    setLastActiveMode('yarg-cue')
    const view = renderEditor(m, (doc) =>
      doc.mode === 'cue'
        ? { ...doc, file: { ...doc.file, group: { ...doc.file.group, name: 'After' } } }
        : doc,
    )
    await waitFor(() => expect(view.result.current.files.length).toBeGreaterThan(0))
    await act(async () => {
      await view.result.current.selectFile(view.result.current.files[0]!)
    })

    let saved = false
    await act(async () => {
      saved = await view.result.current.handleSave()
    })

    expect(saved).toBe(true)
    expect(readGroup(path.join(cueDir('yarg'), 'show.json')).name).toBe('After')
  })
})

describe('import pick validates the tab mode it is given', () => {
  it.each([
    [NODE_CUES.IMPORT_PICK, userCueFile('yarg', 'picked', 'Picked')],
    [EFFECTS.IMPORT_PICK, userEffectFile('yarg', 'picked', 'Picked')],
  ])('%s refuses an unknown mode', async (channel, content) => {
    const m = await bootMain()
    const source = path.join(base, 'picked.json')
    fs.writeFileSync(source, JSON.stringify(content))
    dialogPick.path = source

    expect(await m.invoke(channel, undefined)).toMatchObject({ success: true, mode: 'yarg' })
    expect(await m.invoke(channel, 'nonsense')).toMatchObject({ success: false })
  })
})
