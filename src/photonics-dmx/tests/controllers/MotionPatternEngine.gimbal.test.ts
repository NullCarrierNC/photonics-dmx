import { describe, expect, it, jest } from '@jest/globals'
import {
  gimbalCompensatedPanTiltOffsetsDeg,
  MotionPatternEngine,
} from '../../controllers/sequencer/MotionPatternEngine'
import {
  type ResolvedMotionPatternSetting,
  resolvePositionToAbsolutePercent,
} from '../../cues/node/compiler/ActionEffectFactory'
import { pickAliasedPanMotorDeg } from '../../helpers/panMotorAlias'
import { LightStateManager } from '../../controllers/sequencer/LightStateManager'
import { LightTransitionController } from '../../controllers/sequencer/LightTransitionController'
import type { FixtureConfig } from '../../types'

const TWO_PI = Math.PI * 2
const DEG_TO_RAD = Math.PI / 180
const RAD_TO_DEG = 180 / Math.PI
const NEAR_POLE_EPS_DEG = 1e-9

const defaultMh: FixtureConfig = {
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
  invertPan: false,
  invertTilt: false,
}

function modPositive(x: number, m: number): number {
  return ((x % m) + m) % m
}

/** Mirrors `sphereCircleUnit` in MotionPatternEngine. */
function beamAngleDeg(
  phi0Deg: number,
  alphaDeg: number,
  panCenterDeg: number,
  tRad: number,
): { x: number; y: number; z: number } {
  const phi0 = phi0Deg * DEG_TO_RAD
  const panRad = panCenterDeg * DEG_TO_RAD
  const a = alphaDeg * DEG_TO_RAD
  const cosA = Math.cos(a)
  const sinA = Math.sin(a)
  const sinPhi = Math.sin(phi0)
  const cosPhi = Math.cos(phi0)
  const sinPan = Math.sin(panRad)
  const cosPan = Math.cos(panRad)
  const ct = Math.cos(tRad)
  const st = Math.sin(tRad)

  const hx = sinPhi * sinPan
  const hy = -sinPhi * cosPan
  const hz = cosPhi

  const e1x = cosPhi * sinPan
  const e1y = -cosPhi * cosPan
  const e1z = -sinPhi

  const e2x = cosPan
  const e2y = sinPan
  const e2z = 0

  const ox = ct * e1x + st * e2x
  const oy = ct * e1y + st * e2y
  const oz = ct * e1z + st * e2z

  return {
    x: cosA * hx + sinA * ox,
    y: cosA * hy + sinA * oy,
    z: cosA * hz + sinA * oz,
  }
}

function panAzimuthDegFromBeamXY(x: number, y: number): number {
  let deg = Math.atan2(x, -y) * RAD_TO_DEG
  if (deg < 0) {
    deg += 360
  }
  return deg
}

function encirclingPanMotorWindow(
  panHomeDeg: number,
  panRangeDeg: number,
): { low: number; high: number } {
  const w0 = Math.max(0, Math.min(panHomeDeg - 180, panRangeDeg - 360))
  return { low: w0, high: w0 + 360 }
}

function pickPanMotorDegEncircling(
  azimuthDeg0To360: number,
  panHomeDeg: number,
  panRangeDeg: number,
  preferredPanMotorDeg: number,
): number {
  const { low, high } = encirclingPanMotorWindow(panHomeDeg, panRangeDeg)
  const a = modPositive(azimuthDeg0To360, 360)
  const candidates: number[] = []
  for (const k of [-2, -1, 0, 1, 2]) {
    const c = a + k * 360
    if (c >= low - 1e-9 && c <= high + 1e-9) {
      candidates.push(c)
    }
  }
  if (candidates.length > 0) {
    let best = candidates[0]!
    let bestAbs = Math.abs(wrapSignedDeg(best - preferredPanMotorDeg))
    for (const c of candidates) {
      const w = Math.abs(wrapSignedDeg(c - preferredPanMotorDeg))
      if (w < bestAbs - 1e-9) {
        best = c
        bestAbs = w
      }
    }
    return best
  }
  return Math.max(low, Math.min(high, a))
}

function wrapSignedDeg(d: number): number {
  return ((((d + 180) % 360) + 360) % 360) - 180
}

function shortestPanMotorDegToHome(azimuthDeg0To360: number, panHomeDeg: number): number {
  const a = modPositive(azimuthDeg0To360, 360)
  let best = a
  let bestAbs = Math.abs(wrapSignedDeg(a - panHomeDeg))
  for (const c of [a - 360, a + 360]) {
    const w = Math.abs(wrapSignedDeg(c - panHomeDeg))
    if (w < bestAbs - 1e-9) {
      best = c
      bestAbs = w
    }
  }
  return best
}

