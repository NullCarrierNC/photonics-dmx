import { describe, expect, it } from '@jest/globals'
import { DEFAULT_MOVING_HEAD_FIXTURE_CONFIG, type FixtureConfig } from '../../types'
import { SWEEP_SIZE_DEG, sweepFrames, userRigFixture } from '../helpers/linearSweep'

describe.each([
  ['default fixture', DEFAULT_MOVING_HEAD_FIXTURE_CONFIG as FixtureConfig],
  ['user rig', userRigFixture],
])('linear sweep on the %s', (_label, config) => {
  it('vertical: pan holds at home on every frame while tilt sweeps the size around its home', () => {
    const frames = sweepFrames(config, 'vertical')

    for (const frame of frames) {
      expect(frame.pan).toBeCloseTo(config.panHome, 6)
    }
    const tilts = frames.map((frame) => frame.tilt)
    const sizePct = (SWEEP_SIZE_DEG / config.tiltRangeDeg) * 100
    expect(Math.max(...tilts) - Math.min(...tilts)).toBeCloseTo(2 * sizePct, 3)
    expect(Math.max(...tilts) - config.tiltHome).toBeCloseTo(
      config.tiltHome - Math.min(...tilts),
      3,
    )
  })

  it('horizontal: tilt holds at home on every frame while pan sweeps', () => {
    const frames = sweepFrames(config, 'horizontal')

    for (const frame of frames) {
      expect(frame.tilt).toBeCloseTo(config.tiltHome, 6)
    }
    const pans = frames.map((frame) => frame.pan)
    expect(Math.max(...pans) - Math.min(...pans)).toBeGreaterThan(1)
  })
})
