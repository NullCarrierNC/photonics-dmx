import { EventEmitter } from 'events'
import {
  CueData,
  CueType,
  DrumNoteType,
  InstrumentNoteType,
  cueTypeToStrobeSlot,
  isStrobeCueType,
  isVocalActive,
} from '../cues/types/cueTypes'
import type { MotionCueRef } from '../cues/types/cueTypes'
import { ILightingController } from '../controllers/sequencer/interfaces'
import { DmxLightManager } from '../controllers/DmxLightManager'
import { getStrobeStateManager } from '../controllers/StrobeStateManager'
import { INetCue, CueStyle } from '../cues/interfaces/INetCue'
import { CueRegistry } from '../cues/registries/CueRegistry'
import { RENDERER_RECEIVE } from '../../shared/ipcChannels'
import type { RuntimeBroadcaster } from '../runtime/broadcaster'
import { noopRuntimeBroadcaster } from '../runtime/broadcaster'
import { createLogger } from '../../shared/logger'
import { monotonicNowMs } from '../../shared/time'
const log = createLogger('CueHandler')

/**
 * CueHandler handles the cues called by the YARG network listener.
 *
 * Cue selection is delegated to CueRegistry.getCueImplementation(cueType, trackMode), which uses
 * active/enabled groups, consistency tracking, stage-kit preference when applicable,
 * and default-group fallback when no active group implements the cue.
 *
 * Motion cues run in parallel via CueRegistry.getRandomMotionCue() when the lighting cue type
 * changes (not on re-queues of the same cue). Simulated cues (trackMode === 'simulated') skip
 * random motion selection; use motion simulation IPC instead. Optional once-per-song lock from
 * configuration applies to random selection.
 *
 * Reminder: setEffect clears all running effects, regardless of layer.
 * Layer 0 will maintain its state though.
 * addEffect will not clear other effects unless it's on the same layer.
 */
export type CueHandlerOptions = {
  getMotionCueMinimumHoldMs?: () => number
  /** Probability (0-100) that an automatic motion cue pick will play on a new lighting cue. Defaults to 100 (always). */
  getMotionCueProbabilityPercent?: () => number
  runtimeBroadcaster?: RuntimeBroadcaster
  /** Cue registry to resolve against. Defaults to the shared YARG singleton; a separate domain
   *  (e.g. RB3 cue mode) passes its own instance so its selections stay isolated. */
  registry?: CueRegistry
  /** Which motion-cue-change channel to broadcast on. Defaults to YARG; RB3 cue mode passes its own
   *  so its motion selections don't surface as YARG changes. */
  motionChangeChannel?:
    | typeof RENDERER_RECEIVE.YARG_MOTION_CUE_CHANGE
    | typeof RENDERER_RECEIVE.RB3_MOTION_CUE_CHANGE
}

class CueHandler extends EventEmitter {
  private readonly _lightManager: DmxLightManager
  private readonly _sequencer: ILightingController
  private readonly registry: CueRegistry
  private currentPrimaryCue: INetCue | null = null
  private currentSecondaryCue: INetCue | null = null
  private currentStrobeCue: INetCue | null = null
  private currentMotionCue: INetCue | null = null
  private currentMotionCueStartTime: number | null = null
  private motionEnabled = true
  private manualMotionRef: MotionCueRef | null = null
  /** Tracks which manual ref was used for the last motion pick (undefined = not yet synced). */
  private lastManualMotionRefForMotion: MotionCueRef | null | undefined = undefined
  private lastEmittedMotionKey: string | null = null
  private readonly getMotionCueMinimumHoldMs: () => number
  private readonly getMotionCueProbabilityPercent: () => number
  private readonly runtimeBroadcaster: RuntimeBroadcaster
  private readonly motionChangeChannel:
    | typeof RENDERER_RECEIVE.YARG_MOTION_CUE_CHANGE
    | typeof RENDERER_RECEIVE.RB3_MOTION_CUE_CHANGE
  private cueHistory: CueType[] = []
  private currentCue?: CueType
  private executionCount = 0
  private cueStartTime = 0
  private lastCueChangeTime = 0
  private previousCueData?: Partial<CueData>
  /** Tracks whether any vocal/harmony part was active on the previous frame, for note-on/off edge detection. */
  private wasVocalActive = false

  public setManualMotionRef(ref: MotionCueRef | null): void {
    this.manualMotionRef = ref
    this.lastManualMotionRefForMotion = undefined
  }