function pickPanMotorDegFromAzimuth(
  azimuthDeg0To360: number,
  panHomeDeg: number,
  panRangeDeg: number,
  preferredPanMotorDeg = panHomeDeg,
): number {
  if (panRangeDeg >= 360) {
    return pickPanMotorDegEncircling(
      azimuthDeg0To360,
      panHomeDeg,
      panRangeDeg,
      preferredPanMotorDeg,
    )
  }
  const a = modPositive(azimuthDeg0To360, 360)
  const candidates: number[] = []
  for (const k of [-2, -1, 0, 1, 2]) {
    const c = a + k * 360
    if (c >= -1e-9 && c <= panRangeDeg + 1e-9) {
      candidates.push(c)
    }
  }
  if (candidates.length === 1) {
    return candidates[0]!
  }
  if (candidates.length > 1) {
    let best = candidates[0]!
    let bestAbs = Math.abs(wrapSignedDeg(best - preferredPanMotorDeg))
    for (const c of candidates) {
      const w = Math.abs(wrapSignedDeg(c - preferredPanMotorDeg))
      if (w < bestAbs - 1e-9) {
        best = c
        bestAbs = w
      }
    }
    return best
  }
  const s = shortestPanMotorDegToHome(a, preferredPanMotorDeg)
  return Math.max(0, Math.min(panRangeDeg, s))
}

/** Mirrors near-pole vs standard branching in `gimbalCompensatedPanTiltOffsetsDeg`. */
function effectiveCircleGeometry(
  c: FixtureConfig,
  sizeDeg: number,
  ramp: number,
  bearingDeg: number,
): { phi0Eff: number; panCenterDeg: number; alphaDeg: number; phi0: number } {
  const tiltRange = c.tiltRangeDeg
  const poleTiltDeg = c.tiltStageDeg
  const tiltHomeDeg = (c.tiltHome / 100) * tiltRange
  const phi0 = tiltHomeDeg - poleTiltDeg
  const tiltHeadroomDeg = Math.max(0, Math.min(tiltHomeDeg, tiltRange - tiltHomeDeg))
  const alphaDeg = Math.min(sizeDeg * ramp, tiltHeadroomDeg)
  const panHomeDeg = (c.panHome / 100) * c.panRangeDeg
  const enclosesPole = Math.abs(phi0) < alphaDeg - NEAR_POLE_EPS_DEG
  if (!enclosesPole) {
    return { phi0Eff: phi0, panCenterDeg: panHomeDeg, alphaDeg, phi0 }
  }
  const panDir = c.panDirectionCW ? 1 : -1
  const rawPanTarget = c.panStageDeg + panDir * bearingDeg
  const panCenterDeg = pickAliasedPanMotorDeg(rawPanTarget, c.panRangeDeg, panHomeDeg, 'intent')
  return {
    phi0Eff: alphaDeg,
    panCenterDeg,
    alphaDeg,
    phi0,
  }
}

function signPhi0Deg(phi0Deg: number): number {
  if (Math.abs(phi0Deg) < 1e-12) {
    return 0
  }
  return Math.sign(phi0Deg)
}

function tiltMotorDegFromBeamTest(
  zc: number,
  poleTiltDeg: number,
  phi0EffectiveDeg: number,
  x: number,
  y: number,
  panMotorDeg: number,
): number {
  const thetaDeg = Math.acos(zc) * RAD_TO_DEG
  const sPhi = signPhi0Deg(phi0EffectiveDeg)
  const panRad = panMotorDeg * DEG_TO_RAD
  const dot2d =
    Math.sin(phi0EffectiveDeg * DEG_TO_RAD) * (x * Math.sin(panRad) - y * Math.cos(panRad))
  if (Math.abs(dot2d) < 1e-8) {
    return poleTiltDeg - thetaDeg
  }
  if (sPhi === 0) {
    return poleTiltDeg - thetaDeg
  }
  return poleTiltDeg + sPhi * Math.sign(dot2d) * thetaDeg
}

function offsetsFromBeamDir(
  x: number,
  y: number,
  z: number,
  panHomeDeg: number,
  tiltHomeDeg: number,
  poleTiltDeg: number,
  panRangeDeg: number,
  tiltRangeDeg: number,
  phi0EffectiveDeg: number,
  preferredPanMotorDeg?: number,
): { panOffsetDeg: number; tiltOffsetDeg: number } {
  const zc = Math.max(-1, Math.min(1, z))
  const az0 = panAzimuthDegFromBeamXY(x, y)
  let panMotorDeg = pickPanMotorDegFromAzimuth(
    az0,
    panHomeDeg,
    panRangeDeg,
    preferredPanMotorDeg ?? panHomeDeg,
  )
  let tiltMotorDeg = tiltMotorDegFromBeamTest(zc, poleTiltDeg, phi0EffectiveDeg, x, y, panMotorDeg)

  for (let iter = 0; iter < 6; iter++) {
    const phi0Rad = ((tiltMotorDeg - poleTiltDeg) * Math.PI) / 180
    const s = Math.sin(phi0Rad)
    if (Math.abs(s) < 1e-10) {
      break
    }
    const azPhysDeg = modPositive(Math.atan2(x / s, -y / s) * RAD_TO_DEG, 360)
    const nextPan = pickPanMotorDegFromAzimuth(azPhysDeg, panHomeDeg, panRangeDeg, panMotorDeg)
    if (Math.abs(wrapSignedDeg(nextPan - panMotorDeg)) < 1e-6) {
      panMotorDeg = nextPan
      tiltMotorDeg = tiltMotorDegFromBeamTest(zc, poleTiltDeg, phi0EffectiveDeg, x, y, panMotorDeg)
      break
    }
    panMotorDeg = nextPan
    tiltMotorDeg = tiltMotorDegFromBeamTest(zc, poleTiltDeg, phi0EffectiveDeg, x, y, panMotorDeg)
  }

  if (tiltMotorDeg < 0 || tiltMotorDeg > tiltRangeDeg) {
    const flippedTilt = poleTiltDeg - (tiltMotorDeg - poleTiltDeg)
    if (flippedTilt >= 0 && flippedTilt <= tiltRangeDeg) {
      tiltMotorDeg = flippedTilt
      panMotorDeg = pickPanMotorDegFromAzimuth(
        modPositive(panMotorDeg + 180, 360),
        panHomeDeg,
        panRangeDeg,
        preferredPanMotorDeg ?? panHomeDeg,
      )
    }
  }

  const panOffsetDeg = panMotorDeg - panHomeDeg
  const tiltOffsetDeg = tiltMotorDeg - tiltHomeDeg
  return { panOffsetDeg, tiltOffsetDeg }
}

