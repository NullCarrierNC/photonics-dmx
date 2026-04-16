import { describe, expect, it } from '@jest/globals'
import {
  mirrorDmxForMovingHeadInvert,
  percentToDmx,
} from '../../../photonics-dmx/helpers/dmxHelpers'
import type { FixtureConfig } from '../../../photonics-dmx/types'
import { panTiltDmxToSphericalXY } from './lightsDmxPreviewMath'
import {
  isCeilingMountMovingHead,
  panTiltDmxToStageVector,
  staticWashBeamDirection,
} from './lightsDmxPreview3DMath'

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

function expectUnit(v: { x: number; y: number; z: number }): void {
  expect(Math.hypot(v.x, v.y, v.z)).toBeCloseTo(1, 5)
}

/** Same convention as 2D preview disc vs 3D stage axes (see panTiltDmxToStageVector). */
function assertDiscMatchesStageVector(panDmx: number, tiltDmx: number, cfg: FixtureConfig): void {
  const { xPct, yPct } = panTiltDmxToSphericalXY(panDmx, tiltDmx, cfg)
  const v = panTiltDmxToStageVector(panDmx, tiltDmx, cfg)
  const r = Math.hypot(xPct - 50, yPct - 50)
  if (r < 3) {
    return
  }
  const discUx = (xPct - 50) / 50
  const discUy = (yPct - 50) / 50
  const discHoriz = Math.hypot(discUx, discUy)
  if (discHoriz < 0.06) {
    return
  }
  const expectZSign = Math.sign(discUy)
  const expectXSign = -Math.sign(discUx)
  expect(Math.sign(v.z)).toBe(expectZSign)
  expect(Math.sign(v.x)).toBe(expectXSign)
}

