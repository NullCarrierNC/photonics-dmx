import type { AudioGameModeConfig, AudioLightingData } from '../listeners/Audio/AudioTypes'
import type { IAudioCue } from '../cues/interfaces/IAudioCue'
import { AudioCueRegistry } from '../cues/registries/AudioCueRegistry'
import type { AudioCueType } from '../cues/types/audioCueTypes'

function randomInRange(minSec: number, maxSec: number): number {
  return minSec + Math.random() * (maxSec - minSec)
}

function pickRandom<T>(items: T[]): T | undefined {
  if (items.length === 0) return undefined
  return items[Math.floor(Math.random() * items.length)]
}

function getCueStyle(registry: AudioCueRegistry, cueType: AudioCueType): IAudioCue['style'] {
  const cue = registry.getCueImplementation(cueType)
  return cue?.style
}

function isStrobeStyleCue(registry: AudioCueRegistry, cueType: AudioCueType): boolean {
  return getCueStyle(registry, cueType) === 'strobe'
}

/** Cues eligible as Game Mode primary (excludes style strobe). */
function filterPrimaryRotationPool(
  registry: AudioCueRegistry,
  types: AudioCueType[],
): AudioCueType[] {
  return types.filter((t) => !isStrobeStyleCue(registry, t))
}

/**
 * Drives automatic primary cue cycling for audio Game Mode.
 */
export class AudioGameModeManager {
  private config: AudioGameModeConfig
  private registry = AudioCueRegistry.getInstance()
  private primaryCue: AudioCueType = ''
  private pendingSwitch = false
  private switchDeadlineMs = 0
  private onCueSwitch: ((cueType: AudioCueType) => void) | null = null

  constructor(initialConfig: AudioGameModeConfig) {
    this.config = { ...initialConfig }
  }

  public start(): void {
    let pool = filterPrimaryRotationPool(this.registry, this.registry.getAvailableCueTypes())
    if (pool.length === 0) {
      pool = filterPrimaryRotationPool(this.registry, this.registry.getAvailableCueTypes(true))
    }
    if (pool.length === 0) {
      const any = this.registry.getAvailableCueTypes()
      const fallbackAny = any.length > 0 ? any : this.registry.getAvailableCueTypes(true)
      this.primaryCue = pickRandom(fallbackAny) ?? ''
    } else {
      this.primaryCue = pickRandom(pool) ?? ''
    }
    this.pendingSwitch = false
    this.scheduleNextSwitch()
    this.onCueSwitch?.(this.primaryCue)
  }

  public setOnCueSwitch(cb: ((cueType: AudioCueType) => void) | null): void {
    this.onCueSwitch = cb
  }

  public stop(): void {
    this.pendingSwitch = false
  }

  public updateConfig(config: AudioGameModeConfig): void {
    this.config = { ...config }
    if (!this.pendingSwitch && this.switchDeadlineMs > 0) {
      const remaining = this.switchDeadlineMs - Date.now()
      if (remaining < 0) {
        this.pendingSwitch = true
      }
    }
  }

  public getActivePrimaryCue(): AudioCueType {
    return this.primaryCue
  }

  /**
   * Run once per audio frame before cue execution.
   */
  public processFrame(audioData: AudioLightingData): void {
    const now = Date.now()
    if (!this.pendingSwitch && now >= this.switchDeadlineMs) {
      this.pendingSwitch = true
    }

    if (this.pendingSwitch && audioData.beatDetected) {
      this.switchToNextCue()
      this.pendingSwitch = false
      this.scheduleNextSwitch()
    }
  }

  private scheduleNextSwitch(): void {
    const { cueDurationMin, cueDurationMax } = this.config
    const durationSec = randomInRange(cueDurationMin, cueDurationMax)
    this.switchDeadlineMs = Date.now() + Math.round(durationSec * 1000)
  }

  private switchToNextCue(): void {
    const prev = this.primaryCue
    let pool = filterPrimaryRotationPool(this.registry, this.registry.getAvailableCueTypes())
    if (pool.length === 0) {
      pool = filterPrimaryRotationPool(this.registry, this.registry.getAvailableCueTypes(true))
    }
    if (pool.length === 0) {
      const any = this.registry.getAvailableCueTypes()
      const fallbackAny = any.length > 0 ? any : this.registry.getAvailableCueTypes(true)
      const others = fallbackAny.filter((id) => id !== this.primaryCue)
      this.primaryCue = (others.length > 0 ? pickRandom(others) : fallbackAny[0]) ?? this.primaryCue
      if (this.primaryCue !== prev) {
        this.onCueSwitch?.(this.primaryCue)
      }
      return
    }

    const others = pool.filter((id) => id !== this.primaryCue)
    if (others.length > 0) {
      this.primaryCue = pickRandom(others) ?? this.primaryCue
    }
    if (this.primaryCue !== prev) {
      this.onCueSwitch?.(this.primaryCue)
    }
  }
}