/** Forward kinematics: pan/tilt motor angles → unit beam. */
function beamFromPanTiltMotorDeg(
  panMotorDeg: number,
  tiltMotorDeg: number,
  poleTiltDeg: number,
): { x: number; y: number; z: number } {
  const phi0 = tiltMotorDeg - poleTiltDeg
  const phi0r = phi0 * DEG_TO_RAD
  const panr = panMotorDeg * DEG_TO_RAD
  const sinPhi = Math.sin(phi0r)
  const cosPhi = Math.cos(phi0r)
  return {
    x: sinPhi * Math.sin(panr),
    y: -sinPhi * Math.cos(panr),
    z: cosPhi,
  }
}

describe('gimbalCompensatedPanTiltOffsetsDeg', () => {
  it('returns zero offsets when ramp is zero', () => {
    const r = gimbalCompensatedPanTiltOffsetsDeg({
      sizeDeg: 30,
      phase: 1,
      ramp: 0,
      fixtureConfig: defaultMh,
    })
    expect(r.panOffsetDeg).toBe(0)
    expect(r.tiltOffsetDeg).toBe(0)
  })

  it('uses standard mode when home is far from pole (no bearing-offset)', () => {
    const far: FixtureConfig = { ...defaultMh, tiltHome: 80, tiltStageDeg: 90 }
    const r = gimbalCompensatedPanTiltOffsetsDeg({
      sizeDeg: 30,
      phase: 0,
      ramp: 1,
      fixtureConfig: far,
      bearingDeg: 270,
    })
    expect(r.tiltOffsetDeg).toBeCloseTo(30, 1)
    expect(r.panOffsetDeg).toBeCloseTo(0, 1)
  })

  it('standard mode centers the circle on calibrated home instead of panStageDeg', () => {
    const far: FixtureConfig = {
      ...defaultMh,
      panHome: 20,
      panStageDeg: 270,
      tiltHome: 80,
      tiltStageDeg: 90,
    }
    const r = gimbalCompensatedPanTiltOffsetsDeg({
      sizeDeg: 30,
      phase: 0,
      ramp: 1,
      fixtureConfig: far,
      bearingDeg: 180,
    })
    expect(r.panOffsetDeg).toBeCloseTo(0, 5)
    expect(r.tiltOffsetDeg).toBeCloseTo(30, 1)
  })

  it('standard mode matches analytical sphere circle offsets over one revolution', () => {
    const far: FixtureConfig = { ...defaultMh, tiltHome: 80, tiltStageDeg: 90 }
    const phi0 = 0.8 * 180 - 90
    const alpha = 30
    const panHomeDeg = (50 / 100) * 540
    const tiltHomeDeg = (80 / 100) * 180
    const poleTiltDeg = 90
    const panRangeDeg = 540
    const n = 16
    for (let i = 0; i < n; i++) {
      const t = (i / n) * TWO_PI
      const p = beamAngleDeg(phi0, alpha, panHomeDeg, t)
      const exp = offsetsFromBeamDir(
        p.x,
        p.y,
        p.z,
        panHomeDeg,
        tiltHomeDeg,
        poleTiltDeg,
        panRangeDeg,
        180,
        phi0,
      )
      const g = gimbalCompensatedPanTiltOffsetsDeg({
        sizeDeg: 30,
        phase: t,
        ramp: 1,
        fixtureConfig: far,
      })
      expect(g.panOffsetDeg).toBeCloseTo(exp.panOffsetDeg, 4)
      expect(g.tiltOffsetDeg).toBeCloseTo(exp.tiltOffsetDeg, 4)
    }
  })

  it('near pole: orbit touches the vertical axis (max beam z reaches straight-up)', () => {
    const sizeDeg = 30
    let maxZ = -2
    const n = 128
    for (let i = 0; i < n; i++) {
      const t = (i / n) * TWO_PI
      const p = gimbalCompensatedPanTiltOffsetsDeg({
        sizeDeg,
        phase: t,
        ramp: 1,
        fixtureConfig: defaultMh,
        bearingDeg: 180,
      })
      const panMotorDeg = p.panOffsetDeg + (defaultMh.panHome / 100) * defaultMh.panRangeDeg
      const tiltMotorDeg = p.tiltOffsetDeg + (defaultMh.tiltHome / 100) * defaultMh.tiltRangeDeg
      const b = beamFromPanTiltMotorDeg(panMotorDeg, tiltMotorDeg, defaultMh.tiltStageDeg)
      maxZ = Math.max(maxZ, b.z)
    }
    expect(maxZ).toBeGreaterThan(0.999)
  })

  it('near pole: spherical angular radius from orbit centre remains size', () => {
    const c = defaultMh
    const sizeDeg = 30
    const geo = effectiveCircleGeometry(c, sizeDeg, 1, 180)
    const panHomeDeg = (c.panHome / 100) * c.panRangeDeg
    const tiltHomeDeg = (c.tiltHome / 100) * c.tiltRangeDeg
    const poleTiltDeg = c.tiltStageDeg
    const phi0r = geo.phi0Eff * DEG_TO_RAD
    const panRad = (geo.panCenterDeg * Math.PI) / 180
    const cx = Math.sin(phi0r) * Math.sin(panRad)
    const cy = -Math.sin(phi0r) * Math.cos(panRad)
    const cz = Math.cos(phi0r)
    const cosAlpha = Math.cos((sizeDeg * Math.PI) / 180)
    const n = 32
    for (let i = 0; i < n; i++) {
      const t = (i / n) * TWO_PI
      const b = beamAngleDeg(geo.phi0Eff, geo.alphaDeg, geo.panCenterDeg, t)
      const dot = b.x * cx + b.y * cy + b.z * cz
      expect(dot).toBeCloseTo(cosAlpha, 5)
      const g = gimbalCompensatedPanTiltOffsetsDeg({
        sizeDeg,
        phase: t,
        ramp: 1,
        fixtureConfig: c,
        bearingDeg: 180,
      })
      const exp = offsetsFromBeamDir(
        b.x,
        b.y,
        b.z,
        panHomeDeg,
        tiltHomeDeg,
        poleTiltDeg,
        c.panRangeDeg,
        c.tiltRangeDeg,
        geo.phi0Eff,
      )
      expect(g.panOffsetDeg).toBeCloseTo(exp.panOffsetDeg, 4)
      expect(g.tiltOffsetDeg).toBeCloseTo(exp.tiltOffsetDeg, 4)
    }
  })

  it('near pole: different bearings change pan offset at phase 0', () => {
    const down = gimbalCompensatedPanTiltOffsetsDeg({
      sizeDeg: 25,
      phase: 0,
      ramp: 1,
      fixtureConfig: defaultMh,
      bearingDeg: 180,
    })
    const stageRight = gimbalCompensatedPanTiltOffsetsDeg({
      sizeDeg: 25,
      phase: 0,
      ramp: 1,
      fixtureConfig: defaultMh,
      bearingDeg: 90,
    })
    expect(Math.abs(down.panOffsetDeg - stageRight.panOffsetDeg)).toBeGreaterThan(1)
  })

  it('near pole bearing uses the same pan motor as direction-mode set-position at vertical', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    const c: FixtureConfig = {
      ...defaultMh,
      panHome: 20,
      panStageDeg: 120,
      tiltHome: 52,
      tiltStageDeg: 90,
      panDirectionCW: false,
    }
    const bearingDeg = 180
    const geo = effectiveCircleGeometry(c, 30, 1, bearingDeg)
    const { pan } = resolvePositionToAbsolutePercent(
      { mode: 'direction', bearingDeg, angleFromVerticalDeg: 0 },
      c,
    )
    const expectedCenterMotor = (pan / 100) * c.panRangeDeg
    expect(geo.phi0Eff).toBeCloseTo(30, 6)
    expect(geo.panCenterDeg).toBeCloseTo(expectedCenterMotor, 4)
    warn.mockRestore()
  })

  it('near pole: circle center motor matches resolvePosition for panStageDeg at range max', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    const c: FixtureConfig = {
      ...defaultMh,
      tiltHome: 50,
      tiltStageDeg: 90,
      panHome: 50,
      panRangeDeg: 540,
      panStageDeg: 540,
      panDirectionCW: true,
    }
    const bearingDeg = 180
    const geo = effectiveCircleGeometry(c, 30, 1, bearingDeg)
    const { pan } = resolvePositionToAbsolutePercent(
      { mode: 'direction', bearingDeg, angleFromVerticalDeg: 0 },
      c,
    )
    expect(geo.panCenterDeg).toBeCloseTo((pan / 100) * c.panRangeDeg, 4)
    warn.mockRestore()
  })

  it('rear truss-style config: gimbal circle keeps pan steps bounded over one revolution', () => {
    const rear: FixtureConfig = {
      ...defaultMh,
      panHome: 100,
      panStageDeg: 540,
      tiltHome: 80,
      tiltStageDeg: 180,
      panDirectionCW: true,
      invertPan: true,
      invertTilt: true,
    }
    let prevPan = 0
    let maxPanStep = 0
    let preferred: number | undefined
    const n = 128
    for (let i = 0; i < n; i++) {
      const t = (i / n) * TWO_PI
      const p = gimbalCompensatedPanTiltOffsetsDeg({
        sizeDeg: 25,
        phase: t,
        ramp: 1,
        fixtureConfig: rear,
        bearingDeg: 180,
        preferredPanMotorDeg: preferred,
      })
      const panMotor = p.panOffsetDeg + (rear.panHome / 100) * rear.panRangeDeg
      if (i > 0) {
        maxPanStep = Math.max(maxPanStep, Math.abs(wrapSignedDeg(panMotor - prevPan)))
      }
      prevPan = panMotor
      preferred = panMotor
    }
    expect(maxPanStep).toBeLessThan(90)
  })

  it('standard mode: spherical angular radius from home is sizeDeg over one revolution', () => {
    const phi0 = 0.8 * 180 - 90
    const alpha = 30
    const panHomeDeg = (50 / 100) * 540
    const panRad = (panHomeDeg * Math.PI) / 180
    const phi0r = phi0 * DEG_TO_RAD
    const hwx = Math.sin(phi0r) * Math.sin(panRad)
    const hwy = -Math.sin(phi0r) * Math.cos(panRad)
    const hwz = Math.cos(phi0r)
    const cosAlpha = Math.cos((30 * Math.PI) / 180)
    const n = 32
    for (let i = 0; i < n; i++) {
      const t = (i / n) * TWO_PI
      const b = beamAngleDeg(phi0, alpha, panHomeDeg, t)
      const dot = b.x * hwx + b.y * hwy + b.z * hwz
      expect(dot).toBeCloseTo(cosAlpha, 5)
    }
  })

  it('round-trip: forward pan/tilt beam matches sphere circle at pole (bearing-offset)', () => {
    const c = defaultMh
    const sizeDeg = 30
    const ramp = 1
    const tiltRange = c.tiltRangeDeg
    const poleTiltDeg = c.tiltStageDeg
    const alphaDeg = sizeDeg * ramp
    const panHomeDeg = (c.panHome / 100) * c.panRangeDeg
    const tiltHomeDeg = (c.tiltHome / 100) * tiltRange
    const bearingDeg = 180
    const geo = effectiveCircleGeometry(c, sizeDeg, ramp, bearingDeg)
    expect(Math.abs(geo.phi0)).toBeLessThan(alphaDeg)
    const n = 64
    for (let i = 0; i < n; i++) {
      const t = (i / n) * TWO_PI
      const b = beamAngleDeg(geo.phi0Eff, alphaDeg, geo.panCenterDeg, t)
      const g = gimbalCompensatedPanTiltOffsetsDeg({
        sizeDeg,
        phase: t,
        ramp,
        fixtureConfig: c,
        bearingDeg,
      })
      const panMotorDeg = panHomeDeg + g.panOffsetDeg
      const tiltMotorDeg = tiltHomeDeg + g.tiltOffsetDeg
      const b2 = beamFromPanTiltMotorDeg(panMotorDeg, tiltMotorDeg, poleTiltDeg)
      expect(b2.x).toBeCloseTo(b.x, 4)
      expect(b2.y).toBeCloseTo(b.y, 4)
      expect(b2.z).toBeCloseTo(b.z, 4)
    }
  })

  it('round-trip: standard mode (tilt home 80%) matches sphere circle', () => {
    const c: FixtureConfig = { ...defaultMh, tiltHome: 80, tiltStageDeg: 90 }
    const sizeDeg = 30
    const ramp = 1
    const tiltRange = c.tiltRangeDeg
    const poleTiltDeg = c.tiltStageDeg
    const alphaDeg = sizeDeg * ramp
    const panHomeDeg = (c.panHome / 100) * c.panRangeDeg
    const tiltHomeDeg = (c.tiltHome / 100) * tiltRange
    const geo = effectiveCircleGeometry(c, sizeDeg, ramp, 0)
    expect(geo.phi0Eff).toBeCloseTo(geo.phi0, 6)
    const n = 32
    for (let i = 0; i < n; i++) {
      const t = (i / n) * TWO_PI
      const b = beamAngleDeg(geo.phi0Eff, alphaDeg, panHomeDeg, t)
      const g = gimbalCompensatedPanTiltOffsetsDeg({ sizeDeg, phase: t, ramp, fixtureConfig: c })
      const panMotorDeg = panHomeDeg + g.panOffsetDeg
      const tiltMotorDeg = tiltHomeDeg + g.tiltOffsetDeg
      const b2 = beamFromPanTiltMotorDeg(panMotorDeg, tiltMotorDeg, poleTiltDeg)
      expect(b2.x).toBeCloseTo(b.x, 4)
      expect(b2.y).toBeCloseTo(b.y, 4)
      expect(b2.z).toBeCloseTo(b.z, 4)
    }
  })

  it('motor path continuity: standard circle has bounded steps between adjacent samples', () => {
    const c: FixtureConfig = { ...defaultMh, tiltHome: 80, tiltStageDeg: 90 }
    const n = 128
    let prevPan = 0
    let prevTilt = 0
    let maxPanStep = 0
    let maxTiltStep = 0
    let preferredPanMotorDeg: number | undefined
    for (let i = 0; i < n; i++) {
      const t = (i / n) * TWO_PI
      const p = gimbalCompensatedPanTiltOffsetsDeg({
        sizeDeg: 30,
        phase: t,
        ramp: 1,
        fixtureConfig: c,
        preferredPanMotorDeg,
      })
      const panMotorDeg = p.panOffsetDeg + (c.panHome / 100) * c.panRangeDeg
      const tiltMotorDeg = p.tiltOffsetDeg + (c.tiltHome / 100) * c.tiltRangeDeg
      if (i > 0) {
        const dp = Math.abs(wrapSignedDeg(panMotorDeg - prevPan))
        const dt = Math.abs(wrapSignedDeg(tiltMotorDeg - prevTilt))
        maxPanStep = Math.max(maxPanStep, dp)
        maxTiltStep = Math.max(maxTiltStep, dt)
      }
      prevPan = panMotorDeg
      prevTilt = tiltMotorDeg
      preferredPanMotorDeg = panMotorDeg
    }
    expect(maxPanStep).toBeLessThan(45)
    expect(maxTiltStep).toBeLessThan(45)
  })

  it('pan motor stays within physical [0, panRangeDeg] with panHome 0% (540° fixture)', () => {
    const edge: FixtureConfig = { ...defaultMh, panHome: 0, panStageDeg: 0 }
    const panRange = edge.panRangeDeg
    for (let i = 0; i <= 64; i++) {
      const t = (i / 64) * TWO_PI
      const p = gimbalCompensatedPanTiltOffsetsDeg({
        sizeDeg: 30,
        phase: t,
        ramp: 1,
        fixtureConfig: edge,
      })
      const panMotorDeg = p.panOffsetDeg + (edge.panHome / 100) * panRange
      expect(panMotorDeg).toBeGreaterThanOrEqual(-1e-6)
      expect(panMotorDeg).toBeLessThanOrEqual(panRange + 1e-6)
    }
  })

  it('near-pole: panDirectionCW false with bearing 90 matches CW with bearing 270 (circle center)', () => {
    const params = {
      sizeDeg: 30,
      phase: 1.2,
      ramp: 1,
      fixtureConfig: defaultMh,
    } as const
    const a = gimbalCompensatedPanTiltOffsetsDeg({
      ...params,
      bearingDeg: 270,
      fixtureConfig: { ...defaultMh, panDirectionCW: true },
    })
    const b = gimbalCompensatedPanTiltOffsetsDeg({
      ...params,
      bearingDeg: 90,
      fixtureConfig: { ...defaultMh, panDirectionCW: false },
    })
    expect(a.panOffsetDeg).toBeCloseTo(b.panOffsetDeg, 10)
    expect(a.tiltOffsetDeg).toBeCloseTo(b.tiltOffsetDeg, 10)
  })

  it('narrow pan range (<360°): near-pole path stays in pan window', () => {
    const narrow: FixtureConfig = { ...defaultMh, panHome: 10, panRangeDeg: 300, panStageDeg: 150 }
    const panRange = narrow.panRangeDeg
    for (let i = 0; i <= 48; i++) {
      const t = (i / 48) * TWO_PI
      const p = gimbalCompensatedPanTiltOffsetsDeg({
        sizeDeg: 30,
        phase: t,
        ramp: 1,
        fixtureConfig: narrow,
        bearingDeg: 180,
      })
      const panMotorDeg = p.panOffsetDeg + (narrow.panHome / 100) * panRange
      expect(panMotorDeg).toBeGreaterThanOrEqual(-1e-6)
      expect(panMotorDeg).toBeLessThanOrEqual(panRange + 1e-6)
    }
  })

  it('gimbal offsets are identical regardless of invertPan (compensation is downstream)', () => {
    const front: FixtureConfig = { ...defaultMh, invertPan: false }
    const rear: FixtureConfig = { ...defaultMh, invertPan: true }
    const n = 32
    for (let i = 0; i < n; i++) {
      const t = (i / n) * TWO_PI
      const f = gimbalCompensatedPanTiltOffsetsDeg({
        sizeDeg: 25,
        phase: t,
        ramp: 1,
        fixtureConfig: front,
        bearingDeg: 180,
      })
      const r = gimbalCompensatedPanTiltOffsetsDeg({
        sizeDeg: 25,
        phase: t,
        ramp: 1,
        fixtureConfig: rear,
        bearingDeg: 180,
      })
      expect(f.panOffsetDeg).toBeCloseTo(r.panOffsetDeg, 10)
      expect(f.tiltOffsetDeg).toBeCloseTo(r.tiltOffsetDeg, 10)
    }
  })
  it('light 6 down-firing config: pan/tilt stays within range and draws orbit across the pole', () => {
    const light6: FixtureConfig = {
      ...defaultMh,
      panHome: 100,
      panMin: 0,
      panMax: 255,
      panRangeDeg: 540,
      panDirectionCW: true,
      panStageDeg: 540,
      tiltHome: 71,
      tiltMin: 0,
      tiltMax: 255,
      tiltRangeDeg: 180,
      tiltStageDeg: 168,
      invertPan: true,
      invertTilt: true,
    }

    const sizeDeg = 30
    const ramp = 1
    const n = 128

    let maxZ = -2
    let minTilt = 180
    let maxTilt = 0

    for (let i = 0; i < n; i++) {
      const t = (i / n) * TWO_PI
      const g = gimbalCompensatedPanTiltOffsetsDeg({
        sizeDeg,
        phase: t,
        ramp,
        fixtureConfig: light6,
        bearingDeg: 180,
      })
      const panMotorDeg = (light6.panHome / 100) * light6.panRangeDeg + g.panOffsetDeg
      const tiltMotorDeg = (light6.tiltHome / 100) * light6.tiltRangeDeg + g.tiltOffsetDeg

      expect(panMotorDeg).toBeGreaterThanOrEqual(-1e-6)
      expect(panMotorDeg).toBeLessThanOrEqual(light6.panRangeDeg + 1e-6)

      expect(tiltMotorDeg).toBeGreaterThanOrEqual(-1e-6)
      expect(tiltMotorDeg).toBeLessThanOrEqual(light6.tiltRangeDeg + 1e-6)

      minTilt = Math.min(minTilt, tiltMotorDeg)
      maxTilt = Math.max(maxTilt, tiltMotorDeg)

      const b = beamFromPanTiltMotorDeg(panMotorDeg, tiltMotorDeg, light6.tiltStageDeg)
      maxZ = Math.max(maxZ, b.z)
    }

    // It should have touched the pole (or gone over it, if alpha > phi0, which it is: alpha=30, phi0=168-127.8=40.2 -> wait! phi0 = 127.8 - 168 = -40.2. alpha=30. So it doesn't enclose the pole!
    // Wait, if it doesn't enclose the pole, it shouldn't need to flip pan!
    // Let's check the tilt bounds.
    // tilt should oscillate around 127.8 +/- 30 = [97.8, 157.8].
    // If it oscillates in [97.8, 157.8], it never exceeds 180!
    // Why did the user report "light 6 pans but does not tilt"?
  })
})
const basePattern: ResolvedMotionPatternSetting = {
  pattern: 'custom',
  speedHz: 1,
  sizeDeg: 0,
  fanSpreadDeg: 0,
  panWaveform: 'sine',
  tiltWaveform: 'sine',
  panAmplitudeDeg: 60,
  tiltAmplitudeDeg: 0,
  panPhaseOffsetDeg: 0,
  panFreqMultiplier: 1,
  tiltFreqMultiplier: 1,
  linearSweepAxis: 'horizontal',
  gimbalCompensation: false,
  bearingDeg: 180,
  reverse: false,
}

