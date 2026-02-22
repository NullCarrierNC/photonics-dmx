/**
 * IpcSender tests: start/stop lifecycle, send calls sendToAllWindows, getUniverse returns -1.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { IpcSender } from '../../senders/IpcSender'
import { RENDERER_RECEIVE } from '../../../shared/ipcChannels'

const mockSendToAllWindows = jest.fn()
jest.mock('../../../main/utils/windowUtils', () => ({
  sendToAllWindows: (...args: unknown[]) => mockSendToAllWindows(...args),
}))

const mockGetAllWindows = jest.fn(() => [{ id: 1 }])
jest.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => mockGetAllWindows() },
}))

describe('IpcSender', () => {
  let sender: IpcSender

  beforeEach(() => {
    jest.clearAllMocks()
    mockGetAllWindows.mockReturnValue([{ id: 1 }])
    sender = new IpcSender()
  })

  it('start enables sender', async () => {
    await sender.start()
    await sender.send({ 1: 255 })
    expect(mockSendToAllWindows).toHaveBeenCalledWith(RENDERER_RECEIVE.DMX_VALUES, {
      universeBuffer: { 1: 255 },
    })
  })

  it('stop disables sender', async () => {
    await sender.start()
    await sender.stop()
    await sender.send({ 1: 255 })
    expect(mockSendToAllWindows).not.toHaveBeenCalled()
  })

  it('send calls sendToAllWindows with DMX values', async () => {
    await sender.start()
    await sender.send({ 1: 100, 2: 200 })
    expect(mockSendToAllWindows).toHaveBeenCalledWith(RENDERER_RECEIVE.DMX_VALUES, {
      universeBuffer: { 1: 100, 2: 200 },
    })
  })

  it('getUniverse returns -1', () => {
    expect(sender.getUniverse()).toBe(-1)
  })
})
