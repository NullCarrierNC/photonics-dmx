/**
 * StageKitDirectProcessor - Direct StageKit light data to DMX mapping.
 *
 * Receives StageKit events from the RB3E network listener and dispatches them to every
 * active rig's `Rb3StageKitRigProcessor`, so secondary rigs see the same gameplay
 * lighting (LED-position colour banks, strobes, blackouts) against their own light layout.
 *
 * Game state, menu animation timing, and renderer-bound `cueHandled` event emission stay
 * on this coordinator. The per-rig render machinery lives in `Rb3StageKitRigProcessor`.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { EventEmitter } from 'events'
import { StageKitConfig, DEFAULT_STAGEKIT_CONFIG } from '../listeners/RB3/StageKitTypes'
import { CueData } from '../cues/types/cueTypes'
import { Rb3MenuCueDispatch } from '../cueHandlers/Rb3MenuCueHandler'
import { Rb3StageKitRigProcessor } from './Rb3StageKitRigProcessor'
import { ChainFanout } from '../controllers/ChainFanout'
import { createLogger } from '../../shared/logger'
const log = createLogger('Rb3StageKitDirectProcessor')

const RB3_MAIN_HUB_SCREEN = 'main_hub_screen'
const RB3_SONG_SELECT_SCREEN = 'song_select_screen'

/**
 * StageKit data structure
 */
export interface StageKitData {
  positions: number[] // LED positions [0,1,2,3,4,5,6,7]
  color: string // Color: 'red', 'green', 'blue', 'yellow', 'off'
  brightness: 'low' | 'medium' | 'high'
  fog?: boolean // StageKit FogOn/FogOff state (no DMX fog output yet; see fogState propagation)
  strobeEffect?: 'slow' | 'medium' | 'fast' | 'fastest' | 'off' // Strobe effect type
  timestamp: number
}

export class Rb3StageKitDirectProcessor extends EventEmitter {
  private config: StageKitConfig
  /** Per-rig render processors keyed by rigId. Order doesn't matter — strobes/colours
   *  run independently per rig. Built at construction; managed by `refreshRigs`. */
  private rigs: Map<string, Rb3StageKitRigProcessor> = new Map()

  // Bound event handler for proper cleanup
  private boundHandleStageKitEvent: ((event: StageKitData) => void) | null = null
  private boundHandleGameStateEvent: ((event: any) => void) | null = null
  private boundHandleScreenNameEvent:
    | ((event: { screenName: string; timestamp: number }) => void)
    | null = null

  // Game state tracking
  private _currentGameState: 'Menus' | 'InGame' | 'None' = 'None'

  // Track if we're currently in a song (using direct control)
  private _inSong: boolean = false

  // Menu animation timer
  private menuAnimationTimer: NodeJS.Timeout | null = null

  /**
   * Builds one `Rb3StageKitRigProcessor` per active rig in the supplied `ChainFanout`.
   * Chains with fewer than 4 lights are skipped with a warning (StageKit's light mapper
   * only supports 4- or 8-light modes).
   */
  constructor(
    private chainFanout: ChainFanout,
    stageKitConfig: Partial<StageKitConfig> = {},
    private cueHandler?: Rb3MenuCueDispatch | null,
  ) {
    super()
    this.config = { ...DEFAULT_STAGEKIT_CONFIG, ...stageKitConfig }
    this.rebuildRigProcessorsFromChains()
  }

  /**
   * Synchronise `this.rigs` with the current chain list. Constructs a new rig processor
   * for chains that joined; disposes processors for chains that left. Chains whose light
   * count is below StageKit's 4-light minimum are skipped with a warning so a misconfigured
   * rig can't break RB3 on its siblings.
   *
   * Public via `refreshRigs()` so future `refreshActiveRigs` integration can call it.
   */
  private rebuildRigProcessorsFromChains(): void {
    const chains = this.chainFanout.getChains()
    const currentRigIds = new Set(chains.map((c) => c.rigId))

    // Dispose rigs that left the active set.
    for (const [rigId, rig] of this.rigs) {
      if (!currentRigIds.has(rigId)) {
        void rig.dispose().catch((err) => log.error(`Rig ${rigId}: error disposing:`, err))
        this.rigs.delete(rigId)
      }
    }

    // Add rigs that joined.
    for (const chain of chains) {
      if (this.rigs.has(chain.rigId)) continue
      try {
        const rig = new Rb3StageKitRigProcessor(
          chain.rigId,
          chain.dmxLightManager,
          chain.sequencer,
          this.config,
        )
        this.rigs.set(rig.rigId, rig)
      } catch (err) {
        // Most likely the chain has <4 lights — skip it but keep the others working.
        log.warn(`Skipping StageKit rig ${chain.rigId}: ${(err as Error).message}`)
      }
    }
  }