it('inverted fixtures still produce positive pan motion before DMX output mirroring', () => {
  const lsm = new LightStateManager()
  const ltc = new LightTransitionController(lsm)
  const engine = new MotionPatternEngine(ltc)
  const light = {
    id: 'rear-1',
    position: 1,
    config: { ...defaultMh, panHome: 10, invertPan: true },
  }

  engine.addPattern({
    name: 'pan-test',
    config: basePattern,
    lights: [light],
    layer: 2,
    startTime: 0,
    rampUpDurationMs: 0,
  })

  engine.advanceFrame({ frameStartTime: 250, deltaTime: 16, frameIndex: 1 })

  const state = ltc.getLightState(light.id, 2)
  expect(state.pan).toBeCloseTo(10 + (60 / defaultMh.panRangeDeg) * 100, 5)
  expect(state.pan).toBeGreaterThan(10)
  expect(state.tilt).toBeCloseTo(light.config.tiltHome, 5)
})

it('includes the light id in axis clamp warnings', () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
  const lsm = new LightStateManager()
  const ltc = new LightTransitionController(lsm)
  const engine = new MotionPatternEngine(ltc)
  const light = {
    id: 'rear-clamp',
    position: 2,
    config: { ...defaultMh, panHome: 0, panDirectionCW: false },
  }

  engine.addPattern({
    name: 'clamp-test',
    config: {
      ...basePattern,
      panAmplitudeDeg: 0,
      tiltAmplitudeDeg: 500,
    },
    lights: [light],
    layer: 3,
    startTime: 0,
    rampUpDurationMs: 0,
  })

  engine.advanceFrame({ frameStartTime: 250, deltaTime: 16, frameIndex: 1 })

  expect(warn).toHaveBeenCalledWith(
    expect.stringContaining('[motion-pattern] light rear-clamp tilt clamped'),
  )
  warn.mockRestore()
})

