import { describe, expect, it } from '@jest/globals'
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
    })
  })
})
