/**
 * IPC tests for registerLightsRigsConfigHandlers (SAVE_MY_LIGHTS and related config).
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { CONFIG } from '../../../shared/ipcChannels'
import { registerLightsRigsConfigHandlers } from '../../ipc/config/lights-rigs-handlers'
import { validateDmxFixturesArray } from '../../ipc/inputValidation'

const mockIpcMain = {
  handle: jest.fn() as jest.MockedFunction<(...args: unknown[]) => void>,
  on: jest.fn() as jest.MockedFunction<(...args: unknown[]) => void>,
}

const updateUserLights = jest.fn(async () => {}) as jest.MockedFunction<
  (fixtures: unknown) => Promise<void>
>
const mockGetConfig = jest.fn(() => ({
  updateUserLights,
}))

const mockControllerManager = {
  getConfig: mockGetConfig,
} as { getConfig: () => { updateUserLights: typeof updateUserLights } }

jest.mock('electron', () => ({
  ipcMain: mockIpcMain,
}))

jest.mock('../../utils/windowUtils', () => ({
  sendToAllWindows: jest.fn(),
}))

jest.mock('../../ipc/inputValidation', () => ({
  ...jest.requireActual<typeof import('../../ipc/inputValidation')>('../../ipc/inputValidation'),
  validateDmxFixturesArray: jest.fn(),
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
})
