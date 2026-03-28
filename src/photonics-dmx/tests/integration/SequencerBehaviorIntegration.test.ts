import { getColor } from '../../helpers/dmxHelpers'
import { createSequencerHarness } from '../helpers/sequencerHarness'
import type { Effect } from '../../types'

const buildSingleLayerEffect = (
  lights: Effect['transitions'][number]['lights'],
  layer: number,
  color: Effect['transitions'][number]['transform']['color'],
  duration: number,
  easing: Effect['transitions'][number]['transform']['easing'],
): Effect => ({
  id: 'test-effect',
  description: 'test effect',
  transitions: [
    {
      lights,
      layer,
      waitForCondition: 'none',
      waitForTime: 0,
      waitUntilCondition: 'none',
      waitUntilTime: 0,
      transform: {
        color,
        duration,
        easing,
      },
    },
  ],
})

describe('Sequencer blending and queueing (real harness)', () => {
  it('blends add vs replace with opacity', () => {
    const harness = createSequencerHarness({ frontCount: 1, backCount: 0 })
    const lights = harness.lightManager.getLights(['front'], ['all'])

    const baseColor = { ...getColor('blue', 'high', 'replace'), opacity: 1 }
    const addColor = { ...getColor('red', 'high', 'add'), opacity: 0.5 }

    harness.sequencer.addEffect('base', buildSingleLayerEffect(lights, 0, baseColor, 0, 'linear'))
    harness.sequencer.addEffect('overlay', buildSingleLayerEffect(lights, 1, addColor, 0, 'linear'))
    harness.advanceBy(1)

    const state = harness.getLightState(lights[0].id)
    expect(state?.red ?? 0).toBeGreaterThan(0)
    expect(state?.blue ?? 0).toBeGreaterThan(0)

    harness.cleanup()
  })

  it('produces different mid-transition values for easing', () => {
    const sampleMidValue = (
      easing: Effect['transitions'][number]['transform']['easing'],
    ): number => {
      const harness = createSequencerHarness({ frontCount: 1, backCount: 0 })
      const lights = harness.lightManager.getLights(['front'], ['all'])
      const color = { ...getColor('red', 'high', 'replace'), opacity: 1 }

      harness.sequencer.addEffect('ease', buildSingleLayerEffect(lights, 0, color, 100, easing))
      harness.advanceBy(25)

      const state = harness.getLightState(lights[0].id)
      const value = state?.red ?? 0
      harness.cleanup()
      return value
    }

    const linearMid = sampleMidValue('linear')
    const sinMid = sampleMidValue('sinInOut')
    expect(sinMid).toBeLessThan(linearMid)
  })

  it('queues effects with the same name on a layer', () => {
    const harness = createSequencerHarness({ frontCount: 1, backCount: 0 })
    const lights = harness.lightManager.getLights(['front'], ['all'])
    const colorA = { ...getColor('red', 'high', 'replace'), opacity: 1 }
    const colorB = { ...getColor('blue', 'high', 'replace'), opacity: 1 }

    const effectA = buildSingleLayerEffect(lights, 1, colorA, 50, 'linear')
    const effectB = buildSingleLayerEffect(lights, 1, colorB, 50, 'linear')

    harness.sequencer.addEffect('queue-test', effectA)
    harness.sequencer.addEffect('queue-test', effectB)

    const layerManager = (
      harness.sequencer as unknown as {
        layerManager: { getEffectQueue: () => Map<number, Map<string, unknown>> }
      }
    ).layerManager
    const queue = layerManager.getEffectQueue().get(1)
    expect(queue?.size ?? 0).toBeGreaterThan(0)

    harness.cleanup()
  })

  it('requeues persistent effects after completion', () => {
    const harness = createSequencerHarness({ frontCount: 1, backCount: 0 })
    const lights = harness.lightManager.getLights(['front'], ['all'])
    const color = { ...getColor('green', 'high', 'replace'), opacity: 1 }

    const effect = buildSingleLayerEffect(lights, 1, color, 20, 'linear')
    harness.sequencer.addEffect('persistent-test', effect, true)
    harness.advanceBy(1)

    const lightId = lights[0].id
    expect(harness.sequencer.getActiveEffectsForLight(lightId).has(1)).toBe(true)

    let sawRestart = false
    for (let i = 0; i < 10; i += 1) {
      harness.advanceBy(20)
      if (harness.sequencer.getActiveEffectsForLight(lightId).has(1)) {
        sawRestart = true
        break
      }
    }
    expect(sawRestart).toBe(true)

    harness.cleanup()
  })

  it('fires completion callback after all lights finish', () => {
    const harness = createSequencerHarness({ frontCount: 2, backCount: 0 })
    const lights = harness.lightManager.getLights(['front'], ['all'])
    const color = { ...getColor('red', 'high', 'replace'), opacity: 1 }
    const effect = buildSingleLayerEffect(lights, 1, color, 30, 'linear')

    const onComplete = jest.fn()
    harness.sequencer.addEffectWithCallback('callback-test', effect, onComplete)
    harness.advanceBy(10)
    expect(onComplete).not.toHaveBeenCalled()

    let fired = false
    for (let i = 0; i < 10; i += 1) {
      harness.advanceBy(10)
      if (onComplete.mock.calls.length > 0) {
        fired = true
        break
      }
    }
    expect(fired).toBe(true)
    expect(onComplete).toHaveBeenCalledTimes(1)

    harness.cleanup()
  })

  it('fires callback after queued effect completes', () => {
    const harness = createSequencerHarness({ frontCount: 1, backCount: 0 })
    const lights = harness.lightManager.getLights(['front'], ['all'])
    const colorA = { ...getColor('blue', 'high', 'replace'), opacity: 1 }
    const colorB = { ...getColor('green', 'high', 'replace'), opacity: 1 }
    const effectA = buildSingleLayerEffect(lights, 1, colorA, 20, 'linear')
    const effectB = buildSingleLayerEffect(lights, 1, colorB, 20, 'linear')

    const onComplete = jest.fn()
    harness.sequencer.addEffect('queue-callback', effectA)
    harness.sequencer.addEffectWithCallback('queue-callback', effectB, onComplete)

    harness.advanceBy(25)
    expect(onComplete).not.toHaveBeenCalled()

    let fired = false
    for (let i = 0; i < 10; i += 1) {
      harness.advanceBy(10)
      if (onComplete.mock.calls.length > 0) {
        fired = true
        break
      }
    }
    expect(fired).toBe(true)
    expect(onComplete).toHaveBeenCalledTimes(1)

    harness.cleanup()
  })
})
