/**
 * Policy that parameterizes GraphExecutionEngine behaviour for cue graphs vs effect graphs.
 */

import type { BaseEventNode } from '../../types/nodeCueTypes'
import type { CompiledYargCue } from '../compiler/NodeCueCompiler'
import type { CompiledEffect } from '../compiler/EffectCompiler'
import type { CueData } from '../../types/cueTypes'
import { isInstrumentEventTriggered } from '../../types/cueTypes'

/** Cue data or effect parameter payload. */
export type ExecutionParameters = CueData | Record<string, unknown>

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
 * Cue graph policy: entry events cue-started/cue-called, queuing on, strict revisit, can invoke effects.
 */
export function cueGraphPolicy(groupId: string, cueId: string): GraphExecutionPolicy {
  const entryEventTypes: EntryEventConfig = ['cue-started', 'cue-called']
  return {
    entryEventTypes,
    queuing: true,
    revisitPolicy: 'strict',
    useInitialClearPolicy: true,
    canInvokeEffects: true,
    getLogPrefix: () => `cue:${groupId}:${cueId}`,
    getEntryNodes(compiled, parameters, entryContext): BaseEventNode[] {
      const cue = compiled as CompiledYargCue
      const hasCueStartedFired = entryContext?.hasCueStartedFired ?? false
      const cueData = parameters as CueData

      const isEventTriggered = (eventType: string): boolean => {
        if (eventType === 'cue-started') {
          return !hasCueStartedFired
        }
        if (eventType === 'cue-called') {
          return true
        }
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
            cueData.keyframe === 'First' ||
            cueData.keyframe === 'Next' ||
            cueData.keyframe === 'Previous'
          )
        }
        if (eventType === 'keyframe-first') return cueData.keyframe === 'First'
        if (eventType === 'keyframe-next') return cueData.keyframe === 'Next'
        if (eventType === 'keyframe-previous') return cueData.keyframe === 'Previous'
        const instrumentResult = isInstrumentEventTriggered(
          eventType,
          cueData.guitarNotes,
          cueData.bassNotes,
          cueData.keysNotes,
          cueData.drumNotes,
        )
        if (instrumentResult !== null) {
          return instrumentResult
        }
        return false
      }

      const events = Array.from(cue.eventMap.values())
      const triggeredEvents = events.filter((e) => {
        const eventType = (e as { eventType?: string }).eventType
        return eventType ? isEventTriggered(eventType) : false
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

      // cue-started runs only on first activation; cue-called every time
      // other events run immediately
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
      const listener = Array.from(effect.effectListenerMap.values())[0]
      return listener ? [listener as unknown as BaseEventNode] : []
    },
  }
}
