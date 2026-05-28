/**
 * IpcSender tests: start/stop lifecycle and payload forwarding for both `kind: 'rigs'`
 * (per-active-rig preview) and `kind: 'manual'` (console takeover / shutdown blackout).
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { IpcSender } from '../../senders/IpcSender'
import { RENDERER_RECEIVE } from '../../../shared/ipcChannels'
import type { DmxValuesPayload } from '../../../shared/ipcTypes'

describe('IpcSender', () => {
  let sender: IpcSender
  const mockEmit = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    const hasReceivers = jest.fn<() => boolean>().mockReturnValue(true)
    sender = new IpcSender({ emit: mockEmit }, hasReceivers)
  })

  it('forwards a kind: rigs payload to the renderer when started', async () => {
    await sender.start()
    const payload: DmxValuesPayload = {
      kind: 'rigs',
      rigBuffers: { 'rig-a': { 1: 255 } },
    }
    await sender.send(payload)
    expect(mockEmit).toHaveBeenCalledWith(RENDERER_RECEIVE.DMX_VALUES, payload)
  })

  it('forwards a kind: manual payload to the renderer when started', async () => {
    await sender.start()
    const payload: DmxValuesPayload = { kind: 'manual', buffer: { 1: 128, 2: 64 } }
    await sender.send(payload)
    expect(mockEmit).toHaveBeenCalledWith(RENDERER_RECEIVE.DMX_VALUES, payload)
  })

  it('does not emit after stop', async () => {
    await sender.start()
    await sender.stop()
    mockEmit.mockClear()
    await sender.send({ kind: 'rigs', rigBuffers: {} })
    expect(mockEmit).not.toHaveBeenCalled()
  })

  it('does not emit when no receivers', async () => {
    const hasReceivers = jest.fn<() => boolean>().mockReturnValue(false)
    const localSender = new IpcSender({ emit: mockEmit }, hasReceivers)
    await localSender.start()
    mockEmit.mockClear()
    await localSender.send({ kind: 'rigs', rigBuffers: { 'rig-a': { 1: 100, 2: 200 } } })
    expect(mockEmit).not.toHaveBeenCalled()
  })
})
