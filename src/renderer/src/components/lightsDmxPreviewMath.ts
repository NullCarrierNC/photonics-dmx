import type { FixtureConfig } from '../../../photonics-dmx/types'
import { normalizeFixtureConfig } from '../../../photonics-dmx/types'
import {
  dmxToPercent,
  mirrorDmxForMovingHeadInvert,
} from '../../../photonics-dmx/helpers/dmxHelpers'

function modPositive(x: number, m: number): number {
  return ((x % m) + m) % m
}

const DEG_TO_RAD = Math.PI / 180

/** Truss / down-firing from calibration wizard (both axes inverted together). */
function isDownFiringMount(c: { invertPan: boolean; invertTilt: boolean }): boolean {
  return c.invertPan && c.invertTilt
}

export interface SphericalXYOptions {
  /** Override the pole (vertical) position in motor degrees instead of tiltStageDeg. */
  poleDegOverride?: number
}

/**
 * Top-down projection of beam direction from DMX pan/tilt.
 * Colatitude φ = tiltMotorDeg − tiltStageDeg (same as the motion engine). Horizontal direction
 * uses stage-relative bearing B = mod360(panDir·(panMotorDeg − panStageDeg)), matching
 * direction-mode mapping motor = panStageDeg + panDir·bearing. The disc’s US/DS/SL/SR labels
 * match clockwise stage bearings (0° = upstage at top) via θ = mod360(B − 180°). **Down-firing**
 * (invertPan + invertTilt, wizard truss preset) uses u_x = −sin(θ), u_y = cos(θ) so ±φ does not
 * flip the compass. **Up-firing** (and mixed invert flags) uses u_x = sign(φ)·sin(θ),
 * u_y = −sign(φ)·cos(θ) (sign(φ)=1 at the pole). Radial distance still uses |φ| and asymmetric
 * span toward tiltMin / tiltMax from the pole.
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
  const panDir = c.panDirectionCW ? 1 : -1
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
  let ux: number
  let uy: number
  if (isDownFiringMount(c)) {
    ux = -Math.sin(panRad)
    uy = Math.cos(panRad)
  } else {
    ux = phiSign * Math.sin(panRad)
    uy = -phiSign * Math.cos(panRad)
  }

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
  const panAngleDeg = panDir * modPositive(panMotorDeg, 360)
  const radius = Math.min(1, Math.max(0, tiltPct / 100))
  const panRad = (panAngleDeg * Math.PI) / 180
  const x = Math.sin(panRad) * radius
  const y = -Math.cos(panRad) * radius
  return {
    xPct: 50 + x * 50,
    yPct: 50 + y * 50,
  }
}
