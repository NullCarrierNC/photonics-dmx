import { EventEmitter } from 'events'
import { CueData, CueType, DrumNoteType, InstrumentNoteType } from '../cues/types/cueTypes'
import { YargMotionCueRef } from '../cues/types/audioCueTypes'
import { ILightingController } from '../controllers/sequencer/interfaces'
import { DmxLightManager } from '../controllers/DmxLightManager'
import { INetCue, CueStyle } from '../cues/interfaces/INetCue'
import { YargCueRegistry } from '../cues/registries/YargCueRegistry'
import { RENDERER_RECEIVE } from '../../shared/ipcChannels'
import { sendToAllWindows } from '../../main/utils/windowUtils'

/**
 * YargCueHandler handles the cues called by the YARG network listener.
 *
 * Cue selection is delegated to YargCueRegistry.getCueImplementation(cueType, trackMode), which uses
 * active/enabled groups, consistency tracking, stage-kit preference when applicable,
 * and default-group fallback when no active group implements the cue.
 *
 * Motion cues run in parallel via YargCueRegistry.getRandomMotionCue() when the lighting cue type
 * changes (not on re-queues of the same cue). Simulated cues (trackMode === 'simulated') skip
 * random motion selection; use motion simulation IPC instead. Optional once-per-song lock from
 * configuration applies to random selection.
 *
 * Reminder: setEffect clears all running effects, regardless of layer.
 * Layer 0 will maintain its state though.
 * addEffect will not clear other effects unless it's on the same layer.
 */
const STROBE_TYPES: CueType[] = [
  CueType.Strobe_Fastest,
  CueType.Strobe_Fast,
  CueType.Strobe_Medium,
  CueType.Strobe_Slow,
  CueType.Strobe_Off,
]

export type YargCueHandlerOptions = {
  getMotionCueMinimumHoldMs?: () => number
  /** Probability (0-100) that an automatic motion cue pick will play on a new lighting cue. Defaults to 100 (always). */
  getMotionCueProbabilityPercent?: () => number
}

class YargCueHandler extends EventEmitter {
  private readonly _lightManager: DmxLightManager
  private readonly _sequencer: ILightingController
  private readonly registry: YargCueRegistry
  private currentPrimaryCue: INetCue | null = null
  private currentSecondaryCue: INetCue | null = null
  private currentStrobeCue: INetCue | null = null
  private currentMotionCue: INetCue | null = null
  private currentMotionCueStartTime: number | null = null
  private motionEnabled = true
  private manualMotionRef: YargMotionCueRef | null = null
  /** Tracks which manual ref was used for the last motion pick (undefined = not yet synced). */
  private lastManualMotionRefForMotion: YargMotionCueRef | null | undefined = undefined
  private lastEmittedMotionKey: string | null = null
  private readonly getMotionCueMinimumHoldMs: () => number
  private readonly getMotionCueProbabilityPercent: () => number
  private cueHistory: CueType[] = []
  private currentCue?: CueType
  private executionCount = 0
  private cueStartTime = 0
  private lastCueChangeTime = 0
  private previousCueData?: Partial<CueData>

  public setManualMotionRef(ref: YargMotionCueRef | null): void {
    this.manualMotionRef = ref
    this.lastManualMotionRefForMotion = undefined
  }

  private emitYargMotionCueChange(
    ref: YargMotionCueRef | null,
    source: 'manual' | 'auto' | 'cleared',
    manualFallback?: boolean,
  ): void {
    const key = ref ? `${ref.groupId}:${ref.cueId}` : 'null'
    if (key === this.lastEmittedMotionKey && source !== 'cleared' && manualFallback !== true) {
      return
    }
    this.lastEmittedMotionKey = key
    sendToAllWindows(RENDERER_RECEIVE.YARG_MOTION_CUE_CHANGE, {
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
        this.emitYargMotionCueChange(null, 'cleared')
      }
      this.lastManualMotionRefForMotion = undefined
    } else {
      this.lastManualMotionRefForMotion = undefined
    }
  }

  constructor(
    lightManager: DmxLightManager,
    photonicsSequencer: ILightingController,
    options?: YargCueHandlerOptions,
  ) {
    super()
    this._lightManager = lightManager
    this._sequencer = photonicsSequencer
    this.registry = YargCueRegistry.getInstance()
    this.getMotionCueMinimumHoldMs = options?.getMotionCueMinimumHoldMs ?? (() => 5000)
    this.getMotionCueProbabilityPercent = options?.getMotionCueProbabilityPercent ?? (() => 100)
  }

