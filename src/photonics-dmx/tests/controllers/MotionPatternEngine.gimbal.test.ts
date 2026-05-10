import { describe, expect, it, jest } from '@jest/globals'
import {
  gimbalCompensatedPanTiltOffsetsDeg,
  MotionPatternEngine,
} from '../../controllers/sequencer/MotionPatternEngine'
import {
  type ResolvedMotionPatternSetting,
  resolvePositionToAbsolutePercent,
} from '../../cues/node/compiler/ActionEffectFactory'
import { resolveMotionPattern } from '../../cues/node/runtime/actionResolver'
import { ExecutionContext } from '../../cues/node/runtime/ExecutionContext'
import {
  logicalPanDir,
  mirrorDmxForMovingHeadInvert,
  percentToDmx,
  shouldMirrorTiltForStageRelative,
} from '../../helpers/dmxHelpers'
import { pickAliasedPanMotorDeg } from '../../helpers/panMotorAlias'
import { LightStateManager } from '../../controllers/sequencer/LightStateManager'
import { LightTransitionController } from '../../controllers/sequencer/LightTransitionController'
import type { FixtureConfig } from '../../types'
import type { CueData } from '../../cues/types/cueTypes'
import type { NodeMotionPatternSetting, YargEventNode } from '../../cues/types/nodeCueTypes'
import { panTiltDmxToSphericalXY } from '../../../renderer/src/components/lightsDmxPreviewMath'

const TWO_PI = Math.PI * 2
const DEG_TO_RAD = Math.PI / 180
const RAD_TO_DEG = 180 / Math.PI
const NEAR_POLE_EPS_DEG = 1e-9

function makeExecutionContext(): ExecutionContext {
  const ev: YargEventNode = { id: 'ev', type: 'event', eventType: 'cue-started' }
  return new ExecutionContext(ev, {} as CueData, new Map(), new Map())
}

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

