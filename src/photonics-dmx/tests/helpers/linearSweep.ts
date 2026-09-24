import { MotionPatternEngine } from '../../controllers/sequencer/MotionPatternEngine'
import { LightTransitionController } from '../../controllers/sequencer/LightTransitionController'
import { LightStateManager } from '../../controllers/sequencer/LightStateManager'
import type { ResolvedMotionPatternSetting } from '../../cues/node/compiler/ActionEffectFactory'
import type { FixtureConfig } from '../../types'

/** A floor head with its pan home a few degrees off the calibrated upstage reference. */
export const userRigFixture: FixtureConfig = {
  panHome: 66,
  panMin: 0,
  panMax: 255,
  panRangeDeg: 540,
  panDirectionCW: false,
  panStageDeg: 360,
  tiltHome: 76,
  tiltMin: 0,
  tiltMax: 255,
  tiltRangeDeg: 180,
  tiltStageDeg: 90,
  invertPan: false,
  invertTilt: false,
}

export const SWEEP_SIZE_DEG = 20
const SPEED_HZ = 2
const FRAMES_PER_PERIOD = 16

function linearSweep(axis: 'vertical' | 'horizontal'): ResolvedMotionPatternSetting {
  return {
    pattern: 'linear-sweep',
    speedHz: SPEED_HZ,
    sizeDeg: SWEEP_SIZE_DEG,
    fanSpreadDeg: 0,
    panWaveform: 'sine',
    tiltWaveform: 'sine',
    panAmplitudeDeg: axis === 'horizontal' ? SWEEP_SIZE_DEG : 0,
    tiltAmplitudeDeg: axis === 'vertical' ? SWEEP_SIZE_DEG : 0,
    panPhaseOffsetDeg: 0,
    panFreqMultiplier: 1,
    tiltFreqMultiplier: 1,
    linearSweepAxis: axis,
    gimbalCompensation: false,
    bearingDeg: 180,
    reverse: false,
  }
}

/** Pan and tilt percent the engine writes across one period of the sweep. */
export function sweepFrames(
  config: FixtureConfig,
  axis: 'vertical' | 'horizontal',
): Array<{ pan: number; tilt: number }> {
  const ltc = new LightTransitionController(new LightStateManager())
  const engine = new MotionPatternEngine(ltc)
  const light = { id: 'mh', position: 1, config }
  engine.addPattern({
    name: 'sweep',
    config: linearSweep(axis),
    lights: [light],
    layer: 120,
    startTime: 0,
    rampUpDurationMs: 0,
  })
  const periodMs = 1000 / SPEED_HZ
  const frames: Array<{ pan: number; tilt: number }> = []
  for (let i = 0; i < FRAMES_PER_PERIOD; i++) {
    const frameStartTime = (i * periodMs) / FRAMES_PER_PERIOD
    engine.advanceFrame({ frameStartTime, deltaTime: periodMs / FRAMES_PER_PERIOD, frameIndex: i })
    const state = ltc.getLightState(light.id, 120)
    frames.push({ pan: state.pan!, tilt: state.tilt! })
  }
  return frames
}
