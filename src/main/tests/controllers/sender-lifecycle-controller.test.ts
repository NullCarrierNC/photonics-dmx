import { describe, expect, it, jest } from '@jest/globals'
import {
  SenderLifecycleController,
  type OutputSenderStateSnapshot,
} from '../../controllers/SenderLifecycleController'
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

  it('restoreRunningSenders restores IPC sender when snapshot requests it', async () => {
    const enableSender = await restore({}, { ipc: true })

    expect(enableSender).toHaveBeenCalledTimes(1)
    expect(enableSender).toHaveBeenCalledWith('ipc', 'ipc', { sender: 'ipc' })
  })

  it('restores a USB sender on the serial port its config stores', async () => {
    const enableSender = await restore(
      {
        enttecProConfig: { port: '/dev/tty.usbserial-EN1', dmxSpeed: 40 },
        openDmxConfig: { port: 'COM3' },
      },
      { enttecpro: true, opendmx: true },
    )

    expect(enableSender).toHaveBeenCalledWith(
      'enttecpro',
      'enttecpro',
      expect.objectContaining({ devicePath: '/dev/tty.usbserial-EN1' }),
    )
    expect(enableSender).toHaveBeenCalledWith(
      'opendmx',
      'opendmx',
      expect.objectContaining({ devicePath: 'COM3' }),
    )
  })

  it('leaves a USB sender off when its stored port is not a serial device', async () => {
    const enableSender = await restore(
      {
        enttecProConfig: { port: '/etc/passwd' },
        openDmxConfig: { port: '/dev/../etc/hosts' },
      },
      { enttecpro: true, opendmx: true },
    )

    expect(enableSender).not.toHaveBeenCalled()
  })
})

/**
 * Runs restoreRunningSenders on a controller whose manager records each enable, with `prefs` as
 * the stored preferences and the senders `running` names as the ones to bring back.
 */
async function restore(
  prefs: Record<string, unknown>,
  running: Partial<OutputSenderStateSnapshot>,
): Promise<jest.Mock> {
  const senderManager = { enableSender: jest.fn(() => Promise.resolve()) }
  type SlStub = {
    getConfig: () => { getAllPreferences: () => Record<string, unknown> }
    senderManager: typeof senderManager
    senderErrorHandler: () => void
    senderErrorTrackingCallback: null
  }
  const sl = Object.create(SenderLifecycleController.prototype) as SlStub
  sl.getConfig = () => ({ getAllPreferences: () => prefs })
  sl.senderManager = senderManager
  sl.senderErrorHandler = () => {}
  sl.senderErrorTrackingCallback = null

  await SenderLifecycleController.prototype.restoreRunningSenders.call(
    sl as unknown as SenderLifecycleController,
    { sacn: false, artnet: false, enttecpro: false, opendmx: false, ipc: false, ...running },
  )
  return senderManager.enableSender
}
