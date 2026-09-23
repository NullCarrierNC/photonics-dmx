import type { AudioCueHandler } from '../cueHandlers/AudioCueHandler'
import { DEFAULT_AUDIO_CONFIG } from '../listeners/Audio/AudioConfig'
import type { AudioConfig, AudioLightingData } from '../listeners/Audio/AudioTypes'
import type { FrameTransient, SimDriver } from './FrameDriver'

/** Live audio state shared across dispatched frames. */
export interface AudioFrameState {
  /** The audio cue in the primary slot. */
  cue: string
  /** The audio cue in the secondary slot, or null for none. */
  secondary: string | null
  /** The audio strobe cue, or null for none. */
  strobe: string | null
  bpm: number
  /** Input level from 0 to 1, spread evenly over the spectrum so every band reads it. */
  level: number
}

const SAMPLE_RATE = 48000
const CONFIG: AudioConfig = { ...DEFAULT_AUDIO_CONFIG, enabled: true }

/**
 * Synthesises one audio analysis frame from the live {@link AudioFrameState} and hands it to the
 * {@link AudioCueHandler}, as the audio processor does for each captured frame. A beat transient
 * marks its frame as a detected beat. The spectrum is flat at the live level, so every band and the
 * overall energy read the same value.
 */
export class AudioFrameDriver implements SimDriver {
  constructor(
    private readonly handler: AudioCueHandler,
    private readonly getState: () => AudioFrameState,
  ) {}

  public async dispatch(transient: FrameTransient = {}): Promise<void> {
    const state = this.getState()
    await this.handler.handleAudioData(
      this.buildFrame(state, transient.beat !== undefined),
      CONFIG,
      state.cue,
      state.secondary,
      state.strobe,
      CONFIG.bands.length,
      false,
    )
  }

  public stopCues(): void {
    this.handler.clearCurrentCue()
  }

  public shutdown(): void {
    this.handler.destroy()
  }

  private buildFrame(state: AudioFrameState, beat: boolean): AudioLightingData {
    const level = Math.max(0, Math.min(1, state.level))
    return {
      timestamp: Date.now(),
      overallLevel: level,
      bpm: state.bpm > 0 ? state.bpm : null,
      beatDetected: beat,
      energy: level,
      amplitude: level,
      rawFrequencyData: new Array<number>(CONFIG.fftSize / 2).fill(Math.round(level * 255)),
      sampleRate: SAMPLE_RATE,
      fftSize: CONFIG.fftSize,
    }
  }
}