  public notifySongStart(): void {
    this.registry.onSongStart()
    YargCueRegistry.getInstance().onMotionSongStart()
  }

  public notifySongEnd(): void {
    this.registry.onSongEnd()
    YargCueRegistry.getInstance().onMotionSongEnd()
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
  }

  private addHistoryToCueData(cueType: CueType, parameters: CueData): CueData {
    const now = Date.now()

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
    }

    return historicCueData
  }

  public addCueHandledListener(listener: (data: CueData) => void): void {
    this.on('cueHandled', listener)
  }

  public removeCueHandledListener(listener: (data: CueData) => void): void {
    this.off('cueHandled', listener)
  }

  public setEffectDebouncePeriod(_time: number): void {
    // Stored preference compatibility; node cue dispatch does not debounce cue events.
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

  public async handleCue(cueType: CueType, parameters: CueData): Promise<void> {
    // Update CueData with history and context information
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
    const cue =
      trackMode === 'simulated' && parameters.simulationCueGroup
        ? this.registry.getCueImplementationFromGroup(
            cueType,
            parameters.simulationCueGroup,
            trackMode,
          )
        : this.registry.getCueImplementation(cueType, trackMode)

    if (cue) {
      const incomingIsStrobe = STROBE_TYPES.includes(cueType)
      const incomingIsSecondary = cue.style === CueStyle.Secondary

      if (incomingIsStrobe) {
        // Strobes run on top of primary and secondary overlays; track separately so Strobe_Off only clears strobes.
        if (this.currentStrobeCue && this.currentStrobeCue !== cue) {
          this.currentStrobeCue.onStop?.()
          this.currentStrobeCue = null
        }
        this.currentStrobeCue = cue
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
    } else {
      console.error(`No implementation found for cue: ${cueType}`)
    }

    if (trackMode !== 'simulated') {
      if (!this.motionEnabled) {
        if (this.currentMotionCue) {
          this.currentMotionCue.onStop?.()
          this.currentMotionCue = null
          this.currentMotionCueStartTime = null
          this._sequencer.schedulePanTiltClear()
          this.emitYargMotionCueChange(null, 'cleared')
        }
      } else {
        const registry = YargCueRegistry.getInstance()
        const isNewCue = historicCueData.executionCount === 1
        const isManualChange = this.manualMotionRef !== this.lastManualMotionRefForMotion
        const now = Date.now()
        const minHold = this.getMotionCueMinimumHoldMs()
        const heldLongEnough =
          this.currentMotionCueStartTime == null || now - this.currentMotionCueStartTime >= minHold
        const needNewMotionPick = isManualChange || (isNewCue && heldLongEnough)

        let motionCue: INetCue | null = null

        if (needNewMotionPick) {
          this.lastManualMotionRefForMotion = this.manualMotionRef
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
              sendToAllWindows(RENDERER_RECEIVE.DEBUG_LOG, {
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
            const ref = registry.findYargMotionCueRef(motionCue)
            if (ref) {
              this.emitYargMotionCueChange(ref, pickSource, pickManualFallback)
            }
          } else if (this.currentMotionCue) {
            this.currentMotionCue.onStop?.()
            this.currentMotionCue = null
            this.currentMotionCueStartTime = null
            this._sequencer.schedulePanTiltClear()
            this.emitYargMotionCueChange(null, 'cleared')
          }
        } else {
          motionCue = this.currentMotionCue
        }

        try {
          if (motionCue) {
            await motionCue.execute(historicCueData, this._sequencer, this._lightManager)
          }
        } catch (error) {
          console.error('Motion cue execution failed:', error)
          if (motionCue && this.currentMotionCue === motionCue) {
            this.currentMotionCue.onStop?.()
            this.currentMotionCue = null
            this.currentMotionCueStartTime = null
            this._sequencer.schedulePanTiltClear()
            this.emitYargMotionCueChange(null, 'cleared')
          }
        }
      }
    }

    this.emit('cueHandled', historicCueData)
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
    if (this.currentMotionCue) {
      this.currentMotionCue.onStop?.()
      this.currentMotionCue = null
      this.currentMotionCueStartTime = null
      this._sequencer.schedulePanTiltClear()
      this.emitYargMotionCueChange(null, 'cleared')
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
   * Node cue instances are singletons held by `YargCueRegistry`, so they are not
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
    if (this.currentMotionCue) {
      this.currentMotionCue.onStop?.()
      this.currentMotionCue = null
      this.currentMotionCueStartTime = null
    }
    this.removeAllListeners()
  }
}

export { YargCueHandler, CueType }
