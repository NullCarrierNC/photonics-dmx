/**
 * Policy that parameterizes GraphExecutionEngine behaviour for cue graphs vs effect graphs.
 */

import type { BaseEventNode, YargEventNode } from '../../types/nodeCueTypes'
import type { CompiledYargCue } from '../compiler/NodeCueCompiler'
import type { CompiledEffect } from '../compiler/EffectCompiler'
import type { CueData } from '../../types/cueTypes'
import {
  isInstrumentEventTriggered,
  isVocalActive,
  isLedOn,
  ledBankNibbleAt,
} from '../../types/cueTypes'

/** Cue data or effect parameter payload. */
export type ExecutionParameters = CueData | Record<string, unknown>

/**
 * Whether a per-frame `cueData`-derived condition fires this frame: beat / half-beat / measure,
 * keyframe (any) and directional keyframe-first/next/previous, and the vocal-note, RB3 LED, fog and
 * instrument-note edges. Excludes the entry-only `cue-started`/`cue-called`, which depend on
 * session state rather than cueData. Shared by cue entry-node selection and by condition-based
 * action waits, so an event node and a `waitUntil` on the same condition mean the identical thing.
 * `triggerOnColorChange` is the per-node opt-in for led-N edges to also fire on a same-position
 * bank-colour change; it defaults off, so a caller with no node keeps plain on/off edge semantics.
 */
export function evaluateEventCondition(
  eventType: string,
  cueData: CueData,
  triggerOnColorChange = false,
): boolean {
  if (eventType === 'measure') {
    return cueData.beat === 'Measure'
  }
  if (eventType === 'beat') {
    return cueData.beat === 'Strong' || cueData.beat === 'Weak' || cueData.beat === 'Measure'
  }
  if (eventType === 'half-beat') {
    return cueData.beat === 'Strong' || cueData.beat === 'Weak'
  }
  if (eventType === 'keyframe') {
    return (
      cueData.keyframe === 'First' || cueData.keyframe === 'Next' || cueData.keyframe === 'Previous'
    )
  }
  if (eventType === 'keyframe-first') return cueData.keyframe === 'First'
  if (eventType === 'keyframe-next') return cueData.keyframe === 'Next'
  if (eventType === 'keyframe-previous') return cueData.keyframe === 'Previous'
  // Vocal events are edge-triggered: compare singing state against the previous frame
  // (stamped by CueHandler.addHistoryToCueData) so each node fires once per edge.
  // A missing previousFrame (first frame of the cue) counts as not-singing. When a strobe
  // is active these edges fire only in the primary cue's graph: handleCue updates the
  // previous-frame snapshot on the primary call, so the strobe slot sees prev == current.
  if (eventType === 'vocal-note') {
    return isVocalActive(cueData) && !isVocalActive(cueData.previousFrame ?? {})
  }
  if (eventType === 'vocal-note-off') {
    return !isVocalActive(cueData) && isVocalActive(cueData.previousFrame ?? {})
  }
  // RB3 StageKit LED position edges, matched like vocal events against the previous frame.
  // LED bank state persists between packets, so a level trigger would re-fire every frame; the
  // edge fires once when the aggregate (any-bank) position lights up (led-N) or clears (led-N-off).
  const ledMatch = /^led-([1-8])(-off)?$/.exec(eventType)
  if (ledMatch) {
    const idx = Number(ledMatch[1]) - 1
    const now = isLedOn(cueData, idx)
    const prev = isLedOn(cueData.previousFrame ?? {}, idx)
    if (ledMatch[2]) return !now && prev // led-N-off: clears the aggregate position
    if (now && !prev) return true // on-edge: the position just lit up
    // Opt-in colour change: the position stays lit but the banks lighting it changed. Lets
    // sweeps/flashes fire on lighting that holds all LEDs on and only swaps colours.
    if (now && prev && triggerOnColorChange) {
      return ledBankNibbleAt(cueData, idx) !== ledBankNibbleAt(cueData.previousFrame ?? {}, idx)
    }
    return false
  }
  if (eventType === 'fog-on') {
    return cueData.fogState === true && (cueData.previousFrame?.fogState ?? false) === false
  }
  if (eventType === 'fog-off') {
    return cueData.fogState === false && (cueData.previousFrame?.fogState ?? false) === true
  }
  // Instrument note events are edge-triggered against the previous frame like the vocal and LED
  // edges above: a note held across keepalive frames fires once, on the frame it arrives.
  const instrumentResult = isInstrumentEventTriggered(
    eventType,
    cueData.guitarNotes,
    cueData.bassNotes,
    cueData.keysNotes,
    cueData.drumNotes,
    cueData.previousFrame,
  )
  if (instrumentResult !== null) {
    return instrumentResult
  }
  return false
}

/**
 * Policy aspect: which event types start execution.
 * Cue: cue-started, cue-called; effect: effect-listener (single entry).
 */
export type EntryEventConfig = readonly string[]

/**
 * Revisit rule: strict = visited nodes are never re-entered;
 * relaxed = action nodes and event raisers may be revisited (EffectExecutionEngine behaviour).
 */
