import { describe, expect, it } from '@jest/globals'
import { MotionPatternEngine } from '../../controllers/sequencer/MotionPatternEngine'
import type { ResolvedMotionPatternSetting } from '../../cues/node/compiler/ActionEffectFactory'
import { LightTransitionController } from '../../controllers/sequencer/LightTransitionController'
import { LightStateManager } from '../../controllers/sequencer/LightStateManager'
import type { FixtureConfig } from '../../types'

/** Mirrors Photonics app-data moving-head calibration (edge pan home on 540° range). */
const edgeHomeFixture: FixtureConfig = {
  panHome: 100,
  panMin: 0,
  panMax: 255,
  panRangeDeg: 540,
  panDirectionCW: true,
  panStageDeg: 540,
  tiltHome: 29,
  tiltMin: 0,
  tiltMax: 255,
  tiltRangeDeg: 180,
  tiltStageDeg: 90,
  invertPan: true,
  invertTilt: true,
}

const pendulumResolved: ResolvedMotionPatternSetting = {
  pattern: 'pendulum',
  speedHz: 1,
  sizeDeg: 25,
  fanSpreadDeg: 0,
  panWaveform: 'sine',
  tiltWaveform: 'cosine',
  panAmplitudeDeg: 25,
  tiltAmplitudeDeg: 25,
  panPhaseOffsetDeg: 0,
  panFreqMultiplier: 1,
  tiltFreqMultiplier: 2,
  linearSweepAxis: 'horizontal',
  gimbalCompensation: false,
  bearingDeg: 180,
  reverse: false,
}

const circleEdgeResolved: ResolvedMotionPatternSetting = {
  pattern: 'circle',
  speedHz: 1,
  sizeDeg: 25,
  fanSpreadDeg: 0,
  panWaveform: 'sine',
  tiltWaveform: 'cosine',
  panAmplitudeDeg: 25,
  tiltAmplitudeDeg: 25,
  panPhaseOffsetDeg: 0,
  panFreqMultiplier: 1,
  tiltFreqMultiplier: 2,
  linearSweepAxis: 'horizontal',
  gimbalCompensation: true,
  bearingDeg: 180,
  reverse: false,
}

const lowerEdgeFixture: FixtureConfig = {
  panHome: 0,
  panMin: 0,
  panMax: 255,
  panRangeDeg: 540,
  panDirectionCW: true,
  panStageDeg: 0,
  tiltHome: 29,
  tiltMin: 0,
  tiltMax: 255,
  tiltRangeDeg: 180,
  tiltStageDeg: 90,
  invertPan: false,
  invertTilt: true,
}

describe('MotionPatternEngine edge-home pan', () => {
  it('pendulum keeps pan near home (no 205° motor wrap to ~37%) when panHome is at range max', () => {
    const lsm = new LightStateManager()
    const ltc = new LightTransitionController(lsm)
    const engine = new MotionPatternEngine(ltc)
    const light = {
      id: 'mh-edge',
      position: 1,
      config: edgeHomeFixture,
    }

    engine.addPattern({
      name: 'pend-edge',
      config: pendulumResolved,
      lights: [light],
      layer: 120,
      startTime: 0,
      rampUpDurationMs: 800,
    })

    const wrapSymptomPct = (205 / 540) * 100

    for (let i = 0; i < 400; i++) {
      engine.advanceFrame({ frameStartTime: i * 25, deltaTime: 25, frameIndex: i })
      const state = ltc.getLightState(light.id, 120)
      expect(state.pan).toBeDefined()
      expect(state.pan!).toBeGreaterThan(wrapSymptomPct + 5)
    }
  })

  it('gimbal circle keeps pan above wrap band when panHome is at range max', () => {
    const lsm = new LightStateManager()
    const ltc = new LightTransitionController(lsm)
    const engine = new MotionPatternEngine(ltc)
    const light = {
      id: 'mh-edge-circle',
      position: 1,
      config: edgeHomeFixture,
    }

    engine.addPattern({
      name: 'circle-edge',
      config: circleEdgeResolved,
      lights: [light],
      layer: 121,
      startTime: 0,
      rampUpDurationMs: 800,
    })

    const wrapSymptomPct = (205 / 540) * 100

    for (let i = 0; i < 400; i++) {
      engine.advanceFrame({ frameStartTime: i * 25, deltaTime: 25, frameIndex: i })
      const state = ltc.getLightState(light.id, 121)
      expect(state.pan).toBeDefined()
      expect(state.pan!).toBeGreaterThan(wrapSymptomPct + 5)
    }
  })

  it('pendulum keeps pan low when panHome is at range min (no wrap toward ~62%)', () => {
    const lsm = new LightStateManager()
    const ltc = new LightTransitionController(lsm)
    const engine = new MotionPatternEngine(ltc)
    const light = {
      id: 'mh-lower-edge',
      position: 1,
      config: lowerEdgeFixture,
    }

    engine.addPattern({
      name: 'pend-lower',
      config: pendulumResolved,
      lights: [light],
      layer: 122,
      startTime: 0,
      rampUpDurationMs: 800,
    })

    const wrapSymptomPct = (335 / 540) * 100

    for (let i = 0; i < 400; i++) {
      engine.advanceFrame({ frameStartTime: i * 25, deltaTime: 25, frameIndex: i })
      const state = ltc.getLightState(light.id, 122)
      expect(state.pan).toBeDefined()
      expect(state.pan!).toBeLessThan(wrapSymptomPct - 5)
      const maxNearHomePct = (25 / 540) * 100 + 2
      expect(state.pan!).toBeLessThan(maxNearHomePct)
    }
  })
})
