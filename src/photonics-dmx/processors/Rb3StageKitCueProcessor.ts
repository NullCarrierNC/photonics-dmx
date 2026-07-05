import { EventEmitter } from 'events'
import type { YargCueRuntime } from '../listeners/YARG/YargNetworkListener'
import { CueType, defaultCueData, ledAggregateMask } from '../cues/types/cueTypes'
import type { CueData, StrobeState } from '../cues/types/cueTypes'
import { createLogger } from '../../shared/logger'

const log = createLogger('rb3-cue')

/** Payload of the listener's `stagekit:data` event (see Rb3eNetworkListener.parseStageKitData). */
interface StageKitData {
  positions: number[]
  color: string
  brightness: 'low' | 'medium' | 'high'
  fog: boolean
  strobeEffect?: 'slow' | 'medium' | 'fast' | 'fastest' | 'off'
  rightChannel: number
  timestamp: number
}

const STROBE_STATE: Record<'slow' | 'medium' | 'fast' | 'fastest' | 'off', StrobeState> = {
  slow: 'Strobe_Slow',
  medium: 'Strobe_Medium',
  fast: 'Strobe_Fast',
  fastest: 'Strobe_Fastest',
  off: 'Strobe_Off',
}

const STROBE_CUE: Record<StrobeState, CueType> = {
  Strobe_Off: CueType.Strobe_Off,
  Strobe_Slow: CueType.Strobe_Slow,
  Strobe_Medium: CueType.Strobe_Medium,
  Strobe_Fast: CueType.Strobe_Fast,
  Strobe_Fastest: CueType.Strobe_Fastest,
  Unknown: CueType.Strobe_Off,
}

const COLOUR_BANKS = ['red', 'green', 'blue', 'yellow'] as const
type ColourBank = (typeof COLOUR_BANKS)[number]

// Position → wait-condition name, indexed 0..7 (LED 1..8). Typed const so they satisfy the
// SongEventCondition union without a cast.
const LED_ON = ['led-1', 'led-2', 'led-3', 'led-4', 'led-5', 'led-6', 'led-7', 'led-8'] as const
const LED_OFF = [
  'led-1-off',
  'led-2-off',
  'led-3-off',
  'led-4-off',
  'led-5-off',
  'led-6-off',
  'led-7-off',
  'led-8-off',
] as const

/** ~30 Hz keepalive so cue-called graphs advance while the LED state is static. */
const DEFAULT_KEEPALIVE_MS = 33

export interface Rb3StageKitCueProcessorOptions {
  /** Keepalive re-dispatch interval; null disables the timer (tests drive tick() directly). */
  keepaliveMs?: number | null
}

/**
 * RB3 "cue mode": turns the RB3E StageKit packet stream into node-cue dispatches, in parallel to the
 * direct processor. It keeps the persistent per-colour-bank LED state (replace-per-colour, like the
 * direct processor's updateColorBank) and, on each packet, dispatches an RB3 cue frame (plus strobe /
 * blackout control cues) to a YargCueRuntime — usually the ChainFanout, which fans to every rig's
 * YargCueHandler. The handler stamps previousFrame, so led-N / fog event nodes fire on edges.
 */
export class Rb3StageKitCueProcessor {
  private banks: Record<ColourBank, number> = { red: 0, green: 0, blue: 0, yellow: 0 }
  private fogState = false
  private strobeState: StrobeState = 'Strobe_Off'
  private lastColour: ColourBank | 'off' = 'off'
  private inMenu = false
  // Gameplay evidence gate: the keepalive stays silent until the first StageKit packet (or an InGame
  // game-state) arrives, so cue mode doesn't dispatch a blank RB3 look at ~30 Hz before a song starts.
  private started = false

  private listener: EventEmitter | null = null
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null
  private readonly keepaliveMs: number | null

  private readonly boundStageKit = (data: StageKitData): void => this.handleStageKit(data)
  private readonly boundGameState = (data: { gameState: string }): void =>
    this.handleGameState(data)

  constructor(
    private readonly runtime: YargCueRuntime,
    options: Rb3StageKitCueProcessorOptions = {},
  ) {
    this.keepaliveMs =
      options.keepaliveMs === undefined ? DEFAULT_KEEPALIVE_MS : options.keepaliveMs
  }

  startListening(listener: EventEmitter): void {
    this.stopListening()
    this.listener = listener
    listener.on('stagekit:data', this.boundStageKit)
    listener.on('rb3e:gameState', this.boundGameState)
    if (this.keepaliveMs && this.keepaliveMs > 0) {
      this.keepaliveTimer = setInterval(() => this.tick(), this.keepaliveMs)
    }
    log.info('RB3 cue-mode processor listening')
  }

