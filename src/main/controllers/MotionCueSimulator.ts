import type { INetCue } from '../../photonics-dmx/cues/interfaces/INetCue'
import type { IAudioCue } from '../../photonics-dmx/cues/interfaces/IAudioCue'
import type { ChainFanout } from './ChainFanout'
import type { CueData } from '../../photonics-dmx/cues/types/cueTypes'
import { createMockAudioCueData } from '../ipc/mockCueData'

interface MotionCueSimulatorDeps {
  getChainFanout: () => ChainFanout
}

/**
 * Owns the Cue-Simulation motion-cue state (the active YARG and audio motion cues + the audio
 * execution counter). Held by ControllerManager so it can be reset when the controller graph is
 * rebuilt — the previous module-scope globals survived restartControllers(), leaving a simulated cue
 * "active" against torn-down sequencers.
 */
export class MotionCueSimulator {
  private yargCue: INetCue | null = null
  private audioCue: IAudioCue | null = null
  private audioExecutionCount = 0

  constructor(private readonly deps: MotionCueSimulatorDeps) {}

  hasYargActive(): boolean {
    return this.yargCue !== null
  }

  setYargCue(cue: INetCue): void {
    this.yargCue = cue
  }

  setAudioCue(cue: IAudioCue): void {
    this.audioCue = cue
  }

  /** Stop and clear both active cues without touching pan/tilt (used by start-paths and restart). */
  clearActive(): void {
    this.yargCue?.onStop?.()
    this.yargCue = null
    this.audioCue?.onStop?.()
    this.audioCue = null
    this.audioExecutionCount = 0
  }

  /**
   * Stop simulation and schedule a pan/tilt clear on every chain so secondary rigs don't leave their
   * moving heads pointed at the last motion target.
   */
  stop(): void {
    this.clearActive()
    this.deps.getChainFanout().yargSchedulePanTiltClear()
  }

  /**
   * Reset on controller restart: the chains this simulator drove are being rebuilt, so drop the
   * active cues (no pan/tilt scheduling — the old chains are gone).
   */
  reset(): void {
    this.clearActive()
  }

  /** Execute the active YARG motion cue once per active rig chain. */
  async runYarg(mockCueData: CueData): Promise<void> {
    if (!this.yargCue) return
    for (const chain of this.deps.getChainFanout().getChains()) {
      const maybePromise = this.yargCue.execute(mockCueData, chain.sequencer, chain.dmxLightManager)
      if (maybePromise instanceof Promise) {
        await maybePromise
      }
    }
  }

  /** Execute the active audio motion cue once per active rig chain with fresh mock audio data. */
  async runAudio(): Promise<void> {
    if (!this.audioCue) return
    this.audioExecutionCount++
    const mockAudio = createMockAudioCueData(this.audioExecutionCount)
    for (const chain of this.deps.getChainFanout().getChains()) {
      const maybePromise = this.audioCue.execute(mockAudio, chain.sequencer, chain.dmxLightManager)
      if (maybePromise instanceof Promise) {
        await maybePromise
      }
    }
  }
}
