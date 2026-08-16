import type { INetCue } from '../../photonics-dmx/cues/interfaces/INetCue'
import type { IAudioCue } from '../../photonics-dmx/cues/interfaces/IAudioCue'
import type { ChainFanout } from './ChainFanout'
import type { RigChain } from './RigChain'
import type { CueData } from '../../photonics-dmx/cues/types/cueTypes'
import type { GameCueMode, NodeCueMode } from '../../photonics-dmx/cues/types/nodeCueTypes'
import { createMockAudioCueData } from '../ipc/mockCueData'

interface MotionCueSimulatorDeps {
  getChainFanout: () => ChainFanout
}

/**
 * Owns the Cue-Simulation motion-cue state: one active cue per game domain, the active audio motion
 * cue, and the audio execution counter. Held by ControllerManager so it can be reset when the
 * controller graph is rebuilt — the previous module-scope globals survived restartControllers(),
 * leaving a simulated cue "active" against torn-down sequencers.
 */
export class MotionCueSimulator {
  private readonly gameCues: Record<GameCueMode, INetCue | null> = { yarg: null, rb3: null }
  private audioCue: IAudioCue | null = null
  private audioExecutionCount = 0

  constructor(private readonly deps: MotionCueSimulatorDeps) {}

  hasGameCueActive(domain: GameCueMode): boolean {
    return this.gameCues[domain] !== null
  }

  setGameCue(domain: GameCueMode, cue: INetCue): void {
    this.gameCues[domain] = cue
  }

  setAudioCue(cue: IAudioCue): void {
    this.audioCue = cue
  }

  /** Stop and clear every active cue without touching pan/tilt (used by start-paths and restart). */
  clearActive(): void {
    for (const domain of Object.keys(this.gameCues) as GameCueMode[]) {
      this.gameCues[domain]?.onStop?.()
      this.gameCues[domain] = null
    }
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
    this.deps.getChainFanout().schedulePanTiltClear()
  }

  /**
   * Reset on controller restart: the chains this simulator drove are being rebuilt, so drop the
   * active cues (no pan/tilt scheduling — the old chains are gone).
   */
  reset(): void {
    this.clearActive()
  }

  /**
   * Execute one domain's active motion cue once per active rig chain. Game domains run against the
   * supplied mock cue data; audio builds fresh mock audio each pass from its own execution counter.
   */
  async run(domain: NodeCueMode, mockCueData?: CueData): Promise<void> {
    if (domain === 'audio') {
      if (!this.audioCue) return
      this.audioExecutionCount++
      const mockAudio = createMockAudioCueData(this.audioExecutionCount)
      const cue = this.audioCue
      await this.executeOnChains((sequencer, lightManager) =>
        cue.execute(mockAudio, sequencer, lightManager),
      )
      return
    }
    const cue = this.gameCues[domain]
    if (!cue || !mockCueData) return
    await this.executeOnChains((sequencer, lightManager) =>
      cue.execute(mockCueData, sequencer, lightManager),
    )
  }

  /** Run every domain's active motion cue for one simulation frame. */
  async runAll(mockCueData: CueData): Promise<void> {
    await this.run('yarg', mockCueData)
    await this.run('rb3', mockCueData)
    await this.run('audio')
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