describe('panTiltDmxToStageVector', () => {
  it('is unit length for typical fixture', () => {
    const panDmx = percentToDmx(50, 0, 255)
    const tiltDmx = percentToDmx(50, 0, 255)
    expectUnit(panTiltDmxToStageVector(panDmx, tiltDmx, fixture))
  })

  it('up-firing horizontal: upstage beam is toward −z', () => {
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
    const v = panTiltDmxToStageVector(percentToDmx(0, 0, 255), tiltHorizontalDmx, upfire)
    expectUnit(v)
    expect(Math.abs(v.y)).toBeLessThan(0.05)
    expect(v.z).toBeLessThan(-0.9)
    expect(Math.abs(v.x)).toBeLessThan(0.15)
  })

  it('up-firing horizontal: downstage beam is toward +z', () => {
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
    const v = panTiltDmxToStageVector(
      percentToDmx((180 / upfire.panRangeDeg) * 100, 0, 255),
      tiltHorizontalDmx,
      upfire,
    )
    expectUnit(v)
    expect(Math.abs(v.y)).toBeLessThan(0.05)
    expect(v.z).toBeGreaterThan(0.9)
  })

  it('up-firing horizontal: motor 90° (270° bearing, stage-left) beam is toward −x on stage', () => {
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
    const v = panTiltDmxToStageVector(
      percentToDmx((90 / upfire.panRangeDeg) * 100, 0, 255),
      tiltHorizontalDmx,
      upfire,
    )
    expectUnit(v)
    expect(Math.abs(v.y)).toBeLessThan(0.05)
    expect(v.x).toBeLessThan(-0.85)
  })

  it('at pole: beam is straight up (+y)', () => {
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
    const v = panTiltDmxToStageVector(panDmx, tiltDmx, upstage)
    expectUnit(v)
    expect(v.y).toBeGreaterThan(0.99)
    expect(Math.abs(v.x)).toBeLessThan(0.02)
    expect(Math.abs(v.z)).toBeLessThan(0.02)
  })

  it('poleDegOverride shifts vertical away from straight up', () => {
    const tiltDmx = percentToDmx((fixture.tiltStageDeg / fixture.tiltRangeDeg) * 100, 0, 255)
    const atSavedPole = panTiltDmxToStageVector(0, tiltDmx, fixture)
    expect(Math.hypot(atSavedPole.x, atSavedPole.z)).toBeLessThan(0.02)
    const overridePoleDeg = fixture.tiltStageDeg - 30
    const withOverride = panTiltDmxToStageVector(0, tiltDmx, fixture, {
      poleDegOverride: overridePoleDeg,
    })
    expect(Math.hypot(withOverride.x, withOverride.z)).toBeGreaterThan(0.05)
  })

  it('3D horizontal signs match 2D disc (floor up-firing)', () => {
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
    const tiltH = percentToDmx(0, 0, 255)
    for (const panPct of [0, 25, 50, 75, 100]) {
      const panDmx = percentToDmx((panPct / upfire.panRangeDeg) * 100, 0, 255)
      assertDiscMatchesStageVector(panDmx, tiltH, upfire)
    }
  })

  it('3D horizontal signs match 2D disc (truss invertPan/invertTilt)', () => {
    const truss: FixtureConfig = {
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
      invertPan: true,
      invertTilt: true,
    }
    const tiltH = percentToDmx((truss.tiltStageDeg / truss.tiltRangeDeg) * 100, 0, 255)
    for (const panPct of [10, 30, 50, 70, 90]) {
      const panDmx = percentToDmx(panPct, 0, 255)
      assertDiscMatchesStageVector(panDmx, tiltH, truss)
    }
  })

  it('3D horizontal signs match 2D disc when flipPhi applies (tiltStage mid + tiltHome away from 50)', () => {
    const flipPhiCfg: FixtureConfig = {
      panHome: 50,
      panMin: 0,
      panMax: 255,
      panRangeDeg: 540,
      panDirectionCW: true,
      panStageDeg: 270,
      tiltHome: 40,
      tiltMin: 0,
      tiltMax: 255,
      tiltRangeDeg: 180,
      tiltStageDeg: 90,
      invertPan: false,
      invertTilt: true,
    }
    for (const tiltPct of [15, 35, 55, 75]) {
      const tiltDmx = percentToDmx(tiltPct, 0, 255)
      for (const panPct of [20, 45, 70]) {
        const panDmx = percentToDmx(panPct, 0, 255)
        assertDiscMatchesStageVector(panDmx, tiltDmx, flipPhiCfg)
      }
    }
  })

  it('truss at home points straight down (−y)', () => {
    const truss: FixtureConfig = {
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
      tiltStageDeg: 90,
      invertPan: true,
      invertTilt: true,
    }
    const panDmx = percentToDmx(50, 0, 255)
    const tiltDmx = percentToDmx(50, 0, 255)
    const v = panTiltDmxToStageVector(panDmx, tiltDmx, truss)
    expectUnit(v)
    expect(v.y).toBeLessThan(-0.99)
    expect(Math.abs(v.x)).toBeLessThan(0.02)
    expect(Math.abs(v.z)).toBeLessThan(0.02)
  })

  it('truss horizontal: beam near horizontal (|y| small), xz matches disc', () => {
    const truss: FixtureConfig = {
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
      tiltStageDeg: 90,
      invertPan: true,
      invertTilt: true,
    }
    const tiltRawHorizontal = mirrorDmxForMovingHeadInvert(percentToDmx(0, 0, 255), 0, 255)
    const panDmx = percentToDmx(50, 0, 255)
    const v = panTiltDmxToStageVector(panDmx, tiltRawHorizontal, truss)
    expectUnit(v)
    expect(Math.abs(v.y)).toBeLessThan(0.1)
    assertDiscMatchesStageVector(panDmx, tiltRawHorizontal, truss)
  })
})

describe('staticWashBeamDirection', () => {
  it('floor mount aims up and downstage (normalized)', () => {
    const v = staticWashBeamDirection('floor')
    expectUnit(v)
    expect(v.y).toBeGreaterThan(0.5)
    expect(v.z).toBeGreaterThan(0.5)
  })

  it('ceiling mount aims down and downstage (normalized)', () => {
    const v = staticWashBeamDirection('ceiling')
    expectUnit(v)
    expect(v.y).toBeLessThan(-0.5)
    expect(v.z).toBeGreaterThan(0.5)
  })
})

describe('isCeilingMountMovingHead', () => {
  it('is true only when both invert flags are set', () => {
    expect(isCeilingMountMovingHead({ ...fixture, invertPan: false, invertTilt: false })).toBe(
      false,
    )
    expect(isCeilingMountMovingHead({ ...fixture, invertPan: true, invertTilt: false })).toBe(false)
    expect(isCeilingMountMovingHead({ ...fixture, invertPan: false, invertTilt: true })).toBe(false)
    expect(isCeilingMountMovingHead({ ...fixture, invertPan: true, invertTilt: true })).toBe(true)
  })
})
