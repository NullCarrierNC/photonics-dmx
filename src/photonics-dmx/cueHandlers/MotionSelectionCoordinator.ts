import type { INetCue } from '../cues/interfaces/INetCue'
import type { CueRegistry } from '../cues/registries/CueRegistry'
import type { MotionCueRef } from '../cues/types/cueTypes'
import { RENDERER_RECEIVE } from '../../shared/ipcChannels'
import type { MotionCueChangePayload } from '../../shared/ipc/common'
import type { RuntimeBroadcaster } from '../runtime/broadcaster'
import { noopRuntimeBroadcaster } from '../runtime/broadcaster'
import { monotonicNowMs } from '../../shared/time'

export type MotionChangeChannel =
  | typeof RENDERER_RECEIVE.YARG_MOTION_CUE_CHANGE
  | typeof RENDERER_RECEIVE.RB3_MOTION_CUE_CHANGE

export interface MotionSelectionCoordinatorOptions {
  registry: CueRegistry
  getMotionCueMinimumHoldMs?: () => number
  /** Probability (0-100) that an automatic pick plays on a new lighting cue. Defaults to always. */
  getMotionCueProbabilityPercent?: () => number
  runtimeBroadcaster?: RuntimeBroadcaster
  /** Which motion-change channel a decision is broadcast on. Defaults to YARG. */
  motionChangeChannel?: MotionChangeChannel
}

/**
 * The motion cue one net domain is running, chosen once and shared by every rig chain.
 *
 * Every chain's `CueHandler` asks the coordinator for the motion cue on each dispatch, passing the
 * token the fan-out minted for that dispatch. The first handler to ask decides: it rolls the
 * probability, picks the cue, stops the previous one (a cue stops on every chain at once) and
 * broadcasts the change. The other handlers get the same answer from the token, so two rigs never
 * run different motion cues for one dispatch and the renderer hears one event per decision.
 *
 * A manual ref, a repick request, motion being switched off and an external wipe of the motion
 * patterns all land here, so the answer to "what motion cue is running" has one owner per domain.
 */
export class MotionSelectionCoordinator {
  private readonly registry: CueRegistry
  private readonly getMotionCueMinimumHoldMs: () => number
  private readonly getMotionCueProbabilityPercent: () => number
  private readonly runtimeBroadcaster: RuntimeBroadcaster
  private readonly motionChangeChannel: MotionChangeChannel
  private currentMotionCue: INetCue | null = null
  private currentMotionCueStartTime: number | null = null
  private currentPick: { source: 'manual' | 'auto'; manualFallback: boolean } | null = null
  private manualMotionRef: MotionCueRef | null = null
  /** The manual ref the last pick used, undefined until a pick has looked at it. */
  private lastManualMotionRefForMotion: MotionCueRef | null | undefined = undefined
  private motionEnabled = true
  /** Set when the cue's pattern was wiped from outside, so the next dispatch picks again. */
  private repickPending = false
  /** One decision per dispatch token, so every chain applies the same answer. */
  private readonly decisions = new WeakMap<object, INetCue | null>()

  constructor(options: MotionSelectionCoordinatorOptions) {
    this.registry = options.registry
    this.getMotionCueMinimumHoldMs = options.getMotionCueMinimumHoldMs ?? (() => 5000)
    this.getMotionCueProbabilityPercent = options.getMotionCueProbabilityPercent ?? (() => 100)
    this.runtimeBroadcaster = options.runtimeBroadcaster ?? noopRuntimeBroadcaster()
    this.motionChangeChannel =
      options.motionChangeChannel ?? RENDERER_RECEIVE.YARG_MOTION_CUE_CHANGE
  }

  public isMotionEnabled(): boolean {
    return this.motionEnabled
  }

  public setMotionEnabled(enabled: boolean): void {
    if (this.motionEnabled === enabled) {
      return
    }
    this.motionEnabled = enabled
    if (!enabled) {
      this.stop()
    }
    this.lastManualMotionRefForMotion = undefined
  }

  public setManualMotionRef(ref: MotionCueRef | null): void {
    this.manualMotionRef = ref
    this.lastManualMotionRefForMotion = undefined
  }

  /** The motion cue every chain should be running now, or null while the heads are homed. */
  public getCurrent(): INetCue | null {
    return this.currentMotionCue
  }

