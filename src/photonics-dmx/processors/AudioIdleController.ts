import type { AudioIdleDetectionConfig } from '../listeners/Audio/AudioTypes'

export type AudioIdleState = 'active' | 'pendingIdle' | 'idle' | 'pendingResume'

export type AudioIdleTransition = 'enter' | 'exit' | null

export interface AudioIdleUpdateInput {
  overallLevel: number
  gameModeActive: boolean
  nowMs: number
  config: AudioIdleDetectionConfig
}

/**
 * State machine: low overall energy for minIdleSeconds while Game Mode is on → idle;
 * energy at/above threshold for resumeSeconds → active.
 */
export class AudioIdleController {
  private state: AudioIdleState = 'active'
  private pendingSinceMs: number | null = null

  getState(): AudioIdleState {
    return this.state
  }

  reset(): void {
    this.state = 'active'
    this.pendingSinceMs = null
  }

  update(input: AudioIdleUpdateInput): AudioIdleTransition {
    const { overallLevel, gameModeActive, nowMs, config } = input
    const threshold = config.thresholdPct / 100
    const low = overallLevel < threshold
    const highOrEqual = overallLevel >= threshold

    if (!config.enabled || !gameModeActive) {
      const wasShowingIdle = this.state === 'idle' || this.state === 'pendingResume'
      this.state = 'active'
      this.pendingSinceMs = null
      return wasShowingIdle ? 'exit' : null
    }

    switch (this.state) {
      case 'active': {
        if (low) {
          this.state = 'pendingIdle'
          this.pendingSinceMs = nowMs
        }
        return null
      }
      case 'pendingIdle': {
        if (highOrEqual) {
          this.state = 'active'
          this.pendingSinceMs = null
          return null
        }
        if (
          this.pendingSinceMs != null &&
          nowMs - this.pendingSinceMs >= config.minIdleSeconds * 1000
        ) {
          this.state = 'idle'
          this.pendingSinceMs = null
          return 'enter'
        }
        return null
      }
      case 'idle': {
        if (highOrEqual) {
          this.state = 'pendingResume'
          this.pendingSinceMs = nowMs
        }
        return null
      }
      case 'pendingResume': {
        if (low) {
          this.state = 'idle'
          this.pendingSinceMs = null
          return null
        }
        if (
          this.pendingSinceMs != null &&
          nowMs - this.pendingSinceMs >= config.resumeSeconds * 1000
        ) {
          this.state = 'active'
          this.pendingSinceMs = null
          return 'exit'
        }
        return null
      }
      default:
        return null
    }
  }
}
