import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { performance } from 'perf_hooks'

jest.mock('electron', () => ({
  app: { getPath: jest.fn(() => '/tmp/photonics-test') },
}))

jest.mock('../../utils/windowUtils', () => ({
  sendToAllWindows: jest.fn(),
  hasBrowserWindows: () => false,
  mainRuntimeBroadcaster: { emit: jest.fn() },
}))

import { DmxPublisher } from '../../../photonics-dmx/controllers/DmxPublisher'
import { StrobeStateManager } from '../../../photonics-dmx/controllers/StrobeStateManager'
import { RigChain } from '../../../photonics-dmx/controllers/RigChain'
import type { DmxRig } from '../../../photonics-dmx/types'
import { ManualTestClock } from '../../../photonics-dmx/tests/helpers/sequencerHarness'
import {
  createMockLightingConfig,
  rgbLight,
} from '../../../photonics-dmx/tests/helpers/testFixtures'
import type { ControllerManager } from '../../controllers/ControllerManager'
import { TestEffectRunner } from '../../controllers/TestEffectRunner'
import { restartGraph, stubbedManager } from './lifecycleStub'

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

describe('an uncaught exception while a test effect runs', () => {
  let clock: ManualTestClock
  let chain: RigChain
  let publisher: DmxPublisher
  let runner: TestEffectRunner
  let manager: ControllerManager
  let universe: Record<number, number>
  let nowSpy: jest.SpiedFunction<typeof performance.now>

  /** Frames on the rig clock, each one long enough in real time for the effect to re-dispatch. */
  const frames = async (count: number): Promise<number[]> => {
    const red: number[] = []
    for (let i = 0; i < count; i++) {
      clock.tick(10)
      await sleep(20)
      red.push(universe[1] ?? 0)
    }
    return red
  }

  beforeEach(() => {
    clock = new ManualTestClock(10)
    nowSpy = jest.spyOn(performance, 'now').mockImplementation(() => clock.getCurrentTimeMs())
    const light = rgbLight({
      id: 'front-1',
      group: 'front',
      position: 1,
      channels: { red: 1, green: 2, blue: 3, masterDimmer: 4 } as never,
    })
    const config = createMockLightingConfig({
      numLights: 1,
      frontLights: [light],
      backLights: [],
      strobeLights: [],
    })
    chain = new RigChain({ rigId: 'A', config, clock })
    universe = {}
    const sender = {
      getEnabledWireSenders: () => ['artnet'],
      isIpcEnabled: () => false,
      sendIpc: () => {},
      send: (_wireId: string, buffer: Record<number, number>) => {
        for (const [channel, value] of Object.entries(buffer)) universe[Number(channel)] = value
        return Promise.resolve(true)
      },
    }
    publisher = new DmxPublisher(sender as never, null, new StrobeStateManager())
    publisher.setRigChains([chain])
    publisher.updateActiveRigs([{ id: 'A', name: 'A', active: true, config } as DmxRig])

    runner = new TestEffectRunner(
      { getChainFanout: () => manager.getChainFanout(), ensureInitialized: async () => {} },
      {
        ensureHandlers: () => {},
        dispatch: () =>
          chain.sequencer.setState(
            chain.dmxLightManager.getLights(['front'], ['all']),
            { red: 255, green: 0, blue: 0, intensity: 255, opacity: 1, blendMode: 'replace' },
            0,
          ),
        stopActiveCue: () => {},
      },
    )
    const graph = restartGraph()
    jest.mocked(graph.getDmxPublisher).mockReturnValue(publisher)
    manager = stubbedManager({
      ownConsoleMode: true,
      graph,
      testEffectRunner: runner,
      init: async () => {},
    }).manager
    manager.getChainFanout().setChains([chain])
  })

  afterEach(async () => {
    await runner.stopTestEffect()
    publisher.shutdown()
    chain.dispose()
    nowSpy.mockRestore()
  })

  it('keeps the rig dark while the fault response waits on a running sender change', async () => {
    runner.startTestEffect('Chorus')
    expect((await frames(5)).at(-1)).toBe(255)

    const holding = manager.runSenderOp(() => sleep(400))
    manager.handleUncaughtException(new Error('frame path threw'))
    const duringTheWait = await frames(10)
    await holding

    expect(duringTheWait).toEqual(new Array(10).fill(0))
  })
})
