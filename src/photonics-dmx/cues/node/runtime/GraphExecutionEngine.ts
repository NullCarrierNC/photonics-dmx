/**
 * Unified execution engine for cue and effect node graphs.
 * Parameterized by GraphExecutionPolicy; drives ExecutionStateMachine natively per context.
 */

import { ILightingController } from '../../../controllers/sequencer/interfaces'
import { DmxLightManager } from '../../../controllers/DmxLightManager'
import { CueData } from '../../types/cueTypes'
import type { CompiledYargCue } from '../compiler/NodeCueCompiler'
import type { CompiledEffect } from '../compiler/EffectCompiler'
import type { BaseEventNode } from '../../types/nodeCueTypes'
import type { VariableDefinition } from '../../types/nodeCueTypes'
import type { VariableValue } from './executionTypes'
import type { NodeRuntimeCallbacks } from './executionTypes'
import { NodeExecutionEngine } from './NodeExecutionEngine'
import { EffectExecutionEngine } from './EffectExecutionEngine'
import { EffectRegistry } from './EffectRegistry'
import { ExecutionStateMachine } from './ExecutionStateMachine'
import { ExecutionPhase } from './executionTypes'
import type { GraphExecutionPolicy } from './GraphExecutionPolicy'
import type { ExecutionParameters } from './GraphExecutionPolicy'

/**
 * True if the payload carries instrument-event data (e.g. drum/guitar/bass/keys notes).
 * Used to avoid overwriting a queued instrument-bearing run with a plain tick.
 */
function hasInstrumentNotes(params: ExecutionParameters): boolean {
  const data = params as CueData
  return (
    (Array.isArray(data.drumNotes) && data.drumNotes.length > 0) ||
    (Array.isArray(data.guitarNotes) && data.guitarNotes.length > 0) ||
    (Array.isArray(data.bassNotes) && data.bassNotes.length > 0) ||
    (Array.isArray(data.keysNotes) && data.keysNotes.length > 0)
  )
}

/** Session interface: variable stores and initial-clear policy. */
export interface IGraphExecutionSession {
  getCueLevelVarStore(): Map<string, VariableValue>
  getGroupLevelVarStore(): Map<string, VariableValue>
  consumeInitialClearPolicy(): boolean
  /** For cue: has cue-started already fired this activation (so we don't re-run cue-started). */
  hasCueStartedFired?(): boolean
  /** For cue: mark cue-started as fired (called when we start cue-started run). */
  markCueStartedFired?(): void
  /** For cue: set first submission to use setEffect (primary cue). Returns true if already set this activation. */
  getClearedForThisActivation?(): boolean
  /** For cue: set first submission to use setEffect (primary cue). */
  setFirstSubmissionUsesSetEffect?(): void
  /** For cue: reset cue-level variables (e.g. when cue-started runs). */
  resetCueLevelVariables?(vars: VariableDefinition[]): void
}

/**
 * Single engine that runs either a cue graph or an effect graph based on policy.
 * Owns ExecutionStateMachine per context (created and transitioned internally).
 * For cue graphs: wraps NodeExecutionEngine, handles queuing, drives state machine.
 * For effect graphs: wraps EffectExecutionEngine (state machine optional).
 */
export class GraphExecutionEngine {
  private readonly policy: GraphExecutionPolicy
  private readonly session: IGraphExecutionSession
  private readonly sequencer: ILightingController
  private readonly lightManager: DmxLightManager
  private readonly callbacks?: NodeRuntimeCallbacks
  private readonly variableDefinitions: VariableDefinition[]
  private effectRegistry?: EffectRegistry
  private compiledCue?: CompiledYargCue
  private compiledEffect?: CompiledEffect<BaseEventNode>
  private readonly cueId: string
  private nodeEngine: NodeExecutionEngine | null = null
  private effectEngine: EffectExecutionEngine | null = null
  /** Per-context state machines (cue graph only when using nodeEngine). */
  private readonly contextStateMachines = new Map<string, ExecutionStateMachine>()
  /** Cue queuing: when a cue-started/cue-called run is in progress, queue incoming execute params. */
  private isExecutingCueStarted = false
  private queuedParameters: ExecutionParameters[] = []

  private get compiledCueOrEffect(): CompiledYargCue | CompiledEffect<BaseEventNode> {
    if (this.compiledCue) return this.compiledCue
    if (this.compiledEffect) return this.compiledEffect
    throw new Error('GraphExecutionEngine: neither compiledCue nor compiledEffect set')
  }

  /**
   * Create engine for a cue graph (CompiledYargCue).
   * Effect registry required for effect-raiser nodes.
   */
  static forCue(
    compiledCue: CompiledYargCue,
    cueId: string,
    policy: GraphExecutionPolicy,
    session: IGraphExecutionSession,
    sequencer: ILightingController,
    lightManager: DmxLightManager,
    effectRegistry: EffectRegistry,
    variableDefinitions: VariableDefinition[],
    callbacks?: NodeRuntimeCallbacks,
  ): GraphExecutionEngine {
    const engine = new GraphExecutionEngine(
      policy,
      session,
      sequencer,
      lightManager,
      variableDefinitions,
      callbacks,
      cueId,
    )
    engine.compiledCue = compiledCue
    engine.effectRegistry = effectRegistry
    return engine
  }

