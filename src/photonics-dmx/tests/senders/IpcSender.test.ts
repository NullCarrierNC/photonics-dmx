/**
 * IpcSender tests: start/stop lifecycle, emit via broadcaster when receivers exist, getUniverse returns -1.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { IpcSender } from '../../senders/IpcSender'
import { RENDERER_RECEIVE } from '../../../shared/ipcChannels'

describe('IpcSender', () => {
  let sender: IpcSender
  const mockEmit = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    const hasReceivers = jest.fn<() => boolean>().mockReturnValue(true)
    sender = new IpcSender({ emit: mockEmit }, hasReceivers)
  })

  it('start enables sender', async () => {
    await sender.start()
    await sender.send({ 1: 255 })
    expect(mockEmit).toHaveBeenCalledWith(RENDERER_RECEIVE.DMX_VALUES, {
      universeBuffer: { 1: 255 },
    })
  })

  it('stop disables sender', async () => {
    await sender.start()
    await sender.stop()
    mockEmit.mockClear()
    await sender.send({ 1: 255 })
    expect(mockEmit).not.toHaveBeenCalled()
  })

  it('does not emit when no receivers', async () => {
    const hasReceivers = jest.fn<() => boolean>().mockReturnValue(false)
    const localSender = new IpcSender({ emit: mockEmit }, hasReceivers)
    await localSender.start()
    mockEmit.mockClear()
    await localSender.send({ 1: 100, 2: 200 })
    expect(mockEmit).not.toHaveBeenCalled()
  })

  it('getUniverse returns -1', () => {
    expect(sender.getUniverse()).toBe(-1)
  })
})
