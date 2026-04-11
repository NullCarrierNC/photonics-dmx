import { describe, expect, it } from '@jest/globals'
import {
  mirrorDmxForMovingHeadInvert,
  percentToDmx,
} from '../../../photonics-dmx/helpers/dmxHelpers'
import { panTiltDmxToSphericalXY, panTiltDmxToWizardMotorSpaceXY } from './lightsDmxPreviewMath'
import type { FixtureConfig } from '../../../photonics-dmx/types'

const fixture: FixtureConfig = {
  panHome: 50,
  panMin: 0,
  panMax: 255,
  panRangeDeg: 540,
  panDirectionCW: true,
  panStageDeg: 270,
  tiltHome: 50,
  tiltMin: 0,
  tiltMax: 255,
  tiltRangeDeg: 180,
  tiltStageDeg: 135,
  invertPan: false,
  invertTilt: false,
}

describe('panTiltDmxToWizardMotorSpaceXY', () => {
  it('maps tilt % linearly to radius so half the slider range uses half the disc radius', () => {
    const panDmx = percentToDmx(50, 0, 255)
    const low = panTiltDmxToWizardMotorSpaceXY(panDmx, percentToDmx(25, 0, 255), fixture)
    const high = panTiltDmxToWizardMotorSpaceXY(panDmx, percentToDmx(75, 0, 255), fixture)
    const rLow = Math.hypot(low.xPct - 50, low.yPct - 50)
    const rHigh = Math.hypot(high.xPct - 50, high.yPct - 50)
    expect(rHigh / rLow).toBeCloseTo(3, 0)
  })

  it('uses pan motor degrees mod 360 for compass angle on wide pan ranges', () => {
    const wide: FixtureConfig = { ...fixture, panRangeDeg: 540 }
    const panFull = panTiltDmxToWizardMotorSpaceXY(percentToDmx(100, 0, 255), 0, wide)
    const panZero = panTiltDmxToWizardMotorSpaceXY(0, 0, wide)
    expect(Math.hypot(panFull.xPct - 50, panFull.yPct - 50)).toBeLessThan(0.1)
    expect(Math.hypot(panZero.xPct - 50, panZero.yPct - 50)).toBeLessThan(0.1)
  })
})

