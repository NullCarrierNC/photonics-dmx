import type { FixtureConfig } from '../../../photonics-dmx/types'
import { normalizeFixtureConfig } from '../../../photonics-dmx/types'
import {
  dmxToPercent,
  logicalPanDir,
  mirrorDmxForMovingHeadInvert,
  shouldMirrorTiltForStageRelative,
} from '../../../photonics-dmx/helpers/dmxHelpers'

function modPositive(x: number, m: number): number {
  return ((x % m) + m) % m
}

const DEG_TO_RAD = Math.PI / 180

export interface SphericalXYOptions {
  /** Override the pole (vertical) position in motor degrees instead of tiltStageDeg. */
  poleDegOverride?: number
}

/**
 * Top-down projection of beam direction from DMX pan/tilt.
 * Colatitude φ = tiltMotorDeg − tiltStageDeg (same as the motion engine). Horizontal direction
 * uses stage-relative bearing B = mod360(panDir·(panMotorDeg − panStageDeg)) with logical
 * `panDir` from {@link logicalPanDir}, matching direction-mode mapping
 * motor = panStageDeg + panDir·bearing. Preview discs use US/DS at top/bottom and, from the
 * audience (house) perspective, SR on the house-left side and SL on the house-right side of the
 * disc; θ = mod360(B − 180°) maps bearing to dot position on that disc.
 *
 * u_x = sign(φ)·sin(θ), u_y = −sign(φ)·cos(θ) (sign(φ)=1 at the pole) so crossing the tilt pole
 * flips compass on the disc with logical beam direction for floor and truss mounts (same gimbal
 * geometry in logical motor space after DMX invert). Radial distance uses |φ| and asymmetric span
 * toward tiltMin / tiltMax from the pole.
 */
export function panTiltDmxToSphericalXY(
  panDmx: number,
  tiltDmx: number,
  fixtureConfig: FixtureConfig | undefined,
  options?: SphericalXYOptions,
): { xPct: number; yPct: number } {
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
  const towardMinSpanDeg = poleDeg
  const towardMaxSpanDeg = c.tiltRangeDeg - poleDeg
  const spanDeg = phi0Deg <= 0 ? towardMinSpanDeg : towardMaxSpanDeg
  const radius = spanDeg > 0 ? Math.min(1, Math.abs(phi0Deg) / spanDeg) : 0

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
  const ux = effectivePhiSign * Math.sin(panRad)
  const uy = -effectivePhiSign * Math.cos(panRad)

  return {
    xPct: 50 + ux * radius * 50,
    yPct: 50 + uy * radius * 50,
  }
}

/**
 * Wizard-only preview: maps logical pan/tilt % linearly to a disc so slider motion matches
 * motor travel before `panStageDeg` / `tiltStageDeg` are captured. No pole-relative radius or
 * calibrated vertical reference.
 */
export function panTiltDmxToWizardMotorSpaceXY(
  panDmx: number,
  tiltDmx: number,
  fixtureConfig: FixtureConfig | undefined,
): { xPct: number; yPct: number } {
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
  const panDir = c.panDirectionCW ? 1 : -1
  const panMotorDeg = (panPct / 100) * c.panRangeDeg
  const panAngleDeg = panDir * panMotorDeg
  const radius = Math.min(1, Math.max(0, tiltPct / 100))
  const panRad = (panAngleDeg * Math.PI) / 180
  const x = Math.sin(panRad) * radius
  const y = -Math.cos(panRad) * radius
  return {
    xPct: 50 + x * 50,
    yPct: 50 + y * 50,
  }
}
