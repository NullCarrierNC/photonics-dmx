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
import { StrobeStateManager } from '../controllers/StrobeStateManager'
import { INetCue, CueStyle } from '../cues/interfaces/INetCue'
import { CueRegistry } from '../cues/registries/CueRegistry'
import type { RuntimeBroadcaster } from '../runtime/broadcaster'
import type { MotionCueChangePayload } from '../../shared/ipc/common'
import { createLogger } from '../../shared/logger'
import { monotonicNowMs } from '../../shared/time'
import { MotionSelectionCoordinator, type MotionChangeChannel } from './MotionSelectionCoordinator'
const log = createLogger('CueHandler')

/**
 * CueHandler runs one net domain's cues against one rig: the YARG network listener and the RB3
 * cue-mode processor each drive their own handler per chain, told apart only by which registry and
 * motion-change channel they are constructed with.
 *
 * Cue selection is delegated to CueRegistry.getCueImplementation(cueType, trackMode), which uses
 * active/enabled groups, consistency tracking, stage-kit preference when applicable,
 * and default-group fallback when no active group implements the cue.
 *
 * Motion cues run in parallel with the lighting cue. Which one runs is decided by the domain's
 * {@link MotionSelectionCoordinator}, shared by every chain's handler so all rigs run the same
 * motion cue and the renderer hears one change per decision. This handler applies the decision to
 * its own sequencer. Simulated cues (trackMode === 'simulated') skip motion selection, and motion
 * simulation IPC drives their motion.
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
  /** Cue registry to resolve against. Defaults to the process-wide YARG instance; another domain
   *  (RB3 cue mode) passes its own so its selections stay isolated. */
  registry?: CueRegistry
  /** Which motion-cue-change channel to broadcast on. Defaults to YARG; RB3 cue mode passes its own
   *  so its motion selections don't surface as YARG changes. */
  motionChangeChannel?: MotionChangeChannel
  /**
   * The domain's shared motion selection. Handlers on different rig chains pass the same one so
   * every rig runs the motion cue it picks. A handler built without one decides on its own, from
   * the motion options above.
   */
  motionCoordinator?: MotionSelectionCoordinator
  /**
   * The strobe slot the publisher reads, shared by every handler that drives one rig graph. A
   * handler built without one keeps its own.
   */
  strobeState?: StrobeStateManager
}

class CueHandler extends EventEmitter {
  private readonly _lightManager: DmxLightManager
  private readonly _sequencer: ILightingController
  private readonly registry: CueRegistry
  private readonly motionCoordinator: MotionSelectionCoordinator
  private readonly strobeState: StrobeStateManager
  private readonly unsubscribeMotionWipe: () => void
  private currentPrimaryCue: INetCue | null = null
  private currentSecondaryCue: INetCue | null = null
  private currentStrobeCue: INetCue | null = null
  /** The motion cue this chain last pointed its sequencer at, or null while its heads are home. */
  private appliedMotionCue: INetCue | null = null
  private cueHistory: CueType[] = []
  private currentCue?: CueType
  private executionCount = 0
  private cueStartTime = 0
  private lastCueChangeTime = 0
  private previousCueData?: Partial<CueData>
  /** Tracks whether any vocal/harmony part was active on the previous frame, for note-on/off edge detection. */
  private wasVocalActive = false
  /**
   * Set while a chart-driven Blackout_Slow holds, so the next resolved non-strobe cue can end the
   * sequencer's fade before it executes: the fade is almost always still running (YARG keeps
   * re-dispatching), and its blackout gate would otherwise refuse that cue's first submission.
   * The fade ends in an instant blackout rather than a cancel, because a cancel uncovers the
   * previous cue's look until the new cue first draws, which can be a beat or a measure away.
   */
  private pendingSlowBlackoutEnd = false
  /** Set while a chart blackout holds the rig dark. Strobe cues are swallowed until it clears. */
  private chartBlackoutHeld = false

  public setManualMotionRef(ref: MotionCueRef | null): void {
    this.motionCoordinator.setManualMotionRef(ref)
  }

