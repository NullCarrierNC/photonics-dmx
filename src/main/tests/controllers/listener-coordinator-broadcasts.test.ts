import { EventEmitter } from 'events'
import { afterEach, describe, expect, it, jest } from '@jest/globals'
import {
  ListenerCoordinator,
  type ListenerCoordinatorDeps,
} from '../../controllers/ListenerCoordinator'
import { ChainFanout } from '../../../photonics-dmx/controllers/ChainFanout'
import { noopRuntimeBroadcaster } from '../../../photonics-dmx/runtime/broadcaster'
import type { DmxLightManager } from '../../../photonics-dmx/controllers/DmxLightManager'
import type { RigChain } from '../../../photonics-dmx/controllers/RigChain'
import { RENDERER_RECEIVE } from '../../../shared/ipcChannels'
import { fakeLightingController } from '../../../photonics-dmx/tests/helpers/fakeLightingController'

class FakeUdpSocket extends EventEmitter {
  bind = jest.fn((_port: number, cb?: () => void) => {
    cb?.()
    this.emit('listening')
  })
  close = jest.fn((cb?: () => void) => cb?.())
  address = jest.fn(() => ({ address: '0.0.0.0', port: 21070 }))
}

jest.mock('dgram', () => ({
  createSocket: jest.fn(() => new FakeUdpSocket()),
}))

function makeDeps(): ListenerCoordinatorDeps & { sendToAllWindows: jest.Mock } {
  const sequencer = fakeLightingController()
  const chains = [
    {
      rigId: 'stub',
      isPrimary: true,
      dmxLightManager: {} as DmxLightManager,
      sequencer,
      cueHandlers: { yarg: null, rb3: null },
      audioCueHandler: null,
      rb3MenuCueHandler: null,
    } as unknown as RigChain,
  ]
  const chainFanout = new ChainFanout()
  chainFanout.setChains(chains)
  return {
    getDmxLightManager: () => chains[0].dmxLightManager,
    getEffectsController: () => sequencer,
    getRigChains: () => chains,
    getChainFanout: () => chainFanout,
    getMotionEnabled: () => false,
    getActiveYargMotionCueRef: () => null,
    getMotionCueMinimumHoldMs: () => 5000,
    getMotionCueProbabilityPercent: () => 100,
    getActiveRb3MotionCueRef: () => null,
    getRb3MotionCueMinimumHoldMs: () => 5000,
    getRb3MotionCueProbabilityPercent: () => 100,
    getRb3MotionCueDurationRangeSec: () => ({ min: 5, max: 20 }),
    getRb3RotationEnabled: () => true,
    getFallbackCueTimeMs: () => 20000,
    setVenuePostProcessing: jest.fn(),
    sendSenderError: jest.fn(),
    sendToAllWindows: jest.fn(),
    runtimeBroadcaster: noopRuntimeBroadcaster(),
    setCueHandlerRef: jest.fn(),
    setRb3CueHandlerRef: jest.fn(),
    getRb3ProcessingMode: () => 'direct',
  }
}

const coordinators: ListenerCoordinator[] = []

afterEach(async () => {
  for (const lc of coordinators.splice(0)) {
    await lc.disableYarg()
    await lc.disableRb3()
  }
})

function announcements(deps: { sendToAllWindows: jest.Mock }): unknown[] {
  return deps.sendToAllWindows.mock.calls
    .filter(([channel]) => channel === RENDERER_RECEIVE.LISTENER_ENABLED_CHANGED)
    .map(([, payload]) => payload)
}

describe('ListenerCoordinator listener announcements', () => {
  it('tells every window when YARG starts and stops, whatever stopped it', async () => {
    const deps = makeDeps()
    const lc = new ListenerCoordinator(deps)
    coordinators.push(lc)

    await lc.enableYarg(true, async () => {})
    await lc.disableYarg()

    expect(announcements(deps)).toEqual([
      { listener: 'yarg', enabled: true },
      { listener: 'yarg', enabled: false },
    ])
  })

  it('tells every window when RB3 starts and stops', async () => {
    const deps = makeDeps()
    const lc = new ListenerCoordinator(deps)
    coordinators.push(lc)

    await lc.enableRb3(true, async () => {})
    await lc.disableRb3()

    expect(announcements(deps)).toEqual([
      { listener: 'rb3', enabled: true },
      { listener: 'rb3', enabled: false },
    ])
  })

  it('tells every window YARG is off when RB3 takes over from it', async () => {
    const deps = makeDeps()
    const lc = new ListenerCoordinator(deps)
    coordinators.push(lc)

    await lc.enableYarg(true, async () => {})
    await lc.enableRb3(true, async () => {})

    expect(announcements(deps)).toEqual([
      { listener: 'yarg', enabled: true },
      { listener: 'yarg', enabled: false },
      { listener: 'rb3', enabled: true },
    ])
  })
})

describe('ListenerCoordinator handled-cue events', () => {
  it('forwards cues from the handlers each enable builds after the subscription', async () => {
    const deps = makeDeps()
    const lc = new ListenerCoordinator(deps)
    coordinators.push(lc)
    const heard = jest.fn()
    lc.onCueHandled(heard)

    await lc.enableYarg(true, async () => {})
    lc.getCueHandler()!.emit('cueHandled', { lightingCue: 'first' })
    await lc.disableYarg()
    await lc.enableYarg(true, async () => {})
    lc.getCueHandler()!.emit('cueHandled', { lightingCue: 'second' })

    expect(heard.mock.calls.map(([data]) => (data as { lightingCue: string }).lightingCue)).toEqual(
      ['first', 'second'],
    )
  })

  it('stops forwarding to a listener that unsubscribed', async () => {
    const deps = makeDeps()
    const lc = new ListenerCoordinator(deps)
    coordinators.push(lc)
    const heard = jest.fn()
    const stop = lc.onCueHandled(heard)

    await lc.enableYarg(true, async () => {})
    stop()
    lc.getCueHandler()!.emit('cueHandled', { lightingCue: 'after' })

    expect(heard).not.toHaveBeenCalled()
  })
})
