import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { performance } from 'perf_hooks'
import { DmxPublisher } from '../../controllers/DmxPublisher'
import { fakeSenderManager } from '../helpers/fakeSenderManager'
import { MasterOutputState } from '../../controllers/MasterOutputState'
import { StrobeStateManager } from '../../controllers/StrobeStateManager'
import { Sequencer } from '../../controllers/sequencer/Sequencer'
import { LightTransitionController } from '../../controllers/sequencer/LightTransitionController'
import { LightStateManager } from '../../controllers/sequencer/LightStateManager'
import { DmxLightManager } from '../../controllers/DmxLightManager'
import type { DmxRig } from '../../types'
import { ManualTestClock } from '../helpers/sequencerHarness'
import { createMockLightingConfig, rgbLight } from '../helpers/testFixtures'

const UNMAPPED = 100

describe('console channels on a retaining wire sender', () => {
  let clock: ManualTestClock
  let sequencer: Sequencer
  let publisher: DmxPublisher
  let master: MasterOutputState
  let universe: Record<number, number>
  let nowSpy: jest.SpiedFunction<typeof performance.now>

  const tick = async (frames: number): Promise<void> => {
    for (let i = 0; i < frames; i++) {
      clock.tick(10)
      await Promise.resolve()
      await Promise.resolve()
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
    const lightManager = new DmxLightManager(config)
    const lightStateManager = new LightStateManager()
    sequencer = new Sequencer(new LightTransitionController(lightStateManager), clock)
    universe = {}
    const sender = fakeSenderManager({
      getEnabledWireSenders: () => ['artnet'],
      send: (_wireId, buffer) => {
        for (const [channel, value] of Object.entries(buffer)) universe[Number(channel)] = value
        return Promise.resolve(true)
      },
    })
    master = new MasterOutputState()
    publisher = new DmxPublisher(sender, null, new StrobeStateManager(), {
      masterOutput: master,
    })
    publisher.setRigChains([{ rigId: 'A', lightStateManager }])
    publisher.updateActiveRigs([{ id: 'A', name: 'A', active: true, config } as DmxRig])

    sequencer.setState(
      lightManager.getLights(['front'], ['all']),
      { red: 255, green: 0, blue: 0, intensity: 255, opacity: 1, blendMode: 'replace' },
      0,
    )
    await tick(5)
    publisher.setManualBuffer({ 1: 200, 2: 200, 3: 200, 4: 255, [UNMAPPED]: 255 })
    expect(universe[UNMAPPED]).toBe(255)
  })

  afterEach(() => {
    publisher.shutdown()
    sequencer.shutdown()
    nowSpy.mockRestore()
  })

  it('zeroes a channel no fixture maps on the first cue frame after the console', async () => {
    publisher.clearManualBuffer()
    await tick(1)
    expect(universe[UNMAPPED]).toBe(0)
  })

  it('leaves that channel dark under the master blackout', async () => {
    publisher.clearManualBuffer()
    master.setBlackout(true)
    publisher.refreshOutput()
    await tick(5)
    expect(universe[UNMAPPED]).toBe(0)
  })
})
