import type { INetCue } from '../cues/interfaces/INetCue'
import type { MotionCueRef } from '../cues/types/cueTypes'
import { RENDERER_RECEIVE } from '../../shared/ipcChannels'
import type { MotionCueChangePayload } from '../../shared/ipc/common'
import type { RuntimeBroadcaster } from '../runtime/broadcaster'
import { noopRuntimeBroadcaster } from '../runtime/broadcaster'
import { monotonicNowMs } from '../../shared/time'

export type MotionChangeChannel =
  | typeof RENDERER_RECEIVE.YARG_MOTION_CUE_CHANGE
  | typeof RENDERER_RECEIVE.RB3_MOTION_CUE_CHANGE
  | typeof RENDERER_RECEIVE.AUDIO_MOTION_CUE_CHANGE

/** The motion lookups a coordinator needs from its domain's registry. */
export interface MotionCueSource<TCue> {
  getRandomMotionCue(): TCue | null
  getMotionCueImplementation(ref: MotionCueRef): TCue | null
  findMotionCueRef(cue: TCue): MotionCueRef | null
}

/** A motion cue as the coordinator handles it: one it can stop on every chain at once. */
export interface StoppableMotionCue {
  onStop?(): void
}

export interface MotionSelectionCoordinatorOptions<TCue> {
  registry: MotionCueSource<TCue>
  getMotionCueMinimumHoldMs?: () => number
  /** Probability (0-100) that an automatic pick plays on a new lighting cue. Defaults to always. */
  getMotionCueProbabilityPercent?: () => number
  runtimeBroadcaster?: RuntimeBroadcaster
  /** Which motion-change channel a decision is broadcast on. Defaults to YARG. */
  motionChangeChannel?: MotionChangeChannel
  /** Names the domain in the log line for a manual pick that fell back. Defaults to YARG. */
  domainLabel?: string
}

/** What one dispatch tells the coordinator. */
export interface MotionSelectRequest {
  /** The primary cue the dispatch carries. A key that differs from the last one is a new cue. */
  cueKey?: string
  /** Picks as for a new cue without one, for an external trigger such as the RB3 switch timer. */
  force?: boolean
  /** Picks without waiting out the minimum hold. */
  bypassMinHold?: boolean
  /** Picks automatically, leaving any manual ref aside. */
  ignoreManualRef?: boolean
  /** A new cue that arrives inside the minimum hold still picks once the hold has run. */
  pickAfterHold?: boolean
}

/** Whether two motion refs name the same cue. */
export function sameMotionRef(a: MotionCueRef | null, b: MotionCueRef | null): boolean {
  if (a === null || b === null) {
    return a === b
  }
  return a.groupId === b.groupId && a.cueId === b.cueId
}

/**
 * The motion cue one domain is running, chosen once and shared by every rig chain.
 *
 * Every chain's handler asks the coordinator for the motion cue on each dispatch, passing the token
 * the fan-out minted for that dispatch and the primary cue it carries. The first handler to ask
 * decides: it rolls the probability, picks the cue, stops the previous one (a cue stops on every
 * chain at once) and broadcasts the change. The other handlers get the same answer from the token,
 * so two rigs never run different motion cues for one dispatch and the renderer hears one event
 * per decision. Whether the cue is new is read from the dispatch's cue key against the last one
 * seen, so every chain gets the same answer however its own cue history runs.
 *
 * A manual ref, a repick request, motion being switched off and an external wipe of the motion
 * patterns all land here, so the answer to "what motion cue is running" has one owner per domain.
 */
export class MotionSelectionCoordinator<TCue extends StoppableMotionCue = INetCue> {
  private readonly registry: MotionCueSource<TCue>
  private readonly getMotionCueMinimumHoldMs: () => number
  private readonly getMotionCueProbabilityPercent: () => number
  private readonly runtimeBroadcaster: RuntimeBroadcaster
  private readonly motionChangeChannel: MotionChangeChannel
  private readonly domainLabel: string
  private currentMotionCue: TCue | null = null
  private currentMotionCueStartTime: number | null = null
  private currentPick: { source: 'manual' | 'auto'; manualFallback: boolean } | null = null
  private manualMotionRef: MotionCueRef | null = null
  /** The manual ref the last pick used, undefined until a pick has looked at it. */
  private lastManualMotionRefForMotion: MotionCueRef | null | undefined = undefined
  /** The primary cue the last decision was made for, undefined until a dispatch carries one. */
  private lastCueKey: string | undefined = undefined
  private motionEnabled = true
  /** Set when the cue's pattern was wiped from outside, so the next dispatch picks again. */
  private repickPending = false
  /** One decision per dispatch token, so every chain applies the same answer. */
  private readonly decisions = new WeakMap<object, TCue | null>()

