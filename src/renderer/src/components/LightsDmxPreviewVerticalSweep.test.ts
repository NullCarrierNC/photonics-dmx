import { describe, expect, it } from '@jest/globals'
import { percentToDmx } from '../../../photonics-dmx/helpers/dmxHelpers'
import {
  DEFAULT_MOVING_HEAD_FIXTURE_CONFIG,
  type FixtureConfig,
} from '../../../photonics-dmx/types'
import { panTiltDmxToSphericalXY } from './lightsDmxPreviewMath'

const userRig: FixtureConfig = {
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

/** Disc points for a tilt sweep of about 20 degrees either side of home at the pan home. */
function nodPoints(cfg: FixtureConfig): Array<{ xPct: number; yPct: number }> {
  const panDmx = percentToDmx(cfg.panHome, cfg.panMin, cfg.panMax)
  const sizePct = (20 / cfg.tiltRangeDeg) * 100
  return [-1, -0.5, 0, 0.5, 1].map((k) => {
    const tiltDmx = percentToDmx(cfg.tiltHome + k * sizePct, cfg.tiltMin, cfg.tiltMax)
    return panTiltDmxToSphericalXY(panDmx, tiltDmx, cfg)
  })
}

function span(values: number[]): number {
  return Math.max(...values) - Math.min(...values)
}

describe('vertical sweep projection', () => {
  it('nods straight up and down the disc for the default fixture, whose pan home is its upstage reference', () => {
    const points = nodPoints(DEFAULT_MOVING_HEAD_FIXTURE_CONFIG as FixtureConfig)

    // Within the DMX byte's rounding of the pan home.
    for (const point of points) {
      expect(Math.abs(point.xPct - 50)).toBeLessThan(1)
    }
    expect(span(points.map((point) => point.yPct))).toBeGreaterThan(10)
  })

  it('stays close to vertical for a pan home a few degrees off upstage', () => {
    const points = nodPoints(userRig)

    for (const point of points) {
      expect(Math.abs(point.xPct - 50)).toBeLessThan(10)
    }
    expect(span(points.map((point) => point.yPct))).toBeGreaterThan(10)
  })

  it('crosses the disc sideways when the pan home is a quarter turn off the upstage reference', () => {
    const quarterTurnOff: FixtureConfig = { ...userRig, panStageDeg: userRig.panStageDeg - 90 }
    const points = nodPoints(quarterTurnOff)

    expect(span(points.map((point) => point.xPct))).toBeGreaterThan(10)
    expect(span(points.map((point) => point.yPct))).toBeLessThan(5)
  })
})
