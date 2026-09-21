import type { INetCue } from '../../photonics-dmx/cues/interfaces/INetCue'
import type { IAudioCue } from '../../photonics-dmx/cues/interfaces/IAudioCue'
import type { ChainFanout } from './ChainFanout'
import type { RigChain } from './RigChain'
import type { CueData, MotionCueRef } from '../../photonics-dmx/cues/types/cueTypes'
import type { NetCueMode } from '../../photonics-dmx/cues/types/nodeCueTypes'
import { getCueRegistry } from '../../photonics-dmx/cues/registries/cueRegistries'
import { AudioCueRegistry } from '../../photonics-dmx/cues/registries/AudioCueRegistry'
import type { MotionRuntimeDomain } from '../../shared/ipc/common'
import { createMockAudioCueData } from '../ipc/mockCueData'

interface MotionCueSimulatorDeps {
  getChainFanout: () => ChainFanout
}

/** Which domains have a simulated motion cue running. */
export type ActiveMotionSimDomains = Record<MotionRuntimeDomain, boolean>

/**
 * Owns the Cue-Simulation motion-cue state: one active cue per net domain, the active audio motion
 * cue, and the audio execution counter. Held by ControllerManager so it can be reset when the
 * controller graph is rebuilt — the previous module-scope globals survived restartControllers(),
 * leaving a simulated cue "active" against torn-down sequencers.
 */
export class MotionCueSimulator {
  private readonly netCues: Record<NetCueMode, INetCue | null> = { yarg: null, rb3: null }
  private audioCue: IAudioCue | null = null
  private audioExecutionCount = 0

  constructor(private readonly deps: MotionCueSimulatorDeps) {}

  hasNetCueActive(domain: NetCueMode): boolean {
    return this.netCues[domain] !== null
  }

  setNetCue(domain: NetCueMode, cue: INetCue): void {
    this.netCues[domain] = cue
  }

  setAudioCue(cue: IAudioCue): void {
    this.audioCue = cue
  }

  activeDomains(): ActiveMotionSimDomains {
    return {
      yarg: this.netCues.yarg !== null,
      rb3: this.netCues.rb3 !== null,
      audio: this.audioCue !== null,
    }
  }

  /** The registry ref of a net domain's simulated motion cue, or null while none runs. */
  activeNetCueRef(domain: NetCueMode): MotionCueRef | null {
    const cue = this.netCues[domain]
    return cue ? getCueRegistry(domain).findMotionCueRef(cue) : null
  }

  /** The registry ref of the simulated audio motion cue, or null while none runs. */
  activeAudioCueRef(): MotionCueRef | null {
    return this.audioCue ? AudioCueRegistry.getInstance().findMotionCueRef(this.audioCue) : null
  }

  /**
   * Stop and clear every active cue without touching pan/tilt (used by start-paths and restart).
   * Returns which domains were running, so the caller can tell the renderer what cleared.
   */
  clearActive(): ActiveMotionSimDomains {
    const active = this.activeDomains()
    for (const domain of Object.keys(this.netCues) as NetCueMode[]) {
      this.netCues[domain]?.onStop?.()
      this.netCues[domain] = null
    }
    this.audioCue?.onStop?.()
    this.audioCue = null
    this.audioExecutionCount = 0
    return active
  }

  /**
   * Stop simulation and schedule a pan/tilt clear on every chain so secondary rigs don't leave their
   * moving heads pointed at the last motion target. Returns which domains were running.
   */
  stop(): ActiveMotionSimDomains {
    const active = this.clearActive()
    this.deps.getChainFanout().schedulePanTiltClear()
    return active
  }

  /**
   * Reset on controller restart: the chains this simulator drove are being rebuilt, so drop the
   * active cues (no pan/tilt scheduling — the old chains are gone).
   */
  reset(): void {
    this.clearActive()
  }

  /**
   * Execute one net domain's active motion cue once per active rig chain, against the supplied
   * frame. Separate from {@link runAudio} rather than one call taking an optional frame: a net
   * domain cannot run without one, and an optional parameter would turn forgetting it into a silent
   * no-op instead of a type error.
   */
  async runNet(domain: NetCueMode, mockCueData: CueData): Promise<void> {
    const cue = this.netCues[domain]
    if (!cue) return
    await this.executeOnChains((sequencer, lightManager) =>
      cue.execute(mockCueData, sequencer, lightManager),
    )
  }

  /** Execute the active audio motion cue, which builds fresh mock audio from its own counter. */
  async runAudio(): Promise<void> {
    const cue = this.audioCue
    if (!cue) return
    this.audioExecutionCount++
    const mockAudio = createMockAudioCueData(this.audioExecutionCount)
    await this.executeOnChains((sequencer, lightManager) =>
      cue.execute(mockAudio, sequencer, lightManager),
    )
  }

  /** Run every domain's active motion cue for one simulation frame. */
  async runAll(mockCueData: CueData): Promise<void> {
    await this.runNet('yarg', mockCueData)
    await this.runNet('rb3', mockCueData)
    await this.runAudio()
  }

  private async executeOnChains(
    execute: (
      sequencer: RigChain['sequencer'],
      lightManager: RigChain['dmxLightManager'],
    ) => void | Promise<void>,
  ): Promise<void> {
    for (const chain of this.deps.getChainFanout().getChains()) {
      const maybePromise = execute(chain.sequencer, chain.dmxLightManager)
      if (maybePromise instanceof Promise) {
        await maybePromise
      }
    }
  }
}