  private emitMotionCueChange(
    ref: MotionCueRef | null,
    source: 'manual' | 'auto' | 'cleared',
    manualFallback?: boolean,
  ): void {
    const key = ref ? `${ref.groupId}:${ref.cueId}` : 'null'
    if (key === this.lastEmittedMotionKey && source !== 'cleared' && manualFallback !== true) {
      return
    }
    this.lastEmittedMotionKey = key
    this.runtimeBroadcaster.emit(this.motionChangeChannel, {
      ref,
      source,
      manualFallback: manualFallback === true,
    })
  }

  public setMotionEnabled(enabled: boolean): void {
    if (this.motionEnabled === enabled) {
      return
    }
    this.motionEnabled = enabled
    if (!enabled) {
      if (this.currentMotionCue) {
        this.currentMotionCue.onStop?.()
        this.currentMotionCue = null
        this.currentMotionCueStartTime = null
        this._sequencer.schedulePanTiltClear()
        this.emitMotionCueChange(null, 'cleared')
      }
      this.lastManualMotionRefForMotion = undefined
    } else {
      this.lastManualMotionRefForMotion = undefined
    }
  }

  constructor(
    lightManager: DmxLightManager,
    photonicsSequencer: ILightingController,
    options?: CueHandlerOptions,
  ) {
    super()
    this._lightManager = lightManager
    this._sequencer = photonicsSequencer
    this.registry = options?.registry ?? CueRegistry.getInstance()
    this.getMotionCueMinimumHoldMs = options?.getMotionCueMinimumHoldMs ?? (() => 5000)
    this.getMotionCueProbabilityPercent = options?.getMotionCueProbabilityPercent ?? (() => 100)
    this.runtimeBroadcaster = options?.runtimeBroadcaster ?? noopRuntimeBroadcaster()
    this.motionChangeChannel =
      options?.motionChangeChannel ?? RENDERER_RECEIVE.YARG_MOTION_CUE_CHANGE
  }

  public notifySongStart(): void {
    this.registry.onSongStart()
    this.registry.onMotionSongStart()
  }

  public notifySongEnd(): void {
    this.registry.onSongEnd()
    this.registry.onMotionSongEnd()
  }

  public reset(): void {
    this.registry.reset()
    this.resetCueHistory()
  }

  private resetCueHistory(): void {
    this.cueHistory = []
    this.currentCue = undefined
    this.executionCount = 0
    this.cueStartTime = 0
    this.lastCueChangeTime = 0
    this.previousCueData = undefined
    this.wasVocalActive = false
  }

  private addHistoryToCueData(cueType: CueType, parameters: CueData): CueData {
    const now = monotonicNowMs()

    // Strobe cues (including Strobe_Off) run in their own slot on top of the primary/secondary
    // look. They must not disturb the primary-cue history/executionCount accounting: a held
    // strobe is re-dispatched ~30x/s alongside the lighting cue, and mutating currentCue here
    // would thrash cueHistory/executionCount and defeat the executionCount-gated motion pick.
    // Report the current (unchanged) primary state instead of advancing it.
    if (isStrobeCueType(cueType)) {
      return {
        ...parameters,
        previousCue:
          this.cueHistory.length > 0 ? this.cueHistory[this.cueHistory.length - 1] : undefined,
        cueHistory: [...this.cueHistory],
        executionCount: this.executionCount,
        cueStartTime: this.cueStartTime,
        timeSinceLastCue: now - this.lastCueChangeTime,
        previousFrame: this.previousCueData,
      }
    }

    if (this.currentCue !== cueType) {
      if (this.currentCue && this.currentCue !== cueType) {
        this.cueHistory.push(this.currentCue)

        if (this.cueHistory.length > 5) {
          this.cueHistory.shift()
        }
      }

      this.currentCue = cueType
      this.executionCount = 1
      this.lastCueChangeTime = now
      this.cueStartTime = now
    } else {
      this.executionCount++
    }

    const historicCueData: CueData = {
      ...parameters,
      previousCue:
        this.cueHistory.length > 0 ? this.cueHistory[this.cueHistory.length - 1] : undefined,
      cueHistory: [...this.cueHistory],
      executionCount: this.executionCount,
      cueStartTime: this.cueStartTime,
      timeSinceLastCue: now - this.lastCueChangeTime,
      previousFrame: this.previousCueData,
    }

    this.previousCueData = {
      vocalNote: parameters.vocalNote,
      harmony0Note: parameters.harmony0Note,
      harmony1Note: parameters.harmony1Note,
      harmony2Note: parameters.harmony2Note,
      beat: parameters.beat,
      keyframe: parameters.keyframe,
      // RB3 cue mode: carry LED/fog state so led-N / fog edges fire against the previous frame,
      // exactly like the vocal edges above.
      fogState: parameters.fogState,
      ledBanks: parameters.ledBanks,
    }

    return historicCueData
  }

