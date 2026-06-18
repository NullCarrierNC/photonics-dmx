/**
 * The audio-trigger band envelope rises quickly (attack) and falls slowly (release), so
 * light-organ cues snap up on transients but ease down without flicker — and it stays
 * frame-rate independent because the coefficient is derived from the actual frame delta.
 */
import { describe, expect, it } from '@jest/globals'

import { asymmetricEnvelopeStep } from '../../../../cues/node/runtime/BaseAudioNodeCue'

describe('asymmetricEnvelopeStep', () => {
  const FRAME_MS = 1000 / 60 // ~16.67ms, the audio analysis cadence

  it('rises faster than it falls for the same step and frame delta', () => {
    const attackMs = 30
    const releaseMs = 300

    // Rising from 0 toward 1 with a short attack constant.
    const up = asymmetricEnvelopeStep(0, 1, FRAME_MS, attackMs, releaseMs)
    // Falling from 1 toward 0 with a long release constant.
    const down = 1 - asymmetricEnvelopeStep(1, 0, FRAME_MS, attackMs, releaseMs)

    // Fraction covered toward target in one frame: attack should move much more than release.
    expect(up).toBeGreaterThan(down)
    expect(up).toBeGreaterThan(0.4) // snappy up
    expect(down).toBeLessThan(0.1) // gentle down
  })

  it('snaps instantly when the edge time constant is zero', () => {
    expect(asymmetricEnvelopeStep(0, 0.8, FRAME_MS, 0, 500)).toBeCloseTo(0.8, 6)
    expect(asymmetricEnvelopeStep(0.8, 0, FRAME_MS, 30, 0)).toBeCloseTo(0, 6)
  })

  it('is frame-rate independent: two half-frames ≈ one full frame', () => {
    const tauAttack = 50
    const tauRelease = 400
    const target = 1

    const oneStep = asymmetricEnvelopeStep(0, target, FRAME_MS, tauAttack, tauRelease)

    const half = FRAME_MS / 2
    const a = asymmetricEnvelopeStep(0, target, half, tauAttack, tauRelease)
    const twoSteps = asymmetricEnvelopeStep(a, target, half, tauAttack, tauRelease)

    expect(twoSteps).toBeCloseTo(oneStep, 6)
  })

  it('monotonically approaches but does not overshoot the target', () => {
    let v = 0
    for (let i = 0; i < 100; i++) {
      const next = asymmetricEnvelopeStep(v, 1, FRAME_MS, 30, 300)
      expect(next).toBeGreaterThanOrEqual(v)
      expect(next).toBeLessThanOrEqual(1)
      v = next
    }
    expect(v).toBeGreaterThan(0.99)
  })
})
