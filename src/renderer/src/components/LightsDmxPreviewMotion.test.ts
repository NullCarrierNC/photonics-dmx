import { describe, expect, it } from '@jest/globals'
import { gimbalCompensatedPanTiltOffsetsDeg } from '../../../photonics-dmx/controllers/sequencer/MotionPatternEngine'
import {
  logicalPanDir,
  mirrorDmxForMovingHeadInvert,
  percentToDmx,
} from '../../../photonics-dmx/helpers/dmxHelpers'
import { pickAliasedPanMotorDeg } from '../../../photonics-dmx/helpers/panMotorAlias'
import { resolvePositionToAbsolutePercent } from '../../../photonics-dmx/cues/node/compiler/ActionEffectFactory'
import { normalizeFixtureConfig, type FixtureConfig } from '../../../photonics-dmx/types'
import { panTiltDmxToSphericalXY, panTiltDmxToWizardMotorSpaceXY } from './lightsDmxPreviewMath'

const TWO_PI = Math.PI * 2

function motorToRawDmx(
  panMotorDeg: number,
  tiltMotorDeg: number,
  c: FixtureConfig,
): {
  panDmx: number
  tiltDmx: number
} {
  const cfg = normalizeFixtureConfig(c)
  const panPct = (panMotorDeg / cfg.panRangeDeg) * 100
  const tiltPct = (tiltMotorDeg / cfg.tiltRangeDeg) * 100
  let panDmx = percentToDmx(panPct, cfg.panMin, cfg.panMax)
  let tiltDmx = percentToDmx(tiltPct, cfg.tiltMin, cfg.tiltMax)
  if (cfg.invertPan) {
    panDmx = mirrorDmxForMovingHeadInvert(panDmx, cfg.panMin, cfg.panMax)
  }
  if (cfg.invertTilt) {
    tiltDmx = mirrorDmxForMovingHeadInvert(tiltDmx, cfg.tiltMin, cfg.tiltMax)
  }
  return { panDmx, tiltDmx }
}

function offsetsToMotor(
  panOffsetDeg: number,
  tiltOffsetDeg: number,
  c: FixtureConfig,
  preferredPanMotorDeg: number,
): { panMotor: number; tiltMotor: number; nextPref: number } {
  const cfg = normalizeFixtureConfig(c)
  const panDir = logicalPanDir(cfg)
  const panHomeDeg = (cfg.panHome / 100) * cfg.panRangeDeg
  const tiltHomeDeg = (cfg.tiltHome / 100) * cfg.tiltRangeDeg
  const rawPan = panHomeDeg + panDir * panOffsetDeg
  const chosen = pickAliasedPanMotorDeg(
    rawPan,
    cfg.panRangeDeg,
    preferredPanMotorDeg,
    'continuity-clamp',
  )
  const tiltMotor = tiltHomeDeg + tiltOffsetDeg
  return { panMotor: chosen, tiltMotor, nextPref: chosen }
}

describe('logicalPanDir (truss cheap vs expensive)', () => {
  const base: Omit<FixtureConfig, 'panDirectionCW' | 'invertPan'> = {
    panHome: 0,
    panMin: 0,
    panMax: 255,
    panRangeDeg: 540,
    panStageDeg: 0,
    tiltHome: 50,
    tiltMin: 0,
    tiltMax: 255,
    tiltRangeDeg: 180,
    tiltStageDeg: 90,
    invertTilt: true,
  }

  it('cheap truss (no sensor): physical CCW when DMX up → panCW false + invertPan → SL at motor 270°', () => {
    const cfg: FixtureConfig = { ...base, panDirectionCW: false, invertPan: true }
    expect(logicalPanDir(cfg)).toBe(1)
    const { panDmx, tiltDmx } = motorToRawDmx(270, 0, cfg)
    const p = panTiltDmxToSphericalXY(panDmx, tiltDmx, cfg)
    expect(p.xPct).toBeGreaterThan(80)
    expect(Math.abs(p.yPct - 50)).toBeLessThan(10)
  })

  it('expensive truss (sensor): physical CW when DMX up → panCW true + invertPan → SL at motor 90°', () => {
    const cfg: FixtureConfig = { ...base, panDirectionCW: true, invertPan: true }
    expect(logicalPanDir(cfg)).toBe(-1)
    const { panDmx, tiltDmx } = motorToRawDmx(90, 0, cfg)
    const p = panTiltDmxToSphericalXY(panDmx, tiltDmx, cfg)
    expect(p.xPct).toBeGreaterThan(80)
    expect(Math.abs(p.yPct - 50)).toBeLessThan(10)
  })
})

