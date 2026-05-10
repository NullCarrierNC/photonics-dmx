import { performance } from 'perf_hooks'
import { normalizeFixtureConfig, RGBIO, TrackedLight } from '../../types'
import {
  canonicalGimbalTiltHomeDeg,
  degreeOffsetToPercent,
  logicalPanDir,
  shouldMirrorTiltForStageRelative,
} from '../../helpers/dmxHelpers'
import { logicalPanPercentFromMotorDeg, pickAliasedPanMotorDeg } from '../../helpers/panMotorAlias'
import { reflectBearingUsDs } from '../../helpers/stageDirections'
import type { ResolvedMotionPatternSetting } from '../../cues/node/compiler/ActionEffectFactory'
import type { ActiveMotionPattern, FrameContext } from './interfaces'
import type { WaveformType } from '../../cues/types/nodeCueTypes'
import { LightTransitionController } from './LightTransitionController'
import { createLogger } from '../../../shared/logger'
const log = createLogger('MotionPatternEngine')

const TWO_PI = Math.PI * 2
const DEG_TO_RAD = Math.PI / 180
const RAD_TO_DEG = 180 / Math.PI

/** Tiny epsilon so boundary cases at |φ₀| = α do not flip into near-pole mode spuriously. */
const NEAR_POLE_EPS_DEG = 1e-9

function modPositive(x: number, m: number): number {
  return ((x % m) + m) % m
}

function signPhi0Deg(phi0Deg: number): number {
  if (Math.abs(phi0Deg) < 1e-12) {
    return 0
  }
  return Math.sign(phi0Deg)
}

/**
 * Small circle on the unit sphere centred on the home beam direction (colatitude φ₀ from pole, pan = panHomeDeg).
 * Basis: home, e₁ (tilt at fixed pan), e₂ (pan at fixed tilt); orbit = cos(α)·home + sin(α)·(cos(t)·e₁ + sin(t)·e₂).
 */
