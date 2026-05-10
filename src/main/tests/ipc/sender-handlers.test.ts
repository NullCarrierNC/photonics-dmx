/**
 * IPC tests for setupSenderHandlers (SENDER_ENABLE / SENDER_DISABLE).
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { LIGHT, RENDERER_RECEIVE } from '../../../shared/ipcChannels'
import { setupSenderHandlers } from '../../ipc/sender-handlers'
import { validateSenderEnablePayload } from '../../ipc/inputValidation'
import { sendToAllWindows } from '../../utils/windowUtils'

const mockIpcMain = {
  handle: jest.fn() as jest.MockedFunction<(...args: unknown[]) => void>,
  on: jest.fn() as jest.MockedFunction<(...args: unknown[]) => void>,
}

const enableSender = jest.fn<() => Promise<void>>()
const disableSender = jest.fn<() => Promise<void>>()
const isSenderEnabled = jest.fn<() => boolean>()

const mockSenderManager = {
  enableSender,
  disableSender,
  isSenderEnabled,
  getEnabledSenders: jest.fn().mockReturnValue([]),
  disableAllSenders: jest.fn(),
  restartSender: jest.fn(),
}

const mockControllerManager = {
  getSenderManager: () => mockSenderManager,
} as { getSenderManager: () => typeof mockSenderManager }

jest.mock('electron', () => ({
  ipcMain: mockIpcMain,
}))

jest.mock('../../utils/windowUtils', () => ({
  sendToAllWindows: jest.fn(),
}))

jest.mock('../../ipc/inputValidation', () => ({
  ...jest.requireActual<typeof import('../../ipc/inputValidation')>('../../ipc/inputValidation'),
  validateSenderEnablePayload: jest.fn(),
}))

const validateEnable = validateSenderEnablePayload as jest.MockedFunction<
  typeof validateSenderEnablePayload
>

function getHandler(channel: string) {
  const calls = (mockIpcMain.handle as jest.Mock).mock.calls
  for (let i = calls.length - 1; i >= 0; i--) {
    if (calls[i][0] === channel) {
      return calls[i][1] as (e: unknown, d: unknown) => Promise<unknown>
    }
  }
  throw new Error(`no handler for ${channel}`)
}

describe('setupSenderHandlers', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    enableSender.mockResolvedValue(undefined)
    disableSender.mockResolvedValue(undefined)
    isSenderEnabled.mockReturnValue(false)
  })

  it('SENDER_ENABLE returns validation error and sends SENDER_ERROR on bad payload', async () => {
    setupSenderHandlers(mockIpcMain as any, mockControllerManager as any)
    validateEnable.mockReturnValue({ ok: false, error: 'nope' })

    const h = getHandler(LIGHT.SENDER_ENABLE)
    const r = (await h(null, {})) as { success: boolean; error: string }

    expect(r).toEqual({ success: false, error: 'nope' })
    expect(sendToAllWindows).toHaveBeenCalledWith(RENDERER_RECEIVE.SENDER_ERROR, 'nope')
    expect(enableSender).not.toHaveBeenCalled()
  })

  it('SENDER_ENABLE returns success when sender already enabled (idempotent)', async () => {
    setupSenderHandlers(mockIpcMain as any, mockControllerManager as any)
    validateEnable.mockReturnValue({ ok: true, value: { sender: 'sacn' } } as any)
    isSenderEnabled.mockReturnValue(true)

    const h = getHandler(LIGHT.SENDER_ENABLE)
    const r = (await h(null, {})) as { success: boolean }

    expect(r).toEqual({ success: true })
    expect(enableSender).not.toHaveBeenCalled()
  })

  it('SENDER_ENABLE sends SENDER_START_FAILED and returns error on enable failure', async () => {
    setupSenderHandlers(mockIpcMain as any, mockControllerManager as any)
    validateEnable.mockReturnValue({ ok: true, value: { sender: 'sacn' } } as any)
    isSenderEnabled.mockReturnValue(false)
    enableSender.mockRejectedValue(new Error('bang'))

    const h = getHandler(LIGHT.SENDER_ENABLE)
    const r = (await h(null, {})) as { success: boolean; error: string }

    expect(r).toEqual({ success: false, error: 'bang' })
    expect(sendToAllWindows).toHaveBeenCalledWith(RENDERER_RECEIVE.SENDER_START_FAILED, {
      sender: 'sacn',
      error: 'bang',
    })
  })

  it('SENDER_DISABLE returns error for invalid sender id', async () => {
    setupSenderHandlers(mockIpcMain as any, mockControllerManager as any)
    const h = getHandler(LIGHT.SENDER_DISABLE)
    const r = (await h(null, { sender: 1 })) as { success: boolean; error: string }
    /* validateSenderId rejects non-string */
    expect(r.success).toBe(false)
    expect(typeof r.error).toBe('string')
  })
})
