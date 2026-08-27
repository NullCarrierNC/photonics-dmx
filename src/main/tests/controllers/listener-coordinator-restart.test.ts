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
import { CueRegistry } from '../../../photonics-dmx/cues/registries/CueRegistry'
import { getCueRegistry } from '../../../photonics-dmx/cues/registries/cueRegistries'
import { CueHandler } from '../../../photonics-dmx/cueHandlers/CueHandler'
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
    cueHandlers: {
      yarg: null,
      rb3: null,
    },
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

describe('ListenerCoordinator enableRb3 initialization ordering', () => {
  it('awaits initialization before enabling so a serialized op sees the finished enable', async () => {
    const lc = new ListenerCoordinator(makeDeps())
    const order: string[] = []
    let releaseInit: (() => void) | undefined
    const initP = new Promise<void>((resolve) => {
      releaseInit = resolve
    })
    const initAsync = jest.fn<() => Promise<void>>().mockImplementation(() => {
      order.push('init-start')
      return initP.then(() => {
        order.push('init-done')
      })
    })
    ;(lc as unknown as { enableRb3Internal: () => Promise<void> }).enableRb3Internal = jest.fn(
      async () => {
        order.push('enable')
      },
    )

    const enableP = lc.enableRb3(false, initAsync)
    let resolved = false
    void enableP.then(() => {
      resolved = true
    })

    await Promise.resolve()
    // enableRb3 must not resolve while initialization is still in flight.
    expect(resolved).toBe(false)

    releaseInit!()
    await enableP
    expect(resolved).toBe(true)
    expect(order).toEqual(['init-start', 'init-done', 'enable'])
  })
})

describe('ListenerCoordinator ends the song span on disable so locks do not leak', () => {
  it('disableYarg ends the YARG registry song via its handler and leaves the RB3 registry untouched', async () => {
    const deps = makeDeps()
    const chain = deps.getRigChains()[0]
    chain.cueHandlers.yarg = new CueHandler(chain.dmxLightManager, chain.sequencer, {
      registry: CueRegistry.getInstance(),
    })
    const lc = new ListenerCoordinator(deps)
    const yargEnd = jest.spyOn(CueRegistry.getInstance(), 'onSongEnd')
    const yargMotionEnd = jest.spyOn(CueRegistry.getInstance(), 'onMotionSongEnd')
    const rb3End = jest.spyOn(getCueRegistry('rb3'), 'onSongEnd')

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

  it('disableRb3 ends the RB3 registry song via its handler and leaves the YARG registry untouched', async () => {
    const deps = makeDeps()
    const chain = deps.getRigChains()[0]
    chain.cueHandlers.rb3 = new CueHandler(chain.dmxLightManager, chain.sequencer, {
      registry: getCueRegistry('rb3'),
    })
    const lc = new ListenerCoordinator(deps)
    const rb3End = jest.spyOn(getCueRegistry('rb3'), 'onSongEnd')
    const rb3MotionEnd = jest.spyOn(getCueRegistry('rb3'), 'onMotionSongEnd')
    const yargEnd = jest.spyOn(CueRegistry.getInstance(), 'onSongEnd')

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