  /**
   * Create engine for an effect graph (CompiledEffect).
   * Used when invoking an effect from a cue's effect-raiser (nested).
   */
  static forEffect(
    compiledEffect: CompiledEffect<BaseEventNode>,
    effectId: string,
    instanceId: number,
    policy: GraphExecutionPolicy,
    session: IGraphExecutionSession,
    sequencer: ILightingController,
    lightManager: DmxLightManager,
    variableDefinitions: VariableDefinition[],
    callbacks?: NodeRuntimeCallbacks,
  ): GraphExecutionEngine {
    const cueId = `effect:${effectId}:${instanceId}`
    const engine = new GraphExecutionEngine(
      policy,
      session,
      sequencer,
      lightManager,
      variableDefinitions,
      callbacks,
      cueId,
    )
    engine.compiledEffect = compiledEffect
    return engine
  }

  private constructor(
    policy: GraphExecutionPolicy,
    session: IGraphExecutionSession,
    sequencer: ILightingController,
    lightManager: DmxLightManager,
    variableDefinitions: VariableDefinition[],
    callbacks?: NodeRuntimeCallbacks,
    cueId = '',
  ) {
    this.policy = policy
    this.session = session
    this.sequencer = sequencer
    this.lightManager = lightManager
    this.variableDefinitions = variableDefinitions
    this.callbacks = callbacks
    this.cueId = cueId
  }

  /**
   * Build the lifecycle callback that creates and drives ExecutionStateMachine per context.
   * Used when we delegate to NodeExecutionEngine so we own the state machine.
   * Emits: started -> (blocked <-> running)* -> completed | cancelled.
   */
  private getContextLifecycleCallback(): (
    contextId: string,
    event: 'started' | 'completed' | 'cancelled' | 'blocked' | 'running',
  ) => void {
    return (
      contextId: string,
      event: 'started' | 'completed' | 'cancelled' | 'blocked' | 'running',
    ) => {
      if (event === 'started') {
        const sm = new ExecutionStateMachine()
        sm.transitionTo(ExecutionPhase.RUNNING)
        this.contextStateMachines.set(contextId, sm)
        return
      }
      const sm = this.contextStateMachines.get(contextId)
      if (sm) {
        if (event === 'blocked') {
          if (!sm.isTerminal() && sm.phase !== ExecutionPhase.BLOCKED) {
            sm.transitionTo(ExecutionPhase.BLOCKED)
          }
          return
        }
        if (event === 'running') {
          if (sm.phase === ExecutionPhase.BLOCKED) {
            sm.transitionTo(ExecutionPhase.RUNNING)
          }
          return
        }
        if (event === 'completed') {
          sm.transitionTo(ExecutionPhase.COMPLETED)
        } else if (event === 'cancelled') {
          sm.transitionTo(ExecutionPhase.CANCELLED)
        }
        this.contextStateMachines.delete(contextId)
      }
    }
  }

  private getOrCreateNodeEngine(): NodeExecutionEngine {
    if (this.nodeEngine) return this.nodeEngine
    if (!this.compiledCue || !this.effectRegistry) {
      throw new Error('GraphExecutionEngine: cue graph requires compiledCue and effectRegistry')
    }
    this.nodeEngine = new NodeExecutionEngine(
      this.compiledCue,
      this.cueId,
      this.sequencer,
      this.lightManager,
      this.session.getCueLevelVarStore(),
      this.session.getGroupLevelVarStore(),
      this.effectRegistry,
      this.variableDefinitions,
      undefined,
      this.callbacks,
      () => this.session.consumeInitialClearPolicy(),
      this.getContextLifecycleCallback(),
    )
    return this.nodeEngine
  }

  private getOrCreateEffectEngine(
    parameterValues: Record<string, unknown>,
    callerCueData: CueData | Record<string, unknown>,
  ): EffectExecutionEngine {
    if (this.effectEngine) return this.effectEngine
    if (!this.compiledEffect) {
      throw new Error('GraphExecutionEngine: effect graph requires compiledEffect')
    }
    this.effectEngine = new EffectExecutionEngine(
      this.compiledEffect,
      this.sequencer,
      this.lightManager,
      parameterValues as Record<string, unknown>,
      callerCueData as CueData,
      undefined,
      this.callbacks,
      () => this.session.consumeInitialClearPolicy(),
    )
    return this.effectEngine
  }

