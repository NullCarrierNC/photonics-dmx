import type {
  AudioGameModeConfig,
  AudioGameModeSchedulePayload,
  AudioLightingData,
} from '../listeners/Audio/AudioTypes'
import { AudioCueRegistry } from '../cues/registries/AudioCueRegistry'
import type { AudioCueType } from '../cues/types/audioCueTypes'
import { pickOther, pickRandom } from '../helpers/utils'
import { isStrobeStyleCue } from './audioStrobeHelpers'
import { DwellTimer } from './dwellTimer'

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
  private readonly dwell = new DwellTimer()
  private onCueSwitch: ((cueType: AudioCueType) => void) | null = null

  constructor(initialConfig: AudioGameModeConfig) {
    this.config = { ...initialConfig }
  }

  public start(): void {
    const pool = this.rotationPool()
    this.primaryCue = pickRandom(pool.length > 0 ? pool : this.anyCues()) ?? ''
    this.dwell.clearPending()
    this.scheduleNextSwitch()
    this.dwell.emit()
    this.onCueSwitch?.(this.primaryCue)
  }

  /**
   * Re-validate the active primary cue against the current eligible pool WITHOUT restarting a
   * still-valid run. Re-rolls and reschedules only when the active cue is empty or no longer
   * eligible (e.g. after the user toggles cue groups), otherwise the running cue and its dwell
   * timer are left untouched. Used by `refreshCueSelection` so incidental refreshes (settings
   * edits, cue hot-reloads) don't yank the lights to a new cue and reset the schedule.
   */
  public ensureValidPrimary(): void {
    const pool = this.rotationPool()
    const eligible = pool.length > 0 ? pool : this.registry.getAvailableCueTypes()
    if (this.primaryCue !== '' && eligible.includes(this.primaryCue)) {
      // Active cue still valid: leave it and its dwell timer running, just re-broadcast state.
      this.dwell.emit()
      return
    }
    // Active cue is empty or not in the eligible pool: pick a fresh one and (re)schedule.
    this.start()
  }

  public setOnCueSwitch(cb: ((cueType: AudioCueType) => void) | null): void {
    this.onCueSwitch = cb
  }

  public setOnScheduleChange(cb: ((info: AudioGameModeSchedulePayload) => void) | null): void {
    this.dwell.setOnChange(cb)
  }

  public stop(): void {
    this.dwell.emitCleared()
    this.dwell.clearPending()
  }

  public updateConfig(config: AudioGameModeConfig): void {
    this.config = { ...config }
    if (this.dwell.isScheduled) {
      this.dwell.armIfElapsed()
    }
  }

  public getActivePrimaryCue(): AudioCueType {
    return this.primaryCue
  }

  /**
   * Run once per audio frame before cue execution.
   */
  public processFrame(audioData: AudioLightingData): void {
    this.dwell.armIfElapsed()

    if (this.dwell.isPending && audioData.beatDetected) {
      this.switchToNextCue()
      this.dwell.clearPending()
      this.scheduleNextSwitch()
      this.dwell.emit()
    }
  }

  private scheduleNextSwitch(): void {
    this.dwell.schedule(this.config.cueDurationMin, this.config.cueDurationMax)
  }

  /** Non-strobe cues from the enabled groups, or from every group when the enabled ones hold none. */
  private rotationPool(): AudioCueType[] {
    const enabled = filterPrimaryRotationPool(this.registry, this.registry.getAvailableCueTypes())
    return enabled.length > 0
      ? enabled
      : filterPrimaryRotationPool(this.registry, this.registry.getAvailableCueTypes(true))
  }

  /** Every cue from the enabled groups, or from every group when the enabled ones hold none. */
  private anyCues(): AudioCueType[] {
    const enabled = this.registry.getAvailableCueTypes()
    return enabled.length > 0 ? enabled : this.registry.getAvailableCueTypes(true)
  }

  private switchToNextCue(): void {
    const prev = this.primaryCue
    const pool = this.rotationPool()
    if (pool.length > 0) {
      this.primaryCue = pickOther(pool, this.primaryCue) ?? this.primaryCue
    } else {
      const fallback = this.anyCues()
      this.primaryCue = pickOther(fallback, this.primaryCue) ?? fallback[0] ?? this.primaryCue
    }
    if (this.primaryCue !== prev) {
      this.onCueSwitch?.(this.primaryCue)
    }
  }
}
