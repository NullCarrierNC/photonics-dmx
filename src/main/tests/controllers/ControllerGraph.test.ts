import { describe, expect, it, jest } from '@jest/globals'

jest.mock('../../utils/windowUtils', () => ({
  sendToAllWindows: jest.fn(),
  hasBrowserWindows: () => false,
  mainRuntimeBroadcaster: { emit: jest.fn() },
}))

import { ControllerGraph, type ControllerGraphDeps } from '../../controllers/ControllerGraph'
import { ChainFanout } from '../../controllers/ChainFanout'
import { VenueFrameProcessor } from '../../../photonics-dmx/controllers/VenueFrameProcessor'
import type { ConfigurationManager } from '../../../services/configuration/ConfigurationManager'
import type { CueHandler } from '../../../photonics-dmx/cueHandlers/CueHandler'

function makeGraph(prefs: Record<string, unknown> = {}): ControllerGraph {
  const config = {
    getPreference: (key: string) => prefs[key],
    getActiveRigs: () => [],
  } as unknown as ConfigurationManager
  const deps: ControllerGraphDeps = {
    getConfig: () => config,
    getSenderManager: jest.fn() as unknown as ControllerGraphDeps['getSenderManager'],
    chainFanout: new ChainFanout(),
    venueFrameProcessor: new VenueFrameProcessor(),
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

  it('disposeChainsForShutdown tolerates a failing chain and clears the chain refs', async () => {
    const graph = makeGraph()
    const disposeOk = jest.fn().mockImplementation(() => Promise.resolve())
    const disposeBad = jest.fn().mockImplementation(() => Promise.reject(new Error('boom')))
    seed(graph, {
      rigChains: [
        { rigId: 'a', dispose: disposeBad },
        { rigId: 'b', dispose: disposeOk },
      ],
      dmxLightManager: {},
      effectsController: {},
    })

    await graph.disposeChainsForShutdown()

    expect(disposeBad).toHaveBeenCalledTimes(1)
    expect(disposeOk).toHaveBeenCalledTimes(1)
    expect(graph.getChains()).toEqual([])
    expect(graph.getDmxLightManager()).toBeNull()
    expect(graph.getEffectsController()).toBeNull()
  })

  it('disposeChainsForRestart propagates the first failing chain', async () => {
    const graph = makeGraph()
    const disposeAfter = jest.fn().mockImplementation(() => Promise.resolve())
    seed(graph, {
      rigChains: [
        {
          rigId: 'a',
          dispose: jest.fn().mockImplementation(() => Promise.reject(new Error('boom'))),
        },
        { rigId: 'b', dispose: disposeAfter },
      ],
    })

    await expect(graph.disposeChainsForRestart()).rejects.toThrow('boom')
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

  it('shutdownPublisherSafe swallows a failing publisher, shutdownPublisher propagates it', async () => {
    const graph = makeGraph()
    seed(graph, {
      dmxPublisher: {
        shutdown: jest.fn().mockImplementation(() => Promise.reject(new Error('boom'))),
      },
    })

    await expect(graph.shutdownPublisherSafe()).resolves.toBeUndefined()
    await expect(graph.shutdownPublisher()).rejects.toThrow('boom')
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

  it('refreshActiveRigs is a no-op without a publisher', () => {
    const graph = makeGraph()
    expect(() => graph.refreshActiveRigs()).not.toThrow()
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
