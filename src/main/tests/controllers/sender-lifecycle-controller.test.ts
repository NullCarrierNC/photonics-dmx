import { describe, expect, it, jest } from '@jest/globals'
import { SenderLifecycleController } from '../../controllers/SenderLifecycleController'
import { ConfigurationManager } from '../../../services/configuration/ConfigurationManager'
import { noopRuntimeBroadcaster } from '../../../photonics-dmx/runtime/broadcaster'

function testIpcSenderOptions() {
  return {
    broadcaster: noopRuntimeBroadcaster(),
    hasReceivers: () => true,
  } as const
}

describe('SenderLifecycleController', () => {
  it('handleUncaughtException returns false for non-network errors', () => {
    const c = new SenderLifecycleController(
      () => ({}) as ConfigurationManager,
      testIpcSenderOptions(),
    )
    expect(c.handleUncaughtException(new Error('nope'), () => true)).toBe(false)
  })

  it('getActiveOutputSenderSnapshotIfAny returns booleans for each output when a manager exists', () => {
    const c = new SenderLifecycleController(
      () => ({}) as ConfigurationManager,
      testIpcSenderOptions(),
    )
    const snap = c.getActiveOutputSenderSnapshotIfAny()
    expect(snap).not.toBeNull()
    expect(snap).toEqual({
      sacn: expect.any(Boolean),
      artnet: expect.any(Boolean),
      enttecpro: expect.any(Boolean),
      opendmx: expect.any(Boolean),
      ipc: expect.any(Boolean),
    })
  })

  it('restoreSenderOutputsFromPrefs restores IPC sender when snapshot requests it', async () => {
    const senderManager = {
      enableSender: jest.fn().mockImplementation(() => Promise.resolve()),
    }
    const config = {
      getAllPreferences: () => ({
        dmxOutputConfig: {
          sacnEnabled: false,
          artNetEnabled: false,
          enttecProEnabled: false,
          openDmxEnabled: false,
        },
      }),
    }
    type SlStub = {
      getConfig: () => typeof config
      senderManager: typeof senderManager
      senderErrorHandler: () => void
      senderErrorTrackingCallback: null
    }
    const sl = Object.create(SenderLifecycleController.prototype) as SlStub
    sl.getConfig = () => config
    sl.senderManager = senderManager
    sl.senderErrorHandler = () => {}
    sl.senderErrorTrackingCallback = null

    await SenderLifecycleController.prototype.restoreSenderOutputsFromPrefs.call(
      sl as unknown as SenderLifecycleController,
      {
        sacn: false,
        artnet: false,
        enttecpro: false,
        opendmx: false,
        ipc: true,
      },
    )

    expect(senderManager.enableSender).toHaveBeenCalledTimes(1)
    expect(senderManager.enableSender).toHaveBeenCalledWith('ipc', 'ipc', { sender: 'ipc' })
  })
})