  constructor(options: MotionSelectionCoordinatorOptions<TCue>) {
    this.registry = options.registry
    this.getMotionCueMinimumHoldMs = options.getMotionCueMinimumHoldMs ?? (() => 5000)
    this.getMotionCueProbabilityPercent = options.getMotionCueProbabilityPercent ?? (() => 100)
    this.runtimeBroadcaster = options.runtimeBroadcaster ?? noopRuntimeBroadcaster()
    this.motionChangeChannel =
      options.motionChangeChannel ?? RENDERER_RECEIVE.YARG_MOTION_CUE_CHANGE
    this.domainLabel = options.domainLabel ?? 'YARG'
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

  /** Point manual picks at `ref`. The same ref again changes nothing, so the minimum hold holds. */
  public setManualMotionRef(ref: MotionCueRef | null): void {
    if (sameMotionRef(ref, this.manualMotionRef)) {
      return
    }
    this.manualMotionRef = ref
    this.lastManualMotionRefForMotion = undefined
  }

  /** Forget the hold and the last cue, so the next dispatch picks at once. */
  public resetTracking(): void {
    this.currentMotionCueStartTime = null
    this.lastCueKey = undefined
    this.lastManualMotionRefForMotion = undefined
  }

  /** The motion cue every chain should be running now, or null while the heads are homed. */
  public getCurrent(): TCue | null {
    return this.currentMotionCue
  }

  /**
   * The motion cue for one dispatch. A new primary cue or a `force` trigger picks afresh once the
   * current cue has held for the minimum time. A manual-ref change or a pending repick picks at
   * once. Otherwise the current cue is kept. Repeated calls with the same token return the first
   * call's answer without deciding again.
   */
  public select(token: object, request: MotionSelectRequest = {}): TCue | null {
    if (this.decisions.has(token)) {
      return this.decisions.get(token) ?? null
    }
    const decided = this.decide(request)
    this.decisions.set(token, decided)
    return decided
  }

  /**
   * Stop the running motion cue for one dispatch, recording the cue it carries. Later calls with
   * the same token do nothing.
   */
  public clear(token: object, cueKey?: string): void {
    if (this.decisions.has(token)) {
      return
    }
    this.decisions.set(token, null)
    this.stop()
    if (cueKey !== undefined) {
      this.lastCueKey = cueKey
    }
  }

  /**
   * Stop the running motion cue, if any, and broadcast that nothing runs. The next dispatch counts
   * as a new cue, so motion comes back with whatever plays next.
   * @param stopCue How to stop the cue. Defaults to its `onStop`.
   */
  public stop(stopCue?: (cue: TCue) => void): void {
    this.lastCueKey = undefined
    this.stopRunning(stopCue)
  }

  /** Stop `cue` only while it is the running one, for a chain whose run of it failed. */
  public stopIfCurrent(cue: TCue): void {
    if (this.currentMotionCue === cue) {
      this.stopRunning()
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

  private decide(request: MotionSelectRequest): TCue | null {
    const isNewCue = request.cueKey !== undefined && request.cueKey !== this.lastCueKey
    const isManualChange = this.manualMotionRef !== this.lastManualMotionRefForMotion
    const now = monotonicNowMs()
    const heldLongEnough =
      request.bypassMinHold === true ||
      this.currentMotionCueStartTime == null ||
      now - this.currentMotionCueStartTime >= this.getMotionCueMinimumHoldMs()
    if (isNewCue && (heldLongEnough || request.pickAfterHold !== true)) {
      this.lastCueKey = request.cueKey
    }
    const needNewMotionPick =
      isManualChange ||
      this.repickPending ||
      ((isNewCue || request.force === true) && heldLongEnough)

    if (!needNewMotionPick) {
      return this.currentMotionCue
    }

    this.repickPending = false
    this.lastManualMotionRefForMotion = this.manualMotionRef
    const manualRef = request.ignoreManualRef ? null : this.manualMotionRef
    let motionCue: TCue | null = null
    let source: 'manual' | 'auto' = 'auto'
    let manualFallback = false
    if (manualRef) {
      motionCue = this.registry.getMotionCueImplementation(manualRef)
      if (motionCue) {
        source = 'manual'
      } else {
        manualFallback = true
        motionCue = this.registry.getRandomMotionCue()
        this.runtimeBroadcaster.emit(RENDERER_RECEIVE.DEBUG_LOG, {
          message: `Selected ${this.domainLabel} motion cue is unavailable (disabled or unknown), using a random motion program.`,
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
      this.stopRunning()
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

  /** Stop the running cue and broadcast that nothing runs, keeping the last cue key. */
  private stopRunning(stopCue: (cue: TCue) => void = (cue) => cue.onStop?.()): void {
    if (!this.currentMotionCue) {
      return
    }
    stopCue(this.currentMotionCue)
    this.dropCurrent()
    this.emit(null, 'cleared', false)
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
