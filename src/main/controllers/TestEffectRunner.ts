import { CueData, StrobeState, getCueTypeFromId } from '../../photonics-dmx/cues/types/cueTypes'
import { sendToAllWindows } from '../utils/windowUtils'
import { RENDERER_RECEIVE } from '../../shared/ipcChannels'
import type { ChainFanout } from '../../photonics-dmx/controllers/ChainFanout'
import { createLogger } from '../../shared/logger'
const log = createLogger('TestEffectRunner')

export interface TestEffectRunnerContext {
  getChainFanout: () => ChainFanout
  /**
   * Ensure every active rig chain has a `YargCueHandler` attached so test cues dispatched
   * through the fanout reach every rig — not just the primary chain. Idempotent.
   */
  ensureChainsHaveYargHandlers: () => void
  ensureInitialized: () => Promise<void>
}

/**
 * Runs test effects (interval-driven cue firing for UI preview)
 */
export class TestEffectRunner {
  private testEffectInterval: NodeJS.Timeout | null = null
  private testVenueSize: 'NoVenue' | 'Small' | 'Large' = 'Large'
  private testBpm = 120
  private effectId: string | null = null
  private testCueGroup: string | undefined = undefined

  constructor(private readonly ctx: TestEffectRunnerContext) {}

  public startTestEffect(
    effectId: string,
    venueSize?: 'NoVenue' | 'Small' | 'Large',
    bpm?: number,
    cueGroup?: string,
  ): void {
    log.info(
      `TestEffectRunner.startTestEffect effectId: ${effectId}, venueSize: ${venueSize}, BPM: ${bpm}, cueGroup: ${cueGroup ?? 'none'}`,
    )

    if (this.testEffectInterval) {
      clearInterval(this.testEffectInterval)
      this.testEffectInterval = null
    }

    this.testVenueSize = venueSize ?? 'Large'
    this.testBpm = bpm ?? 120
    this.effectId = effectId
    this.testCueGroup = cueGroup
    log.info(`Set testVenueSize to: ${this.testVenueSize}, testBpm to: ${this.testBpm}`)

    this.ctx
      .ensureInitialized()
      .then(() => {
        this.startInternal()
      })
      .catch((error: unknown) => {
        log.error('Error during initialization:', error)
      })
  }

  public async stopTestEffect(): Promise<void> {
    if (!this.testEffectInterval && !this.effectId) {
      return
    }

    if (this.testEffectInterval) {
      clearInterval(this.testEffectInterval)
      this.testEffectInterval = null
    }
    this.effectId = null
    this.testCueGroup = undefined

    // Stop the active cue on every chain's handler and blackout every chain's sequencer
    // (not just the primary). Without this, secondary rigs would stay lit at the last
    // test-effect frame after stop.
    const fanout = this.ctx.getChainFanout()
    fanout.yargStopActiveCue()
    await fanout.yargBlackout(0)
  }

  private startInternal(): void {
    // Make sure every active rig chain has a YARG handler attached before we start
    // dispatching test cues — without this, only chains whose listener has already
    // enabled would see the cue.
    this.ctx.ensureChainsHaveYargHandlers()

    const fanout = this.ctx.getChainFanout()
    if (fanout.getChains().length === 0) {
      log.error('Cannot test effect: no active rig chains')
      return
    }

    const effectId = this.effectId
    if (!effectId) return

    this.testEffectInterval = setInterval(() => {
      this.testCue(effectId)
    }, 16)
  }

  private testCue(cueId: string): void {
    const cue = getCueTypeFromId(cueId)
    if (cue === undefined) {
      log.error('\n Test Cue Error: no cue for ID ', cueId)
      return
    }

    let strobe: StrobeState = 'Strobe_Off' as StrobeState
    if (cueId.indexOf('Strobe') > -1) {
      strobe = cueId as StrobeState
    }

    const data: CueData = {
      datagramVersion: 0,
      platform: 'Windows',
      currentScene: 'Gameplay',
      pauseState: 'Unpaused',
      venueSize: this.testVenueSize,
      beatsPerMinute: this.testBpm,
      songSection: 'Verse',
      guitarNotes: [],
      bassNotes: [],
      drumNotes: [],
      keysNotes: [],
      vocalNote: 0,
      harmony0Note: 0,
      harmony1Note: 0,
      harmony2Note: 0,
      lightingCue: cueId,
      postProcessing: 'Default',
      fogState: false,
      strobeState: strobe,
      performer: 0,
      trackMode: 'simulated',
      simulationCueGroup: this.testCueGroup,
      beat: 'Off',
      keyframe: 'Off',
      bonusEffect: false,
      ledColor: '',
    }

    try {
      // Always dispatch through the fanout — `startInternal` guarantees handlers exist on
      // every chain, so this reaches every rig in lockstep.
      void this.ctx.getChainFanout().handleCue(cue, data)
      sendToAllWindows(RENDERER_RECEIVE.CUE_HANDLED, data)
    } catch (error) {
      log.error('Error handling cue:', error)
    }
  }
}