  public setMotionEnabled(enabled: boolean): void {
    this.motionCoordinator.setMotionEnabled(enabled)
    if (!enabled) {
      this.applyMotionCue(null)
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
    this.strobeState = options?.strobeState ?? new StrobeStateManager()
    this.motionCoordinator =
      options?.motionCoordinator ??
      new MotionSelectionCoordinator({
        registry: this.registry,
        getMotionCueMinimumHoldMs: options?.getMotionCueMinimumHoldMs,
        getMotionCueProbabilityPercent: options?.getMotionCueProbabilityPercent,
        runtimeBroadcaster: options?.runtimeBroadcaster,
        motionChangeChannel: options?.motionChangeChannel,
      })
    this.unsubscribeMotionWipe = this._sequencer.onMotionPatternsCleared(() => {
      this.onMotionPatternsWiped()
    })
  }

  /** The domain's shared motion selection this handler applies. */
  public getMotionCoordinator(): MotionSelectionCoordinator {
    return this.motionCoordinator
  }

  /** The motion cue this handler's domain is running, as the renderer should show it. */
  public getRunningMotionCue(): MotionCueChangePayload {
    return this.motionCoordinator.getRunningMotionRef()
  }

  /** A new song starts with no chart blackout held, so a strobe that opens it plays. */
  public notifySongStart(): void {
    this.registry.onSongStart()
    this.registry.onMotionSongStart()
    this.chartBlackoutHeld = false
  }

  public notifySongEnd(): void {
    this.registry.onSongEnd()
    this.registry.onMotionSongEnd()
    this.chartBlackoutHeld = false
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
    this.resetInputEdgeState()
  }

  /** Clears per-frame edge baselines without disturbing primary cue history or registry state. */
  public resetInputEdgeState(): void {
    this.previousCueData = undefined
    this.wasVocalActive = false
    this.pendingSlowBlackoutEnd = false
    this.chartBlackoutHeld = false
  }

  /** Stops the active strobe slot without disturbing per-frame edge baselines. */
  public stopActiveStrobe(): void {
    if (this.currentStrobeCue) {
      this.currentStrobeCue.onStop?.()
      this.currentStrobeCue = null
    }
    this.strobeState.setActive(null, 'net')
  }

  /** Stops any active strobe slot and clears per-frame edge baselines at session boundaries. */
  public resetSessionState(): void {
    this.stopActiveStrobe()
    this.resetInputEdgeState()
  }

  private addHistoryToCueData(cueType: CueType, parameters: CueData): CueData {
    const now = monotonicNowMs()

    // Strobe cues (including Strobe_Off) run in their own slot on top of the primary/secondary
    // look. They must not disturb the primary-cue history/executionCount accounting: a held
    // strobe is re-dispatched ~30x/s alongside the lighting cue, and mutating currentCue here
    // would thrash cueHistory/executionCount. Report the current (unchanged) primary state
    // instead of advancing it.
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
      fogState: parameters.fogState,
      ledBanks: parameters.ledBanks,
      guitarNotes: parameters.guitarNotes,
      bassNotes: parameters.bassNotes,
      keysNotes: parameters.keysNotes,
      drumNotes: parameters.drumNotes,
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

  /**
   * Run one dispatch. `dispatchToken` identifies the dispatch to the motion coordinator. The
   * fan-out passes one object to every chain's handler so they all apply the same motion decision,
   * and a direct caller leaves it out and gets a decision of its own.
   */
  public async handleCue(
    cueType: CueType,
    parameters: CueData,
    dispatchToken: object = {},
  ): Promise<void> {
    const incomingIsStrobe = isStrobeCueType(cueType)
    // Update CueData with history and context information. addHistoryToCueData no-ops the
    // primary-cue accounting for strobe cues so a held strobe does not thrash it.
    const historicCueData = this.addHistoryToCueData(cueType, parameters)

    // Special cases that need to be handled differently
    switch (cueType) {
      case CueType.Blackout_Fast:
      case CueType.Blackout_Spotlight:
      case CueType.NoCue:
        this.pendingSlowBlackoutEnd = false
        this.chartBlackoutHeld = true
        this.stopCurrentCue()
        void this._sequencer.blackout(0)
        this.emit('cueHandled', historicCueData)
        return
      case CueType.Blackout_Slow:
        this.pendingSlowBlackoutEnd = true
        this.chartBlackoutHeld = true
        this.stopCurrentCue()
        void this._sequencer.blackout(500)
        this.emit('cueHandled', historicCueData)
        return
      case CueType.Strobe_Off:
        this.stopActiveStrobe()
        this.emit('cueHandled', historicCueData)
        return
      case CueType.Keyframe_First:
      case CueType.Keyframe_Next:
      case CueType.Keyframe_Previous:
        this.handleKeyframe()
        this.emit('cueHandled', historicCueData)
        return
    }

    if (incomingIsStrobe && this.chartBlackoutHeld) {
      this.emit('cueHandled', historicCueData)
      return
    }
    // A non-strobe cue past this point ends the hold, resolved or not: the chart moved on.
    if (!incomingIsStrobe) {
      this.chartBlackoutHeld = false
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
      // End a running fade before this cue executes (see the field comment). Beyond the chart's
      // Blackout_Slow, a new primary cue also ends a fade the previous cue's own blackout action
      // started, which would refuse the new cue's first submission the same way. Strobes run on top
      // of whatever is already showing and must not touch it.
      const incomingIsNewPrimary =
        !incomingIsStrobe && !incomingIsSecondary && this.currentPrimaryCue !== cue
      if (
        (this.pendingSlowBlackoutEnd && !incomingIsStrobe) ||
        (incomingIsNewPrimary && this._sequencer.isBlackoutActive())
      ) {
        this.pendingSlowBlackoutEnd = false
        void this._sequencer.blackout(0)
      }

      if (incomingIsStrobe) {
        // Strobes run on top of primary and secondary overlays; track separately so Strobe_Off only clears strobes.
        if (this.currentStrobeCue && this.currentStrobeCue !== cue) {
          this.currentStrobeCue.onStop?.()
          this.currentStrobeCue = null
        }
        this.currentStrobeCue = cue
        this.strobeState.setActive(cueTypeToStrobeSlot(cueType), 'net')
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

      try {
        await cue.execute(historicCueData, this._sequencer, this._lightManager)
      } catch (error) {
        log.error(`Cue ${cueType} execution failed:`, error)
      }
    }
    // No `else` log here: the registry already logs (and dedups) a missing cue implementation.

    // Strobe cues run in their own slot and must not drive motion selection. The coordinator reads
    // a new cue from the cue type each dispatch carries, so only non-strobe cues reach it.
    if (trackMode !== 'simulated' && !incomingIsStrobe) {
      // The Fallback is a self-contained idle look; never layer an automatic motion cue on top of
      // it. Treat it like motion-disabled so any motion left over from the previous cue is stopped
      // (and the heads homed) and no new pick is made.
      if (!this.motionCoordinator.isMotionEnabled() || cueType === CueType.Fallback) {
        this.motionCoordinator.clear(dispatchToken, cueType)
        this.applyMotionCue(null)
      } else {
        this.motionCoordinator.select(dispatchToken, { cueKey: cueType })
        await this.runMotionCue(this.motionCoordinator.getCurrent(), historicCueData)
      }
    }

    this.emit('cueHandled', historicCueData)
  }

  /** Point this chain at the coordinator's motion cue and run it against this chain's sequencer. */
  private async runMotionCue(motionCue: INetCue | null, data: CueData): Promise<void> {
    this.applyMotionCue(motionCue)
    if (!motionCue) {
      return
    }
    try {
      await motionCue.execute(data, this._sequencer, this._lightManager)
    } catch (error) {
      log.error('Motion cue execution failed:', error)
      this.motionCoordinator.stopIfCurrent(motionCue)
      this.applyMotionCue(null)
    }
  }

  /**
   * Record which motion cue this chain runs. A change to a cue cancels a pending pan/tilt clear so
   * the new motion is not homed on its first frame. A change to nothing homes this chain's heads.
   */
  private applyMotionCue(motionCue: INetCue | null): void {
    if (motionCue === this.appliedMotionCue) {
      return
    }
    if (motionCue) {
      this._sequencer.cancelPanTiltClear()
    } else {
      this._sequencer.schedulePanTiltClear()
    }
    this.appliedMotionCue = motionCue
  }

  /** This chain's sequencer dropped its motion patterns without a pick asking it to. */
  private onMotionPatternsWiped(): void {
    if (!this.appliedMotionCue) {
      return
    }
    this.appliedMotionCue = null
    this.motionCoordinator.notifyExternalWipe()
  }

  /**
   * External trigger (RB3 switch-timer + Light-1 edge): force a probability-gated motion re-pick.
   * The swapped cue runs on the next frame dispatch (the RB3 keepalive), so this does not execute
   * it. The fan-out passes one `token` to every chain so they share the pick. No-op while motion is
   * disabled.
   */
  public requestMotionRepick(token: object = {}): void {
    if (!this.motionCoordinator.isMotionEnabled()) {
      return
    }
    this.motionCoordinator.select(token, { force: true })
    this.applyMotionCue(this.motionCoordinator.getCurrent())
  }

  /**
   * Stop all tracked cues (primary, secondary, strobe) and call their onStop lifecycle methods.
   * Used by blackout, NoCue, stopActiveCue(), and shutdown(). Primary-to-primary transitions stop
   * only the previous primary inline, not via this method.
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
    this.stopActiveStrobe()
    this.motionCoordinator.stop()
    this.applyMotionCue(null)
  }

  /** Stop the active cue. Used by simulation so restarting the same cue works reliably. */
  public stopActiveCue(): void {
    this.stopCurrentCue()
  }

  public handleKeyframe(): void {
    this._sequencer.onKeyframe()
  }

  public async handleCueDefault(parameters: CueData): Promise<void> {
    await this.handleCue(CueType.Default, parameters)
  }

  /**
   * Clean up resources and stop any executing cue.
   *
   * Node cue instances are singletons held by the domain's `CueRegistry`, so they are not
   * literally destroyed when this handler tears down; the same instances are reused
   * by the next handler. We call `onStop()` so each cue's `CueSession` is reset
   * (`cueStartedFired` cleared, engine nulled) and the next activation can fire
   * `cue-started` from a clean state.
   */
  public shutdown(): void {
    this.stopCurrentCue()
    this.unsubscribeMotionWipe()
    // End any open song on the registry so once-per-song and motion locks never survive a teardown.
    // This is the single owner of song-end on teardown, covering every path that disposes a handler
    // (coordinator clear, RigChain.dispose). Both calls are idempotent.
    this.registry.onSongEnd()
    this.registry.onMotionSongEnd()
    this.removeAllListeners()
  }
}

export { CueHandler, CueType }