function sphereCircleUnit(
  phi0Deg: number,
  alphaDeg: number,
  panHomeDeg: number,
  tRad: number,
): { x: number; y: number; z: number } {
  const phi0 = phi0Deg * DEG_TO_RAD
  const panRad = panHomeDeg * DEG_TO_RAD
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

/**
 * Pan azimuth (degrees, 0–360) consistent with top-down projection:
 * x = sin(pan)*r, y = -cos(pan)*r (see LightsDmxPreview).
 */
function panAzimuthDegFromBeamXY(x: number, y: number): number {
  let deg = Math.atan2(x, -y) * RAD_TO_DEG
  if (deg < 0) {
    deg += 360
  }
  return deg
}

/** A 360° pan motor window inside [0, panRangeDeg] that contains panHomeDeg when possible. */
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

/** Map beam azimuth to a pan motor angle inside the encircling window (continuous 360° sweep). */
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

/**
 * Map beam azimuth to a physical pan motor angle in [0, panRangeDeg].
 * When panRangeDeg >= 360°, use the same home-centred 360° window as encircling so lifts stay
 * continuous and never pick negative equivalents that clamp in % space.
 * When panRangeDeg < 360°, enumerate lifts in range and pick nearest to preferred in linear motor
 * distance, with in-range clamp tie-break (matches encircling branch).
 */
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

function wrapSignedDeg(d: number): number {
  return ((((d + 180) % 360) + 360) % 360) - 180
}

/**
 * Tilt motor from beam z and horizontal components, coupled to the chosen pan motor angle
 * so hemisphere matches the orbit (same dot2d rule for standard and bearing-offset circles).
 */
function tiltMotorDegFromBeam(
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
  const side = Math.sign(dot2d)
  if (sPhi === 0) {
    return poleTiltDeg - thetaDeg
  }
  return poleTiltDeg + sPhi * side * thetaDeg
}

/**
 * Inverse kinematics: beam direction → pan/tilt motor offsets.
 *
 * `tiltHomeDegForIK` drives the IK geometry and may be a canonical (mirrored) value for
 * inverted fixtures. `tiltHomeDegForOffset` is the actual motor home used for the output
 * offset baseline and for the motor-bounds check — these differ for inverted fixtures with
 * asymmetric `tiltStageDeg`.
 */
function panTiltOffsetsFromBeam(
  x: number,
  y: number,
  z: number,
  panHomeDeg: number,
  tiltHomeDegForIK: number,
  tiltHomeDegForOffset: number,
  poleTiltDeg: number,
  panRangeDeg: number,
  tiltRangeDeg: number,
  phi0EffectiveDeg: number,
  preferredPanMotorDeg?: number,
): { panOffsetDeg: number; tiltOffsetDeg: number } {
  const zc = Math.max(-1, Math.min(1, z))
  const az0 = panAzimuthDegFromBeamXY(x, y)
  const initialMotorAzimuth = phi0EffectiveDeg < 0 ? modPositive(az0 + 180, 360) : az0
  let panMotorDeg = pickPanMotorDegFromAzimuth(
    initialMotorAzimuth,
    panHomeDeg,
    panRangeDeg,
    preferredPanMotorDeg ?? panHomeDeg,
  )
  let tiltMotorDeg = tiltMotorDegFromBeam(zc, poleTiltDeg, phi0EffectiveDeg, x, y, panMotorDeg)

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
      tiltMotorDeg = tiltMotorDegFromBeam(zc, poleTiltDeg, phi0EffectiveDeg, x, y, panMotorDeg)
      break
    }
    panMotorDeg = nextPan
    tiltMotorDeg = tiltMotorDegFromBeam(zc, poleTiltDeg, phi0EffectiveDeg, x, y, panMotorDeg)
  }

  // Convert from IK (canonical) motor space to actual motor space.
  // When canonical mirroring was applied (ikHome ≠ actualHome), the canonical orbit is the
  // pole-reflection of the actual orbit: actualMotor = 2·poleTiltDeg − ikMotor.
  // When no mirror was applied (ikHome === actualHome), the IK ran in actual space directly.
  const wasMirrored = Math.abs(tiltHomeDegForIK - tiltHomeDegForOffset) > 1e-9
  const tiltMotorDegActual = wasMirrored ? 2 * poleTiltDeg - tiltMotorDeg : tiltMotorDeg
  let finalTiltMotorDeg = tiltMotorDegActual
  let finalPanMotorDeg = panMotorDeg

  if (finalTiltMotorDeg < 0 || finalTiltMotorDeg > tiltRangeDeg) {
    const flippedTilt = poleTiltDeg - (finalTiltMotorDeg - poleTiltDeg)
    if (flippedTilt >= 0 && flippedTilt <= tiltRangeDeg) {
      finalTiltMotorDeg = flippedTilt
      finalPanMotorDeg = pickPanMotorDegFromAzimuth(
        modPositive(panMotorDeg + 180, 360),
        panHomeDeg,
        panRangeDeg,
        preferredPanMotorDeg ?? panHomeDeg,
      )
    }
  }

  const panOffsetDeg = finalPanMotorDeg - panHomeDeg
  const tiltOffsetDeg = finalTiltMotorDeg - tiltHomeDegForOffset

  return { panOffsetDeg, tiltOffsetDeg }
}

/**
 * Spherical circle on the pan/tilt gimbal: small circle on the unit sphere. When the home-centred
 * circle would enclose the tilt pole, the orbit is offset in `bearingDeg` so the nearest edge
 * reaches the pole while angular radius stays `size` (see docs/moving-head-system.md).
 */