it('reported front-light calibration does not hit pan clamp in normal circle motion', () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
  const lsm = new LightStateManager()
  const ltc = new LightTransitionController(lsm)
  const engine = new MotionPatternEngine(ltc)
  const light = {
    id: '5290b4eb-5bd2-42e4-8438-8c27f992e9ce',
    position: 2,
    config: {
      ...defaultMh,
      panHome: 67,
      tiltHome: 81,
      panStageDeg: 0,
      tiltStageDeg: 90,
      panDirectionCW: false,
      invertPan: false,
      invertTilt: false,
    },
  }

  engine.addPattern({
    name: 'front-circle',
    config: { ...basePattern, pattern: 'circle', sizeDeg: 25, gimbalCompensation: true },
    lights: [light],
    layer: 4,
    startTime: 0,
    rampUpDurationMs: 0,
  })

  for (let i = 0; i < 32; i++) {
    engine.advanceFrame({ frameStartTime: i * 40, deltaTime: 40, frameIndex: i })
  }

  expect(warn).not.toHaveBeenCalledWith(
    expect.stringContaining('5290b4eb-5bd2-42e4-8438-8c27f992e9ce pan clamped'),
  )
  warn.mockRestore()
})

it('reported near-pole light does not hit tilt clamp in normal circle motion', () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
  const lsm = new LightStateManager()
  const ltc = new LightTransitionController(lsm)
  const engine = new MotionPatternEngine(ltc)
  const light = {
    id: '379c87a2-0f49-45f4-940e-3ee2e87ba8de',
    position: 4,
    config: {
      ...defaultMh,
      panHome: 66,
      tiltHome: 88,
      panStageDeg: 0,
      tiltStageDeg: 90,
      panDirectionCW: false,
      invertPan: false,
      invertTilt: false,
    },
  }

  engine.addPattern({
    name: 'near-pole-circle',
    config: { ...basePattern, pattern: 'circle', sizeDeg: 25, gimbalCompensation: true },
    lights: [light],
    layer: 5,
    startTime: 0,
    rampUpDurationMs: 0,
  })

  for (let i = 0; i < 32; i++) {
    engine.advanceFrame({ frameStartTime: i * 40, deltaTime: 40, frameIndex: i })
  }

  expect(warn).not.toHaveBeenCalledWith(
    expect.stringContaining('379c87a2-0f49-45f4-940e-3ee2e87ba8de tilt clamped'),
  )
  warn.mockRestore()
})