  public addCueHandledListener(listener: (data: CueData) => void): void {
    this.on('cueHandled', listener)
  }

  public removeCueHandledListener(listener: (data: CueData) => void): void {
    this.off('cueHandled', listener)
  }

  /**
   * Handle a beat event from YARG
   */
  public handleBeat(): void {
    this._sequencer.onBeat()
  }

  /**
   * Handle a measure event from YARG
   */
  public handleMeasure(): void {
    this._sequencer.onBeat()
    this._sequencer.onMeasure()
  }

  public handleKeyframeFirst(): void {
    this._sequencer.onKeyframeFirst()
  }

  public handleKeyframeNext(): void {
    this._sequencer.onKeyframeNext()
  }

  public handleKeyframePrevious(): void {
    this._sequencer.onKeyframePrevious()
  }

  public handleDrumNote(noteType: DrumNoteType, _data: CueData): void {
    this._sequencer.onDrumNote(noteType)
  }

  public handleGuitarNote(noteType: InstrumentNoteType, _data: CueData): void {
    this._sequencer.onGuitarNote(noteType)
  }

  public handleBassNote(noteType: InstrumentNoteType, _data: CueData): void {
    this._sequencer.onBassNote(noteType)
  }

  public handleKeysNote(noteType: InstrumentNoteType, _data: CueData): void {
    this._sequencer.onKeysNote(noteType)
  }

  /**
   * Detect vocal note-on / note-off edges from the current frame's vocal and harmony
   * values and forward them to the sequencer. "Singing" is any vocal or harmony part
   * above zero; an edge fires only when that aggregate active state changes.
   */
  public handleVocalNote(data: CueData): void {
    const isActive = isVocalActive(data)

    if (isActive !== this.wasVocalActive) {
      this._sequencer.onVocalNote(isActive)
      this.wasVocalActive = isActive
    }
  }

