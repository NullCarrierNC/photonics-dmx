import { EventEmitter } from 'events'
import type { CueRuntime } from '../cueHandlers/CueRuntime'
import type { Rb3MenuCueDispatch } from '../cueHandlers/Rb3MenuCueHandler'
import { CueType, defaultCueData, ledAggregateMask } from '../cues/types/cueTypes'
import type { CueData, StrobeState } from '../cues/types/cueTypes'
import {
  Rb3RightChannel,
  RB3_MAIN_HUB_SCREEN,
  RB3_SONG_SELECT_SCREEN,
} from '../listeners/RB3/rb3eTypes'
import type { StageKitData } from '../listeners/RB3/rb3eTypes'
import { Rb3MenuFramePump } from './rb3MenuAnimation'
import { Rb3GameModeManager, Rb3GameModeSchedulePayload } from './Rb3GameModeManager'
import { createLogger } from '../../shared/logger'

const log = createLogger('rb3-cue')

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
  /** Menu-look dispatch (the ChainFanout in production); drives the RB3 menu cue while in menus.
   *  Omitted in unit tests that only exercise the gameplay cue path. */
  menuDispatch?: Rb3MenuCueDispatch
  /** RB3 primary-cue dwell range (seconds), from the rb3Motion prefs. When set, the processor arms a
   *  primary-cue switch on the countdown and fires it on the next Light-1 edge — rotating the primary
   *  group and re-rolling motion. Omitted in tests that don't exercise switching. */
  getMotionSwitchDurationRangeSec?: () => { min: number; max: number }
  /** Enabled primary-cue groups to rotate among (RB3 has one cueType, so rotation is by group).
   *  Defaults to none, i.e. no visible rotation — the timer then only re-rolls motion. */
  getPrimaryGroupPool?: () => string[]
  /** False pins the primary group for the whole song (the RB3 lighting `oncePerSong` mode). */
  getRotationEnabled?: () => boolean
  /** Renderer push: the active primary-cue group changed (game mode). */
  onPrimaryCueChange?: (groupId: string | null) => void
  /** Renderer push: the primary-cue countdown schedule changed (game mode). */
  onGameModeScheduleChange?: (info: Rb3GameModeSchedulePayload) => void
}