  /** Public entry point for re-syncing the rig processors with the chain list — used by
   *  the listener controller after `refreshActiveRigs` so rig add/remove takes effect
   *  without restarting controllers. Idempotent. */
  public refreshRigs(): void {
    this.rebuildRigProcessorsFromChains()
  }

  /**
   * Start listening for StageKit events
   * @param networkListener The network listener to listen to
   */
  public startListening(networkListener: EventEmitter): void {
    this.boundHandleStageKitEvent = this.handleStageKitEvent.bind(this)
    this.boundHandleGameStateEvent = this.handleGameStateEvent.bind(this)

    networkListener.on(
      'stagekit:data',
      this.boundHandleStageKitEvent as (event: StageKitData) => void,
    )
    networkListener.on('rb3e:gameState', this.boundHandleGameStateEvent as (event: unknown) => void)

    this.boundHandleScreenNameEvent = this.handleScreenNameEvent.bind(this)
    networkListener.on(
      'rb3e:screenName',
      this.boundHandleScreenNameEvent as (event: { screenName: string; timestamp: number }) => void,
    )

    log.info(
      'StageKitDirectProcessor: Registered listeners for stagekit:data, rb3e:gameState, and rb3e:screenName',
    )
  }

  /**
   * Stop listening for events
   * @param networkListener The network listener to stop listening to
   */
  public stopListening(networkListener: EventEmitter): void {
    if (this.boundHandleStageKitEvent) {
      networkListener.off('stagekit:data', this.boundHandleStageKitEvent)
      this.boundHandleStageKitEvent = null
    }
    if (this.boundHandleGameStateEvent) {
      networkListener.off('rb3e:gameState', this.boundHandleGameStateEvent)
      this.boundHandleGameStateEvent = null
    }
    if (this.boundHandleScreenNameEvent) {
      networkListener.off('rb3e:screenName', this.boundHandleScreenNameEvent)
      this.boundHandleScreenNameEvent = null
    }
    log.info(
      'StageKitDirectProcessor stopped listening for stagekit:data, rb3e:gameState, and rb3e:screenName',
    )
  }

  /**
   * Cue payload for RB3 menu-style screens (code-based Default cue, not node editor).
   */
  private buildMenusCueData(
    realCueData: CueData | null,
    platform: string,
    rb3ScreenNameOverride?: string,
  ): CueData {
    return {
      datagramVersion: realCueData?.datagramVersion || 1,
      platform: realCueData?.platform || 'RB3E',
      currentScene: 'Menu',
      pauseState: realCueData?.pauseState || 'Unpaused',
      venueSize: 'NoVenue',
      beatsPerMinute: realCueData?.beatsPerMinute || 0,
      songSection: realCueData?.songSection || 'Unknown',
      guitarNotes: realCueData?.guitarNotes || [],
      bassNotes: realCueData?.bassNotes || [],
      drumNotes: realCueData?.drumNotes || [],
      keysNotes: realCueData?.keysNotes || [],
      vocalNote: realCueData?.vocalNote || 0,
      harmony0Note: realCueData?.harmony0Note || 0,
      harmony1Note: realCueData?.harmony1Note || 0,
      harmony2Note: realCueData?.harmony2Note || 0,
      lightingCue: 'Default',
      postProcessing: realCueData?.postProcessing || 'Default',
      fogState: realCueData?.fogState || false,
      strobeState: realCueData?.strobeState || 'Strobe_Off',
      performer: realCueData?.performer || 0,
      trackMode: realCueData?.trackMode || 'tracked',
      beat: realCueData?.beat || 'Unknown',
      keyframe: realCueData?.keyframe || 'Unknown',
      bonusEffect: realCueData?.bonusEffect || false,
      ledColor: '',
      ledPositions: [],
      rb3Platform: platform,
      rb3BuildTag: realCueData?.rb3BuildTag || '',
      rb3SongName: realCueData?.rb3SongName || '',
      rb3SongArtist: realCueData?.rb3SongArtist || '',
      rb3SongShortName: realCueData?.rb3SongShortName || '',
      rb3VenueName: realCueData?.rb3VenueName || '',
      rb3ScreenName: rb3ScreenNameOverride ?? realCueData?.rb3ScreenName ?? '',
      rb3BandInfo: realCueData?.rb3BandInfo || { members: [] },
      rb3ModData: realCueData?.rb3ModData || { identifyValue: '', string: '' },
      totalScore: realCueData?.totalScore || 0,
      memberScores: realCueData?.memberScores || [],
      stars: realCueData?.stars || 0,
      sustainDurationMs: realCueData?.sustainDurationMs || 0,
      measureOrBeat: realCueData?.measureOrBeat || 0,
      cueHistory: [],
      executionCount: 1,
      cueStartTime: Date.now(),
      timeSinceLastCue: 0,
    }
  }