describe('nod through vertical pole', () => {
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

  function yAtTiltMotor(tiltMotor: number, cfg: FixtureConfig): number {
    const { panDmx, tiltDmx } = motorToRawDmx(180, tiltMotor, cfg)
    return panTiltDmxToSphericalXY(panDmx, tiltDmx, cfg).yPct
  }

  it('up-firing: DS → centre → US as tilt crosses pole (pan at DS)', () => {
    const yBelow = yAtTiltMotor(45, upfire)
    const yPole = yAtTiltMotor(90, upfire)
    const yAbove = yAtTiltMotor(135, upfire)
    expect(yBelow).toBeGreaterThan(50)
    expect(Math.abs(yPole - 50)).toBeLessThan(2)
    expect(yAbove).toBeLessThan(50)
  })

  it('down-firing: same trajectory as up-firing for mirrored DMX', () => {
    const inverted: FixtureConfig = { ...upfire, invertPan: true, invertTilt: true }
    for (const tiltMotor of [45, 90, 135]) {
      const a = yAtTiltMotor(tiltMotor, upfire)
      const b = yAtTiltMotor(tiltMotor, inverted)
      expect(a).toBeCloseTo(b, 5)
    }
  })
})

describe('gimbal circle → preview disc', () => {
  const circleCfg: FixtureConfig = {
    panHome: 50,
    panMin: 0,
    panMax: 255,
    panRangeDeg: 540,
    panDirectionCW: false,
    panStageDeg: 270,
    tiltHome: 70,
    tiltMin: 0,
    tiltMax: 255,
    tiltRangeDeg: 180,
    tiltStageDeg: 90,
    invertPan: false,
    invertTilt: false,
  }

  it('samples form near-constant radius from centroid (standard gimbal mode)', () => {
    const n = 16
    const points: { x: number; y: number }[] = []
    let pref = (circleCfg.panHome / 100) * circleCfg.panRangeDeg
    for (let i = 0; i < n; i++) {
      const phase = (i / n) * TWO_PI
      const { panOffsetDeg, tiltOffsetDeg } = gimbalCompensatedPanTiltOffsetsDeg({
        sizeDeg: 12,
        phase,
        ramp: 1,
        fixtureConfig: circleCfg,
        bearingDeg: 180,
        preferredPanMotorDeg: pref,
      })
      const { panMotor, tiltMotor, nextPref } = offsetsToMotor(
        panOffsetDeg,
        tiltOffsetDeg,
        circleCfg,
        pref,
      )
      pref = nextPref
      const { panDmx, tiltDmx } = motorToRawDmx(panMotor, tiltMotor, circleCfg)
      const p = panTiltDmxToSphericalXY(panDmx, tiltDmx, circleCfg)
      points.push({ x: p.xPct, y: p.yPct })
    }
    const cx = points.reduce((s, p) => s + p.x, 0) / n
    const cy = points.reduce((s, p) => s + p.y, 0) / n
    const radii = points.map((p) => Math.hypot(p.x - cx, p.y - cy))
    const meanR = radii.reduce((s, r) => s + r, 0) / n
    for (const r of radii) {
      expect(Math.abs(r - meanR)).toBeLessThan(1.2)
    }
    expect(cy).toBeGreaterThan(50)
  })

  it('at vertical pole, mirrored truss DMX matches floor DMX (disc centre) for several pan values', () => {
    const base: FixtureConfig = { ...circleCfg, invertPan: false, invertTilt: false }
    const truss: FixtureConfig = { ...circleCfg, invertPan: true, invertTilt: true }
    const tiltAtPolePct = (circleCfg.tiltStageDeg / circleCfg.tiltRangeDeg) * 100
    const tiltL = percentToDmx(tiltAtPolePct, 0, 255)
    const tiltR = mirrorDmxForMovingHeadInvert(tiltL, 0, 255)
    for (const panPct of [0, 33, 66, 100]) {
      const panL = percentToDmx(panPct, 0, 255)
      const panR = mirrorDmxForMovingHeadInvert(panL, 0, 255)
      const a = panTiltDmxToSphericalXY(panL, tiltL, base)
      const b = panTiltDmxToSphericalXY(panR, tiltR, truss)
      expect(Math.hypot(a.xPct - 50, a.yPct - 50)).toBeLessThan(2)
      expect(Math.hypot(b.xPct - 50, b.yPct - 50)).toBeLessThan(2)
      expect(a.xPct).toBeCloseTo(b.xPct, 0)
      expect(a.yPct).toBeCloseTo(b.yPct, 0)
    }
  })
})

