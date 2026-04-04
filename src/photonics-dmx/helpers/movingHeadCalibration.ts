import { dmxToPercent, mirrorDmxForMovingHeadInvert } from './dmxHelpers'
import type { FixtureConfig } from '../types'

function logicalPanDmx(panDmx: number, cfg: FixtureConfig): number {
  if (!cfg.invertPan) {
    return panDmx
  }
  return mirrorDmxForMovingHeadInvert(panDmx, cfg.panMin, cfg.panMax)
}

function logicalTiltDmx(tiltDmx: number, cfg: FixtureConfig): number {
  if (!cfg.invertTilt) {
    return tiltDmx
  }
  return mirrorDmxForMovingHeadInvert(tiltDmx, cfg.tiltMin, cfg.tiltMax)
}

/**
 * Convert a raw DMX slider value (from console mode) to the logical percent
 * that reproduces the same physical output through DmxPublisher's invert pipeline.
 */
export function rawDmxToLogicalHomePercent(
  rawDmx: number,
  min: number,
  max: number,
  invert: boolean,
): number {
  if (!invert) {
    return dmxToPercent(rawDmx, min, max)
  }
  const d = Math.max(0, Math.min(255, Math.round(rawDmx)))
  return dmxToPercent(min + max - d, min, max)
}

/** Motor pan angle (0..panRangeDeg) from current pan DMX and fixture range. */
export function motorDegFromPanDmx(panDmx: number, cfg: FixtureConfig): number {
  const pct = dmxToPercent(logicalPanDmx(panDmx, cfg), cfg.panMin, cfg.panMax)
  return (pct / 100) * cfg.panRangeDeg
}

/** Motor tilt angle (0..tiltRangeDeg) from current tilt DMX and fixture range. */
export function motorDegFromTiltDmx(tiltDmx: number, cfg: FixtureConfig): number {
  const pct = dmxToPercent(logicalTiltDmx(tiltDmx, cfg), cfg.tiltMin, cfg.tiltMax)
  return (pct / 100) * cfg.tiltRangeDeg
}
