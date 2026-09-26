import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { EFFECTS } from '../../../shared/ipcChannels'

type DialogResult = { canceled: boolean; filePaths?: string[]; filePath?: string }

const mockShowOpenDialog = jest.fn<(options: unknown) => Promise<DialogResult>>()
const mockShowSaveDialog = jest.fn<(options: unknown) => Promise<DialogResult>>()
const mockReadFile = jest.fn<(path: string, encoding: string) => Promise<string>>()
const mockCopyFile = jest.fn<(from: string, to: string) => Promise<void>>()

jest.mock('electron', () => ({
  dialog: {
    showOpenDialog: (options: unknown) => mockShowOpenDialog(options),
    showSaveDialog: (options: unknown) => mockShowSaveDialog(options),
  },
}))

jest.mock('fs/promises', () => ({
  readFile: (path: string, encoding: string) => mockReadFile(path, encoding),
  copyFile: (from: string, to: string) => mockCopyFile(from, to),
}))

import { setupEffectHandlers } from '../../ipc/effect-handlers'

type Handler = (event: unknown, ...args: unknown[]) => Promise<unknown>

const effectFile = {
  version: 1,
  mode: 'yarg',
  group: { id: 'grp-1', name: 'Group One' },
  effects: [
    {
      id: 'fx-1',
      name: 'Effect One',
      mode: 'yarg',
      nodes: { events: [], actions: [], logic: [] },
      connections: [],
      variables: [],
    },
  ],
}

function makeLoader() {
  return {
    getSummary: jest.fn(() => ({ yarg: [], audio: [] })),
    reload: jest.fn(async () => ({ reloaded: true })),
    readFile: jest.fn(async (_path: string) => effectFile),
    saveFile: jest.fn(
      async (
        mode: string,
        filename: string,
        _content: unknown,
        _options: { createOnly: boolean },
      ) => ({
        saved: `${mode}/${filename}`,
      }),
    ),
    deleteFile: jest.fn(async (_path: string) => ({ success: true })),
    getModes: jest.fn(() => ['yarg', 'audio']),
    resolveEffectFilePathForIpc: jest.fn((path: string) => `/root/effects/${path}`),
  }
}

describe('setupEffectHandlers', () => {
  let handlers: Map<string, Handler>
  let loader: ReturnType<typeof makeLoader> | null

  const call = (channel: string, ...args: unknown[]) => handlers.get(channel)!({}, ...args)

  beforeEach(() => {
    jest.clearAllMocks()
    loader = makeLoader()
    handlers = new Map()
    const ipcMain = {
      handle: (channel: string, handler: Handler) => handlers.set(channel, handler),
      on: jest.fn(),
    }
    setupEffectHandlers(ipcMain as never, { getEffectLoader: () => loader } as never)
  })

  it('registers every effects channel', () => {
    expect([...handlers.keys()].sort()).toEqual(Object.values(EFFECTS).sort())
  })

  it('routes list, reload, read and delete to the effect loader', async () => {
    expect(await call(EFFECTS.LIST)).toEqual({ yarg: [], audio: [] })
    expect(await call(EFFECTS.RELOAD)).toEqual({ reloaded: true })
    expect(await call(EFFECTS.READ, 'yarg/a.json')).toBe(effectFile)
    expect(loader!.readFile).toHaveBeenCalledWith('yarg/a.json')
    expect(await call(EFFECTS.DELETE, 'yarg/a.json')).toEqual({ success: true })
    expect(loader!.deleteFile).toHaveBeenCalledWith('yarg/a.json')
  })

  it('refuses while the effect loader is not initialized', async () => {
    loader = null
    for (const channel of [EFFECTS.LIST, EFFECTS.RELOAD, EFFECTS.READ, EFFECTS.DELETE]) {
      expect(await call(channel, 'yarg/a.json')).toEqual({
        success: false,
        error: 'Effect loader is not initialized.',
      })
    }
  })

  it('saves a valid payload through the loader', async () => {
    const result = await call(EFFECTS.SAVE, {
      mode: 'audio',
      filename: 'b.json',
      content: effectFile,
    })

    expect(result).toEqual({ saved: 'audio/b.json' })
    expect(loader!.saveFile).toHaveBeenCalledWith('audio', 'b.json', effectFile, {
      createOnly: false,
    })
  })

  it.each([
    ['a non-object payload', 'nope'],
    ['a mode the loader does not offer', { mode: 'rb3', filename: 'b.json', content: {} }],
    ['an empty filename', { mode: 'yarg', filename: '', content: {} }],
    ['non-object content', { mode: 'yarg', filename: 'b.json', content: 'x' }],
    [
      'a createOnly that is not a boolean',
      { mode: 'yarg', filename: 'b.json', content: {}, createOnly: 'yes' },
    ],
  ])('refuses to save %s', async (_label, payload) => {
    const result = await call(EFFECTS.SAVE, payload)

    expect(result).toEqual({ success: false, error: expect.any(String) })
    expect(loader!.saveFile).not.toHaveBeenCalled()
  })

  it('validates content directly and a path through the loader', async () => {
    expect(await call(EFFECTS.VALIDATE, { content: effectFile })).toMatchObject({ valid: true })
    expect(loader!.readFile).not.toHaveBeenCalled()

    expect(await call(EFFECTS.VALIDATE, { path: 'yarg/a.json' })).toMatchObject({ valid: true })
    expect(loader!.readFile).toHaveBeenCalledWith('yarg/a.json')
  })

  it('answers a validation refusal for a payload with neither content nor path', async () => {
    expect(await call(EFFECTS.VALIDATE, {})).toEqual({
      valid: false,
      errors: ['Validation payload must include either content or path.'],
    })
  })

  it('imports a picked effect file with its own mode', async () => {
    mockShowOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/picked/fx.json'] })
    mockReadFile.mockResolvedValue(JSON.stringify(effectFile))

    expect(await call(EFFECTS.IMPORT_PICK)).toMatchObject({
      success: true,
      sourceBasename: 'fx.json',
      mode: 'yarg',
    })
  })

  it('answers a cancelled import and refuses a file that is not JSON', async () => {
    mockShowOpenDialog.mockResolvedValueOnce({ canceled: true, filePaths: [] })
    expect(await call(EFFECTS.IMPORT_PICK)).toMatchObject({ success: false, cancelled: true })

    mockShowOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: ['/picked/fx.json'] })
    mockReadFile.mockResolvedValueOnce('{ not json')
    expect(await call(EFFECTS.IMPORT_PICK)).toEqual({
      success: false,
      error: 'That file is not valid JSON.',
    })
  })

  it('exports from the path the loader resolves', async () => {
    mockShowSaveDialog.mockResolvedValue({ canceled: false, filePath: '/out/fx.json' })

    expect(await call(EFFECTS.EXPORT, 'yarg/a.json')).toEqual({
      success: true,
      path: '/out/fx.json',
    })
    expect(loader!.readFile).toHaveBeenCalledWith('/root/effects/yarg/a.json')
    expect(mockCopyFile).toHaveBeenCalledWith('/root/effects/yarg/a.json', '/out/fx.json')
  })

  it('copies nothing when the export is cancelled', async () => {
    mockShowSaveDialog.mockResolvedValue({ canceled: true })

    expect(await call(EFFECTS.EXPORT, 'yarg/a.json')).toMatchObject({
      success: false,
      cancelled: true,
    })
    expect(mockCopyFile).not.toHaveBeenCalled()
  })
})