export function gimbalCompensatedPanTiltOffsetsDeg(params: {
  sizeDeg: number
  phase: number
  ramp: number
  fixtureConfig: TrackedLight['config']
  /** Stage bearing (deg); only used in near-pole mode. Defaults to downstage (180). */
  bearingDeg?: number
  /** Previous frame pan motor angle for continuity across valid lifts. */
  preferredPanMotorDeg?: number
  /** When true, bearing reflects across SR-SL for back-row lights in front-back layout. */
  bearingIsFlipped?: boolean
}): { panOffsetDeg: number; tiltOffsetDeg: number } {
  const {
    sizeDeg,
    phase,
    ramp,
    fixtureConfig,
    bearingDeg: bearingDegRaw,
    preferredPanMotorDeg,
    bearingIsFlipped,
  } = params
  const baseBearing = bearingDegRaw ?? 180
  const bearingDeg = bearingIsFlipped === true ? reflectBearingUsDs(baseBearing) : baseBearing
  const c = normalizeFixtureConfig(fixtureConfig)
  const tiltRange = c.tiltRangeDeg
  const actualTiltHomeDeg = (c.tiltHome / 100) * tiltRange
  // Canonical IK home: for inverted fixtures, mirror tilt home across the pole so the IK
  // solver sees a positive phi0 in the up-firing frame regardless of tiltStageDeg.
  const ikTiltHomeDeg = canonicalGimbalTiltHomeDeg(c)
  const poleTiltDeg = c.tiltStageDeg
  const phi0Deg = ikTiltHomeDeg - poleTiltDeg
  // Headroom uses the actual motor home to respect physical travel limits.
  const tiltHeadroomDeg = Math.max(0, Math.min(actualTiltHomeDeg, tiltRange - actualTiltHomeDeg))
  const alphaDeg = Math.min(sizeDeg * ramp, tiltHeadroomDeg)
  if (alphaDeg <= 0 || !Number.isFinite(alphaDeg)) {
    return { panOffsetDeg: 0, tiltOffsetDeg: 0 }
  }

  const panHomeDeg = (c.panHome / 100) * c.panRangeDeg
  const panRangeDeg = c.panRangeDeg
  const panDir = logicalPanDir(c)

  const enclosesPole = Math.abs(phi0Deg) < alphaDeg - NEAR_POLE_EPS_DEG
  let phi0EffectiveDeg: number
  let circleCenterPanMotorDeg: number
  if (!enclosesPole) {
    phi0EffectiveDeg = phi0Deg
    circleCenterPanMotorDeg = panHomeDeg
  } else {
    phi0EffectiveDeg = alphaDeg
    const rawPanTarget = c.panStageDeg + panDir * bearingDeg
    circleCenterPanMotorDeg = pickAliasedPanMotorDeg(
      rawPanTarget,
      c.panRangeDeg,
      preferredPanMotorDeg ?? panHomeDeg,
      'continuity-clamp',
    )
  }

  // panTiltOffsetsFromBeam applies a +180° azimuth offset when phi0EffectiveDeg < 0, which flips
  // the motor pan direction of travel relative to the sphere orbit. Negate phase so stage-CW
  // matches the cue label for both hemispheres (same intrinsic pan sense as phi0 > 0).
  const phaseSign = phi0EffectiveDeg < 0 ? -1 : 1
  const tRad = modPositive(phaseSign * phase, TWO_PI)

  const { x, y, z } = sphereCircleUnit(phi0EffectiveDeg, alphaDeg, circleCenterPanMotorDeg, tRad)
  // IK runs in canonical frame (ikTiltHomeDeg); output offsets are in actual motor space
  // because panTiltOffsetsFromBeam uses tiltHomeDegForOffset (actualTiltHomeDeg) for the
  // offset baseline and bounds check.
  return panTiltOffsetsFromBeam(
    x,
    y,
    z,
    panHomeDeg,
    ikTiltHomeDeg,
    actualTiltHomeDeg,
    poleTiltDeg,
    panRangeDeg,
    tiltRange,
    phi0EffectiveDeg,
    preferredPanMotorDeg,
  )
}

/**
 * Waveform in [-1, 1]; phase in radians.
 */