  private isDefaultMenuCueRunning(): boolean {
    return this._currentGameState === 'Menus' && this.menuAnimationTimer !== null
  }

  /**
   * Same Default menu path as Menus game state: cueHandled, clear direct lights, menu animation timer.
   */
  private applyDefaultMenuCueForScreenName(screenName: string): void {
    this._currentGameState = 'Menus'
    this._inSong = false
    this.emit('cueHandled', this.buildMenusCueData(null, 'RB3E', screenName))
    void this.turnOffAllRigs().catch((error) => {
      log.error(
        'StageKitDirectProcessor: Error clearing lights during screen-based Default menu cue:',
        error,
      )
    })
    this.startMenuAnimationTimer()
  }

  /**
   * RB3E screen names that map to the main menu: drive the same Default menu cue as Menus game state.
   * song_select_screen is skipped when that cue is already active to avoid restarting the menu loop.
   */
  private handleScreenNameEvent(event: { screenName: string; timestamp: number }): void {
    const { screenName } = event
    if (screenName !== RB3_MAIN_HUB_SCREEN && screenName !== RB3_SONG_SELECT_SCREEN) {
      return
    }

    if (screenName === RB3_SONG_SELECT_SCREEN && this.isDefaultMenuCueRunning()) {
      log.info(
        'StageKitDirectProcessor: song_select_screen skipped — Default menu cue already running',
      )
      return
    }

    try {
      if (screenName === RB3_MAIN_HUB_SCREEN) {
        log.info(
          'StageKitDirectProcessor: Main hub screen — applying code-based Default menu cue (rb3e:screenName)',
        )
      } else {
        log.info(
          'StageKitDirectProcessor: Song select screen — applying code-based Default menu cue (rb3e:screenName)',
        )
      }
      this.applyDefaultMenuCueForScreenName(screenName)
    } catch (error) {
      log.error('StageKitDirectProcessor: Error handling rb3e:screenName:', error)
    }
  }

  /**
   * Handle StageKit events
   */
  private handleStageKitEvent(event: StageKitData): void {
    const { positions, color, strobeEffect } = event

    if (!this._inSong) {
      log.info(
        'StageKitDirectProcessor: Received StageKit event while not in song, marking as in song',
      )
      this._inSong = true
    }

    if (strobeEffect === 'off') {
      this.clearStrobeEffectsAtPositions(positions)
    } else if (strobeEffect) {
      this.applyStrobeEffect(strobeEffect)
    } else if (color !== 'off') {
      void this.applyLightData(positions, color)
    } else {
      void this.clearLightsAtPositions(positions)
    }

    this.emit('stagekit:processed', {
      positions,
      color,
      strobeEffect,
      timestamp: Date.now(),
    })
    this.emitCueDataForStageKit(event)
  }

