import { describe, expect, it, jest } from '@jest/globals'

jest.mock('../../utils/windowUtils', () => ({
  sendToAllWindows: jest.fn(),
  hasBrowserWindows: () => false,
  mainRuntimeBroadcaster: { emit: jest.fn() },
}))

import { ControllerGraph, type ControllerGraphDeps } from '../../controllers/ControllerGraph'
import { ChainFanout } from '../../controllers/ChainFanout'
import { VenueFrameProcessor } from '../../../photonics-dmx/controllers/VenueFrameProcessor'
import { MasterOutputState } from '../../../photonics-dmx/controllers/MasterOutputState'
import type { ConfigurationManager } from '../../../services/configuration/ConfigurationManager'
import type { CueHandler } from '../../../photonics-dmx/cueHandlers/CueHandler'
import { SenderManager } from '../../../photonics-dmx/controllers/SenderManager'
import type { Clock } from '../../../photonics-dmx/controllers/sequencer/Clock'

function makeGraph(
  prefs: Record<string, unknown> = {},
  senderManager?: SenderManager,
): ControllerGraph {
  const config = {
    getPreference: (key: string) => prefs[key],
    getActiveRigs: () => [],
  } as unknown as ConfigurationManager
  const deps: ControllerGraphDeps = {
    getConfig: () => config,
    isRb3Enabled: () => false,
    isYargEnabled: () => false,
    isAudioEnabled: () => false,
    getSenderManager: (senderManager
      ? () => senderManager
      : jest.fn()) as unknown as ControllerGraphDeps['getSenderManager'],
    chainFanout: new ChainFanout(),
    venueFrameProcessor: new VenueFrameProcessor(),
    masterOutput: new MasterOutputState(),
  }
  return new ControllerGraph(deps)
}

/** Assign internal built-graph state, as a build would have. */
function seed(graph: ControllerGraph, state: Record<string, unknown>): void {
  Object.assign(graph as unknown as Record<string, unknown>, state)
}