export type RevisitPolicy = 'strict' | 'relaxed'

export interface GraphExecutionPolicy {
  /** Event types that start execution (e.g. ['cue-started', 'cue-called'] or effect-listener). */
  readonly entryEventTypes: EntryEventConfig
  /** When true, retain the most recent pending cue run while a cue lifecycle run is in progress; when it completes, one run is started with the latest params (cue only). */
  readonly queuing: boolean
  /** strict = no re-entry of visited nodes; relaxed = action/event-raiser may revisit. */
  readonly revisitPolicy: RevisitPolicy
  /** When true, first effect submission uses setEffect (consumed from session). */
  readonly useInitialClearPolicy: boolean
  /** When true, this run can spawn nested effect runs (cue only). */
  readonly canInvokeEffects: boolean
  /** Prefix for logging and effect naming (e.g. "cue:groupId:cueType" or "effect:effectId"). */
  getLogPrefix(): string
  /**
   * Return entry event nodes for this execution.
   * Cue: event nodes from eventMap (triggered by params + entryContext.hasCueStartedFired); effect: single effect listener.
   */
  getEntryNodes(
    compiled: CompiledYargCue | CompiledEffect<BaseEventNode>,
    parameters: ExecutionParameters,
    entryContext?: { hasCueStartedFired?: boolean },
  ): BaseEventNode[]
}

/**
 * Shared cue-like graph policy (YARG visual cues and motion node cues share entry-node logic).
 */
function cueLikeGraphPolicy(
  groupId: string,
  cueId: string,
  useInitialClearPolicy: boolean,
): GraphExecutionPolicy {
  return {
    entryEventTypes: ['cue-started', 'cue-called'],
    queuing: true,
    revisitPolicy: 'strict',
    useInitialClearPolicy,
    canInvokeEffects: true,
    getLogPrefix: () => `cue:${groupId}:${cueId}`,
    getEntryNodes(compiled, parameters, entryContext): BaseEventNode[] {
      const cue = compiled as CompiledYargCue
      const hasCueStartedFired = entryContext?.hasCueStartedFired ?? false
      const cueData = parameters as CueData

      const isEventTriggered = (event: YargEventNode): boolean => {
        const eventType = event.eventType
        if (eventType === 'cue-started') {
          return !hasCueStartedFired
        }
        if (eventType === 'cue-called') {
          return true
        }
        return evaluateEventCondition(eventType, cueData, event.triggerOnColorChange)
      }

      const events = Array.from(cue.eventMap.values())
      const triggeredEvents = events.filter((e) => {
        const event = e as YargEventNode
        return event.eventType ? isEventTriggered(event) : false
      })

      const cueStarted = triggeredEvents.filter(
        (e) => (e as { eventType?: string }).eventType === 'cue-started',
      )
      const cueCalled = triggeredEvents.filter(
        (e) => (e as { eventType?: string }).eventType === 'cue-called',
      )
      const otherEvents = triggeredEvents.filter((e) => {
        const et = (e as { eventType?: string }).eventType
        return et !== 'cue-started' && et !== 'cue-called'
      })

      // cue-started runs only on first activation; cue-called every tick when present; other events when params match
      const ordered: BaseEventNode[] = []
      if (cueStarted.length > 0) {
        ordered.push(...cueStarted)
      }
      if (cueCalled.length > 0) {
        ordered.push(...cueCalled)
      }
      ordered.push(...otherEvents)
      return ordered
    },
  }
}

/**
 * Cue graph policy: entry events cue-started/cue-called, queuing on, strict revisit, can invoke effects.
 * First effect submission may use setEffect to clear prior effects (primary visual cue behaviour).
 */
export function cueGraphPolicy(groupId: string, cueId: string): GraphExecutionPolicy {
  return cueLikeGraphPolicy(groupId, cueId, true)
}

/**
 * Motion cue graph policy: never uses initial setEffect clear (motion runs alongside visuals).
 * Entry events match visual cues (`cue-started`, `cue-called`, beat/instrument, etc.).
 * Motion-pattern actions skip re-adding when the resolved config matches an active run (see NodeExecutionEngine).
 */
export function motionCueGraphPolicy(groupId: string, cueId: string): GraphExecutionPolicy {
  return cueLikeGraphPolicy(groupId, cueId, false)
}

/**
 * Effect graph policy: single effect-listener entry, no queuing, relaxed revisit, no effect invocation.
 */
export function effectGraphPolicy(effectId: string, instanceId?: number): GraphExecutionPolicy {
  const prefix = instanceId != null ? `effect:${effectId}:${instanceId}` : `effect:${effectId}`
  return {
    entryEventTypes: ['effect-listener'],
    queuing: false,
    revisitPolicy: 'relaxed',
    useInitialClearPolicy: true,
    canInvokeEffects: false,
    getLogPrefix: () => prefix,
    getEntryNodes(compiled, _parameters, _entryContext): BaseEventNode[] {
      const effect = compiled as CompiledEffect<BaseEventNode>
      // Every effect-listener is an entry point (an effect may declare more than one).
      return Array.from(effect.effectListenerMap.values()) as unknown as BaseEventNode[]
    },
  }
}
