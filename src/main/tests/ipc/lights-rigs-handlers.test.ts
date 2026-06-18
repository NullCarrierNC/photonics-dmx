/**
 * IPC tests for registerLightsRigsConfigHandlers (SAVE_MY_LIGHTS and related config).
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { dialog } from 'electron'
import { writeFile, readFile } from 'fs/promises'
import { CONFIG, RIGS } from '../../../shared/ipcChannels'
import { registerLightsRigsConfigHandlers } from '../../ipc/config/lights-rigs-handlers'
import { validateDmxFixturesArray, validateDmxRigPayload } from '../../ipc/inputValidation'

const mockIpcMain = {
  handle: jest.fn() as jest.MockedFunction<(...args: unknown[]) => void>,
  on: jest.fn() as jest.MockedFunction<(...args: unknown[]) => void>,
}

const updateUserLights = jest.fn(async () => {}) as jest.MockedFunction<
  (fixtures: unknown) => Promise<void>
>
const syncRigsWithUserLights = jest.fn(async () => false) as jest.MockedFunction<
  () => Promise<boolean>
>
const restartControllers = jest.fn(async () => {}) as jest.MockedFunction<() => Promise<void>>
const getDmxRig = jest.fn() as jest.MockedFunction<(id: string) => unknown>
const getUserLights = jest.fn(() => [] as unknown[]) as jest.MockedFunction<() => unknown[]>
const mockGetConfig = jest.fn(() => ({
  updateUserLights,
  syncRigsWithUserLights,
  getDmxRig,
  getUserLights,
}))

const mockControllerManager = {
  getConfig: mockGetConfig,
  restartControllers,
} as unknown as {
  getConfig: () => ReturnType<typeof mockGetConfig>
  restartControllers: typeof restartControllers
}

// Self-contained factories (no outer-const references): the handler value-imports `dialog` and
// `fs/promises`, so these factories run at module load — before module-body consts initialize.
// `ipcMain` reaches the handler via its parameter (mockIpcMain), so electron's stub is unused.
jest.mock('electron', () => ({
  ipcMain: { handle: jest.fn(), on: jest.fn() },
  dialog: { showSaveDialog: jest.fn(), showOpenDialog: jest.fn() },
}))

jest.mock('fs/promises', () => ({
  writeFile: jest.fn(),
  readFile: jest.fn(),
}))

type AsyncMock = jest.Mock<(...args: unknown[]) => Promise<unknown>>
const mockShowSaveDialog = dialog.showSaveDialog as unknown as AsyncMock
const mockShowOpenDialog = dialog.showOpenDialog as unknown as AsyncMock
const mockWriteFile = writeFile as unknown as AsyncMock
const mockReadFile = readFile as unknown as AsyncMock

jest.mock('../../utils/windowUtils', () => ({
  sendToAllWindows: jest.fn(),
}))

jest.mock('../../ipc/inputValidation', () => ({
  ...jest.requireActual<typeof import('../../ipc/inputValidation')>('../../ipc/inputValidation'),
  validateDmxFixturesArray: jest.fn(),
  validateDmxRigPayload: jest.fn(),
}))

function getSaveMyLightsHandler(): (
  event: unknown,
  data: unknown,
) => Promise<{
  success: boolean
  error?: string
}> {
  const calls = (mockIpcMain.handle as jest.Mock).mock.calls
  for (let i = calls.length - 1; i >= 0; i--) {
    if (calls[i][0] === CONFIG.SAVE_MY_LIGHTS) {
      return calls[i][1] as (
        event: unknown,
        data: unknown,
      ) => Promise<{
        success: boolean
        error?: string
      }>
    }
  }
  throw new Error('SAVE_MY_LIGHTS handler not registered')
}

describe('registerLightsRigsConfigHandlers (SAVE_MY_LIGHTS)', () => {
  const validateDmx = validateDmxFixturesArray as jest.MockedFunction<
    typeof validateDmxFixturesArray
  >

  beforeEach(() => {
    jest.clearAllMocks()
    updateUserLights.mockResolvedValue(undefined)
    syncRigsWithUserLights.mockResolvedValue(false)
    restartControllers.mockResolvedValue(undefined)
  })

  it('returns a validation error for invalid myLights payload', async () => {
    registerLightsRigsConfigHandlers(mockIpcMain as any, mockControllerManager as any)
    validateDmx.mockReturnValue({ ok: false, error: 'bad fixtures' })

    const h = getSaveMyLightsHandler()
    const r = await h(null, null)

    expect(r).toEqual({ success: false, error: 'bad fixtures' })
    expect(updateUserLights).not.toHaveBeenCalled()
  })

  it('persists and returns success for valid myLights', async () => {
    registerLightsRigsConfigHandlers(mockIpcMain as any, mockControllerManager as any)
    const fixtures = [{ id: 'a' }] as any
    validateDmx.mockReturnValue({ ok: true, value: fixtures })

    const h = getSaveMyLightsHandler()
    const r = await h(null, [])

    expect(r).toEqual({ success: true })
    expect(updateUserLights).toHaveBeenCalledWith(fixtures)
  })

  it('returns ipcError when updateUserLights rejects', async () => {
    registerLightsRigsConfigHandlers(mockIpcMain as any, mockControllerManager as any)
    const fixtures = [{ id: 'a' }] as any
    validateDmx.mockReturnValue({ ok: true, value: fixtures })
    updateUserLights.mockRejectedValue(new Error('disk full'))

    const h = getSaveMyLightsHandler()
    const r = await h(null, [])

    expect(r).toEqual({ success: false, error: 'disk full' })
  })

  it('restarts controllers when the rig sync reports changes', async () => {
    registerLightsRigsConfigHandlers(mockIpcMain as any, mockControllerManager as any)
    validateDmx.mockReturnValue({ ok: true, value: [{ id: 'a' }] as any })
    syncRigsWithUserLights.mockResolvedValue(true)

    const h = getSaveMyLightsHandler()
    const r = await h(null, [])

    expect(r).toEqual({ success: true })
    expect(syncRigsWithUserLights).toHaveBeenCalledTimes(1)
    expect(restartControllers).toHaveBeenCalledTimes(1)
  })

  it('does NOT restart controllers when rig sync reports no changes', async () => {
    registerLightsRigsConfigHandlers(mockIpcMain as any, mockControllerManager as any)
    validateDmx.mockReturnValue({ ok: true, value: [{ id: 'a' }] as any })
    syncRigsWithUserLights.mockResolvedValue(false)

    const h = getSaveMyLightsHandler()
    const r = await h(null, [])

    expect(r).toEqual({ success: true })
    expect(syncRigsWithUserLights).toHaveBeenCalledTimes(1)
    expect(restartControllers).not.toHaveBeenCalled()
  })
})

function getHandler(
  channel: string,
): (event: unknown, arg: unknown) => Promise<Record<string, unknown>> {
  const calls = (mockIpcMain.handle as jest.Mock).mock.calls
  for (let i = calls.length - 1; i >= 0; i--) {
    if (calls[i][0] === channel) {
      return calls[i][1] as (event: unknown, arg: unknown) => Promise<Record<string, unknown>>
    }
  }
  throw new Error(`${channel} handler not registered`)
}

describe('registerLightsRigsConfigHandlers (RIGS export / import)', () => {
  const validateRig = validateDmxRigPayload as jest.MockedFunction<typeof validateDmxRigPayload>
  const validateTemplates = validateDmxFixturesArray as jest.MockedFunction<
    typeof validateDmxFixturesArray
  >

  const exampleRig = {
    id: 'r1',
    name: 'My Rig',
    active: true,
    config: {
      numLights: 0,
      lightLayout: { id: 'front', label: 'Front only' },
      strobeType: 'None',
      frontLights: [],
      backLights: [],
      strobeLights: [],
    },
  }

  beforeEach(() => {
    jest.clearAllMocks()
    getUserLights.mockReturnValue([])
  })

  it('export: returns an error when the rig is not found', async () => {
    registerLightsRigsConfigHandlers(mockIpcMain as never, mockControllerManager as never)
    getDmxRig.mockReturnValue(null)
    const r = await getHandler(RIGS.EXPORT)(null, 'missing')
    expect(r).toEqual({ success: false, error: 'Rig not found.' })
    expect(mockShowSaveDialog).not.toHaveBeenCalled()
  })

  it('export: rejects an empty rig id', async () => {
    registerLightsRigsConfigHandlers(mockIpcMain as never, mockControllerManager as never)
    const r = await getHandler(RIGS.EXPORT)(null, '')
    expect(r).toMatchObject({ success: false })
    expect(getDmxRig).not.toHaveBeenCalled()
  })

  it('export: writes the built file and returns its path', async () => {
    registerLightsRigsConfigHandlers(mockIpcMain as never, mockControllerManager as never)
    getDmxRig.mockReturnValue(exampleRig)
    mockShowSaveDialog.mockResolvedValue({ canceled: false, filePath: '/out/My Rig.json' })

    const r = await getHandler(RIGS.EXPORT)(null, 'r1')

    expect(r).toEqual({ success: true, path: '/out/My Rig.json' })
    expect(mockWriteFile).toHaveBeenCalledTimes(1)
    const [writtenPath, contents] = mockWriteFile.mock.calls[0] as unknown as [string, string]
    expect(writtenPath).toBe('/out/My Rig.json')
    expect(JSON.parse(contents)).toMatchObject({
      type: 'photonics-rig',
      rig: { id: 'r1', active: true },
    })
  })

  it('export: returns the cancel error when the save dialog is dismissed', async () => {
    registerLightsRigsConfigHandlers(mockIpcMain as never, mockControllerManager as never)
    getDmxRig.mockReturnValue(exampleRig)
    mockShowSaveDialog.mockResolvedValue({ canceled: true })
    const r = await getHandler(RIGS.EXPORT)(null, 'r1')
    expect(r).toEqual({ success: false, error: 'User cancelled export.' })
    expect(mockWriteFile).not.toHaveBeenCalled()
  })

  it('import-pick: returns the parsed rig + templates without committing', async () => {
    registerLightsRigsConfigHandlers(mockIpcMain as never, mockControllerManager as never)
    const file = {
      formatVersion: 1,
      type: 'photonics-rig',
      rig: exampleRig,
      templates: [{ id: 't1' }],
    }
    mockShowOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/in/rig.json'] })
    mockReadFile.mockResolvedValue(JSON.stringify(file))
    validateRig.mockReturnValue({ ok: true, value: exampleRig as never })
    validateTemplates.mockReturnValue({ ok: true, value: file.templates as never })

    const r = await getHandler(RIGS.IMPORT_PICK)(null, undefined)

    expect(r).toEqual({
      success: true,
      sourceBasename: 'rig.json',
      rig: exampleRig,
      templates: file.templates,
    })
    expect(updateUserLights).not.toHaveBeenCalled()
  })

  it('import-pick: returns the cancel error when dismissed', async () => {
    registerLightsRigsConfigHandlers(mockIpcMain as never, mockControllerManager as never)
    mockShowOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })
    const r = await getHandler(RIGS.IMPORT_PICK)(null, undefined)
    expect(r).toEqual({ success: false, error: 'User cancelled import.' })
  })

  it('import-pick: rejects malformed JSON', async () => {
    registerLightsRigsConfigHandlers(mockIpcMain as never, mockControllerManager as never)
    mockShowOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/in/rig.json'] })
    mockReadFile.mockResolvedValue('{ not json')
    const r = await getHandler(RIGS.IMPORT_PICK)(null, undefined)
    expect(r).toMatchObject({ success: false })
    expect(validateRig).not.toHaveBeenCalled()
  })

  it('import-pick: rejects a file that is not a rig export', async () => {
    registerLightsRigsConfigHandlers(mockIpcMain as never, mockControllerManager as never)
    mockShowOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/in/rig.json'] })
    mockReadFile.mockResolvedValue(JSON.stringify({ type: 'not-a-rig' }))
    const r = await getHandler(RIGS.IMPORT_PICK)(null, undefined)
    expect(r).toMatchObject({ success: false })
  })
})
