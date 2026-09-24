import { afterEach, describe, expect, it, jest } from '@jest/globals'
import { performance } from 'perf_hooks'
import { Sequencer } from '../../controllers/sequencer/Sequencer'
import { LightTransitionController } from '../../controllers/sequencer/LightTransitionController'
import { LightStateManager } from '../../controllers/sequencer/LightStateManager'
import { DmxLightManager } from '../../controllers/DmxLightManager'
import { ManualTestClock } from '../helpers/sequencerHarness'
import { createMockDmxLight, createMockLightingConfig } from '../helpers/testFixtures'
import { Rb3StageKitRigProcessor } from '../../processors/Rb3StageKitRigProcessor'

const CLOCK_MS = 10
const ALL_LEDS = [0, 1, 2, 3, 4, 5, 6, 7]

/** An eight-light rig on the real sequencer and a manual clock, with f1 and f5 strobe-enabled. */
function buildRig() {
  jest.useFakeTimers({ doNotFake: ['performance'] })
  let now = 1
  const clockNow = jest.spyOn(performance, 'now').mockImplementation(() => now)

  const front = Array.from({ length: 8 }, (_, index) =>
    createMockDmxLight({
      id: `f${index + 1}`,
      group: 'front',
      position: index + 1,
      isStrobeEnabled: index === 0 || index === 4,
    }),
  )
  const lightManager = new DmxLightManager(
    createMockLightingConfig({
      numLights: 8,
      frontLights: front,
      backLights: [],
      strobeLights: [front[0], front[4]],
    }),
  )
  const clock = new ManualTestClock(CLOCK_MS)
  const lightStateManager = new LightStateManager()
  const sequencer = new Sequencer(new LightTransitionController(lightStateManager), clock)
  const rig = new Rb3StageKitRigProcessor('rig-a', lightManager, sequencer, { enabled: true })

  const level = (lightId: string): number | undefined =>
    lightStateManager.getLightState(lightId)?.intensity

  const step = async (ms: number, onFrame?: () => void): Promise<void> => {
    for (let tick = 0; tick < ms; tick++) {
      now += 1
      await jest.advanceTimersByTimeAsync(1)
      if (now % CLOCK_MS === 0) {
        clock.tick(CLOCK_MS)
        onFrame?.()
      }
    }
  }

  const dispose = (): void => {
    rig.dispose()
    sequencer.shutdown()
    clockNow.mockRestore()
  }

  return { rig, level, step, dispose }
}

describe('Rb3StageKitRigProcessor light levels', () => {
  let current: ReturnType<typeof buildRig> | null = null

  afterEach(() => {
    current?.dispose()
    current = null
    jest.useRealTimers()
  })

  it('returns a light to its own level when a second colour bank clears', async () => {
    current = buildRig()
    const { rig, level, step } = current

    rig.applyLightData([0], 'red')
    await step(100)
    const redAlone = level('f1')

    rig.applyLightData([0], 'green')
    await step(100)
    rig.applyLightData([], 'green')
    await step(100)

    expect(redAlone).toBe(100)
    expect(level('f1')).toBe(redAlone)
  })

  it('leaves a strobe-enabled light at its neighbour level once a strobe stops', async () => {
    current = buildRig()
    const { rig, level, step } = current

    rig.applyLightData(ALL_LEDS, 'red')
    await step(100)
    rig.applyStrobeEffect('medium')
    await step(1000)
    rig.clearStrobeEffectsAtPositions([])
    await step(500)

    expect(level('f2')).toBe(100)
    expect(level('f1')).toBe(level('f2'))
  })

  it('keeps the held level between the pulses of a second colour on the beat', async () => {
    current = buildRig()
    const { rig, level, step } = current

    rig.applyLightData([0, 1], 'red')
    await step(100)
    const held = level('f1')

    const offBeatLevels: Array<number | undefined> = []
    for (let beat = 0; beat < 8; beat++) {
      rig.applyLightData(ALL_LEDS, 'green')
      await step(250)
      rig.applyLightData([], 'green')
      await step(50)
      await step(200, () => offBeatLevels.push(level('f1')))
    }

    expect(held).toBe(100)
    expect(new Set(offBeatLevels)).toEqual(new Set([held]))
  })
})