export function evaluateWaveform(type: WaveformType, phase: number): number {
  switch (type) {
    case 'sine':
      return Math.sin(phase)
    case 'cosine':
      return Math.cos(phase)
    case 'triangle': {
      const t = (phase / TWO_PI) % 1
      const u = t < 0 ? t + 1 : t
      return u < 0.5 ? 4 * u - 1 : 3 - 4 * u
    }
    case 'sawtooth': {
      const t = (phase / TWO_PI) % 1
      const u = t < 0 ? t + 1 : t
      return 2 * u - 1
    }
    case 'square':
      return Math.sin(phase) >= 0 ? 1 : -1
    default:
      return Math.sin(phase)
  }
}

function clampPercentAxis(axis: 'pan' | 'tilt', raw: number, lightId: string): number {
  const clamped = Math.max(0, Math.min(100, raw))
  if (raw < -1e-6 || raw > 100 + 1e-6) {
    log.warn(
      `[motion-pattern] light ${lightId} ${axis} clamped from ${raw.toFixed(2)}% to ${clamped.toFixed(2)}%.`,
    )
  }
  return clamped
}

/**
 * Converts stage-relative degree offsets (waveform path) or actual motor-space offsets
 * (gimbal path) to absolute logical pan/tilt percentages.
 *
 * `gimbalMode` must be true when the offsets come from `gimbalCompensatedPanTiltOffsetsDeg`.
 * In that case the tilt offset is already in actual logical motor space and must NOT have the
 * percentage-space mirror applied (that mirror is only correct for stage-relative waveform
 * offsets, not for motor offsets that the IK already solved in the right frame).
 */
function offsetDegToAbsolutePercent(
  panOffsetDeg: number,
  tiltOffsetDeg: number,
  fixtureConfig: TrackedLight['config'],
  lightId: string,
  preferredPanMotorDeg: number,
  gimbalMode = false,
): { pan: number; tilt: number; chosenPanMotorDeg: number } {
  const c = normalizeFixtureConfig(fixtureConfig)
  const panDir = logicalPanDir(c)
  const panHomeDeg = (c.panHome / 100) * c.panRangeDeg
  const rawPanMotorDeg = panHomeDeg + panDir * panOffsetDeg
  const chosenPanMotorDeg = pickAliasedPanMotorDeg(
    rawPanMotorDeg,
    c.panRangeDeg,
    preferredPanMotorDeg,
    'continuity-clamp',
  )
  const panRaw = logicalPanPercentFromMotorDeg(chosenPanMotorDeg, c.panRangeDeg)
  // Gimbal offsets are in actual motor space; applying the percentage-space mirror would
  // double-flip the tilt. Waveform offsets are stage-relative and need the mirror to land
  // on the correct side of home after the DMX publisher applies hardware inversion.
  const tiltDir = !gimbalMode && shouldMirrorTiltForStageRelative(c) ? -1 : 1
  const tiltRaw = c.tiltHome + tiltDir * degreeOffsetToPercent(tiltOffsetDeg, c.tiltRangeDeg)
  return {
    pan: clampPercentAxis('pan', panRaw, lightId),
    tilt: clampPercentAxis('tilt', tiltRaw, lightId),
    chosenPanMotorDeg,
  }
}

function fanPhaseOffsetRad(lightIndex: number, lightCount: number, fanSpreadDeg: number): number {
  if (lightCount <= 1 || fanSpreadDeg === 0) {
    return 0
  }
  return ((lightIndex / lightCount) * fanSpreadDeg * Math.PI) / 180
}

/**
 * Per-frame parametric pan/tilt; writes transparent RGB layers with pan/tilt into LTC.
 */
export class MotionPatternEngine {
  private readonly ltc: LightTransitionController
  private readonly patterns = new Map<string, ActiveMotionPattern>()
  private readonly lastPanMotorDegByPatternLight = new Map<string, number>()

  constructor(lightTransitionController: LightTransitionController) {
    this.ltc = lightTransitionController
  }

  public addPattern(pattern: ActiveMotionPattern): void {
    this.patterns.set(pattern.name, pattern)
  }

  public removePattern(name: string): void {
    const run = this.patterns.get(name)
    if (!run) {
      return
    }
    this.patterns.delete(name)
    for (const light of run.lights) {
      this.lastPanMotorDegByPatternLight.delete(`${name}:${light.id}`)
      this.ltc.removeGeneratorLayer(light.id, run.layer)
    }
  }