describe('nod one hemisphere (tilt below pole, pan at DS)', () => {
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
    invertTilt: false,
  }

  it('dot moves toward DS with increasing tilt from pole (fixed pan downstage)', () => {
    const panDmx = percentToDmx((180 / cfg.panRangeDeg) * 100, 0, 255)
    const y50 = panTiltDmxToSphericalXY(panDmx, percentToDmx((50 / 180) * 100, 0, 255), cfg).yPct
    const y30 = panTiltDmxToSphericalXY(panDmx, percentToDmx((30 / 180) * 100, 0, 255), cfg).yPct
    expect(y30).toBeGreaterThan(y50)
    expect(
      Math.abs(
        panTiltDmxToSphericalXY(panDmx, percentToDmx((30 / 180) * 100, 0, 255), cfg).xPct - 50,
      ),
    ).toBeLessThan(12)
  })
})

describe('pan sweep at fixed tilt', () => {
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
    invertTilt: false,
  }

  it('one full pan revolution at horizontal tilt traces near-circle at constant radius', () => {
    const tiltDmx = percentToDmx(0, 0, 255)
    const pts: { x: number; y: number }[] = []
    const steps = 16
    for (let i = 0; i <= steps; i++) {
      const panPct = (i / steps) * (360 / cfg.panRangeDeg) * 100
      const panDmx = percentToDmx(panPct, 0, 255)
      const p = panTiltDmxToSphericalXY(panDmx, tiltDmx, cfg)
      pts.push({ x: p.xPct, y: p.yPct })
    }
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length
    const radii = pts.map((p) => Math.hypot(p.x - cx, p.y - cy))
    const meanR = radii.reduce((s, r) => s + r, 0) / radii.length
    for (const r of radii) {
      expect(Math.abs(r - meanR)).toBeLessThan(3.5)
    }
  })
})

describe('near-pole gimbal compensation', () => {
  const nearPoleHome: FixtureConfig = {
    panHome: 50,
    panMin: 0,
    panMax: 255,
    panRangeDeg: 540,
    panDirectionCW: true,
    panStageDeg: 270,
    tiltHome: 52,
    tiltMin: 0,
    tiltMax: 255,
    tiltRangeDeg: 180,
    tiltStageDeg: 90,
    invertPan: false,
    invertTilt: false,
  }

  it('orbit uses shifted centre when home encloses pole; preview samples stay in valid band', () => {
    const tiltHomeDeg = (nearPoleHome.tiltHome / 100) * nearPoleHome.tiltRangeDeg
    const phi0 = tiltHomeDeg - nearPoleHome.tiltStageDeg
    const sizeDeg = 25
    expect(Math.abs(phi0)).toBeLessThan(sizeDeg)
    const n = 12
    let pref = (nearPoleHome.panHome / 100) * nearPoleHome.panRangeDeg
    for (let i = 0; i < n; i++) {
      const phase = (i / n) * TWO_PI
      const { panOffsetDeg, tiltOffsetDeg } = gimbalCompensatedPanTiltOffsetsDeg({
        sizeDeg,
        phase,
        ramp: 1,
        fixtureConfig: nearPoleHome,
        bearingDeg: 180,
        preferredPanMotorDeg: pref,
      })
      const { panMotor, tiltMotor, nextPref } = offsetsToMotor(
        panOffsetDeg,
        tiltOffsetDeg,
        nearPoleHome,
        pref,
      )
      pref = nextPref
      expect(panMotor).toBeGreaterThanOrEqual(-1e-6)
      expect(panMotor).toBeLessThanOrEqual(nearPoleHome.panRangeDeg + 1e-6)
      expect(tiltMotor).toBeGreaterThanOrEqual(-1e-6)
      expect(tiltMotor).toBeLessThanOrEqual(nearPoleHome.tiltRangeDeg + 1e-6)
      const { panDmx, tiltDmx } = motorToRawDmx(panMotor, tiltMotor, nearPoleHome)
      const p = panTiltDmxToSphericalXY(panDmx, tiltDmx, nearPoleHome)
      expect(p.xPct).toBeGreaterThanOrEqual(0)
      expect(p.xPct).toBeLessThanOrEqual(100)
      expect(p.yPct).toBeGreaterThanOrEqual(0)
      expect(p.yPct).toBeLessThanOrEqual(100)
    }
  })
})