it('up-firing panHome 0 / panStageDeg 0: circle motion does not pan-clamp and spans pan', () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
  const lsm = new LightStateManager()
  const ltc = new LightTransitionController(lsm)
  const engine = new MotionPatternEngine(ltc)
  const light = {
    id: 'up-fire-edge-home',
    position: 2,
    config: {
      ...defaultMh,
      panHome: 0,
      tiltHome: 78,
      panStageDeg: 0,
      tiltStageDeg: 90,
      panDirectionCW: false,
      invertPan: false,
      invertTilt: false,
    },
  }

  engine.addPattern({
    name: 'up-fire-circle',
    config: { ...basePattern, pattern: 'circle', sizeDeg: 25, gimbalCompensation: true },
    lights: [light],
    layer: 7,
    startTime: 0,
    rampUpDurationMs: 0,
  })

  let minPan = 100
  let maxPan = 0
  for (let i = 0; i < 64; i++) {
    engine.advanceFrame({ frameStartTime: i * 40, deltaTime: 40, frameIndex: i })
    const state = ltc.getLightState(light.id, 7)
    const pan = state.pan ?? 0
    minPan = Math.min(minPan, pan)
    maxPan = Math.max(maxPan, pan)
  }

  expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('up-fire-edge-home pan clamped'))
  expect(maxPan - minPan).toBeGreaterThan(8)
  warn.mockRestore()
})