  stopListening(): void {
    if (this.listener) {
      this.listener.off('stagekit:data', this.boundStageKit)
      this.listener.off('rb3e:gameState', this.boundGameState)
      this.listener = null
    }
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer)
      this.keepaliveTimer = null
    }
  }

  destroy(): void {
    this.stopListening()
  }

  /** Keepalive dispatch: re-runs the active look so cue-called graphs advance without a new packet. */
  tick(): void {
    if (this.inMenu || !this.started) return
    void this.runtime.handleCue(CueType.RB3, this.buildFrame())
    if (this.strobeState !== 'Strobe_Off') {
      void this.runtime.handleCue(STROBE_CUE[this.strobeState], this.buildFrame())
    }
  }

  private handleGameState(data: { gameState: string }): void {
    const menu = data.gameState !== 'InGame'
    if (!menu) this.started = true // InGame is gameplay evidence; the keepalive may run
    if (menu === this.inMenu) return
    this.inMenu = menu
    if (menu) {
      // Leaving gameplay: clear the accumulated look so a returning game starts clean.
      this.reset()
      void this.runtime.handleCue(CueType.Blackout_Fast, this.buildFrame())
    }
  }

  private handleStageKit(data: StageKitData): void {
    if (this.inMenu) return
    this.started = true // a real packet is gameplay evidence; the keepalive may run
    const before = this.ledSnapshot()

    // DisableAll (0xFF): full StageKit reset — blank everything (the RB3 cue stays active so its
    // led-N-off / fog-off edges fire and the graph renders its own dark state; deliberate deviation
    // from the plan's Blackout_Fast, which would kill the cue).
    if (data.rightChannel === 0xff) {
      this.reset()
      this.emitEdges(before)
      void this.runtime.handleCue(CueType.Strobe_Off, this.buildFrame())
      void this.runtime.handleCue(CueType.RB3, this.buildFrame())
      return
    }

    // Fog rides the event's fog field (the listener already folded persistent fog in).
    this.fogState = data.fog

    // Strobe command: drive the strobe slot; strobe packets carry no colour bank (but may flip fog).
    if (data.strobeEffect) {
      this.strobeState = STROBE_STATE[data.strobeEffect]
      this.emitEdges(before)
      void this.runtime.handleCue(STROBE_CUE[this.strobeState], this.buildFrame())
      return
    }

    // Colour-bank packet: REPLACE that bank's 8-bit mask (mirrors the direct processor's
    // updateColorBank replace semantics); the other three banks persist.
    if ((COLOUR_BANKS as readonly string[]).includes(data.color)) {
      this.banks[data.color as ColourBank] = this.maskFromPositions(data.positions)
      this.lastColour = data.color as ColourBank
    }
    // color 'off' with no strobe (a fog / no-op packet) leaves the banks as-is, like direct mode.

    this.emitEdges(before)
    void this.runtime.handleCue(CueType.RB3, this.buildFrame())
  }

  /** Snapshot the current aggregate LED mask + fog, taken before a packet mutates state. */
  private ledSnapshot(): { mask: number; fog: boolean } {
    return { mask: ledAggregateMask({ ledBanks: this.banks }), fog: this.fogState }
  }

  /** Advance action-timing waits gated on the led-N / fog edges this packet produced, diffing the new
   *  state against `before`. Called before the handleCue dispatch, matching YARG's sequencer-then-cue
   *  order; the keepalive tick never calls this, so a held look produces no edges. */
  private emitEdges(before: { mask: number; fog: boolean }): void {
    const after = ledAggregateMask({ ledBanks: this.banks })
    for (let i = 0; i < 8; i++) {
      const bit = 1 << i
      const was = (before.mask & bit) !== 0
      const now = (after & bit) !== 0
      if (now && !was) this.runtime.handleSongEvent?.(LED_ON[i])
      else if (was && !now) this.runtime.handleSongEvent?.(LED_OFF[i])
    }
    if (this.fogState && !before.fog) this.runtime.handleSongEvent?.('fog-on')
    else if (!this.fogState && before.fog) this.runtime.handleSongEvent?.('fog-off')
  }

  private reset(): void {
    this.banks = { red: 0, green: 0, blue: 0, yellow: 0 }
    this.fogState = false
    this.strobeState = 'Strobe_Off'
    this.lastColour = 'off'
  }

  private maskFromPositions(positions: number[]): number {
    let mask = 0
    for (const p of positions) {
      if (p >= 0 && p <= 7) mask |= 1 << p
    }
    return mask & 0xff
  }

  /** Build a fresh RB3 cue frame from the current accumulated state (no previousFrame — the handler
   *  stamps that from its own history). */
  private buildFrame(): CueData {
    const banks = { ...this.banks }
    const aggregate = ledAggregateMask({ ledBanks: banks })
    const positions: number[] = []
    for (let i = 0; i < 8; i++) {
      if (aggregate & (1 << i)) positions.push(i)
    }
    return {
      ...defaultCueData,
      currentScene: 'Gameplay',
      lightingCue: CueType.RB3,
      fogState: this.fogState,
      strobeState: this.strobeState,
      ledBanks: banks,
      ledColor: aggregate === 0 ? 'off' : this.lastColour,
      ledPositions: positions,
    }
  }
}