  /**
   * The motion cue for one dispatch. A new primary cue (`isNewCue`) or an external `force` trigger
   * picks afresh once the current cue has held for the minimum time. A manual-ref change or a
   * pending repick picks at once. Otherwise the current cue is kept. Repeated calls with the same
   * token return the first call's answer without deciding again.
   */
  public select(token: object, isNewCue: boolean, force: boolean): INetCue | null {
    if (this.decisions.has(token)) {
      return this.decisions.get(token) ?? null
    }
    const decided = this.decide(isNewCue, force)
    this.decisions.set(token, decided)
    return decided
  }

  /** Stop the running motion cue for one dispatch. Later calls with the same token do nothing. */
  public clear(token: object): void {
    if (this.decisions.has(token)) {
      return
    }
    this.decisions.set(token, null)
    this.stop()
  }

  /** Stop the running motion cue, if any, and broadcast that nothing runs. */
  public stop(): void {
    if (!this.currentMotionCue) {
      return
    }
    this.currentMotionCue.onStop?.()
    this.dropCurrent()
    this.emit(null, 'cleared', false)
  }

  /** Stop `cue` only while it is the running one, for a chain whose run of it failed. */
  public stopIfCurrent(cue: INetCue): void {
    if (this.currentMotionCue === cue) {
      this.stop()
    }
  }

  /**
   * The motion patterns were removed underneath the running cue by something other than a pick.
   * The cue is stopped so its sessions reset and `cue-started` can fire again, and the next
   * dispatch picks afresh instead of waiting out the min hold.
   */
  public notifyExternalWipe(): void {
    if (!this.currentMotionCue) {
      return
    }
    this.currentMotionCue.onStop?.()
    this.dropCurrent()
    this.repickPending = true
    this.emit(null, 'cleared', false)
  }

  /** What the renderer should show for this domain's motion layer right now. */
  public getRunningMotionRef(): MotionCueChangePayload {
    const cue = this.currentMotionCue
    const pick = this.currentPick
    const ref = cue && pick ? this.registry.findMotionCueRef(cue) : null
    if (!ref || !pick) {
      return { ref: null, source: 'cleared', manualFallback: false }
    }
    return { ref, source: pick.source, manualFallback: pick.manualFallback }
  }

  private decide(isNewCue: boolean, force: boolean): INetCue | null {
    const isManualChange = this.manualMotionRef !== this.lastManualMotionRefForMotion
    const now = monotonicNowMs()
    const minHold = this.getMotionCueMinimumHoldMs()
    const heldLongEnough =
      this.currentMotionCueStartTime == null || now - this.currentMotionCueStartTime >= minHold
    const needNewMotionPick =
      isManualChange || this.repickPending || ((isNewCue || force) && heldLongEnough)

    if (!needNewMotionPick) {
      return this.currentMotionCue
    }

    this.repickPending = false
    this.lastManualMotionRefForMotion = this.manualMotionRef
    let motionCue: INetCue | null = null
    let source: 'manual' | 'auto' = 'auto'
    let manualFallback = false
    if (this.manualMotionRef) {
      motionCue = this.registry.getMotionCueImplementation(this.manualMotionRef)
      if (motionCue) {
        source = 'manual'
      } else {
        manualFallback = true
        motionCue = this.registry.getRandomMotionCue()
        this.runtimeBroadcaster.emit(RENDERER_RECEIVE.DEBUG_LOG, {
          message:
            'Selected YARG motion cue is unavailable (disabled or unknown), using a random motion program.',
          variables: [],
          timestamp: Date.now(),
        })
      }
    } else {
      const probability = this.getMotionCueProbabilityPercent()
      if (probability >= 100 || Math.random() * 100 < probability) {
        motionCue = this.registry.getRandomMotionCue()
      }
    }

    if (!motionCue) {
      this.stop()
      return null
    }

    const previous = this.currentMotionCue
    if (previous && previous !== motionCue) {
      previous.onStop?.()
    }
    this.currentMotionCue = motionCue
    if (previous !== motionCue) {
      this.currentMotionCueStartTime = now
    }
    this.currentPick = { source, manualFallback }
    const ref = this.registry.findMotionCueRef(motionCue)
    if (ref) {
      this.emit(ref, source, manualFallback)
    }
    return motionCue
  }

  private dropCurrent(): void {
    this.currentMotionCue = null
    this.currentMotionCueStartTime = null
    this.currentPick = null
  }

  private emit(
    ref: MotionCueRef | null,
    source: MotionCueChangePayload['source'],
    manualFallback: boolean,
  ): void {
    const payload: MotionCueChangePayload = { ref, source, manualFallback }
    this.runtimeBroadcaster.emit(this.motionChangeChannel, payload)
  }
}