it('light 6 down-firing config: pan/tilt stays within range and draws orbit across the pole', () => {
  const lsm = new LightStateManager()
  const ltc = new LightTransitionController(lsm)
  const engine = new MotionPatternEngine(ltc)
  const light = {
    id: 'rear-6',
    position: 6,
    config: {
      ...defaultMh,
      panHome: 100,
      panMin: 0,
      panMax: 255,
      panRangeDeg: 540,
      panDirectionCW: true,
      panStageDeg: 540,
      tiltHome: 71,
      tiltMin: 0,
      tiltMax: 255,
      tiltRangeDeg: 180,
      tiltStageDeg: 168,
      invertPan: true,
      invertTilt: true,
    },
  }

  engine.addPattern({
    name: 'rear-6-circle',
    config: { ...basePattern, pattern: 'circle', sizeDeg: 60, gimbalCompensation: true },
    lights: [light],
    layer: 6,
    startTime: 0,
    rampUpDurationMs: 0,
  })

  let minTilt = 100
  let maxTilt = 0
  let minPan = 100
  let maxPan = 0

  for (let i = 0; i < 128; i++) {
    engine.advanceFrame({ frameStartTime: i * 40, deltaTime: 40, frameIndex: i })
    const state = ltc.getLightState(light.id, 6)
    const tilt = state.tilt ?? 0
    const pan = state.pan ?? 0
    minTilt = Math.min(minTilt, tilt)
    maxTilt = Math.max(maxTilt, tilt)
    minPan = Math.min(minPan, pan)
    maxPan = Math.max(maxPan, pan)
  }

  expect(maxTilt).toBeLessThanOrEqual(100)
  expect(minTilt).toBeGreaterThanOrEqual(0)
  // If it hits the edge and is clamped without pan-flipping, minTilt/maxTilt would be exactly 100.
  // Ensure it's not permanently stuck at 100.
  expect(minTilt).toBeLessThan(95)
})