  /**
   * Run a cue graph: get entry nodes from policy, optionally queue, then start execution.
   * Caller must pass entryContext.hasCueStartedFired from session when policy uses queuing.
   */
  startCueRun(
    parameters: ExecutionParameters,
    entryContext?: { hasCueStartedFired?: boolean },
  ): void {
    const compiled = this.compiledCueOrEffect as CompiledYargCue
    const entryNodes = this.policy.getEntryNodes(compiled, parameters, entryContext)
    const cueStartedNodes = entryNodes.filter(
      (n) => (n as { eventType?: string }).eventType === 'cue-started',
    )
    const cueCalledNodes = entryNodes.filter(
      (n) => (n as { eventType?: string }).eventType === 'cue-called',
    )
    const hasCueEvent = cueStartedNodes.length > 0 || cueCalledNodes.length > 0

    if (this.policy.queuing && hasCueEvent && this.isExecutingCueStarted) {
      const existing = this.queuedParameters[0]
      if (existing && hasInstrumentNotes(existing) && !hasInstrumentNotes(parameters)) {
        return
      }
      this.queuedParameters = [parameters]
      return
    }

    if (hasCueEvent) {
      this.isExecutingCueStarted = true
    }

    if (
      this.session.setFirstSubmissionUsesSetEffect &&
      hasCueEvent &&
      !(this.session.getClearedForThisActivation?.() ?? false)
    ) {
      this.session.setFirstSubmissionUsesSetEffect()
    }

    if (cueStartedNodes.length > 0 && this.session.resetCueLevelVariables) {
      this.session.resetCueLevelVariables(this.variableDefinitions)
    }
    const otherNodes = entryNodes.filter((n) => {
      const et = (n as { eventType?: string }).eventType
      return et !== 'cue-started' && et !== 'cue-called'
    })

    const params = parameters as CueData
    const engine = this.getOrCreateNodeEngine()

    for (const event of otherNodes) {
      engine.startExecution(event as BaseEventNode, params)
    }

    if (cueStartedNodes.length > 0) {
      this.runCueStartedThenCalled(engine, cueStartedNodes, cueCalledNodes, params)
      return
    }

    if (cueCalledNodes.length > 0) {
      this.runCueCalledBatch(engine, cueCalledNodes, params)
      return
    }

    this.isExecutingCueStarted = false
  }

  private runCueStartedThenCalled(
    engine: NodeExecutionEngine,
    cueStartedNodes: BaseEventNode[],
    cueCalledNodes: BaseEventNode[],
    params: CueData,
  ): void {
    if (this.session.markCueStartedFired) {
      this.session.markCueStartedFired()
    }
    const runCueStartedAtIndex = (idx: number): void => {
      const ev = cueStartedNodes[idx]
      engine.startExecutionWithCallback(ev, params, () => {
        const nextIdx = idx + 1
        if (nextIdx < cueStartedNodes.length) {
          runCueStartedAtIndex(nextIdx)
          return
        }
        if (cueCalledNodes.length > 0) {
          let remaining = cueCalledNodes.length
          for (const calledEv of cueCalledNodes) {
            engine.startExecutionWithCallback(calledEv, params, () => {
              remaining -= 1
              if (remaining === 0) {
                this.onCueEventComplete()
              }
            })
          }
        } else {
          this.onCueEventComplete()
        }
      })
    }
    runCueStartedAtIndex(0)
  }

  private runCueCalledBatch(
    engine: NodeExecutionEngine,
    cueCalledNodes: BaseEventNode[],
    params: CueData,
  ): void {
    let remaining = cueCalledNodes.length
    for (const calledEv of cueCalledNodes) {
      engine.startExecutionWithCallback(calledEv, params, () => {
        remaining -= 1
        if (remaining === 0) {
          this.onCueEventComplete()
        }
      })
    }
  }

  private onCueEventComplete(): void {
    this.isExecutingCueStarted = false
    if (this.queuedParameters.length > 0) {
      const next = this.queuedParameters.shift()!
      const hasCueStartedFired = this.session.hasCueStartedFired?.() ?? false
      this.startCueRun(next, { hasCueStartedFired })
    }
  }

  /**
   * Run an effect graph (single entry: effect listener).
   * Apply parameter values and trigger.
   */
  triggerEffectRun(
    parameterValues: Record<string, unknown>,
    callerCueData: CueData | Record<string, unknown>,
  ): void {
    const engine = this.getOrCreateEffectEngine(parameterValues, callerCueData)
    engine.triggerEffect(callerCueData as CueData)
  }

  /**
   * Cancel all active executions.
   * @param skipEffectRemoval When true, leave effects on sequencer (e.g. primary cue stop).
   */
  cancelAll(skipEffectRemoval = false): void {
    this.queuedParameters.length = 0
    this.isExecutingCueStarted = false
    for (const sm of this.contextStateMachines.values()) {
      if (!sm.isTerminal()) {
        sm.transitionTo(ExecutionPhase.CANCELLED)
      }
    }
    this.contextStateMachines.clear()
    if (this.nodeEngine) {
      this.nodeEngine.cancelAll(skipEffectRemoval)
    }
    if (this.effectEngine) {
      this.effectEngine.cancelAll(skipEffectRemoval)
    }
  }

  hasActiveContexts(): boolean {
    return (
      this.contextStateMachines.size > 0 ||
      (this.effectEngine != null && this.effectEngine.hasActiveContexts())
    )
  }
}
