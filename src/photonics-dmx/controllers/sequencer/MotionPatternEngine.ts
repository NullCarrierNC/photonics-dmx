import { performance } from 'perf_hooks'
import { normalizeFixtureConfig, RGBIO, TrackedLight } from '../../types'
import {
  degreeOffsetToPercent,
  logicalPanDir,
  shouldMirrorTiltForStageRelative,
} from '../../helpers/dmxHelpers'
import { logicalPanPercentFromMotorDeg, pickAliasedPanMotorDeg } from '../../helpers/panMotorAlias'
import type { ResolvedMotionPatternSetting } from '../../cues/node/compiler/ActionEffectFactory'
import type { ActiveMotionPattern, FrameContext } from './interfaces'
import type { WaveformType } from '../../cues/types/nodeCueTypes'
import { LightTransitionController } from './LightTransitionController'

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

/**
 * Map beam azimuth to a physical pan motor angle in [0, panRangeDeg].
 * When panRangeDeg >= 360°, use the same home-centred 360° window as encircling so lifts stay
 * continuous and never pick negative equivalents that clamp in % space.
 * When panRangeDeg < 360°, enumerate lifts in range and pick nearest to home in circular distance.
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

function panTiltOffsetsFromBeam(
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
}): { panOffsetDeg: number; tiltOffsetDeg: number } {
  const {
    sizeDeg,
    phase,
    ramp,
    fixtureConfig,
    bearingDeg: bearingDegRaw,
    preferredPanMotorDeg,
  } = params
  const bearingDeg = bearingDegRaw ?? 180
  const c = normalizeFixtureConfig(fixtureConfig)
  const mirrorTiltOffset = shouldMirrorTiltForStageRelative(c)
  const cMotion = {
    ...c,
    tiltHome: mirrorTiltOffset ? 100 - c.tiltHome : c.tiltHome,
  }
  const tiltRange = cMotion.tiltRangeDeg
  const tiltHomeDeg = (cMotion.tiltHome / 100) * tiltRange
  const poleTiltDeg = cMotion.tiltStageDeg
  const phi0Deg = tiltHomeDeg - poleTiltDeg
  const tiltHeadroomDeg = Math.max(0, Math.min(tiltHomeDeg, tiltRange - tiltHomeDeg))
  const alphaDeg = Math.min(sizeDeg * ramp, tiltHeadroomDeg)
  if (alphaDeg <= 0 || !Number.isFinite(alphaDeg)) {
    return { panOffsetDeg: 0, tiltOffsetDeg: 0 }
  }

  const panHomeDeg = (cMotion.panHome / 100) * cMotion.panRangeDeg
  const panRangeDeg = cMotion.panRangeDeg

  const enclosesPole = Math.abs(phi0Deg) < alphaDeg - NEAR_POLE_EPS_DEG
  let phi0EffectiveDeg: number
  let circleCenterPanMotorDeg: number
  if (!enclosesPole) {
    phi0EffectiveDeg = phi0Deg
    circleCenterPanMotorDeg = panHomeDeg
  } else {
    phi0EffectiveDeg = alphaDeg
    const panDir = logicalPanDir(cMotion)
    // Match direction-mode set-position: same raw target and intent-based 360° alias pick
    // as resolvePositionToAbsolutePercent direction mode (bearing from panStageDeg).
    const rawPanTarget = cMotion.panStageDeg + panDir * bearingDeg
    circleCenterPanMotorDeg = pickAliasedPanMotorDeg(
      rawPanTarget,
      cMotion.panRangeDeg,
      panHomeDeg,
      'intent',
    )
  }

  const tRad = modPositive(phase, TWO_PI)

  const { x, y, z } = sphereCircleUnit(phi0EffectiveDeg, alphaDeg, circleCenterPanMotorDeg, tRad)
  return panTiltOffsetsFromBeam(
    x,
    y,
    z,
    panHomeDeg,
    tiltHomeDeg,
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
    console.warn(
      `[motion-pattern] light ${lightId} ${axis} clamped from ${raw.toFixed(2)}% to ${clamped.toFixed(2)}%.`,
    )
  }
  return clamped
}

function offsetDegToAbsolutePercent(
  panOffsetDeg: number,
  tiltOffsetDeg: number,
  fixtureConfig: TrackedLight['config'],
  lightId: string,
  preferredPanMotorDeg: number,
): { pan: number; tilt: number; chosenPanMotorDeg: number } {
  const c = normalizeFixtureConfig(fixtureConfig)
  const panDir = logicalPanDir(c)
  const panHomeDeg = (c.panHome / 100) * c.panRangeDeg
  const rawPanMotorDeg = panHomeDeg + panDir * panOffsetDeg
  const chosenPanMotorDeg = pickAliasedPanMotorDeg(
    rawPanMotorDeg,
    c.panRangeDeg,
    preferredPanMotorDeg,
    'continuity',
  )
  const panRaw = logicalPanPercentFromMotorDeg(chosenPanMotorDeg, c.panRangeDeg)
  const tiltDir = shouldMirrorTiltForStageRelative(c) ? -1 : 1
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

        if (cfg.gimbalCompensation) {
          const comp = gimbalCompensatedPanTiltOffsetsDeg({
            sizeDeg: cfg.sizeDeg,
            phase: phasePan,
            ramp,
            fixtureConfig: light.config,
            bearingDeg: cfg.bearingDeg,
            preferredPanMotorDeg,
          })
          panOffsetDeg = comp.panOffsetDeg
          tiltOffsetDeg = comp.tiltOffsetDeg
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