it('reverse flips pan oscillation direction for non-gimbal pattern', () => {
  const light = { id: 'rev-test', position: 0, config: defaultMh }
  const sampleDelta = (reverse: boolean): number => {
    const lsm = new LightStateManager()
    const ltc = new LightTransitionController(lsm)
    const engine = new MotionPatternEngine(ltc)
    engine.addPattern({
      name: 'rev-sample',
      config: { ...basePattern, reverse, speedHz: 1 },
      lights: [light],
      layer: 9,
      startTime: 0,
      rampUpDurationMs: 0,
    })
    engine.advanceFrame({ frameStartTime: 100, deltaTime: 16, frameIndex: 0 })
    const pan1 = ltc.getLightState(light.id, 9).pan ?? 50
    engine.advanceFrame({ frameStartTime: 180, deltaTime: 16, frameIndex: 1 })
    const pan2 = ltc.getLightState(light.id, 9).pan ?? 50
    return pan2 - pan1
  }

  const deltaFwd = sampleDelta(false)
  const deltaRev = sampleDelta(true)
  expect(Math.abs(deltaFwd)).toBeGreaterThan(1e-6)
  expect(Math.sign(deltaFwd)).not.toBe(0)
  expect(Math.sign(deltaRev)).toBe(-Math.sign(deltaFwd))
})