  public async handleCue(cueType: CueType, parameters: CueData): Promise<void> {
    const incomingIsStrobe = isStrobeCueType(cueType)
    // Update CueData with history and context information. addHistoryToCueData no-ops the
    // primary-cue accounting for strobe cues so a held strobe does not thrash it.
    const historicCueData = this.addHistoryToCueData(cueType, parameters)

    // Special cases that need to be handled differently
    switch (cueType) {
      case CueType.Blackout_Fast:
        this.stopCurrentCue()
        this._sequencer.blackout(0)
        this.emit('cueHandled', historicCueData)
        return
      case CueType.Blackout_Slow:
        this.stopCurrentCue()
        this._sequencer.blackout(500)
        this.emit('cueHandled', historicCueData)
        return
      case CueType.Blackout_Spotlight:
        this.stopCurrentCue()
        this._sequencer.blackout(0)
        this.emit('cueHandled', historicCueData)
        return
      case CueType.Strobe_Off:
        if (this.currentStrobeCue) {
          this.currentStrobeCue.onStop?.()
          this.currentStrobeCue = null
        }
        getStrobeStateManager().setActive(null)
        this.emit('cueHandled', historicCueData)
        return
      case CueType.Keyframe_First:
      case CueType.Keyframe_Next:
      case CueType.Keyframe_Previous:
        this.handleKeyframe()
        this.emit('cueHandled', historicCueData)
        return
      case CueType.NoCue:
        this.stopCurrentCue()
        this._sequencer.blackout(0)
        this.emit('cueHandled', historicCueData)
        return
      case CueType.Menu:
      //      this.stopCurrentCue();
      //     break;
    }

    // Get implementation from registry
    // Use trackMode, defaulting to 'tracked' if not specified
    const trackMode = parameters.trackMode || 'tracked'
    // A forced group (RB3 game-mode primary rotation, any track mode) wins; then the simulation group;
    // otherwise normal active-group selection. Both forced paths use the deterministic group resolver.
    const forcedGroup =
      parameters.preferredCueGroup ??
      (trackMode === 'simulated' ? parameters.simulationCueGroup : undefined)
    const forcedCue = forcedGroup
      ? this.registry.getCueImplementationFromGroup(cueType, forcedGroup, trackMode)
      : null
    // RB3 forces its rotated group on every dispatch, strobes included, but only the Stage Kit group
    // ships strobes, so a forced group missing the cueType falls through to normal selection.
    const cue = forcedCue ?? this.registry.getCueImplementation(cueType, trackMode)

    if (cue) {
      const incomingIsSecondary = cue.style === CueStyle.Secondary

      if (incomingIsStrobe) {
        // Strobes run on top of primary and secondary overlays; track separately so Strobe_Off only clears strobes.
        if (this.currentStrobeCue && this.currentStrobeCue !== cue) {
          this.currentStrobeCue.onStop?.()
          this.currentStrobeCue = null
        }
        this.currentStrobeCue = cue
        getStrobeStateManager().setActive(cueTypeToStrobeSlot(cueType))
      } else if (incomingIsSecondary) {
        // Non-strobe overlays run concurrently with primary and strobes, but replace the existing secondary overlay.
        if (this.currentSecondaryCue && this.currentSecondaryCue !== cue) {
          this.currentSecondaryCue.onStop?.()
          this.currentSecondaryCue = null
        }
        this.currentSecondaryCue = cue
      } else {
        // Primary: stop previous primary when switching to a different cue instance (e.g. different group); leave secondary untouched.
        if (this.currentPrimaryCue && this.currentPrimaryCue !== cue) {
          this.currentPrimaryCue.onStop?.()
          this.currentPrimaryCue = null
        }
        this.currentPrimaryCue = cue
      }

      await cue.execute(historicCueData, this._sequencer, this._lightManager)
    }
    // No `else` log here: the registry already logs (and dedups) a missing cue implementation.

    // Strobe cues run in their own slot and must not drive motion selection (which is gated on
    // the primary cue's executionCount); only non-strobe cues touch the motion pick.
    if (trackMode !== 'simulated' && !incomingIsStrobe) {
      // The Fallback is a self-contained idle look; never layer an automatic motion cue on top of
      // it. Treat it like motion-disabled so any motion left over from the previous cue is stopped
      // (and the heads homed) and no new pick is made.
      if (!this.motionEnabled || cueType === CueType.Fallback) {
        if (this.currentMotionCue) {
          this.currentMotionCue.onStop?.()
          this.currentMotionCue = null
          this.currentMotionCueStartTime = null
          this._sequencer.schedulePanTiltClear()
          this.emitMotionCueChange(null, 'cleared')
        }
      } else {
        const motionCue = this.selectMotionCue(historicCueData.executionCount === 1, false)
        try {
          if (motionCue) {
            await motionCue.execute(historicCueData, this._sequencer, this._lightManager)
          }
        } catch (error) {
          log.error('Motion cue execution failed:', error)
          if (motionCue && this.currentMotionCue === motionCue) {
            this.currentMotionCue.onStop?.()
            this.currentMotionCue = null
            this.currentMotionCueStartTime = null
            this._sequencer.schedulePanTiltClear()
            this.emitMotionCueChange(null, 'cleared')
          }
        }
      }
    }

    this.emit('cueHandled', historicCueData)
  }

  /**
   * Re-pick the motion cue and return the one that should run this frame. A fresh pick happens on a
   * new primary cue (`isNewCue`), a manual-ref change, or an external `force` trigger — each subject
   * to the min-hold floor; otherwise the current motion cue is retained. This swaps
   * `currentMotionCue` and emits the change but does NOT execute the cue: the caller runs it on its
   * own frame cadence.
   */
  private selectMotionCue(isNewCue: boolean, force: boolean): INetCue | null {
    const registry = this.registry
    const isManualChange = this.manualMotionRef !== this.lastManualMotionRefForMotion
    const now = monotonicNowMs()
    const minHold = this.getMotionCueMinimumHoldMs()
    const heldLongEnough =
      this.currentMotionCueStartTime == null || now - this.currentMotionCueStartTime >= minHold
    const needNewMotionPick = isManualChange || ((isNewCue || force) && heldLongEnough)

    if (!needNewMotionPick) {
      return this.currentMotionCue
    }

    this.lastManualMotionRefForMotion = this.manualMotionRef
    let motionCue: INetCue | null = null
    let pickSource: 'manual' | 'auto' = 'auto'
    let pickManualFallback = false
    if (this.manualMotionRef) {
      motionCue = registry.getMotionCueImplementation(this.manualMotionRef)
      if (motionCue) {
        pickSource = 'manual'
      } else {
        pickManualFallback = true
        motionCue = registry.getRandomMotionCue()
        pickSource = 'auto'
        this.runtimeBroadcaster.emit(RENDERER_RECEIVE.DEBUG_LOG, {
          message:
            'Selected YARG motion cue is unavailable (disabled or unknown); using a random motion program.',
          variables: [],
          timestamp: Date.now(),
        })
      }
    } else {
      const probability = this.getMotionCueProbabilityPercent()
      if (probability >= 100 || Math.random() * 100 < probability) {
        motionCue = registry.getRandomMotionCue()
      }
    }

    if (motionCue) {
      const prevMotion = this.currentMotionCue
      if (this.currentMotionCue && this.currentMotionCue !== motionCue) {
        this.currentMotionCue.onStop?.()
      }
      this.currentMotionCue = motionCue
      if (prevMotion !== motionCue) {
        this.currentMotionCueStartTime = now
      }
      this._sequencer.cancelPanTiltClear()
      const ref = registry.findMotionCueRef(motionCue)
      if (ref) {
        this.emitMotionCueChange(ref, pickSource, pickManualFallback)
      }
    } else if (this.currentMotionCue) {
      this.currentMotionCue.onStop?.()
      this.currentMotionCue = null
      this.currentMotionCueStartTime = null
      this._sequencer.schedulePanTiltClear()
      this.emitMotionCueChange(null, 'cleared')
    }
    return this.currentMotionCue
  }