  /**
   * Handle game state events
   */
  private handleGameStateEvent(event: {
    gameState: 'Menus' | 'InGame'
    platform: string
    timestamp: number
    cueData: CueData | null
  }): void {
    try {
      log.info('StageKitDirectProcessor: Received game state event:', event)
      const { gameState, cueData: realCueData } = event

      log.info(
        `StageKitDirectProcessor: Game state changed from ${this._currentGameState} to ${gameState}`,
      )

      const stateChanged = this._currentGameState !== gameState
      const returningToMenu = gameState === 'Menus' && this._inSong

      if (!stateChanged && !returningToMenu) {
        log.info(
          'StageKitDirectProcessor: Game state unchanged and not returning from song, skipping processing',
        )
        return
      }

      if (returningToMenu) {
        log.info('StageKitDirectProcessor: Returning to menu from song, processing transition')
      }

      const previousState = this._currentGameState
      this._currentGameState = gameState

      const clearCueData: CueData =
        gameState === 'InGame'
          ? {
              datagramVersion: realCueData?.datagramVersion || 1,
              platform: realCueData?.platform || 'RB3E',
              currentScene: 'Gameplay',
              pauseState: realCueData?.pauseState || 'Unpaused',
              venueSize: realCueData?.venueSize || 'Large',
              beatsPerMinute: realCueData?.beatsPerMinute || 0,
              songSection: realCueData?.songSection || 'Unknown',
              guitarNotes: realCueData?.guitarNotes || [],
              bassNotes: realCueData?.bassNotes || [],
              drumNotes: realCueData?.drumNotes || [],
              keysNotes: realCueData?.keysNotes || [],
              vocalNote: realCueData?.vocalNote || 0,
              harmony0Note: realCueData?.harmony0Note || 0,
              harmony1Note: realCueData?.harmony1Note || 0,
              harmony2Note: realCueData?.harmony2Note || 0,
              lightingCue: 'StageKitDirect',
              postProcessing: realCueData?.postProcessing || 'Default',
              fogState: realCueData?.fogState || false,
              strobeState: realCueData?.strobeState || 'Strobe_Off',
              performer: realCueData?.performer || 0,
              trackMode: realCueData?.trackMode || 'tracked',
              beat: realCueData?.beat || 'Unknown',
              keyframe: realCueData?.keyframe || 'Unknown',
              bonusEffect: realCueData?.bonusEffect || false,
              ledColor: '',
              ledPositions: [],
              rb3Platform: event.platform,
              rb3BuildTag: realCueData?.rb3BuildTag || '',
              rb3SongName: realCueData?.rb3SongName || '',
              rb3SongArtist: realCueData?.rb3SongArtist || '',
              rb3SongShortName: realCueData?.rb3SongShortName || '',
              rb3VenueName: realCueData?.rb3VenueName || '',
              rb3ScreenName: realCueData?.rb3ScreenName || '',
              rb3BandInfo: realCueData?.rb3BandInfo || { members: [] },
              rb3ModData: realCueData?.rb3ModData || { identifyValue: '', string: '' },
              totalScore: realCueData?.totalScore || 0,
              memberScores: realCueData?.memberScores || [],
              stars: realCueData?.stars || 0,
              sustainDurationMs: realCueData?.sustainDurationMs || 0,
              measureOrBeat: realCueData?.measureOrBeat || 0,
              cueHistory: [],
              executionCount: 1,
              cueStartTime: Date.now(),
              timeSinceLastCue: 0,
            }
          : this.buildMenusCueData(realCueData, event.platform)

      this.emit('cueHandled', clearCueData)

      if (gameState === 'InGame') {
        log.info(
          'StageKitDirectProcessor: Transitioning to InGame - clearing all lights and LED positions',
        )

        this._inSong = true
        this.clearMenuAnimationTimer()

        void this.turnOffAllRigs().catch((error) => {
          log.error(
            'StageKitDirectProcessor: Error clearing lights during InGame transition:',
            error,
          )
        })

        void this.blackoutAllRigs().catch((error) => {
          log.error(
            'StageKitDirectProcessor: Error calling sequencer blackout during InGame transition:',
            error,
          )
        })
      } else if (gameState === 'Menus') {
        log.info(
          'StageKitDirectProcessor: Transitioning to Menus - triggering cue handler and clearing LED positions',
        )

        this._inSong = false

        void this.turnOffAllRigs().catch((error) => {
          log.error(
            'StageKitDirectProcessor: Error clearing lights during Menus transition:',
            error,
          )
        })

        this.startMenuAnimationTimer()
      }

      this.emit('gameStateChanged', {
        previousState,
        currentState: gameState,
        timestamp: event.timestamp,
      })
    } catch (error) {
      log.error('StageKitDirectProcessor: Error handling game state event:', error)
    }
  }

