import {
  CueData,
  CueType,
  StrobeState,
  getCueTypeFromId,
} from '../../photonics-dmx/cues/types/cueTypes'
import { sendToAllWindows } from '../utils/windowUtils'
import { RENDERER_RECEIVE } from '../../shared/ipcChannels'
import type { ChainFanout } from '../../photonics-dmx/controllers/ChainFanout'
import { createLogger } from '../../shared/logger'
const log = createLogger('TestEffectRunner')

export interface TestEffectRunnerContext {
  getChainFanout: () => ChainFanout
  ensureInitialized: () => Promise<void>
}

/**
 * The per-domain cue plumbing the runner drives. The interval, CueData building, and blackout are
 * domain-agnostic; only which per-chain handler receives the cue (and stops) differs between YARG
 * and RB3, so those are injected.
 */
export interface TestCueDispatcher {
  /** Attach this domain's cue handlers to every active rig chain (idempotent). */
  ensureHandlers: () => void
  /** Dispatch one cue to this domain's per-chain handlers. */
  dispatch: (cue: CueType, data: CueData) => void
  /** Stop this domain's active cue on every chain (the runner handles blackout separately). */
  stopActiveCue: () => void
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

  constructor(
    private readonly ctx: TestEffectRunnerContext,
    private readonly dispatcher: TestCueDispatcher,
  ) {}

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
    // test-effect frame after stop. Blackout is per-chain sequencer work shared across domains.
    const fanout = this.ctx.getChainFanout()
    this.dispatcher.stopActiveCue()
    await fanout.yargBlackout(0)
  }

  private startInternal(): void {
    // Make sure every active rig chain has this domain's cue handler attached before we start
    // dispatching test cues — without this, only chains whose listener has already enabled
    // would see the cue.
    this.dispatcher.ensureHandlers()

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
      // Dispatch through the injected domain dispatcher — `startInternal` guarantees this
      // domain's handlers exist on every chain, so this reaches every rig in lockstep.
      this.dispatcher.dispatch(cue, data)
      sendToAllWindows(RENDERER_RECEIVE.CUE_HANDLED, data)
    } catch (error) {
      log.error('Error handling cue:', error)
    }
  }
}