describe('ControllerGraph teardown steps', () => {
  it('shutdownDomainCueHandlerRefs stops and nulls both handlers even if one throws', () => {
    const graph = makeGraph()
    const rb3Shutdown = jest.fn()
    graph.setCueHandler({
      shutdown: jest.fn(() => {
        throw new Error('boom')
      }),
    } as unknown as CueHandler)
    graph.setRb3CueHandler({ shutdown: rb3Shutdown } as unknown as CueHandler)

    graph.shutdownDomainCueHandlerRefs()

    expect(graph.getCueHandler()).toBeNull()
    expect(rb3Shutdown).toHaveBeenCalledTimes(1)
    expect(graph.getRb3CueHandler()).toBeNull()
  })

  it('disposeChainsForShutdown tolerates a failing chain and clears the chain refs', () => {
    const graph = makeGraph()
    const disposeOk = jest.fn()
    const disposeBad = jest.fn(() => {
      throw new Error('boom')
    })
    seed(graph, {
      rigChains: [
        { rigId: 'a', dispose: disposeBad },
        { rigId: 'b', dispose: disposeOk },
      ],
      dmxLightManager: {},
      effectsController: {},
    })

    graph.disposeChainsForShutdown()

    expect(disposeBad).toHaveBeenCalledTimes(1)
    expect(disposeOk).toHaveBeenCalledTimes(1)
    expect(graph.getChains()).toEqual([])
    expect(graph.getDmxLightManager()).toBeNull()
    expect(graph.getEffectsController()).toBeNull()
  })

  it('disposeChainsForRestart propagates the first failing chain', () => {
    const graph = makeGraph()
    const disposeAfter = jest.fn()
    seed(graph, {
      rigChains: [
        {
          rigId: 'a',
          dispose: jest.fn(() => {
            throw new Error('boom')
          }),
        },
        { rigId: 'b', dispose: disposeAfter },
      ],
    })

    expect(() => graph.disposeChainsForRestart()).toThrow('boom')
    expect(disposeAfter).not.toHaveBeenCalled()
  })

  it('disposeLoaders tolerates each failure and nulls the refs', async () => {
    const graph = makeGraph()
    const nodeDispose = jest.fn().mockImplementation(() => Promise.reject(new Error('boom')))
    const effectDispose = jest.fn().mockImplementation(() => Promise.resolve())
    graph.setNodeCueLoader({
      dispose: nodeDispose,
      removeAllListeners: jest.fn(),
    } as unknown as Parameters<ControllerGraph['setNodeCueLoader']>[0])
    graph.setEffectLoader({
      dispose: effectDispose,
      removeAllListeners: jest.fn(),
    } as unknown as Parameters<ControllerGraph['setEffectLoader']>[0])

    await graph.disposeLoaders()

    expect(nodeDispose).toHaveBeenCalledTimes(1)
    expect(effectDispose).toHaveBeenCalledTimes(1)
    // The rejected loader keeps its ref (nulling follows the successful dispose only).
    expect(graph.getNodeCueLoader()).not.toBeNull()
    expect(graph.getEffectLoader()).toBeNull()
  })

  it('shutdownPublisherSafe swallows a failing publisher, shutdownPublisher propagates it', () => {
    const graph = makeGraph()
    seed(graph, {
      dmxPublisher: {
        shutdown: jest.fn(() => {
          throw new Error('boom')
        }),
      },
    })

    expect(() => graph.shutdownPublisherSafe()).not.toThrow()
    expect(() => graph.shutdownPublisher()).toThrow('boom')
  })

  it('destroyClock tolerates a throwing clock and clears it either way', () => {
    const graph = makeGraph()
    seed(graph, {
      clock: {
        destroy: jest.fn(() => {
          throw new Error('boom')
        }),
      },
    })

    expect(() => graph.destroyClock()).not.toThrow()
    seed(graph, { clock: { destroy: jest.fn() } })
    graph.destroyClock()
  })

  it('a second build disposes the clock, chains and publisher of the first', () => {
    jest.useFakeTimers()
    const senderManager = new SenderManager({
      broadcaster: { emit: () => {} },
      hasReceivers: () => false,
    })
    const graph = makeGraph({ clockRate: 10 }, senderManager)
    try {
      graph.buildChains()
      const clock = (graph as unknown as { clock: Clock }).clock
      const publisher = graph.getDmxPublisher()!
      const chain = graph.getChains()[0]
      const destroyClock = jest.spyOn(clock, 'destroy')
      const shutdownPublisher = jest.spyOn(publisher, 'shutdown')
      const disposeChain = jest.spyOn(chain, 'dispose')

      graph.buildChains()

      expect(destroyClock).toHaveBeenCalled()
      expect(shutdownPublisher).toHaveBeenCalled()
      expect(disposeChain).toHaveBeenCalled()
    } finally {
      graph.disposeChainsForShutdown()
      graph.shutdownPublisherSafe()
      graph.destroyClock()
      jest.useRealTimers()
    }
  })

  it('fans motion toggles and manual refs out to every chain handler', () => {
    const graph = makeGraph()
    const yargA = { setMotionEnabled: jest.fn(), setManualMotionRef: jest.fn() }
    const rb3B = { setMotionEnabled: jest.fn(), setManualMotionRef: jest.fn() }
    seed(graph, {
      rigChains: [
        { rigId: 'a', cueHandlers: { yarg: yargA, rb3: null } },
        { rigId: 'b', cueHandlers: { yarg: null, rb3: rb3B } },
      ],
    })

    graph.setMotionEnabledOnChains(false)
    graph.setManualMotionRefOnChains('yarg', { groupId: 'g', cueId: 'c' })
    graph.setManualMotionRefOnChains('rb3', null)

    expect(yargA.setMotionEnabled).toHaveBeenCalledWith(false)
    expect(rb3B.setMotionEnabled).toHaveBeenCalledWith(false)
    expect(yargA.setManualMotionRef).toHaveBeenCalledWith({ groupId: 'g', cueId: 'c' })
    expect(rb3B.setManualMotionRef).toHaveBeenCalledWith(null)
  })
})