  // ── Per-rig fanout wrappers ──────────────────────────────────────────────────────────
  // Each wrapper iterates every active rig processor so the coordinator's event handlers
  // stay rig-agnostic. Errors on one rig don't block the others (Promise.allSettled).

  private async applyLightData(positions: number[], color: string): Promise<void> {
    await Promise.allSettled(
      Array.from(this.rigs.values()).map((r) => r.applyLightData(positions, color)),
    )
  }

  private applyStrobeEffect(strobeType: 'slow' | 'medium' | 'fast' | 'fastest'): void {
    for (const rig of this.rigs.values()) {
      try {
        rig.applyStrobeEffect(strobeType)
      } catch (error) {
        log.error(`Rig ${rig.rigId}: applyStrobeEffect failed:`, error)
      }
    }
  }

  private clearStrobeEffectsAtPositions(positions: number[]): void {
    for (const rig of this.rigs.values()) {
      try {
        rig.clearStrobeEffectsAtPositions(positions)
      } catch (error) {
        log.error(`Rig ${rig.rigId}: clearStrobeEffectsAtPositions failed:`, error)
      }
    }
  }

  private async clearLightsAtPositions(positions: number[]): Promise<void> {
    await Promise.allSettled(
      Array.from(this.rigs.values()).map((r) => r.clearLightsAtPositions(positions)),
    )
  }

  private async turnOffAllRigs(): Promise<void> {
    await Promise.allSettled(Array.from(this.rigs.values()).map((r) => r.turnOffAllLights()))
  }

  private async blackoutAllRigs(): Promise<void> {
    await Promise.allSettled(Array.from(this.rigs.values()).map((r) => r.blackoutSequencer()))
  }

  /**
   * Update configuration
   */
  public updateConfig(newConfig: Partial<StageKitConfig>): void {
    this.config = { ...this.config, ...newConfig }
    log.info('StageKitDirectProcessor: config updated:', this.config)
  }

  /**
   * Get current configuration
   */
  public getConfig(): StageKitConfig {
    return { ...this.config }
  }

  public getCurrentBrightness(): 'low' | 'medium' | 'high' {
    return 'medium'
  }

  // ── Aggregated diagnostics (existing public surface) ─────────────────────────────────

  public getStatus(): {
    currentActiveLights: string[]
    hasActiveLights: boolean
    activeLightCount: number
    activeStrobeEffects: string[]
    hasActiveStrobeEffects: boolean
    strobedLights: number[]
  } {
    const activeLights: string[] = []
    const activeStrobeEffects: string[] = []
    const strobedLights: number[] = []
    for (const rig of this.rigs.values()) {
      const summary = rig.getActiveLightSummary()
      activeLights.push(...summary.activeLights)
      activeStrobeEffects.push(...summary.activeStrobeEffects)
      strobedLights.push(...summary.strobedLights)
    }
    return {
      currentActiveLights: activeLights,
      hasActiveLights: activeLights.length > 0,
      activeLightCount: activeLights.length,
      activeStrobeEffects,
      hasActiveStrobeEffects: activeStrobeEffects.length > 0,
      strobedLights,
    }
  }

  /**
   * Get colour blending information for a specific colour. The blend itself is
   * rig-independent — any rig will produce the same result for the same colour set —
   * so the coordinator picks any rig to compute it and returns one value.
   */
  public getColorBlendingInfo(color: string): {
    color: string
    blendedColor: any
    description: string
  } {
    const rig = this.rigs.values().next().value as Rb3StageKitRigProcessor | undefined
    if (!rig) {
      return { color, blendedColor: null, description: 'No active rigs' }
    }
    const blendedColor = rig.blendColorsPublic([color])
    const description = color === 'off' ? 'No colors active' : `Single color: ${color}`
    return { color, blendedColor, description }
  }

  /**
   * Public method to manually clear all lights (for testing and debugging)
   */
  public async clearAllLightsManually(): Promise<void> {
    await this.turnOffAllRigs()
  }

