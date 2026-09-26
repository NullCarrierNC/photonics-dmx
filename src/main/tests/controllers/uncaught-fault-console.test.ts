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
import { restartGraph, stubbedManager } from './lifecycleStub'

const UNMAPPED = 100

describe('an uncaught exception while the DMX console is open', () => {
  let clock: ManualTestClock
  let chain: RigChain
  let publisher: DmxPublisher
  let manager: ControllerManager
  let universe: Record<number, number>
  let nowSpy: jest.SpiedFunction<typeof performance.now>

  const run = async (frames: number): Promise<void> => {
    for (let i = 0; i < frames; i++) {
      clock.tick(10)
      await new Promise<void>((resolve) => setImmediate(resolve))
    }
  }

  beforeEach(async () => {
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

    const graph = restartGraph()
    jest.mocked(graph.getDmxPublisher).mockReturnValue(publisher)
    manager = stubbedManager({
      ownConsoleMode: true,
      graph,
      init: async () => {},
    }).manager
    manager.getChainFanout().setChains([chain])

    chain.sequencer.setState(
      chain.dmxLightManager.getLights(['front'], ['all']),
      { red: 255, green: 0, blue: 0, intensity: 255, opacity: 1, blendMode: 'replace' },
      0,
    )
    await run(5)
    expect(await manager.enableConsoleMode('A')).toEqual({ success: true })
    manager.getConsoleModeController().sendConsoleDmx({ 1: 200, 4: 255, [UNMAPPED]: 255 })
    expect(universe[1]).toBe(200)
    expect(universe[UNMAPPED]).toBe(255)
  })

  afterEach(() => {
    publisher.shutdown()
    chain.dispose()
    nowSpy.mockRestore()
  })

  it('takes the wire dark and refuses later console frames', async () => {
    manager.handleUncaughtException(new Error('frame path threw'))
    await run(10)

    expect(manager.getLifecyclePhase()).toBe('failed')
    expect([universe[1], universe[2], universe[3], universe[4], universe[UNMAPPED]]).toEqual([
      0, 0, 0, 0, 0,
    ])

    manager.getConsoleModeController().sendConsoleDmx({ 1: 255, 4: 255, [UNMAPPED]: 255 })
    await run(3)

    expect(universe[1]).toBe(0)
    expect(universe[UNMAPPED]).toBe(0)
  })

  it('refuses to reopen the console while the fault is held', async () => {
    manager.handleUncaughtException(new Error('frame path threw'))
    await run(10)

    const reopened = await manager.enableConsoleMode('A')
    manager.getConsoleModeController().sendConsoleDmx({ 1: 255, 4: 255 })
    await run(3)

    expect(reopened.success).toBe(false)
    expect(universe[1]).toBe(0)
  })
})