describe('logicalPanDir helper', () => {
  it('XORs panDirectionCW with invertPan', () => {
    expect(logicalPanDir({ panDirectionCW: true, invertPan: false })).toBe(1)
    expect(logicalPanDir({ panDirectionCW: false, invertPan: false })).toBe(-1)
    expect(logicalPanDir({ panDirectionCW: false, invertPan: true })).toBe(1)
    expect(logicalPanDir({ panDirectionCW: true, invertPan: true })).toBe(-1)
  })
})

/** Preview config used by the calibration wizard: console DMX is on-the-wire, not publisher-mirrored. */
function wizardPreviewConfig(c: FixtureConfig): FixtureConfig {
  return { ...c, invertPan: false, invertTilt: false }
}

describe('wizard raw console DMX preview (invert flags off)', () => {
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

  const truss: FixtureConfig = { ...upfire, invertPan: true, invertTilt: true }

  it('spherical: same linear raw tilt delta as up-firing when wizard strips invert (console = on-the-wire)', () => {
    const panDmx = percentToDmx((180 / upfire.panRangeDeg) * 100, 0, 255)
    const tiltLo = percentToDmx(35, 0, 255)
    const tiltHi = percentToDmx(55, 0, 255)
    expect(tiltHi).toBeGreaterThan(tiltLo)

    const dyUp =
      panTiltDmxToSphericalXY(panDmx, tiltHi, upfire).yPct -
      panTiltDmxToSphericalXY(panDmx, tiltLo, upfire).yPct
    const dyWiz =
      panTiltDmxToSphericalXY(panDmx, tiltHi, wizardPreviewConfig(truss)).yPct -
      panTiltDmxToSphericalXY(panDmx, tiltLo, wizardPreviewConfig(truss)).yPct

    expect(dyWiz).toBeCloseTo(dyUp, 5)
  })

  it('spherical: publisher DMX from motorToRawDmx still matches full preview after stripping invert', () => {
    const { panDmx, tiltDmx } = motorToRawDmx(180, 60, truss)
    const full = panTiltDmxToSphericalXY(panDmx, tiltDmx, truss)
    const wiz = panTiltDmxToSphericalXY(panDmx, tiltDmx, wizardPreviewConfig(truss))
    expect(wiz.xPct).toBeCloseTo(full.xPct, 5)
    expect(wiz.yPct).toBeCloseTo(full.yPct, 5)
  })

  it('wizard motor-space preview uses physical pan direction when invert flags are off', () => {
    const panLo = percentToDmx(10, 0, 255)
    const panHi = percentToDmx(25, 0, 255)
    const tiltDmx = percentToDmx(40, 0, 255)
    const w = wizardPreviewConfig(truss)
    const xLo = panTiltDmxToWizardMotorSpaceXY(panLo, tiltDmx, w).xPct
    const xHi = panTiltDmxToWizardMotorSpaceXY(panHi, tiltDmx, w).xPct
    expect(xHi).not.toBeCloseTo(xLo, 0)
  })

  it('stage-relative decode: down-firing calibrated raw sample lands opposite hemisphere to DS target', () => {
    const trussCalibrated: FixtureConfig = {
      ...truss,
      panDirectionCW: true,
      panStageDeg: 540,
      tiltStageDeg: 90,
      panHome: 100,
      tiltHome: 19,
    }
    // Captured from down-firing calibration flow where physical aim is downstage.
    const rawPanDmx = 0
    const rawTiltDmx = 199
    const stagePreview = panTiltDmxToSphericalXY(rawPanDmx, rawTiltDmx, trussCalibrated)
    const targetLogical = resolvePositionToAbsolutePercent(
      { mode: 'direction', bearingDeg: 180, angleFromVerticalDeg: 30 },
      trussCalibrated,
    )
    let targetPanDmx = percentToDmx(
      targetLogical.pan,
      trussCalibrated.panMin,
      trussCalibrated.panMax,
    )
    let targetTiltDmx = percentToDmx(
      targetLogical.tilt,
      trussCalibrated.tiltMin,
      trussCalibrated.tiltMax,
    )
    targetPanDmx = mirrorDmxForMovingHeadInvert(
      targetPanDmx,
      trussCalibrated.panMin,
      trussCalibrated.panMax,
    )
    targetTiltDmx = mirrorDmxForMovingHeadInvert(
      targetTiltDmx,
      trussCalibrated.tiltMin,
      trussCalibrated.tiltMax,
    )
    const targetPreview = panTiltDmxToSphericalXY(targetPanDmx, targetTiltDmx, trussCalibrated)
    expect(Math.sign(stagePreview.yPct - 50)).toBe(-Math.sign(targetPreview.yPct - 50))
  })

  it('stage-relative decode: calibrated top/bottom fixtures agree on DS/US/SL/SR targets', () => {
    const topCalibrated: FixtureConfig = {
      ...upfire,
      panDirectionCW: false,
      panStageDeg: 0,
      panHome: 0,
      tiltStageDeg: 90,
      tiltHome: 76,
    }
    const bottomCalibrated: FixtureConfig = {
      ...truss,
      panDirectionCW: true,
      panStageDeg: 540,
      panHome: 100,
      tiltStageDeg: 90,
      tiltHome: 25,
    }

    const previewFromDirection = (
      cfg: FixtureConfig,
      bearingDeg: number,
      angleFromVerticalDeg = 30,
    ): { xPct: number; yPct: number } => {
      const logical = resolvePositionToAbsolutePercent(
        { mode: 'direction', bearingDeg, angleFromVerticalDeg },
        cfg,
      )
      let panDmx = percentToDmx(logical.pan, cfg.panMin, cfg.panMax)
      let tiltDmx = percentToDmx(logical.tilt, cfg.tiltMin, cfg.tiltMax)
      if (cfg.invertPan) {
        panDmx = mirrorDmxForMovingHeadInvert(panDmx, cfg.panMin, cfg.panMax)
      }
      if (cfg.invertTilt) {
        tiltDmx = mirrorDmxForMovingHeadInvert(tiltDmx, cfg.tiltMin, cfg.tiltMax)
      }
      return panTiltDmxToSphericalXY(panDmx, tiltDmx, cfg)
    }

    const targets = [{ bearing: 180 }, { bearing: 0 }, { bearing: 90 }, { bearing: 270 }] as const

    for (const target of targets) {
      const top = previewFromDirection(topCalibrated, target.bearing)
      const bottom = previewFromDirection(bottomCalibrated, target.bearing)
      expect(Math.abs(bottom.xPct - top.xPct)).toBeLessThan(2)
      expect(Math.abs(bottom.yPct - top.yPct)).toBeLessThan(2)
    }
  })

  /**
   * Regression: asymmetric tiltStageDeg (≠ tiltRangeDeg/2). The old code required tiltStageDeg
   * to be exactly at the range midpoint for the shouldMirrorTiltForStageRelative check to fire.
   * Fixtures like Light 6 with tiltStageDeg=93° (not exactly 90°) were not getting flipPhi in the
   * preview, causing the disc dot to appear in the wrong hemisphere.
   */
  it('stage-relative decode: asymmetric tiltStageDeg (≠90°) top/bottom agree on DS/US/SL/SR', () => {
    const asymTop: FixtureConfig = {
      ...upfire,
      panDirectionCW: false,
      panStageDeg: 0,
      panHome: 0,
      tiltStageDeg: 93,
      tiltHome: 76,
    }
    const asymBottom: FixtureConfig = {
      ...truss,
      panDirectionCW: true,
      panStageDeg: 540,
      panHome: 100,
      tiltStageDeg: 93,
      tiltHome: 24,
    }

    const previewFromDirection = (
      cfg: FixtureConfig,
      bearingDeg: number,
      angleFromVerticalDeg = 30,
    ): { xPct: number; yPct: number } => {
      const logical = resolvePositionToAbsolutePercent(
        { mode: 'direction', bearingDeg, angleFromVerticalDeg },
        cfg,
      )
      let panDmx = percentToDmx(logical.pan, cfg.panMin, cfg.panMax)
      let tiltDmx = percentToDmx(logical.tilt, cfg.tiltMin, cfg.tiltMax)
      if (cfg.invertPan) {
        panDmx = mirrorDmxForMovingHeadInvert(panDmx, cfg.panMin, cfg.panMax)
      }
      if (cfg.invertTilt) {
        tiltDmx = mirrorDmxForMovingHeadInvert(tiltDmx, cfg.tiltMin, cfg.tiltMax)
      }
      return panTiltDmxToSphericalXY(panDmx, tiltDmx, cfg)
    }

    const targets = [{ bearing: 180 }, { bearing: 0 }, { bearing: 90 }, { bearing: 270 }] as const

    for (const target of targets) {
      const top = previewFromDirection(asymTop, target.bearing)
      const bottom = previewFromDirection(asymBottom, target.bearing)
      expect(Math.abs(bottom.xPct - top.xPct)).toBeLessThan(2)
      expect(Math.abs(bottom.yPct - top.yPct)).toBeLessThan(2)
    }
  })
})
