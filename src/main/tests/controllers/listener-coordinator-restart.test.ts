/**
 * Ensures disableYarg / disableRb3 await UDP listener shutdown so the port is
 * released before `isYargEnabled` / `isRb3Enabled` is cleared.
 */
import { describe, expect, it, jest } from '@jest/globals'
import {
  ListenerCoordinator,
  type ListenerCoordinatorDeps,
} from '../../controllers/ListenerCoordinator'
import { DmxLightManager } from '../../../photonics-dmx/controllers/DmxLightManager'
import { ILightingController } from '../../../photonics-dmx/controllers/sequencer/interfaces'
import { ChainFanout } from '../../../photonics-dmx/controllers/ChainFanout'
import { noopRuntimeBroadcaster } from '../../../photonics-dmx/runtime/broadcaster'
import { YargCueRegistry } from '../../../photonics-dmx/cues/registries/YargCueRegistry'
import { getRb3CueRegistry } from '../../../photonics-dmx/cues/registries/Rb3CueRegistry'
import type { RigChain } from '../../../photonics-dmx/controllers/RigChain'

function makeDeps(): ListenerCoordinatorDeps {
  const effects = {
    removeAllEffects: jest.fn(),
    blackout: jest.fn<() => Promise<void>>().mockImplementation(() => Promise.resolve()),
  } as unknown as ILightingController
  const dmx = {} as DmxLightManager
  // Stub a single rig chain that exposes the effects controller as its sequencer so the
  // disable paths' blackout loops have something to call.
  const fakeChain = {
    rigId: 'stub',
    isPrimary: true,
    dmxLightManager: dmx,
    sequencer: effects,
    yargCueHandler: null,
    audioCueHandler: null,
    rb3MenuCueHandler: null,
  } as unknown as RigChain
  const chains: RigChain[] = [fakeChain]
  const chainFanout = new ChainFanout()
  chainFanout.setChains(chains)
  return {
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
    getFallbackCueTimeMs: () => 20000,
    sendSenderError: jest.fn(),
    sendToAllWindows: jest.fn(),
    runtimeBroadcaster: noopRuntimeBroadcaster(),
    setCueHandlerRef: jest.fn(),
    setRb3CueHandlerRef: jest.fn(),
    getRb3ProcessingMode: () => 'direct',
  }
}

describe('ListenerCoordinator listener shutdown ordering', () => {
  it('disableYarg keeps isYargEnabled true until the YARG listener shutdown Promise resolves', async () => {
    const lc = new ListenerCoordinator(makeDeps())
    let releaseShutdown: (() => void) | undefined
    const shutdownP = new Promise<void>((resolve) => {
      releaseShutdown = resolve
    })

    const co = lc as unknown as {
      isYargEnabled: boolean
      yargListener: { shutdown: () => Promise<void> } | null
      cueHandler: { shutdown: () => void } | null
    }
    co.isYargEnabled = true
    co.yargListener = { shutdown: () => shutdownP }
    co.cueHandler = { shutdown: jest.fn() }

    const disableP = lc.disableYarg()
    await Promise.resolve()
    expect(co.isYargEnabled).toBe(true)
    releaseShutdown!()
    await disableP
    expect(co.isYargEnabled).toBe(false)
    expect(co.yargListener).toBeNull()
    expect(co.cueHandler).toBeNull()
  })

  it('disableRb3 keeps isRb3Enabled true until the RB3 listener shutdown Promise resolves', async () => {
    const lc = new ListenerCoordinator(makeDeps())
    let releaseShutdown: (() => void) | undefined
    const shutdownP = new Promise<void>((resolve) => {
      releaseShutdown = resolve
    })

    const co = lc as unknown as {
      isRb3Enabled: boolean
      rb3eListener: { shutdown: () => Promise<void> } | null
      processorManager: { destroy: () => void } | null
    }
    co.isRb3Enabled = true
    co.rb3eListener = { shutdown: () => shutdownP }
    co.processorManager = { destroy: jest.fn() }

    const disableP = lc.disableRb3()
    await Promise.resolve()
    expect(co.isRb3Enabled).toBe(true)
    releaseShutdown!()
    await disableP
    expect(co.isRb3Enabled).toBe(false)
    expect(co.rb3eListener).toBeNull()
    expect(co.processorManager).toBeNull()
  })
})

describe('ListenerCoordinator ends the song span on disable so locks do not leak', () => {
  it('disableYarg ends the YARG registry song and leaves the RB3 registry untouched', async () => {
    const lc = new ListenerCoordinator(makeDeps())
    const yargEnd = jest.spyOn(YargCueRegistry.getInstance(), 'onSongEnd')
    const yargMotionEnd = jest.spyOn(YargCueRegistry.getInstance(), 'onMotionSongEnd')
    const rb3End = jest.spyOn(getRb3CueRegistry(), 'onSongEnd')

    const co = lc as unknown as {
      isYargEnabled: boolean
      yargListener: { shutdown: () => Promise<void> } | null
    }
    co.isYargEnabled = true
    co.yargListener = { shutdown: () => Promise.resolve() }

    await lc.disableYarg()

    expect(yargEnd).toHaveBeenCalled()
    expect(yargMotionEnd).toHaveBeenCalled()
    expect(rb3End).not.toHaveBeenCalled()
    jest.restoreAllMocks()
  })

  it('disableRb3 ends the RB3 registry song and leaves the YARG registry untouched', async () => {
    const lc = new ListenerCoordinator(makeDeps())
    const rb3End = jest.spyOn(getRb3CueRegistry(), 'onSongEnd')
    const rb3MotionEnd = jest.spyOn(getRb3CueRegistry(), 'onMotionSongEnd')
    const yargEnd = jest.spyOn(YargCueRegistry.getInstance(), 'onSongEnd')

    const co = lc as unknown as {
      isRb3Enabled: boolean
      rb3eListener: { shutdown: () => Promise<void> } | null
      processorManager: { destroy: () => void } | null
    }
    co.isRb3Enabled = true
    co.rb3eListener = { shutdown: () => Promise.resolve() }
    co.processorManager = { destroy: jest.fn() }

    await lc.disableRb3()

    expect(rb3End).toHaveBeenCalled()
    expect(rb3MotionEnd).toHaveBeenCalled()
    expect(yargEnd).not.toHaveBeenCalled()
    jest.restoreAllMocks()
  })
})