  public removeAllPatterns(): void {
    const names = Array.from(this.patterns.keys())
    for (const name of names) {
      this.removePattern(name)
    }
  }

  public hasPattern(name: string): boolean {
    return this.patterns.has(name)
  }

  /** Active run for idempotent motion-pattern updates (same config + layer + ramp + lights). */
  public getPattern(name: string): ActiveMotionPattern | undefined {
    return this.patterns.get(name)
  }

  /** Swap resolved config without resetting phase or ramp progress (e.g. live `bearingDeg` updates). */
  public updatePatternConfig(name: string, config: ResolvedMotionPatternSetting): void {
    const run = this.patterns.get(name)
    if (!run) {
      return
    }
    run.config = config
  }

  public advanceFrame(frame: FrameContext): void {
    const now = frame.frameStartTime ?? performance.now()

    for (const run of this.patterns.values()) {
      const elapsedMs = now - run.startTime
      const ramp = run.rampUpDurationMs <= 0 ? 1 : Math.min(1, elapsedMs / run.rampUpDurationMs)

      const cfg: ResolvedMotionPatternSetting = run.config
      const tSec = elapsedMs / 1000
      const basePhase = TWO_PI * cfg.speedHz * tSec
      const dirSign = cfg.reverse ? -1 : 1

      const lightCount = run.lights.length

      for (let i = 0; i < lightCount; i++) {
        const light = run.lights[i]!
        const fanRad = fanPhaseOffsetRad(i, lightCount, cfg.fanSpreadDeg)

        const phasePan =
          cfg.panFreqMultiplier * dirSign * (basePhase + fanRad) +
          (cfg.panPhaseOffsetDeg * Math.PI) / 180
        const phaseTilt = cfg.tiltFreqMultiplier * dirSign * (basePhase + fanRad)

        let panOffsetDeg: number
        let tiltOffsetDeg: number
        const continuityKey = `${run.name}:${light.id}`
        const lightCfg = normalizeFixtureConfig(light.config)
        const panHomeDeg = (lightCfg.panHome / 100) * lightCfg.panRangeDeg
        const preferredPanMotorDeg =
          this.lastPanMotorDegByPatternLight.get(continuityKey) ?? panHomeDeg

        let gimbalMode = false
        if (cfg.gimbalCompensation) {
          const comp = gimbalCompensatedPanTiltOffsetsDeg({
            sizeDeg: cfg.sizeDeg,
            phase: phasePan,
            ramp,
            fixtureConfig: light.config,
            bearingDeg: cfg.bearingDeg,
            preferredPanMotorDeg,
            bearingIsFlipped: light.bearingIsFlipped,
          })
          panOffsetDeg = comp.panOffsetDeg
          tiltOffsetDeg = comp.tiltOffsetDeg
          gimbalMode = true
        } else {
          const panOsc = evaluateWaveform(cfg.panWaveform, phasePan)
          const tiltOsc = evaluateWaveform(cfg.tiltWaveform, phaseTilt)
          panOffsetDeg = ramp * cfg.panAmplitudeDeg * panOsc
          tiltOffsetDeg = ramp * cfg.tiltAmplitudeDeg * tiltOsc
        }

        const { pan, tilt, chosenPanMotorDeg } = offsetDegToAbsolutePercent(
          panOffsetDeg,
          tiltOffsetDeg,
          light.config,
          light.id,
          preferredPanMotorDeg,
          gimbalMode,
        )
        this.lastPanMotorDegByPatternLight.set(continuityKey, chosenPanMotorDeg)

        const state: RGBIO = {
          red: 0,
          green: 0,
          blue: 0,
          intensity: 0,
          opacity: 0,
          blendMode: 'replace',
          pan,
          tilt,
        }

        this.ltc.setGeneratorLayerState(light.id, run.layer, state)
      }
    }
  }
}