describe('panTiltDmxToSphericalXY', () => {
  it('places pan at panStageDeg with tilt at pole at disc centre (stage upstage reference)', () => {
    const upstage: FixtureConfig = {
      panHome: 0,
      panMin: 0,
      panMax: 255,
      panRangeDeg: 540,
      panDirectionCW: false,
      panStageDeg: 0,
      tiltHome: 50,
      tiltMin: 0,
      tiltMax: 255,
      tiltRangeDeg: 180,
      tiltStageDeg: 90,
      invertPan: false,
      invertTilt: false,
    }
    const panDmx = percentToDmx(0, 0, 255)
    const tiltDmx = percentToDmx((upstage.tiltStageDeg / upstage.tiltRangeDeg) * 100, 0, 255)
    const point = panTiltDmxToSphericalXY(panDmx, tiltDmx, upstage)
    expect(Math.abs(point.xPct - 50)).toBeLessThan(0.2)
    expect(Math.abs(point.yPct - 50)).toBeLessThan(0.2)
  })

  it('uses calibrated tiltStageDeg as the default vertical pole', () => {
    const tiltDmx = percentToDmx((fixture.tiltStageDeg / fixture.tiltRangeDeg) * 100, 0, 255)
    const point = panTiltDmxToSphericalXY(0, tiltDmx, fixture)
    expect(Math.abs(point.xPct - 50)).toBeLessThan(0.1)
    expect(Math.abs(point.yPct - 50)).toBeLessThan(0.1)
  })

  it('poleDegOverride shifts vertical pole used for φ and radius', () => {
    const tiltDmx = percentToDmx((fixture.tiltStageDeg / fixture.tiltRangeDeg) * 100, 0, 255)
    const atSavedPole = panTiltDmxToSphericalXY(0, tiltDmx, fixture)
    expect(Math.hypot(atSavedPole.xPct - 50, atSavedPole.yPct - 50)).toBeLessThan(0.2)
    const overridePoleDeg = fixture.tiltStageDeg - 30
    const withOverride = panTiltDmxToSphericalXY(0, tiltDmx, fixture, {
      poleDegOverride: overridePoleDeg,
    })
    expect(Math.hypot(withOverride.xPct - 50, withOverride.yPct - 50)).toBeGreaterThan(1)
  })

  it('up-firing: horizontal beam uses stage bearing (US at panStage, DS/SL from motor + panDir)', () => {
    const upfire: FixtureConfig = {
      panHome: 0,
      panMin: 0,
      panMax: 255,
      panRangeDeg: 540,
      panDirectionCW: false,
      panStageDeg: 0,
      tiltHome: 50,
      tiltMin: 0,
      tiltMax: 255,
      tiltRangeDeg: 180,
      tiltStageDeg: 90,
      invertPan: false,
      invertTilt: false,
    }
    const tiltHorizontalDmx = percentToDmx(0, 0, 255)
    // Motor at panStage → bearing 0 (upstage) → US label (top of disc, low yPct).
    const panUpstage = panTiltDmxToSphericalXY(percentToDmx(0, 0, 255), tiltHorizontalDmx, upfire)
    expect(panUpstage.yPct).toBeLessThan(10)
    expect(Math.abs(panUpstage.xPct - 50)).toBeLessThan(8)
    // Downstage = 180° bearing → motor = panStageDeg + panDir * 180 = 180° (panDir -1).
    const panDownstage = panTiltDmxToSphericalXY(
      percentToDmx((180 / upfire.panRangeDeg) * 100, 0, 255),
      tiltHorizontalDmx,
      upfire,
    )
    expect(panDownstage.yPct).toBeGreaterThan(95)
    expect(Math.abs(panDownstage.xPct - 50)).toBeLessThan(8)
    // Stage-left = 270° bearing → motor = panStageDeg + panDir * 270 = 90°.
    const panStageLeft = panTiltDmxToSphericalXY(
      percentToDmx((90 / upfire.panRangeDeg) * 100, 0, 255),
      tiltHorizontalDmx,
      upfire,
    )
    expect(panStageLeft.xPct).toBeLessThan(15)
    expect(Math.abs(panStageLeft.yPct - 50)).toBeLessThan(8)
  })

  it('non-zero panStageDeg: same bearing maps to different motor when stage anchor shifts', () => {
    const cfg: FixtureConfig = {
      panHome: 50,
      panMin: 0,
      panMax: 255,
      panRangeDeg: 540,
      panDirectionCW: true,
      panStageDeg: 90,
      tiltHome: 50,
      tiltMin: 0,
      tiltMax: 255,
      tiltRangeDeg: 180,
      tiltStageDeg: 90,
      invertPan: false,
      invertTilt: false,
    }
    const tiltHorizontalDmx = percentToDmx(0, 0, 255)
    // Bearing 0 (upstage) requires motor 90 when panStage=90 and panDir=+1.
    const upstage = panTiltDmxToSphericalXY(
      percentToDmx((90 / cfg.panRangeDeg) * 100, 0, 255),
      tiltHorizontalDmx,
      cfg,
    )
    expect(upstage.yPct).toBeLessThan(10)
    // Same motor 90 would have been stage-right if panStage were 0 with panDir +1.
    const refZeroStage: FixtureConfig = { ...cfg, panStageDeg: 0 }
    const ifZeroStage = panTiltDmxToSphericalXY(
      percentToDmx((90 / cfg.panRangeDeg) * 100, 0, 255),
      tiltHorizontalDmx,
      refZeroStage,
    )
    expect(ifZeroStage.xPct).toBeGreaterThan(90)
  })

  it('down-firing: ±φ with same |φ| and same stage bearing mirrors dot through disc centre', () => {
    const cfg: FixtureConfig = {
      panHome: 0,
      panMin: 0,
      panMax: 255,
      panRangeDeg: 540,
      panDirectionCW: false,
      panStageDeg: 0,
      tiltHome: 50,
      tiltMin: 0,
      tiltMax: 255,
      tiltRangeDeg: 180,
      tiltStageDeg: 90,
      invertPan: true,
      invertTilt: true,
    }
    const panLogical = percentToDmx((180 / cfg.panRangeDeg) * 100, 0, 255)
    const tiltBelowLogical = percentToDmx((45 / cfg.tiltRangeDeg) * 100, 0, 255)
    const tiltAboveLogical = percentToDmx((135 / cfg.tiltRangeDeg) * 100, 0, 255)
    const panDownstageDmx = mirrorDmxForMovingHeadInvert(panLogical, 0, 255)
    const belowPoleTiltDmx = mirrorDmxForMovingHeadInvert(tiltBelowLogical, 0, 255)
    const abovePoleTiltDmx = mirrorDmxForMovingHeadInvert(tiltAboveLogical, 0, 255)
    const below = panTiltDmxToSphericalXY(panDownstageDmx, belowPoleTiltDmx, cfg)
    const above = panTiltDmxToSphericalXY(panDownstageDmx, abovePoleTiltDmx, cfg)
    expect(below.xPct).toBeCloseTo(-(above.xPct - 50) + 50, 5)
    expect(below.yPct).toBeCloseTo(-(above.yPct - 50) + 50, 5)
  })

  it('down-firing (invertPan/invertTilt): same logical aim as non-inverted preview', () => {
    const base: FixtureConfig = {
      panHome: 0,
      panMin: 0,
      panMax: 255,
      panRangeDeg: 540,
      panDirectionCW: false,
      panStageDeg: 0,
      tiltHome: 50,
      tiltMin: 0,
      tiltMax: 255,
      tiltRangeDeg: 180,
      tiltStageDeg: 90,
      invertPan: false,
      invertTilt: false,
    }
    const inverted: FixtureConfig = { ...base, invertPan: true, invertTilt: true }
    const logicalPanDmx = percentToDmx(0, 0, 255)
    const logicalTiltDmx = percentToDmx(0, 0, 255)
    const rawPan = mirrorDmxForMovingHeadInvert(logicalPanDmx, 0, 255)
    const rawTilt = mirrorDmxForMovingHeadInvert(logicalTiltDmx, 0, 255)
    const a = panTiltDmxToSphericalXY(logicalPanDmx, logicalTiltDmx, base)
    const b = panTiltDmxToSphericalXY(rawPan, rawTilt, inverted)
    expect(a.xPct).toBeCloseTo(b.xPct, 5)
    expect(a.yPct).toBeCloseTo(b.yPct, 5)
  })

  it('down-firing (Nod-like tilt above pole): same preview as up-firing for same logical pan/tilt', () => {
    const base: FixtureConfig = {
      panHome: 0,
      panMin: 0,
      panMax: 255,
      panRangeDeg: 540,
      panDirectionCW: false,
      panStageDeg: 0,
      tiltHome: 50,
      tiltMin: 0,
      tiltMax: 255,
      tiltRangeDeg: 180,
      tiltStageDeg: 90,
      invertPan: false,
      invertTilt: false,
    }
    const inverted: FixtureConfig = { ...base, invertPan: true, invertTilt: true }
    const panLogical = percentToDmx((180 / base.panRangeDeg) * 100, 0, 255)
    const tiltAboveLogical = percentToDmx((135 / base.tiltRangeDeg) * 100, 0, 255)
    const rawPan = mirrorDmxForMovingHeadInvert(panLogical, 0, 255)
    const rawTilt = mirrorDmxForMovingHeadInvert(tiltAboveLogical, 0, 255)
    const up = panTiltDmxToSphericalXY(panLogical, tiltAboveLogical, base)
    const down = panTiltDmxToSphericalXY(rawPan, rawTilt, inverted)
    expect(up.xPct).toBeCloseTo(down.xPct, 5)
    expect(up.yPct).toBeCloseTo(down.yPct, 5)
  })

  it('down-firing: horizontal beam matches stage bearing like up-firing (mirrored raw DMX)', () => {
    const base: FixtureConfig = {
      panHome: 0,
      panMin: 0,
      panMax: 255,
      panRangeDeg: 540,
      panDirectionCW: false,
      panStageDeg: 0,
      tiltHome: 50,
      tiltMin: 0,
      tiltMax: 255,
      tiltRangeDeg: 180,
      tiltStageDeg: 90,
      invertPan: true,
      invertTilt: true,
    }
    const tiltHorizontalLogical = percentToDmx(0, 0, 255)
    const tiltHorizontalRaw = mirrorDmxForMovingHeadInvert(tiltHorizontalLogical, 0, 255)
    const panUpstageRaw = mirrorDmxForMovingHeadInvert(percentToDmx(0, 0, 255), 0, 255)
    const panDownstageRaw = mirrorDmxForMovingHeadInvert(
      percentToDmx((180 / base.panRangeDeg) * 100, 0, 255),
      0,
      255,
    )
    const panStageLeftRaw = mirrorDmxForMovingHeadInvert(
      percentToDmx((90 / base.panRangeDeg) * 100, 0, 255),
      0,
      255,
    )
    const panUpstage = panTiltDmxToSphericalXY(panUpstageRaw, tiltHorizontalRaw, base)
    expect(panUpstage.yPct).toBeLessThan(10)
    expect(Math.abs(panUpstage.xPct - 50)).toBeLessThan(8)
    const panDownstage = panTiltDmxToSphericalXY(panDownstageRaw, tiltHorizontalRaw, base)
    expect(panDownstage.yPct).toBeGreaterThan(95)
    expect(Math.abs(panDownstage.xPct - 50)).toBeLessThan(8)
    const panStageLeft = panTiltDmxToSphericalXY(panStageLeftRaw, tiltHorizontalRaw, base)
    expect(panStageLeft.xPct).toBeLessThan(15)
    expect(Math.abs(panStageLeft.yPct - 50)).toBeLessThan(8)
  })

  it('mixed invertPan/invertTilt uses up-firing-style φ sign coupling (tilt-only invert)', () => {
    const cfg: FixtureConfig = {
      panHome: 0,
      panMin: 0,
      panMax: 255,
      panRangeDeg: 540,
      panDirectionCW: false,
      panStageDeg: 0,
      tiltHome: 50,
      tiltMin: 0,
      tiltMax: 255,
      tiltRangeDeg: 180,
      tiltStageDeg: 90,
      invertPan: false,
      invertTilt: true,
    }
    const tiltHorizontalLogical = percentToDmx(0, 0, 255)
    const tiltRaw = mirrorDmxForMovingHeadInvert(tiltHorizontalLogical, 0, 255)
    const panUpstage = panTiltDmxToSphericalXY(percentToDmx(0, 0, 255), tiltRaw, cfg)
    expect(panUpstage.yPct).toBeLessThan(10)
    expect(Math.abs(panUpstage.xPct - 50)).toBeLessThan(8)
  })

  it('uses asymmetric radius around a non-centered calibrated vertical pole', () => {
    const asymmetricFixture: FixtureConfig = {
      ...fixture,
      tiltRangeDeg: 180,
      tiltStageDeg: 135,
    }
    const belowPoleDmx = percentToDmx(((asymmetricFixture.tiltStageDeg - 45) / 180) * 100, 0, 255)
    const abovePoleDmx = percentToDmx(((asymmetricFixture.tiltStageDeg + 45) / 180) * 100, 0, 255)
    const belowPole = panTiltDmxToSphericalXY(0, belowPoleDmx, asymmetricFixture)
    const abovePole = panTiltDmxToSphericalXY(0, abovePoleDmx, asymmetricFixture)
    const belowRadius = Math.hypot(belowPole.xPct - 50, belowPole.yPct - 50)
    const aboveRadius = Math.hypot(abovePole.xPct - 50, abovePole.yPct - 50)
    expect(belowRadius).toBeCloseTo(16.67, 0)
    expect(aboveRadius).toBeCloseTo(50, 0)
  })
})
