import { afterEach, describe, expect, it, jest } from '@jest/globals'

// Stub electron window helpers so the phase broadcast is a no-op under test.
jest.mock('../../utils/windowUtils', () => ({
  sendToAllWindows: jest.fn(),
  hasBrowserWindows: () => false,
  mainRuntimeBroadcaster: { emit: jest.fn() },
}))

import { resetLogConfiguration, setLogSink, type LogEntry } from '../../../shared/logger'
import { ControllerGraph } from '../../controllers/ControllerGraph'
import { ChainFanout } from '../../controllers/ChainFanout'
import { VenueFrameProcessor } from '../../../photonics-dmx/controllers/VenueFrameProcessor'
import { MasterOutputState } from '../../../photonics-dmx/controllers/MasterOutputState'
import { SenderManager } from '../../../photonics-dmx/controllers/SenderManager'
import { playCueThatFailsToStop } from '../../../photonics-dmx/tests/helpers/cueThatFailsToStop'
import { stubbedManager, stubConfig } from './lifecycleStub'

/** A graph built over no active rigs, which leaves it one real rig chain. */
function builtGraph(): ControllerGraph {
  const config = stubConfig()
  const senderManager = new SenderManager({
    broadcaster: { emit: () => {} },
    hasReceivers: () => false,
  })
  const graph = new ControllerGraph({
    getConfig: () => config,
    isRb3Enabled: () => false,
    isYargEnabled: () => false,
    isAudioEnabled: () => false,
    getSenderManager: () => senderManager,
    chainFanout: new ChainFanout(),
    venueFrameProcessor: new VenueFrameProcessor(),
    masterOutput: new MasterOutputState(),
  })
  graph.buildChains()
  return graph
}

/**
 * When tearing controllers down during a restart fails and no shutdown is concurrently running,
 * the restart must abort and surface the failure instead of calling init() on top of a partially
 * torn-down graph, which would leave dangling listeners/timers publishing alongside the new ones.
 */
describe('ControllerManager restart when teardown fails', () => {
  let graph: ControllerGraph | null = null

  afterEach(() => {
    graph?.shutdownPublisherSafe()
    graph?.destroyClock()
    graph = null
    resetLogConfiguration()
    jest.restoreAllMocks()
  })

  it('aborts reinitialization and enters the failed phase when a rig chain fails to dispose', async () => {
    const entries: LogEntry[] = []
    setLogSink((entry) => {
      entries.push(entry)
    })
    graph = builtGraph()
    const [chain] = graph.getChains()
    const disposeFailure = new Error('cue failed to stop')
    await playCueThatFailsToStop(chain, disposeFailure)
    const shutdownPublisher = jest.spyOn(graph, 'shutdownPublisher')
    const { manager, lifecycle, listeners, init } = stubbedManager({ graph })

    await expect(manager.restartControllers()).rejects.toThrow(/teardown failed/i)
    expect(listeners.yargRb3.disableRb3).toHaveBeenCalled()
    expect(shutdownPublisher).not.toHaveBeenCalled()
    expect(entries).toContainEqual(
      expect.objectContaining({
        level: 'error',
        message: 'Error shutting down controllers:',
        data: [disposeFailure],
      }),
    )
    expect(init).not.toHaveBeenCalled()
    expect(lifecycle.phase).toBe('failed')
    expect(manager.getIsInitialized()).toBe(false)
  })
})