  /**
   * Create and emit CueData for network debugging
   * @param event The StageKit event data
   */
  private emitCueDataForStageKit(event: StageKitData): void {
    const { positions, color, strobeEffect, fog } = event

    const cueData: CueData = {
      datagramVersion: 1,
      platform: 'RB3E',
      currentScene: 'Gameplay',
      pauseState: 'Unpaused',
      venueSize: 'Large',
      beatsPerMinute: 120,
      songSection: 'Verse',
      guitarNotes: [],
      bassNotes: [],
      drumNotes: [],
      keysNotes: [],
      vocalNote: 0,
      harmony0Note: 0,
      harmony1Note: 0,
      harmony2Note: 0,
      lightingCue: 'StageKitDirect',
      postProcessing: 'Default',
      // Carry the StageKit fog state through for downstream/debug consumers. There is no DMX fog
      // output yet (a future fixture/channel concept), so nothing renders it today.
      fogState: fog ?? false,
      strobeState:
        strobeEffect === 'off'
          ? 'Strobe_Off'
          : strobeEffect === 'slow'
            ? 'Strobe_Slow'
            : strobeEffect === 'medium'
              ? 'Strobe_Medium'
              : strobeEffect === 'fast'
                ? 'Strobe_Fast'
                : strobeEffect === 'fastest'
                  ? 'Strobe_Fastest'
                  : 'Strobe_Off',
      performer: 0,
      trackMode: 'tracked',
      beat: 'Strong',
      keyframe: 'Off',
      bonusEffect: false,
      ledColor: color === 'off' ? '' : color,
      ledPositions: positions,
      rb3Platform: 'RB3E',
      rb3BuildTag: '',
      rb3SongName: '',
      rb3SongArtist: '',
      rb3SongShortName: '',
      rb3VenueName: '',
      rb3ScreenName: '',
      rb3BandInfo: { members: [] },
      rb3ModData: { identifyValue: '', string: '' },
      totalScore: 0,
      memberScores: [],
      stars: 0,
      sustainDurationMs: 0,
      measureOrBeat: 0,
      cueHistory: [],
      executionCount: 1,
      cueStartTime: Date.now(),
      timeSinceLastCue: 0,
    }

    this.emit('cueHandled', cueData)
  }

  /**
   * Set the cue handler for menu state handling
   * @param cueHandler The cue handler instance
   */
  public setCueHandler(cueHandler: Rb3MenuCueDispatch): void {
    this.cueHandler = cueHandler
    log.info('StageKitDirectProcessor: Cue handler updated')
  }

  /**
   * Start the menu animation timer to drive RB3E-only menu frame every 1000ms
   */
  private startMenuAnimationTimer(): void {
    log.info('StageKitDirectProcessor: startMenuAnimationTimer called')
    this.clearMenuAnimationTimer()

    if (!this.cueHandler || typeof this.cueHandler.playMenuFrame !== 'function') {
      log.warn(
        'StageKitDirectProcessor: Cannot start menu animation - no menu cue handler available',
      )
      return
    }

    log.info('StageKitDirectProcessor: Starting menu animation timer (1000ms interval)')

    this.menuAnimationTimer = setInterval(() => {
      if (this._currentGameState === 'Menus' && this.cueHandler) {
        try {
          this.cueHandler.playMenuFrame()
        } catch (error) {
          log.error('StageKitDirectProcessor: Error in menu cue playMenuFrame:', error)
        }
      }
    }, 1000)
  }

  /**
   * Clear the menu animation timer and any RB3E menu-layer effects
   */
  private clearMenuAnimationTimer(): void {
    log.info('StageKitDirectProcessor: clearMenuAnimationTimer called')
    if (this.menuAnimationTimer) {
      log.info('StageKitDirectProcessor: Clearing menu animation timer')
      clearInterval(this.menuAnimationTimer)
      this.menuAnimationTimer = null
    } else {
      log.info('StageKitDirectProcessor: No menu animation timer to clear')
    }
    this.cueHandler?.clear()
  }

  /**
   * Clean up resources
   */
  public destroy(): void {
    void this.turnOffAllRigs().catch((error) => {
      log.error('StageKitDirectProcessor: Error clearing lights during destroy:', error)
    })
    this.clearMenuAnimationTimer()
    for (const rig of this.rigs.values()) {
      void rig.dispose().catch((error) => {
        log.error(`Rig ${rig.rigId}: error disposing during destroy:`, error)
      })
    }
    this.rigs.clear()
    this.removeAllListeners()
  }
}
