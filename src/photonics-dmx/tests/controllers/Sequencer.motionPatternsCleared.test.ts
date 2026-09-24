import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { createSequencerHarness, type SequencerHarness } from '../helpers/sequencerHarness'
import type { ResolvedMotionPatternSetting } from '../../cues/node/compiler/ActionEffectFactory'

const sweep: ResolvedMotionPatternSetting = {
  pattern: 'linear-sweep',
  speedHz: 1,
  sizeDeg: 20,
  fanSpreadDeg: 0,
  panWaveform: 'sine',
  tiltWaveform: 'sine',
  panAmplitudeDeg: 0,
  tiltAmplitudeDeg: 20,
  panPhaseOffsetDeg: 0,
  panFreqMultiplier: 1,
  tiltFreqMultiplier: 1,
  linearSweepAxis: 'vertical',
  gimbalCompensation: false,
  bearingDeg: 180,
  reverse: false,
}

describe('Sequencer.removeAllEffects and motion patterns', () => {
  let harness: SequencerHarness

  beforeEach(() => {
    harness = createSequencerHarness({ frontCount: 1, backCount: 0, movingHead: true })
  })

  afterEach(() => {
    harness.cleanup()
  })

  it('drops the running pattern, homes the head and notifies once per call', () => {
    const lights = harness.lightManager.getLights(['front'], ['all'])
    const listener = jest.fn()
    harness.sequencer.onMotionPatternsCleared(listener)
    harness.sequencer.addMotionPattern('sweep', sweep, lights, 120, 0)
    harness.advanceBy(10)
    expect(harness.getLightState(lights[0].id)?.tilt).toBeDefined()

    harness.sequencer.removeAllEffects()
    harness.advanceBy(10)

    expect(listener).toHaveBeenCalledTimes(1)
    expect(harness.sequencer.getMotionPattern('sweep')).toBeUndefined()
    expect(harness.getLightState(lights[0].id)?.tilt).toBeUndefined()
  })

  it('an unsubscribed listener hears nothing more', () => {
    const listener = jest.fn()
    const unsubscribe = harness.sequencer.onMotionPatternsCleared(listener)

    harness.sequencer.removeAllEffects()
    unsubscribe()
    harness.sequencer.removeAllEffects()

    expect(listener).toHaveBeenCalledTimes(1)
  })
})
