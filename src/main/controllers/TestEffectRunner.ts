import {
  CueData,
  CueType,
  StrobeState,
  getCueTypeFromId,
  ledAggregateMask,
} from '../../photonics-dmx/cues/types/cueTypes'
import { sendToAllWindows } from '../utils/windowUtils'
import { RENDERER_RECEIVE } from '../../shared/ipcChannels'
import type { ChainFanout } from '../../photonics-dmx/controllers/ChainFanout'
import type { SongEventCondition } from '../../photonics-dmx/controllers/sequencer/interfaces'
import { createLogger } from '../../shared/logger'
const log = createLogger('TestEffectRunner')

/** RB3 StageKit LED bank masks (each 8 bits) plus fog, as the simulator drives them. */
export interface Rb3LedState {
  red: number
  green: number
  blue: number
  yellow: number
  fog: boolean
}

const RB3_LED_OFF: Rb3LedState = { red: 0, green: 0, blue: 0, yellow: 0, fog: false }

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
  /** Dispatch an RB3 LED/fog edge (led-N / led-N-off / fog-on / fog-off) to this domain's
   *  song-event path. Only the RB3 dispatcher provides this; other domains omit it. */
  songEvent?: (condition: SongEventCondition) => void
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
  private rb3LedState: Rb3LedState = { ...RB3_LED_OFF }
  private rb3LastColour = 'off'

  constructor(
    private readonly ctx: TestEffectRunnerContext,
    private readonly dispatcher: TestCueDispatcher,
  ) {}

  /**
   * Set the simulated RB3 StageKit LED bank masks + fog. The next dispatched frame carries them as
   * `ledBanks`, and the aggregate/fog change emits led-N / led-N-off / fog edges through the
   * dispatcher's song-event path (mirroring the live processor), so both the always-active RB3 cue
   * and any led-N-event-driven cue respond.
   */
  public setRb3LedState(state: Rb3LedState): void {
    const before = {
      mask: ledAggregateMask({ ledBanks: this.rb3LedState }),
      fog: this.rb3LedState.fog,
    }
    const banks: Rb3LedState = {
      red: state.red & 0xff,
      green: state.green & 0xff,
      blue: state.blue & 0xff,
      yellow: state.yellow & 0xff,
      fog: state.fog,
    }
    // ledColor tracks a representative lit bank (the led-color cue-data); 'off' when dark.
    const lit = (['red', 'green', 'blue', 'yellow'] as const).find((c) => banks[c] !== 0)
    this.rb3LastColour = lit ?? 'off'
    this.rb3LedState = banks
    this.emitRb3Edges(before)
  }

  private emitRb3Edges(before: { mask: number; fog: boolean }): void {
    if (!this.dispatcher.songEvent) return
    const after = ledAggregateMask({ ledBanks: this.rb3LedState })
    for (let i = 0; i < 8; i++) {
      const bit = 1 << i
      const was = (before.mask & bit) !== 0
      const now = (after & bit) !== 0
      if (now && !was) this.dispatcher.songEvent(`led-${i + 1}` as SongEventCondition)
      else if (was && !now) this.dispatcher.songEvent(`led-${i + 1}-off` as SongEventCondition)
    }
    if (this.rb3LedState.fog && !before.fog) this.dispatcher.songEvent('fog-on')
    else if (!this.rb3LedState.fog && before.fog) this.dispatcher.songEvent('fog-off')
  }

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
    this.rb3LedState = { ...RB3_LED_OFF }
    this.rb3LastColour = 'off'

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

  private rb3LedPositions(): number[] {
    const mask = ledAggregateMask({ ledBanks: this.rb3LedState })
    const positions: number[] = []
    for (let i = 0; i < 8; i++) {
      if (mask & (1 << i)) positions.push(i)
    }
    return positions
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
      fogState: this.rb3LedState.fog,
      strobeState: strobe,
      performer: 0,
      trackMode: 'simulated',
      simulationCueGroup: this.testCueGroup,
      beat: 'Off',
      keyframe: 'Off',
      bonusEffect: false,
      ledBanks: {
        red: this.rb3LedState.red,
        green: this.rb3LedState.green,
        blue: this.rb3LedState.blue,
        yellow: this.rb3LedState.yellow,
      },
      ledColor: ledAggregateMask({ ledBanks: this.rb3LedState }) === 0 ? 'off' : this.rb3LastColour,
      ledPositions: this.rb3LedPositions(),
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