/**
 * RB3 "cue mode": turns the RB3E StageKit packet stream into node-cue dispatches, in parallel to the
 * direct processor. It keeps the persistent per-colour-bank LED state (replace-per-colour, like the
 * direct processor's updateColorBank) and, on each packet, dispatches an RB3 cue frame (plus strobe /
 * blackout control cues) to a CueRuntime — usually the ChainFanout, which fans to every rig's
 * CueHandler. The handler stamps previousFrame, so led-N / fog event nodes fire on edges.
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
  // Last song-span value (started && !inMenu); syncSongSpan fires song notifications on its edges.
  private wasInSong = false

  private listener: EventEmitter | null = null
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null
  private readonly keepaliveMs: number | null
  private readonly menuDispatch: Rb3MenuCueDispatch | null
  // Menu-look pump: an immediate first frame (enterMenu already set inMenu), no restart on a
  // repeated start, frames gated on inMenu so a stale tick never paints over gameplay.
  private readonly menuFramePump = new Rb3MenuFramePump({
    getDispatch: () => this.menuDispatch,
    isActive: () => this.inMenu,
    immediateFirstFrame: true,
    restartOnStart: false,
  })

  private readonly boundStageKit = (data: StageKitData): void => this.handleStageKit(data)
  private readonly boundGameState = (data: { gameState: string }): void =>
    this.handleGameState(data)
  private readonly boundScreenName = (data: { screenName: string }): void =>
    this.handleScreenName(data)

  /** Primary-cue rotation + dwell timer; null when no duration range was supplied (switching off). */
  private readonly gameModeManager: Rb3GameModeManager | null

  constructor(
    private readonly runtime: CueRuntime,
    options: Rb3StageKitCueProcessorOptions = {},
  ) {
    this.keepaliveMs =
      options.keepaliveMs === undefined ? DEFAULT_KEEPALIVE_MS : options.keepaliveMs
    this.menuDispatch = options.menuDispatch ?? null
    this.gameModeManager = options.getMotionSwitchDurationRangeSec
      ? new Rb3GameModeManager(
          options.getPrimaryGroupPool ?? (() => []),
          options.getMotionSwitchDurationRangeSec,
          () => this.runtime.requestMotionRepick?.(),
          options.getRotationEnabled ?? (() => true),
        )
      : null
    if (this.gameModeManager) {
      if (options.onPrimaryCueChange) {
        this.gameModeManager.setOnPrimaryCueChange(options.onPrimaryCueChange)
      }
      if (options.onGameModeScheduleChange) {
        this.gameModeManager.setOnScheduleChange(options.onGameModeScheduleChange)
      }
    }
  }

  startListening(listener: EventEmitter): void {
    this.stopListening()
    this.listener = listener
    listener.on('stagekit:data', this.boundStageKit)
    listener.on('rb3e:gameState', this.boundGameState)
    // Screen-name events drive menu entry (state cleanup + the menu look when a dispatch is wired).
    listener.on('rb3e:screenName', this.boundScreenName)
    if (this.keepaliveMs && this.keepaliveMs > 0) {
      this.keepaliveTimer = setInterval(() => this.tick(), this.keepaliveMs)
    }
    log.info('RB3 cue-mode processor listening')
  }

  stopListening(): void {
    if (this.listener) {
      this.listener.off('stagekit:data', this.boundStageKit)
      this.listener.off('rb3e:gameState', this.boundGameState)
      this.listener.off('rb3e:screenName', this.boundScreenName)
      this.listener = null
    }
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer)
      this.keepaliveTimer = null
    }
    this.menuFramePump.stop()
    // Close an open song span so the registry's once-per-song locks don't outlive the processor.
    if (this.wasInSong) {
      this.wasInSong = false
      this.runtime.notifySongEnd()
    }
  }

  destroy(): void {
    this.stopListening()
  }

  /** Keepalive dispatch: re-runs the active look so cue-called graphs advance without a new packet. */
  tick(): void {
    if (this.inMenu || !this.started) return
    // Arm a primary-cue switch once the countdown elapses; it fires on the next Light-1 edge (emitEdges).
    this.gameModeManager?.tick()
    void this.runtime.handleCue(CueType.RB3, this.buildFrame())
    if (this.strobeState !== 'Strobe_Off') {
      void this.runtime.handleCue(STROBE_CUE[this.strobeState], this.buildFrame())
    }
  }

  private handleGameState(data: { gameState: string }): void {
    const menu = data.gameState !== 'InGame'
    if (!menu) this.started = true // InGame is gameplay evidence; the keepalive may run
    if (menu) {
      this.enterMenu()
    } else {
      this.exitMenu()
    }
    this.syncSongSpan()
  }

  /** RB3E hub / song-select screens drive the same menu look as direct mode; other screens are
   *  ignored. */
  private handleScreenName(data: { screenName: string }): void {
    if (data.screenName !== RB3_MAIN_HUB_SCREEN && data.screenName !== RB3_SONG_SELECT_SCREEN) {
      return
    }
    this.enterMenu()
    this.syncSongSpan()
  }

  /** Song span = gameplay evidence seen and not in a menu. Fires the runtime's song notifications
   *  on the span's edges so shared once-per-song state (cue-group and motion locks, consistency
   *  tracking) follows RB3 songs the way it follows YARG songs. Called after every mutation of
   *  `started` / `inMenu`; the keepalive tick mutates neither, so it never re-fires. */
  private syncSongSpan(): void {
    const inSong = this.started && !this.inMenu
    if (inSong === this.wasInSong) return
    this.wasInSong = inSong
    if (inSong) {
      this.runtime.notifySongStart()
      this.gameModeManager?.start()
    } else {
      this.runtime.notifySongEnd()
      this.gameModeManager?.stop()
    }
  }

  /** Enter the menu look: clear the accumulated gameplay state so a returning game starts clean,
   *  blank the rig, and start painting menu frames. No-op when already in a menu — a game-state
   *  and a screen-name event announcing the same menu must not re-blank. */
  private enterMenu(): void {
    if (this.inMenu) return
    this.inMenu = true
    this.reset()
    void this.runtime.handleCue(CueType.Blackout_Fast, this.buildFrame())
    if (this.menuDispatch) {
      this.menuFramePump.start()
    }
  }

  /** Leave the menu look: from here the RB3 cue drives the lights. No-op outside a menu. */
  private exitMenu(): void {
    if (!this.inMenu) return
    this.inMenu = false
    this.menuFramePump.stop()
  }

  private handleStageKit(data: StageKitData): void {
    if (this.inMenu) {
      // Menu-time packets: only active gameplay evidence (a lit colour bank, a strobe turning on,
      // or fog turning on) pulls the processor out of the menu. End-of-song teardown traffic —
      // DisableAll, strobe/fog off, bank clears — leaves the menu look running, and a lost or
      // late InGame game-state event no longer keeps the song's opening packets from rendering.
      if (!this.isActiveGameplayPacket(data)) return
      this.exitMenu()
    }
    this.started = true // a real packet is gameplay evidence; the keepalive may run
    this.syncSongSpan()
    const before = this.ledSnapshot()

    // DisableAll (0xFF): full StageKit reset — blank everything (the RB3 cue stays active so its
    // led-N-off / fog-off edges fire and the graph renders its own dark state; deliberate deviation
    // from the plan's Blackout_Fast, which would kill the cue).
    if (data.rightChannel === Rb3RightChannel.DisableAll) {
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

    // Colour-bank packet: REPLACE that bank's 8-bit mask with the raw leftChannel (mirrors the direct
    // processor's updateColorBank replace semantics); the other three banks persist.
    if ((COLOUR_BANKS as readonly string[]).includes(data.color)) {
      this.banks[data.color as ColourBank] = data.leftChannel & 0xff
      this.lastColour = data.color as ColourBank
    }
    // color 'off' with no strobe (a fog / no-op packet) leaves the banks as-is, like direct mode.

    this.emitEdges(before)
    void this.runtime.handleCue(CueType.RB3, this.buildFrame())
  }

  /** A packet that lights something: a colour bank with LEDs set, a strobe turning on, or fog on. */
  private isActiveGameplayPacket(data: StageKitData): boolean {
    if (
      (COLOUR_BANKS as readonly string[]).includes(data.color) &&
      (data.leftChannel & 0xff) !== 0
    ) {
      return true
    }
    if (data.strobeEffect && data.strobeEffect !== 'off') return true
    return data.rightChannel === Rb3RightChannel.FogOn
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
      // Light 1 (bit 0) gates the primary-cue switch: any change fires a pending switch (RB3 has no beat).
      if (i === 0 && was !== now) this.gameModeManager?.notifyLight1Edge()
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
      // Force the game-mode-selected primary group (empty pool -> unset -> normal selection).
      preferredCueGroup: this.gameModeManager?.getActivePrimaryGroupId() || undefined,
    }
  }
}
