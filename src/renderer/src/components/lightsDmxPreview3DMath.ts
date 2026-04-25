import type { FixtureConfig } from '../../../photonics-dmx/types'
import { normalizeFixtureConfig } from '../../../photonics-dmx/types'
import {
  dmxToPercent,
  logicalPanDir,
  mirrorDmxForMovingHeadInvert,
  shouldMirrorTiltForStageRelative,
} from '../../../photonics-dmx/helpers/dmxHelpers'
import type { SphericalXYOptions } from './lightsDmxPreviewMath'

function modPositive(x: number, m: number): number {
  return ((x % m) + m) % m
}

const DEG_TO_RAD = Math.PI / 180

export interface StageVector3 {
  x: number
  y: number
  z: number
}

function normalizeVec(v: StageVector3): StageVector3 {
  const len = Math.hypot(v.x, v.y, v.z)
  if (len < 1e-10) {
    return { x: 0, y: 1, z: 0 }
  }
  return { x: v.x / len, y: v.y / len, z: v.z / len }
}

/**
 * Unit beam direction in stage space: x = stage right, y = up, z = downstage.
 * Uses the same pan/tilt mapping as {@link panTiltDmxToSphericalXY}: horizontal direction from
 * disc components (discUx, discUy) and vertical from φ = tiltMotorDeg − poleDeg.
 */
export function panTiltDmxToStageVector(
  panDmx: number,
  tiltDmx: number,
  fixtureConfig: FixtureConfig | undefined,
  options?: SphericalXYOptions,
): StageVector3 {
  const c = normalizeFixtureConfig(fixtureConfig)
  let panDmxLogical = panDmx
  let tiltDmxLogical = tiltDmx
  if (c.invertPan) {
    panDmxLogical = mirrorDmxForMovingHeadInvert(panDmx, c.panMin, c.panMax)
  }
  if (c.invertTilt) {
    tiltDmxLogical = mirrorDmxForMovingHeadInvert(tiltDmx, c.tiltMin, c.tiltMax)
  }
  const panPct = dmxToPercent(panDmxLogical, c.panMin, c.panMax)
  const tiltPct = dmxToPercent(tiltDmxLogical, c.tiltMin, c.tiltMax)
  const panMotorDeg = (panPct / 100) * c.panRangeDeg
  const tiltMotorDeg = (tiltPct / 100) * c.tiltRangeDeg
  const panDir = logicalPanDir(c)
  const stageBearingDeg = modPositive(panDir * (panMotorDeg - c.panStageDeg), 360)
  const poleDeg = options?.poleDegOverride ?? c.tiltStageDeg
  const phi0Deg = tiltMotorDeg - poleDeg

  const bearingTrigDeg = modPositive(stageBearingDeg - 180, 360)
  const panRad = bearingTrigDeg * DEG_TO_RAD
  const sinPhi = Math.sin(phi0Deg * DEG_TO_RAD)
  const atPole = Math.abs(sinPhi) < 1e-10
  const phiSign = atPole ? 1 : Math.sign(sinPhi)
  const homePhiDeg = (c.tiltHome / 100) * c.tiltRangeDeg - poleDeg
  const homeSinPhi = Math.sin(homePhiDeg * DEG_TO_RAD)
  const homePhiSign = Math.abs(homeSinPhi) < 1e-10 ? 0 : Math.sign(homeSinPhi)
  const flipPhi =
    shouldMirrorTiltForStageRelative(c) && homePhiSign !== 0 && homePhiSign === phiSign
  const effectivePhiSign = flipPhi ? -phiSign : phiSign
  /** Same disc components as {@link panTiltDmxToSphericalXY} (x = SR/SL, y = US/DS on the disc). */
  const discUx = effectivePhiSign * Math.sin(panRad)
  const discUy = -effectivePhiSign * Math.cos(panRad)

  const phi0Rad = phi0Deg * DEG_TO_RAD
  /** Horizontal magnitude from pole; sign of aim comes from disc (same as {@link panTiltDmxToSphericalXY}). */
  const horizMag = Math.abs(Math.sin(phi0Rad))

  /**
   * World xz aligned with the 2D preview disc: world +x = stage right; disc horizontal and world x
   * share sign (positive = audience-right = stage-left on the disc). Disc screen-y → world +z
   * (downstage toward audience).
   */
  const raw: StageVector3 = {
    x: horizMag * discUx,
    y: Math.cos(phi0Rad),
    z: horizMag * discUy,
  }
  /** Truss: logical vertical is up at pole; physical lens fires down. XZ already stage-aligned via DMX mirror. */
  if (isCeilingMountMovingHead(c)) {
    raw.y = -raw.y
  }
  return normalizeVec(raw)
}

/**
 * 45° from floor (up-firing) or ceiling (down-firing) normal.
 * When `flipUsDs`, the horizontal stage component points upstage (for static fixtures behind the audience).
 */
export function staticWashBeamDirection(
  mount: 'floor' | 'ceiling',
  options?: { flipUsDs?: boolean },
): StageVector3 {
  const zSign = options?.flipUsDs === true ? -1 : 1
  if (mount === 'floor') {
    return normalizeVec({ x: 0, y: 1, z: zSign })
  }
  return normalizeVec({ x: 0, y: -1, z: zSign })
}

export function isCeilingMountMovingHead(config: FixtureConfig | undefined): boolean {
  const c = normalizeFixtureConfig(config)
  return c.invertPan === true && c.invertTilt === true
}
