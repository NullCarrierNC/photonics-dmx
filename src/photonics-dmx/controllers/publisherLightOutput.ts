/**
 * Two per-light stages of a published frame: where a moving head points, and what colour a
 * hardware-strobing fixture holds. Both answer one light at a time and neither touches the wire.
 */

import { DmxFixture, DmxRig, normalizeFixtureConfig } from '../types'
import {
  mirrorDmxForMovingHeadInvert,
  mirrorPercentAroundHome,
  percentToDmx,
} from '../helpers/dmxHelpers'

/** A moving head's pan and tilt as DMX values. */
export type MovingHeadAxes = { panOut: number; tiltOut: number }

/**
 * Resolves a moving head's pan and tilt to DMX.
 *
 * A null axis means the cue is not driving it, which parks the head at its calibrated home. The
 * rig's Horiz mirror is a choreographic overlay applied in percent space around home, before the
 * percent-to-DMX conversion, so a look 15% stage-left becomes 15% stage-right. The fixture's own
 * invert is a mounting property and applies after, at the DMX layer, so the two compose.
 */
export function resolveMovingHeadAxes(
  dmxLight: DmxFixture,
  rig: DmxRig,
  pan: number | null | undefined,
  tilt: number | null | undefined,
): MovingHeadAxes {
  const cfg = normalizeFixtureConfig(dmxLight.config)
  const homePanDmxLogical = percentToDmx(cfg.panHome, cfg.panMin, cfg.panMax)
  const homeTiltDmxLogical = percentToDmx(cfg.tiltHome, cfg.tiltMin, cfg.tiltMax)
  const homePanDmx = cfg.invertPan
    ? mirrorDmxForMovingHeadInvert(homePanDmxLogical, cfg.panMin, cfg.panMax)
    : homePanDmxLogical
  const homeTiltDmx = cfg.invertTilt
    ? mirrorDmxForMovingHeadInvert(homeTiltDmxLogical, cfg.tiltMin, cfg.tiltMax)
    : homeTiltDmxLogical

  let panOut = homePanDmx
  if (pan != null) {
    const panEffective = rig.mirrorHoriz === true ? mirrorPercentAroundHome(pan, cfg.panHome) : pan
    const panDmx = percentToDmx(panEffective, cfg.panMin, cfg.panMax)
    panOut = cfg.invertPan ? mirrorDmxForMovingHeadInvert(panDmx, cfg.panMin, cfg.panMax) : panDmx
  }

  let tiltOut = homeTiltDmx
  if (tilt != null) {
    const tiltDmx = percentToDmx(tilt, cfg.tiltMin, cfg.tiltMax)
    tiltOut = cfg.invertTilt
      ? mirrorDmxForMovingHeadInvert(tiltDmx, cfg.tiltMin, cfg.tiltMax)
      : tiltDmx
  }

  return { panOut, tiltOut }
}

/** A colour the latch is holding for one light. */
export type LatchedColor = { red: number; green: number; blue: number; intensity: number }

/**
 * Holds the brightest colour a hardware-strobing fixture has shown since its strobe began.
 *
 * Stock strobe cues flash opacity, which the blender folds into rgb and intensity, so the
 * post-blend stream swings between the cue's brightest moment and the underlying primary cue. A
 * fixture whose own strobe channel does the chopping wants a steady colour instead, so the peak is
 * what it gets. Brightness is max of intensity and the three primaries, which keeps a
 * constant-intensity coloured strobe latching too.
 *
 * No opacity is involved: by the time light state reaches the publisher, the transition controller
 * has already consumed the strobe's opacity envelope into rgb and intensity and emits a constant
 * opacity of 1.
 */
export class StrobePeakLatch {
  private peaks = new Map<string, LatchedColor>()
  private wasActive = false

  /** Call once a frame, before any light is resolved. Ending a strobe drops every held peak. */
  public beginFrame(strobeActive: boolean): void {
    if (this.wasActive && !strobeActive) {
      this.peaks.clear()
    }
    this.wasActive = strobeActive
  }

  /**
   * The colour to emit for one light. `latching` is true only for a fixture whose hardware strobe
   * channel is currently running, which is the case a steady colour is wanted for. Everything else
   * passes through and gives up any peak it was holding.
   */
  public resolve(lightId: string, latching: boolean, color: LatchedColor): LatchedColor {
    if (!latching) {
      this.peaks.delete(lightId)
      return color
    }

    const currentLevel = Math.max(color.intensity, color.red, color.green, color.blue)
    const peak = this.peaks.get(lightId)
    if (!peak) {
      // A first frame that is fully dark is pre-peak, so emit as-is until something non-zero lands.
      if (currentLevel > 0) {
        this.peaks.set(lightId, { ...color })
      }
      return color
    }

    const peakLevel = Math.max(peak.intensity, peak.red, peak.green, peak.blue)
    if (currentLevel > peakLevel) {
      this.peaks.set(lightId, { ...color })
      return color
    }
    return peak
  }

  /** Drops every held peak. */
  public clear(): void {
    this.peaks.clear()
    this.wasActive = false
  }
}