  /**
   * External trigger (RB3 switch-timer + Light-1 edge): force a probability-gated motion re-pick.
   * The swapped cue runs on the next frame dispatch (the RB3 keepalive), so this does not execute it.
   * No-op while motion is disabled.
   */
  public requestMotionRepick(): void {
    if (!this.motionEnabled) {
      return
    }
    this.selectMotionCue(false, true)
  }

  /**
   * Stop all tracked cues (primary, secondary, strobe) and call their onStop lifecycle methods.
   * Used for blackout, NoCue, and by stopActiveCue(); primary-to-primary transitions stop only the previous primary inline, not via this method.
   */
  private stopCurrentCue(): void {
    if (this.currentPrimaryCue) {
      this.currentPrimaryCue.onStop?.()
      this.currentPrimaryCue = null
    }
    if (this.currentSecondaryCue) {
      this.currentSecondaryCue.onStop?.()
      this.currentSecondaryCue = null
    }
    if (this.currentStrobeCue) {
      this.currentStrobeCue.onStop?.()
      this.currentStrobeCue = null
    }
    // Unconditional: clearing a primary/blackout must also drop any shared strobe slot even if
    // this handler didn't think a strobe cue was active (defensive against state drift).
    getStrobeStateManager().setActive(null)
    if (this.currentMotionCue) {
      this.currentMotionCue.onStop?.()
      this.currentMotionCue = null
      this.currentMotionCueStartTime = null
      this._sequencer.schedulePanTiltClear()
      this.emitMotionCueChange(null, 'cleared')
    }
  }

  /**
   * Stop the active cue (if any) and run its onStop lifecycle.
   * Used by Cue Simulation / test harnesses so restarting the same cue works reliably.
   */
  public stopActiveCue(): void {
    this.stopCurrentCue()
  }

  /**
   * Handle keyframe navigation
   */
  public handleKeyframe(): void {
    this._sequencer.onKeyframe()
  }

  public async handleCueDefault(parameters: CueData): Promise<void> {
    await this.handleCue(CueType.Default, parameters)
  }

  /**
   * Clean up resources and stop any executing cue.
   *
   * Node cue instances are singletons held by `CueRegistry`, so they are not
   * literally destroyed when this handler tears down; the same instances are reused
   * by the next handler. We call `onStop()` so each cue's `CueSession` is reset
   * (`cueStartedFired` cleared, engine nulled) and the next activation can fire
   * `cue-started` from a clean state.
   */
  public shutdown(): void {
    if (this.currentPrimaryCue) {
      this.currentPrimaryCue.onStop?.()
      this.currentPrimaryCue = null
    }
    if (this.currentSecondaryCue) {
      this.currentSecondaryCue.onStop?.()
      this.currentSecondaryCue = null
    }
    if (this.currentStrobeCue) {
      this.currentStrobeCue.onStop?.()
      this.currentStrobeCue = null
    }
    // Unconditional: a handler teardown must never leave the shared StrobeStateManager stuck.
    getStrobeStateManager().setActive(null)
    if (this.currentMotionCue) {
      this.currentMotionCue.onStop?.()
      this.currentMotionCue = null
      this.currentMotionCueStartTime = null
    }
    // End any open song on the registry so once-per-song and motion locks never survive a teardown.
    // This is the single owner of song-end on teardown, covering every path that disposes a handler
    // (coordinator clear, RigChain.dispose). Both calls are idempotent.
    this.registry.onSongEnd()
    this.registry.onMotionSongEnd()
    this.removeAllListeners()
  }
}

export { CueHandler, CueType }
