import { performance } from 'perf_hooks'
import { normalizeFixtureConfig, RGBIO } from '../../types'
import type { ResolvedMotionPatternSetting } from '../../cues/node/compiler/ActionEffectFactory'
import type { ActiveMotionPattern, FrameContext } from './interfaces'
import { LightTransitionController } from './LightTransitionController'
import {
  TWO_PI,
  evaluateWaveform,
  fanPhaseOffsetRad,
  gimbalCompensatedPanTiltOffsetsDeg,
  offsetDegToAbsolutePercent,
} from './motionGeometry'

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
