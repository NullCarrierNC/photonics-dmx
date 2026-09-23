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
import {
  RB3_MAIN_HUB_SCREEN,
  RB3_SONG_SELECT_SCREEN,
  Rb3RightChannel,
} from '../listeners/RB3/rb3eTypes'
import type { StageKitData } from '../listeners/RB3/rb3eTypes'
import { Rb3MenuFramePump } from './rb3MenuAnimation'
import { StrobeWatchdog } from './strobeWatchdog'
import { createLogger } from '../../shared/logger'
import {
  buildInGameClearCueData,
  buildMenusCueData,
  buildStageKitCueData,
  LedBankAccumulator,
} from './rb3StageKitCueData'
const log = createLogger('Rb3StageKitDirectProcessor')

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

  // Cuts a strobe the console stopped talking about.
  private readonly strobeWatchdog: StrobeWatchdog

  // The strobe type the rigs are running, so a repeated packet is not a second start.
  private _currentStrobeType: 'slow' | 'medium' | 'fast' | 'fastest' | null = null

  // Accumulated StageKit LED bank masks (bit i = position i lit). The incoming StageKit events are
  // per-bank, so we accumulate here and emit a full `ledBanks` snapshot each frame, the same shape the
  // cue-mode processor emits. This keeps the preview a single render path (no per-packet direct mode).
  // Reset on menu/clear/off.
  private readonly ledBanks = new LedBankAccumulator()

  // Menu-look pump: no immediate first frame (the first paint lands one interval after Menus),
  // start() restarts the interval, frames gated on the Menus game state.
  private readonly menuFramePump = new Rb3MenuFramePump({
    getDispatch: () => this.cueHandler ?? null,
    isActive: () => this._currentGameState === 'Menus',
    immediateFirstFrame: false,
    restartOnStart: true,
  })

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
    this.strobeWatchdog = new StrobeWatchdog(this.config.strobeWatchdogMs ?? 0, () => {
      log.warn('StageKitDirectProcessor: strobe outlived its packets, cutting it.')
      this.clearStrobeEffectsAtPositions([])
    })
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
        rig.dispose()
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
        // A rig that joins during a strobe strobes with the others straight away.
        if (this._currentStrobeType) {
          rig.applyStrobeEffect(this._currentStrobeType)
        }
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

    this.strobeWatchdog.start()

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
    this.strobeWatchdog.stop()

    log.info(
      'StageKitDirectProcessor stopped listening for stagekit:data, rb3e:gameState, and rb3e:screenName',
    )
  }

  /**
   * A menu frame, clearing the accumulated LED snapshot first because a menu has no StageKit LEDs
   * lit and the frame should carry empty banks.
   */
  private menusCueData(
    realCueData: CueData | null,
    platform: string,
    rb3ScreenNameOverride?: string,
  ): CueData {
    this.ledBanks.reset()
    return buildMenusCueData(realCueData, platform, rb3ScreenNameOverride)
  }

  private isDefaultMenuCueRunning(): boolean {
    return this._currentGameState === 'Menus' && this.menuFramePump.isRunning()
  }

  /**
   * Same Default menu path as Menus game state: cueHandled, clear direct lights, menu animation timer.
   */
  private applyDefaultMenuCueForScreenName(screenName: string): void {
    this._currentGameState = 'Menus'
    this._inSong = false
    this.emit('cueHandled', this.menusCueData(null, 'RB3E', screenName))
    this.turnOffAllRigs().catch((error) => {
      log.error(
        'StageKitDirectProcessor: Error clearing lights during screen-based Default menu cue:',
        error,
      )
    })
    this.startMenuAnimationTimer()
  }

  /**
   * RB3E screen names that map to the main menu: drive the same Default menu cue as Menus game state.
   * Either screen is skipped while that cue is already active, so the menu loop is not restarted.
   */
  private handleScreenNameEvent(event: { screenName: string; timestamp: number }): void {
    const { screenName } = event
    if (screenName !== RB3_MAIN_HUB_SCREEN && screenName !== RB3_SONG_SELECT_SCREEN) {
      return
    }

    if (this.isDefaultMenuCueRunning()) {
      log.info(`StageKitDirectProcessor: ${screenName} skipped, Default menu cue already running`)
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

    this.strobeWatchdog.packetSeen()

    if (event.rightChannel === Rb3RightChannel.DisableAll) {
      this.handleDisableAll(event)
      return
    }

    if (!this._inSong) {
      log.info(
        'StageKitDirectProcessor: Received StageKit event while not in song, marking as in song',
      )
      this._inSong = true
    }

    if (strobeEffect === 'off') {
      this.strobeWatchdog.setStrobeRunning(false)
      this._currentStrobeType = null
      this.clearStrobeEffectsAtPositions(positions)
    } else if (strobeEffect) {
      this.strobeWatchdog.setStrobeRunning(true)
      // RB3E repeats the packet for as long as the strobe holds, so only the edge is work.
      if (strobeEffect !== this._currentStrobeType) {
        this._currentStrobeType = strobeEffect
        this.applyStrobeEffect(strobeEffect)
      }
    } else if (color !== 'off') {
      this.applyLightData(positions, color)
    }
    // Fog, 0x00 and unrecognised commands carry no colour bank and leave the LEDs as they are.

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

      // Clearing the lights resets the accumulated snapshot, so defaultCueData's empty ledBanks is emitted.
      this.ledBanks.reset()
      const clearCueData: CueData =
        gameState === 'InGame'
          ? buildInGameClearCueData(realCueData, event.platform)
          : this.menusCueData(realCueData, event.platform)

      this.emit('cueHandled', clearCueData)

      if (gameState === 'InGame') {
        log.info(
          'StageKitDirectProcessor: Transitioning to InGame - clearing all lights and LED positions',
        )

        this._inSong = true
        this.clearMenuAnimationTimer()

        this.turnOffAllRigs().catch((error) => {
          log.error(
            'StageKitDirectProcessor: Error clearing lights during InGame transition:',
            error,
          )
        })

        this.blackoutAllRigs().catch((error) => {
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

        this.turnOffAllRigs().catch((error) => {
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
  // stay rig-agnostic. Errors on one rig don't block the others.

  private applyLightData(positions: number[], color: string): void {
    for (const rig of this.rigs.values()) {
      try {
        rig.applyLightData(positions, color)
      } catch (error) {
        log.error(`Rig ${rig.rigId}: applyLightData failed:`, error)
      }
    }
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
    this._currentStrobeType = null
    for (const rig of this.rigs.values()) {
      try {
        rig.clearStrobeEffectsAtPositions(positions)
      } catch (error) {
        log.error(`Rig ${rig.rigId}: clearStrobeEffectsAtPositions failed:`, error)
      }
    }
  }

  private async turnOffAllRigs(): Promise<void> {
    this._currentStrobeType = null
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

  private emitCueDataForStageKit(event: StageKitData): void {
    if (
      event.color === 'red' ||
      event.color === 'green' ||
      event.color === 'blue' ||
      event.color === 'yellow'
    ) {
      this.ledBanks.update(event.color, event.positions)
    }
    this.emit('cueHandled', buildStageKitCueData(event, this.ledBanks.snapshot()))
  }

  private handleDisableAll(event: StageKitData): void {
    this.strobeWatchdog.setStrobeRunning(false)
    this._currentStrobeType = null
    this.ledBanks.reset()
    this.emit('stagekit:processed', {
      positions: event.positions,
      color: event.color,
      strobeEffect: event.strobeEffect,
      timestamp: Date.now(),
    })
    this.emit('cueHandled', buildStageKitCueData(event, this.ledBanks.snapshot()))
    // RB3E repeats DisableAll as end-of-song teardown traffic even after the player has already
    // backed out to Menus, where the menu pump owns the rig until its next frame repaints it.
    if (this.isDefaultMenuCueRunning()) return
    this.turnOffAllRigs().catch((error) => {
      log.error('StageKitDirectProcessor: Error handling DisableAll:', error)
    })
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
   * Start the menu animation pump to drive the RB3E-only menu frame every 1000ms
   */
  private startMenuAnimationTimer(): void {
    log.info('StageKitDirectProcessor: Starting the menu animation pump')
    this.menuFramePump.start()
  }

  /**
   * Stop the menu animation pump, clearing any RB3E menu-layer effects
   */
  private clearMenuAnimationTimer(): void {
    log.info('StageKitDirectProcessor: Stopping the menu animation pump')
    this.menuFramePump.stop()
  }

  /**
   * Clean up resources
   */
  public destroy(): void {
    this.turnOffAllRigs().catch((error) => {
      log.error('StageKitDirectProcessor: Error clearing lights during destroy:', error)
    })
    this.clearMenuAnimationTimer()
    this.strobeWatchdog.stop()
    for (const rig of this.rigs.values()) {
      rig.dispose()
    }
    this.rigs.clear()
    this.removeAllListeners()
  }
}
