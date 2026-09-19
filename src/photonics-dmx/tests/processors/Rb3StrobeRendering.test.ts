/**
 * A strobe is only visible if the frame renders between its halves. Two state changes inside one
 * frame are sampled once, and the same half wins every time, so the run is driven through the real
 * sequencer here and what the light shows is counted.
 */
import { afterEach, describe, expect, it, jest } from '@jest/globals'
import { performance } from 'perf_hooks'
import { Sequencer } from '../../controllers/sequencer/Sequencer'
import type { Clock } from '../../controllers/sequencer/Clock'
import { LightTransitionController } from '../../controllers/sequencer/LightTransitionController'
import { LightStateManager } from '../../controllers/sequencer/LightStateManager'
import { DmxLightManager } from '../../controllers/DmxLightManager'
import { ManualTestClock } from '../helpers/sequencerHarness'
import { createMockDmxLight, createMockLightingConfig } from '../helpers/testFixtures'
import { Rb3StageKitRigProcessor } from '../../processors/Rb3StageKitRigProcessor'

const WINDOW_MS = 2000

type StrobeRun = { flashes: number; whiteMs: number; whiteAfterStop: boolean }

/** Runs one strobe type against a clock of the given interval and reports what the light showed. */
async function runStrobe(clockMs: number, type: 'fastest' | 'fast' | 'medium'): Promise<StrobeRun> {
  jest.useFakeTimers({ doNotFake: ['performance'] })
  let now = 1
  const clockNow = jest.spyOn(performance, 'now').mockImplementation(() => now)

  const front = Array.from({ length: 8 }, (_, index) =>
    createMockDmxLight({
      id: `f${index + 1}`,
      group: 'front',
      position: index + 1,
      isStrobeEnabled: index === 0 || index === 4,
    } as never),
  )
  const lightManager = new DmxLightManager(
    createMockLightingConfig({
      numLights: 8,
      frontLights: front,
      backLights: [],
      strobeLights: [front[0], front[4]],
    }),
  )
  const clock = new ManualTestClock(clockMs)
  const lightStateManager = new LightStateManager()
  const sequencer = new Sequencer(
    new LightTransitionController(lightStateManager),
    clock as unknown as Clock,
  )
  const rig = new Rb3StageKitRigProcessor('rig-a', lightManager, sequencer, { enabled: true })

  // A lit rig first, so a flash is something other than the colour underneath it.
  await rig.applyLightData([0, 1, 2, 3, 4, 5, 6, 7], 'blue')

  const isWhite = (): boolean => {
    const state = lightStateManager.getLightState('f1')
    return !!state && state.red > 200 && state.green > 200 && state.blue > 200
  }

  let flips = 0
  let white = false
  let whiteMs = 0
  const step = async (ms: number, measure: boolean): Promise<void> => {
    for (let tick = 0; tick < ms; tick++) {
      now += 1
      await jest.advanceTimersByTimeAsync(1)
      if (now % clockMs === 0) {
        clock.tick(clockMs)
      }
      if (measure) {
        const lit = isWhite()
        if (lit !== white) {
          flips++
        }
        white = lit
        if (lit) {
          whiteMs++
        }
      }
    }
  }

  await step(200, false)
  rig.applyStrobeEffect(type)
  await step(WINDOW_MS, true)
  rig.clearStrobeEffectsAtPositions([])
  await step(500, false)
  const whiteAfterStop = isWhite()

  rig.dispose()
  sequencer.shutdown()
  clockNow.mockRestore()

  return { flashes: flips / 2, whiteMs, whiteAfterStop }
}

describe('RB3 strobe against the frame it renders in', () => {
  afterEach(() => {
    jest.useRealTimers()
  })

  it('flashes the fastest strobe on a clock that ticks slower than it asks', async () => {
    const run = await runStrobe(50, 'fastest')

    expect(run.flashes).toBeGreaterThanOrEqual(6)
    expect(run.whiteMs).toBeLessThan(WINDOW_MS * 0.75)
    expect(run.whiteAfterStop).toBe(false)
  })

  it('flashes the fastest strobe on a clock halfway through the window', async () => {
    const run = await runStrobe(25, 'fastest')

    expect(run.flashes).toBeGreaterThanOrEqual(12)
    expect(run.whiteMs).toBeLessThan(WINDOW_MS * 0.75)
    expect(run.whiteAfterStop).toBe(false)
  })

  it('flashes at the rate it asks for when the frame can show it', async () => {
    const run = await runStrobe(10, 'fastest')

    expect(run.flashes).toBeGreaterThanOrEqual(32)
    expect(run.whiteAfterStop).toBe(false)
  })
})