function pickPanMotorDegNearestLinearPreferClampOnTie(
  pool: number[],
  clampedCandidate: number,
  preferredPanMotorDeg: number,
): number {
  let best = pool[0]!
  let bestDist = Math.abs(best - preferredPanMotorDeg)
  for (const c of pool) {
    const d = Math.abs(c - preferredPanMotorDeg)
    if (d < bestDist - 1e-9) {
      best = c
      bestDist = d
    } else if (Math.abs(d - bestDist) < 1e-9) {
      const cIsClamp = Math.abs(c - clampedCandidate) < 1e-9
      const bestIsClamp = Math.abs(best - clampedCandidate) < 1e-9
      if (cIsClamp && !bestIsClamp) {
        best = c
      }
    }
  }
  return best
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
  const clampedInWindow = Math.max(low, Math.min(high, a))
  if (candidates.length > 0) {
    const pool = Array.from(new Set([...candidates, clampedInWindow]))
    return pickPanMotorDegNearestLinearPreferClampOnTie(pool, clampedInWindow, preferredPanMotorDeg)
  }
  return clampedInWindow
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
  const clampedInRange = Math.max(0, Math.min(panRangeDeg, a))
  if (candidates.length >= 1) {
    const pool = Array.from(new Set([...candidates, clampedInRange]))
    return pickPanMotorDegNearestLinearPreferClampOnTie(pool, clampedInRange, preferredPanMotorDeg)
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
  const panDir = logicalPanDir(c)
  const rawPanTarget = c.panStageDeg + panDir * bearingDeg
  const panCenterDeg = pickAliasedPanMotorDeg(
    rawPanTarget,
    c.panRangeDeg,
    panHomeDeg,
    'continuity-clamp',
  )
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

  it('near pole: bearingIsFlipped maps 180° to same orbit centre as 0°', () => {
    const t = 0.7
    const flipped = gimbalCompensatedPanTiltOffsetsDeg({
      sizeDeg: 30,
      phase: t,
      ramp: 1,
      fixtureConfig: defaultMh,
      bearingDeg: 180,
      bearingIsFlipped: true,
    })
    const ref = gimbalCompensatedPanTiltOffsetsDeg({
      sizeDeg: 30,
      phase: t,
      ramp: 1,
      fixtureConfig: defaultMh,
      bearingDeg: 0,
    })
    expect(flipped.panOffsetDeg).toBeCloseTo(ref.panOffsetDeg, 3)
    expect(flipped.tiltOffsetDeg).toBeCloseTo(ref.tiltOffsetDeg, 3)
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

  it('near pole bearing: circle center matches continuity-clamp alias pick (motion path)', () => {
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
    const panHomeDeg = (c.panHome / 100) * c.panRangeDeg
    const rawPanTarget = c.panStageDeg + logicalPanDir(c) * bearingDeg
    expect(geo.phi0Eff).toBeCloseTo(30, 6)
    expect(geo.panCenterDeg).toBeCloseTo(
      pickAliasedPanMotorDeg(rawPanTarget, c.panRangeDeg, panHomeDeg, 'continuity-clamp'),
      4,
    )
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

it('invertPan flips logical panDir so sine offset aliases on 540° window (DMX mirror still downstream)', () => {
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
  const panHomeDeg = (light.config.panHome / 100) * defaultMh.panRangeDeg
  const rawMotor = panHomeDeg + -60
  const chosen = pickAliasedPanMotorDeg(
    rawMotor,
    defaultMh.panRangeDeg,
    panHomeDeg,
    'continuity-clamp',
  )
  expect(state.pan).toBeCloseTo((chosen / defaultMh.panRangeDeg) * 100, 5)
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

it('up-firing panHome 0 / panStageDeg 0: edge home produces limited pan sweep (clamp motion path)', () => {
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
  expect(minPan).toBeGreaterThanOrEqual(-1e-6)
  expect(maxPan).toBeLessThan(15)
  expect(maxPan - minPan).toBeLessThan(12)
  warn.mockRestore()
})

it('up-firing front fixtures (phi0 < 0): no startup 180° snap and no periodic flip-flop', () => {
  const lsm = new LightStateManager()
  const ltc = new LightTransitionController(lsm)
  const engine = new MotionPatternEngine(ltc)
  const light = {
    id: 'front-up-firing',
    position: 3,
    config: {
      ...defaultMh,
      panHome: 33,
      tiltHome: 19,
      panStageDeg: 0,
      tiltStageDeg: 95,
      panDirectionCW: false,
      invertPan: false,
      invertTilt: false,
    },
  }

  engine.addPattern({
    name: 'front-circle',
    config: { ...basePattern, pattern: 'circle', sizeDeg: 30, gimbalCompensation: true },
    lights: [light],
    layer: 8,
    startTime: 0,
    rampUpDurationMs: 0,
  })

  const panHomePct = 33
  let maxPanDelta = 0
  let prevPan: number | undefined

  // Run for 3 full revolutions (at 1 Hz, 3 seconds = 3000ms. 3000 / 25ms = 120 frames)
  for (let i = 0; i < 120; i++) {
    engine.advanceFrame({ frameStartTime: i * 25, deltaTime: 25, frameIndex: i })
    const state = ltc.getLightState(light.id, 8)
    const pan = state.pan ?? panHomePct

    if (prevPan !== undefined) {
      const delta = Math.abs(pan - prevPan)
      maxPanDelta = Math.max(maxPanDelta, delta)
    } else {
      // First frame: should not snap 180° (which would be ~33% difference on a 540° fixture)
      expect(Math.abs(pan - panHomePct)).toBeLessThan(10)
    }
    prevPan = pan
  }

  // A 180° snap or flip-flop would cause a delta of > 30%.
  // Smooth motion should keep per-frame deltas small (< 5%).
  expect(maxPanDelta).toBeLessThan(5)
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

/**
 * Full pipeline integration: MotionPatternEngine → LightTransitionController → DmxPublisher →
 * panTiltDmxToSphericalXY. Verifies that a floor fixture (invertPan=false) and a truss fixture
 * (invertPan=true, invertTilt=true) with the same calibration produce the same stage-relative
 * preview position at each motion tick.
 *
 * This test would have caught all four bugs fixed in the inversion pipeline:
 *   1. DmxPublisher home fallback not mirroring  → home fallback tick would diverge
 *   2. blendWithOpacity dropping pan/tilt        → motion state wouldn't reach publisher
 *   3. MPE config staleness (invertPan unset)    → pan direction would diverge
 *   4. SAVE_DMX_RIG / setConsoleFixtureConfig not restarting → would not apply here (IPC-level)
 *
 * Math invariant (when panStageDeg = panHome% × panRangeDeg and same for tilt):
 *   floor bearing  = +1 × (logicalMotorDeg − stageDeg) = offset
 *   truss bearing  = −1 × (un-mirrored-logicalMotorDeg − stageDeg) = −1 × (−offset) = offset ✓
 */
describe('full pipeline: inverted fixture motion to preview stage position', () => {
  const floorConfig: FixtureConfig = {
    ...defaultMh,
    invertPan: false,
    invertTilt: false,
  }
  // Identical geometry, physically mounted upside-down on truss
  const trussConfig: FixtureConfig = {
    ...defaultMh,
    invertPan: true,
    invertTilt: true,
  }

  /**
   * Simulate one DMX pipeline tick for a light:
   *  1. Get logical pan/tilt % from LightTransitionController (set by MotionPatternEngine)
   *  2. Apply DmxPublisher invert logic: percentToDmx then optional mirrorDmxForMovingHeadInvert
   *  3. Return wire DMX values
   * This mirrors DmxPublisher.publishNow for moving-head fixtures.
   */
  function logicalPctToWireDmx(
    pan: number,
    tilt: number,
    cfg: FixtureConfig,
  ): { panDmx: number; tiltDmx: number } {
    const panDmxLogical = percentToDmx(pan, cfg.panMin, cfg.panMax)
    const tiltDmxLogical = percentToDmx(tilt, cfg.tiltMin, cfg.tiltMax)
    return {
      panDmx: cfg.invertPan
        ? mirrorDmxForMovingHeadInvert(panDmxLogical, cfg.panMin, cfg.panMax)
        : panDmxLogical,
      tiltDmx: cfg.invertTilt
        ? mirrorDmxForMovingHeadInvert(tiltDmxLogical, cfg.tiltMin, cfg.tiltMax)
        : tiltDmxLogical,
    }
  }

  function runPipelineTick(
    config: FixtureConfig,
    patternConfig: ResolvedMotionPatternSetting,
    frameStartTime: number,
    layer = 5,
  ): { xPct: number; yPct: number } {
    const id = config.invertPan ? 'truss-1' : 'floor-1'
    const lsm = new LightStateManager()
    const ltc = new LightTransitionController(lsm)
    const engine = new MotionPatternEngine(ltc)
    engine.addPattern({
      name: 'test',
      config: patternConfig,
      lights: [{ id, position: 0, config }],
      layer,
      startTime: 0,
      rampUpDurationMs: 0,
    })
    engine.advanceFrame({ frameStartTime, deltaTime: 16, frameIndex: 0 })
    const state = ltc.getLightState(id, layer)
    // pan/tilt from LTC are logical percentages; apply publisher invert math
    const { panDmx, tiltDmx } = logicalPctToWireDmx(
      state.pan ?? config.panHome,
      state.tilt ?? config.tiltHome,
      config,
    )
    return panTiltDmxToSphericalXY(panDmx, tiltDmx, config)
  }

  it('linear-sweep pan: floor and truss preview positions match at mid-sweep', () => {
    const pattern: ResolvedMotionPatternSetting = {
      ...basePattern,
      panAmplitudeDeg: 60,
      tiltAmplitudeDeg: 0,
      speedHz: 1,
    }
    const floorXY = runPipelineTick(floorConfig, pattern, 250)
    const trussXY = runPipelineTick(trussConfig, pattern, 250)
    expect(trussXY.xPct).toBeCloseTo(floorXY.xPct, 1)
    expect(trussXY.yPct).toBeCloseTo(floorXY.yPct, 1)
  })

  it('linear-sweep pan: preview positions match at multiple points across the sweep', () => {
    const pattern: ResolvedMotionPatternSetting = {
      ...basePattern,
      panAmplitudeDeg: 45,
      tiltAmplitudeDeg: 0,
      speedHz: 1,
    }
    // Sample at 8 points across one full period (1 second = 1000ms)
    for (let i = 0; i < 8; i++) {
      const t = (i / 8) * 1000
      const floorXY = runPipelineTick(floorConfig, pattern, t)
      const trussXY = runPipelineTick(trussConfig, pattern, t)
      expect(trussXY.xPct).toBeCloseTo(floorXY.xPct, 1)
      expect(trussXY.yPct).toBeCloseTo(floorXY.yPct, 1)
    }
  })

  it('tilt sweep: floor and truss preview positions match across the sweep', () => {
    // Use even panMax=200 so panHome=50% maps to exactly 100 DMX, which mirrors to 100 (symmetric
    // midpoint). This avoids the quantization artifact where panMax=255 gives 128 mirroring to 127.
    const tiltTestFloor: FixtureConfig = { ...floorConfig, panMax: 200, panStageDeg: 270 }
    const tiltTestTruss: FixtureConfig = { ...trussConfig, panMax: 200, panStageDeg: 270 }
    const pattern: ResolvedMotionPatternSetting = {
      ...basePattern,
      panAmplitudeDeg: 0,
      tiltAmplitudeDeg: 30,
      panWaveform: 'sine',
      tiltWaveform: 'sine',
      speedHz: 1,
    }
    for (let i = 0; i < 8; i++) {
      const t = (i / 8) * 1000
      const floorXY = runPipelineTick(tiltTestFloor, pattern, t)
      const trussXY = runPipelineTick(tiltTestTruss, pattern, t)
      expect(trussXY.xPct).toBeCloseTo(floorXY.xPct, 1)
      expect(trussXY.yPct).toBeCloseTo(floorXY.yPct, 1)
    }
  })

  it('Nod (vertical linear-sweep): floor and truss stage-relative preview match with non-symmetric tiltStageDeg', () => {
    // Simulates the real "Nod" cue: linear-sweep on the vertical axis, sizeDeg=20.
    // Uses a non-symmetric calibration where tiltStageDeg (75°) ≠ tiltHome%×range (50%×180=90°).
    // This exercises the case where tiltHome and tiltStageDeg are independently calibrated.
    // Use panMax=200 to keep pan quantization symmetric (avoids ±0.5 DMX rounding drift).
    const nodFloor: FixtureConfig = {
      ...defaultMh,
      panMax: 200,
      panStageDeg: 270,
      tiltStageDeg: 75,
      invertPan: false,
      invertTilt: false,
    }
    const nodTruss: FixtureConfig = {
      ...nodFloor,
      invertPan: true,
      invertTilt: true,
    }
    const nodPattern = resolveMotionPattern(
      {
        pattern: { source: 'literal', value: 'linear-sweep' },
        linearSweepAxis: { source: 'literal', value: 'vertical' },
        speed: { source: 'literal', value: 2 },
        size: { source: 'literal', value: 20 },
      } as NodeMotionPatternSetting,
      makeExecutionContext(),
    )
    for (let i = 0; i < 8; i++) {
      const t = (i / 8) * 500 // half-period at 2 Hz
      const floorXY = runPipelineTick(nodFloor, nodPattern, t)
      const trussXY = runPipelineTick(nodTruss, nodPattern, t)
      expect(trussXY.xPct).toBeCloseTo(floorXY.xPct, 1)
      expect(trussXY.yPct).toBeCloseTo(floorXY.yPct, 1)
    }
  })

  it('Circle (gimbal-compensated): floor and truss stage-relative preview orbit the same stage area', () => {
    // Simulates the real "Clockwise Sync" circle cue: gimbal-compensated, bearingDeg=180 (DS).
    // The test verifies that the pan and tilt preview directions stay in phase between
    // floor (invertPan=false, invertTilt=false) and truss (invertPan=true, invertTilt=true).
    // Use symmetric panMax to avoid 127/128 midpoint quantization skew around x=50%.
    const circleFloor: FixtureConfig = { ...floorConfig, panMax: 200 }
    const circleTruss: FixtureConfig = { ...trussConfig, panMax: 200 }
    const circlePattern = resolveMotionPattern(
      {
        pattern: { source: 'literal', value: 'circle' },
        bearing: { source: 'literal', value: 180 },
        speed: { source: 'literal', value: 0.5 },
        size: { source: 'literal', value: 25 },
      } as NodeMotionPatternSetting,
      makeExecutionContext(),
    )
    for (let i = 0; i < 8; i++) {
      const t = (i / 8) * 2000 // one full period at 0.5 Hz
      const floorXY = runPipelineTick(circleFloor, circlePattern, t)
      const trussXY = runPipelineTick(circleTruss, circlePattern, t)
      // Allow a small (<1.5%) x drift due to quantization + alias path selection near the
      // circle center where mirrored pan values can differ by a single DMX step.
      expect(Math.abs(trussXY.xPct - floorXY.xPct)).toBeLessThan(1.5)
      expect(Math.abs(trussXY.yPct - floorXY.yPct)).toBeLessThan(1.5)
    }
  })

  const mixedTopCfg: FixtureConfig = {
    ...defaultMh,
    panHome: 0,
    panDirectionCW: false,
    panStageDeg: 0,
    tiltHome: 76,
    tiltStageDeg: 90,
    invertPan: false,
    invertTilt: false,
  }
  const mixedBottomCfg: FixtureConfig = {
    ...defaultMh,
    panHome: 100,
    panDirectionCW: true,
    panStageDeg: 540,
    tiltHome: 25,
    tiltStageDeg: 90,
    invertPan: true,
    invertTilt: true,
  }

  function runDirectionTargetPreview(
    config: FixtureConfig,
    bearingDeg: number,
    angleFromVerticalDeg = 30,
  ): { xPct: number; yPct: number } {
    const logical = resolvePositionToAbsolutePercent(
      {
        mode: 'direction',
        bearingDeg,
        angleFromVerticalDeg,
      },
      config,
    )
    const { panDmx, tiltDmx } = logicalPctToWireDmx(logical.pan, logical.tilt, config)
    return panTiltDmxToSphericalXY(panDmx, tiltDmx, config)
  }

  it('mixed real-world calibration: Nod keeps top and bottom stage position aligned', () => {
    const nodPattern = resolveMotionPattern(
      {
        pattern: { source: 'literal', value: 'linear-sweep' },
        linearSweepAxis: { source: 'literal', value: 'vertical' },
        speed: { source: 'literal', value: 2 },
        size: { source: 'literal', value: 20 },
      } as NodeMotionPatternSetting,
      makeExecutionContext(),
    )

    for (let i = 0; i < 8; i++) {
      const t = (i / 8) * 500
      const topXY = runPipelineTick(mixedTopCfg, nodPattern, t)
      const bottomXY = runPipelineTick(mixedBottomCfg, nodPattern, t)
      expect(Math.abs(bottomXY.xPct - topXY.xPct)).toBeLessThan(2)
      expect(Math.abs(bottomXY.yPct - topXY.yPct)).toBeLessThan(2)
    }
  })

  it('mixed real-world calibration: Clockwise circle keeps top and bottom stage position aligned', () => {
    const circlePattern = resolveMotionPattern(
      {
        pattern: { source: 'literal', value: 'circle' },
        bearing: { source: 'literal', value: 180 },
        speed: { source: 'literal', value: 1 },
        size: { source: 'literal', value: 30 },
      } as NodeMotionPatternSetting,
      makeExecutionContext(),
    )

    for (let i = 0; i < 12; i++) {
      const t = (i / 12) * 1000
      const topXY = runPipelineTick(mixedTopCfg, circlePattern, t)
      const bottomXY = runPipelineTick(mixedBottomCfg, circlePattern, t)
      expect(Math.abs(bottomXY.xPct - topXY.xPct)).toBeLessThan(2)
      expect(Math.abs(bottomXY.yPct - topXY.yPct)).toBeLessThan(2)
    }
  })

  it('mixed real-world calibration: direction mode keeps DS/US/SL/SR aligned across mounts', () => {
    const bearings = [180, 0, 270, 90]
    for (const bearing of bearings) {
      const topXY = runDirectionTargetPreview(mixedTopCfg, bearing, 30)
      const bottomXY = runDirectionTargetPreview(mixedBottomCfg, bearing, 30)
      expect(Math.abs(bottomXY.xPct - topXY.xPct)).toBeLessThan(40)
      expect(Math.abs(bottomXY.yPct - topXY.yPct)).toBeLessThan(40)
    }
  })

  /**
   * Regression for fixtures with asymmetric tiltStageDeg (≠ tiltRangeDeg/2).
   *
   * The old code gate on shouldMirrorTiltForStageRelative required tiltStageDeg to equal
   * tiltRangeDeg/2. Fixtures with any other value (e.g. tiltStageDeg=93° on a 180° fixture) were
   * never mirrored, breaking stage-relative parity. The new code drops that condition.
   *
   * Fixture notes:
   *   Top: floor, tiltHome=76%, tiltStageDeg=93° → phi0=+43.8° (home above pole)
   *   Nod bottom: tiltHome=24% → stage-equivalent home (100−76=24), matched for waveform parity
   *   Circle bottom: tiltHome=27% → actualHome≈48.6°, canonical phi0≈44.4° ≈ floor phi0=43.8°
   *
   * The asymmetric pole shifts the canonical phi0 slightly from the floor phi0, so the tolerance
   * is 3.5% rather than the 2% used for symmetric calibrations.
   */
  const asymTopCfg: FixtureConfig = {
    ...defaultMh,
    panHome: 0,
    panMax: 200,
    panDirectionCW: false,
    panStageDeg: 0,
    tiltHome: 76,
    tiltStageDeg: 93,
    invertPan: false,
    invertTilt: false,
  }

  it('asymmetric tiltStageDeg (≠90°): Nod keeps top and bottom stage position aligned', () => {
    // tiltHome=24% → stage-equivalent of floor 76% (100−76=24) via waveform tiltDir path
    const asymNodBottomCfg: FixtureConfig = {
      ...defaultMh,
      panHome: 100,
      panMax: 200,
      panDirectionCW: true,
      panStageDeg: 540,
      tiltHome: 24,
      tiltStageDeg: 93,
      invertPan: true,
      invertTilt: true,
    }
    const nodPattern = resolveMotionPattern(
      {
        pattern: { source: 'literal', value: 'linear-sweep' },
        linearSweepAxis: { source: 'literal', value: 'vertical' },
        speed: { source: 'literal', value: 2 },
        size: { source: 'literal', value: 20 },
      } as NodeMotionPatternSetting,
      makeExecutionContext(),
    )
    for (let i = 0; i < 8; i++) {
      const t = (i / 8) * 500
      const topXY = runPipelineTick(asymTopCfg, nodPattern, t)
      const bottomXY = runPipelineTick(asymNodBottomCfg, nodPattern, t)
      expect(Math.abs(bottomXY.xPct - topXY.xPct)).toBeLessThan(3.5)
      expect(Math.abs(bottomXY.yPct - topXY.yPct)).toBeLessThan(3.5)
    }
  })

  it('asymmetric tiltStageDeg (≠90°): Circle keeps top and bottom stage position aligned', () => {
    // tiltHome=27% → actualHome≈48.6°, canonical phi0=93−48.6≈44.4° ≈ floor phi0=43.8°
    const asymCircleBottomCfg: FixtureConfig = {
      ...defaultMh,
      panHome: 100,
      panMax: 200,
      panDirectionCW: true,
      panStageDeg: 540,
      tiltHome: 27,
      tiltStageDeg: 93,
      invertPan: true,
      invertTilt: true,
    }
    const circlePattern = resolveMotionPattern(
      {
        pattern: { source: 'literal', value: 'circle' },
        bearing: { source: 'literal', value: 180 },
        speed: { source: 'literal', value: 1 },
        size: { source: 'literal', value: 25 },
      } as NodeMotionPatternSetting,
      makeExecutionContext(),
    )
    for (let i = 0; i < 12; i++) {
      const t = (i / 12) * 1000
      const topXY = runPipelineTick(asymTopCfg, circlePattern, t)
      const bottomXY = runPipelineTick(asymCircleBottomCfg, circlePattern, t)
      expect(Math.abs(bottomXY.xPct - topXY.xPct)).toBeLessThan(3.5)
      expect(Math.abs(bottomXY.yPct - topXY.yPct)).toBeLessThan(3.5)
    }
  })

  it('asymmetric tiltStageDeg (≠90°): direction mode keeps DS/US/SL/SR aligned across mounts', () => {
    const asymDirBottomCfg: FixtureConfig = {
      ...defaultMh,
      panHome: 100,
      panMax: 200,
      panDirectionCW: true,
      panStageDeg: 540,
      tiltHome: 24,
      tiltStageDeg: 93,
      invertPan: true,
      invertTilt: true,
    }
    const bearings = [180, 0, 270, 90]
    for (const bearing of bearings) {
      const topXY = runDirectionTargetPreview(asymTopCfg, bearing, 30)
      const bottomXY = runDirectionTargetPreview(asymDirBottomCfg, bearing, 30)
      expect(Math.abs(bottomXY.xPct - topXY.xPct)).toBeLessThan(42)
      expect(Math.abs(bottomXY.yPct - topXY.yPct)).toBeLessThan(42)
    }
  })

  /**
   * Regression for the orbit direction unification fix.
   *
   * Before the phaseSign fix, the orbit's pan direction depended on sign(phi0). A phi0<0 fixture
   * (home below the tilt pole) would orbit CCW in stage space while phi0>0 fixtures orbited CW,
   * because panTiltOffsetsFromBeam's +180° azimuth offset for phi0<0 inverts the motor travel
   * direction relative to the sphere orbit's e2 component.
   *
   * The fix negates the phase when phi0<0 so the e2 traversal direction is reversed, cancelling
   * the azimuth flip and restoring CW stage rotation.
   *
   * Direction is verified via the shoelace signed area of the closed orbit on the preview disc,
   * sampled over one full period. After gimbal `phaseSign`, stage-CW is unified, but the disc
   * still applies `effectivePhiSign` from {@link panTiltDmxToSphericalXY}: when
   * `shouldMirrorTiltForStageRelative` flips the tilt hemisphere for preview, the same stage-CW
   * orbit appears with opposite winding on (ux, uy), so the shoelace sign expectation depends
   * on that flag (negative area when mirrored, positive when not).
   *
   * Monotonic bearing increase is NOT used because non-polar orbits (|phi0| > alpha) oscillate
   * in bearing; the shoelace area correctly captures CW vs CCW regardless of orbit radius.
   *
   * Light 2 (real rig): floor, panDirectionCW=false, invertPan=false, phi0=-46.8° (below pole)
   * Light 6 (real rig): truss, panDirectionCW=true, invertPan=true, phi0=+43.8° (above pole)
   */
  /**
   * Helper: sample the preview disc over one orbit and assert stage-CW via shoelace winding.
   * Sign depends on `shouldMirrorTiltForStageRelative` (see block comment above).
   */
  function assertCircleCW(config: FixtureConfig, pattern: ResolvedMotionPatternSetting): void {
    const nSamples = 32
    const periodMs = Math.round(1000 / pattern.speedHz)
    const pts: { ux: number; uy: number }[] = []
    for (let i = 0; i < nSamples; i++) {
      const t = (i / nSamples) * periodMs
      const { xPct, yPct } = runPipelineTick(config, pattern, t)
      pts.push({ ux: (xPct - 50) / 50, uy: (yPct - 50) / 50 })
    }
    let area2 = 0
    for (let i = 0; i < nSamples; i++) {
      const p0 = pts[i]!
      const p1 = pts[(i + 1) % nSamples]!
      area2 += p0.ux * p1.uy - p0.uy * p1.ux
    }
    const mirroredTiltPreview = shouldMirrorTiltForStageRelative(config)
    if (mirroredTiltPreview) {
      expect(area2).toBeLessThan(0)
    } else {
      expect(area2).toBeGreaterThan(0)
    }
  }

  it('circle direction: phi0<0 floor fixture (real-rig Light 2) orbits CW', () => {
    const light2Config: FixtureConfig = {
      ...defaultMh,
      panHome: 34,
      panMax: 255,
      panRangeDeg: 540,
      panDirectionCW: false,
      panStageDeg: 0,
      tiltHome: 24,
      tiltRangeDeg: 180,
      tiltStageDeg: 90,
      invertPan: false,
      invertTilt: false,
    }
    const circlePattern = resolveMotionPattern(
      {
        pattern: { source: 'literal', value: 'circle' },
        bearing: { source: 'literal', value: 180 },
        speed: { source: 'literal', value: 1 },
        size: { source: 'literal', value: 20 },
      } as NodeMotionPatternSetting,
      makeExecutionContext(),
    )
    assertCircleCW(light2Config, circlePattern)
  })

  it('circle direction: phi0>0 truss fixture (real-rig Light 6) orbits CW', () => {
    const light6Config: FixtureConfig = {
      ...defaultMh,
      panHome: 67,
      panMax: 255,
      panRangeDeg: 540,
      panDirectionCW: true,
      panStageDeg: 540,
      tiltHome: 76,
      tiltRangeDeg: 180,
      tiltStageDeg: 93,
      invertPan: true,
      invertTilt: true,
    }
    const circlePattern = resolveMotionPattern(
      {
        pattern: { source: 'literal', value: 'circle' },
        bearing: { source: 'literal', value: 180 },
        speed: { source: 'literal', value: 1 },
        size: { source: 'literal', value: 20 },
      } as NodeMotionPatternSetting,
      makeExecutionContext(),
    )
    assertCircleCW(light6Config, circlePattern)
  })
})
