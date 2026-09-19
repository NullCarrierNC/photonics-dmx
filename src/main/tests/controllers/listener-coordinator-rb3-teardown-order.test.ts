/**
 * RB3 teardown stops input before it clears the rig.
 *
 * `disableYarg` already closes its socket ahead of the blackout so the blackout is the last word on
 * the lights. RB3 does the same, and these hold that order in place: a packet arriving during the
 * blackout, or a processor tick, must not light a rig that is on its way down.
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { EventEmitter } from 'events'
import * as dgram from 'dgram'
import {
  ListenerCoordinator,
  type ListenerCoordinatorDeps,
} from '../../controllers/ListenerCoordinator'
import { DmxLightManager } from '../../../photonics-dmx/controllers/DmxLightManager'
import { ChainFanout } from '../../controllers/ChainFanout'
import { noopRuntimeBroadcaster } from '../../../photonics-dmx/runtime/broadcaster'
import type { RigChain } from '../../../photonics-dmx/controllers/RigChain'
import {
  fakeLightingController,
  type FakeLightingController,
} from '../../../photonics-dmx/tests/helpers/fakeLightingController'

class FakeUdpSocket extends EventEmitter {
  public bind = jest.fn((_port: number, cb?: () => void) => {
    cb?.()
    this.emit('listening')
  })
  public close = jest.fn((cb?: () => void) => cb?.())
  public address = jest.fn(() => ({ address: '0.0.0.0', port: 0, family: 'IPv4' }))
}

jest.mock('dgram', () => ({
  createSocket: jest.fn(),
}))

/** The socket the coordinator's listener built, which is the only one this test drives. */
function currentSocket(): FakeUdpSocket {
  const results = jest.mocked(dgram.createSocket).mock.results
  const last = results[results.length - 1]
  if (!last || last.type !== 'return') {
    throw new Error('No socket was created')
  }
  return last.value as unknown as FakeUdpSocket
}

interface Fixture {
  effects: FakeLightingController
  coordinator: ListenerCoordinator
}

function makeFixture(): Fixture {
  const effects = fakeLightingController()
  const dmx = {} as DmxLightManager
  const fakeChain = {
    rigId: 'stub',
    isPrimary: true,
    dmxLightManager: dmx,
    sequencer: effects,
    cueHandlers: { yarg: null, rb3: null },
    audioCueHandler: null,
    rb3MenuCueHandler: null,
  } as unknown as RigChain
  const chains: RigChain[] = [fakeChain]
  const chainFanout = new ChainFanout()
  chainFanout.setChains(chains)

  const deps = {
    getDmxLightManager: () => dmx,
    getEffectsController: () => effects,
    getRigChains: () => chains,
    getChainFanout: () => chainFanout,
    getMotionEnabled: () => true,
    getActiveYargMotionCueRef: () => null,
    getMotionCueMinimumHoldMs: () => 5000,
    getMotionCueProbabilityPercent: () => 100,
    getActiveRb3MotionCueRef: () => null,
    getRb3MotionCueMinimumHoldMs: () => 5000,
    getRb3MotionCueProbabilityPercent: () => 100,
    getRb3MotionCueDurationRangeSec: () => ({ min: 5, max: 20 }),
    getRb3RotationEnabled: () => true,
    getFallbackCueTimeMs: () => 0,
    setVenuePostProcessing: jest.fn(),
    sendSenderError: jest.fn(),
    sendToAllWindows: jest.fn(),
    runtimeBroadcaster: noopRuntimeBroadcaster(),
    setCueHandlerRef: jest.fn(),
    setRb3CueHandlerRef: jest.fn(),
    getRb3ProcessingMode: () => 'direct' as const,
  } as unknown as ListenerCoordinatorDeps

  return { effects, coordinator: new ListenerCoordinator(deps) }
}

describe('ListenerCoordinator RB3 teardown order', () => {
  let fixture: Fixture

  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(dgram.createSocket).mockImplementation(() => new FakeUdpSocket() as never)
    fixture = makeFixture()
  })

  afterEach(async () => {
    await fixture.coordinator.disableRb3()
  })

  it('closes the socket before it clears the rig', async () => {
    await fixture.coordinator.enableRb3Internal()
    const socket = currentSocket()
    const order: string[] = []
    socket.close.mockImplementation((cb?: () => void) => {
      order.push('close')
      cb?.()
    })
    fixture.effects.removeAllEffects.mockImplementation(() => {
      order.push('clear')
    })

    await fixture.coordinator.disableRb3()

    expect(order[0]).toBe('close')
    expect(order).toContain('clear')
  })

  it('tears down once when a socket failure and a manual disable race', async () => {
    await fixture.coordinator.enableRb3Internal()
    const socket = currentSocket()

    socket.emit('error', new Error('socket died'))
    await fixture.coordinator.disableRb3()
    // The error handler already closed and nulled the socket, so the disable finds nothing left to
    // close and still completes rather than throwing.
    await expect(fixture.coordinator.disableRb3()).resolves.toBeUndefined()
    expect(fixture.coordinator.getRb3Mode()).toBe('none')
  })
})
