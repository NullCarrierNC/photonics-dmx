/**
 * Unified execution engine for cue and effect node graphs.
 * Parameterized by GraphExecutionPolicy; drives ExecutionStateMachine natively per context.
 */

import { ILightingController } from '../../../controllers/sequencer/interfaces'
import { DmxLightManager } from '../../../controllers/DmxLightManager'
import { CueData } from '../../types/cueTypes'
import type { CompiledNetCue } from '../compiler/NodeCueCompiler'
import type { BaseEventNode } from '../../types/nodeCueTypes'
import type { VariableDefinition } from '../../types/nodeCueTypes'
import type { VariableValue } from './executionTypes'
import type { NodeRuntimeCallbacks } from './executionTypes'
import { NodeExecutionEngine } from './NodeExecutionEngine'
import { EffectRegistry } from './EffectRegistry'
import { createExecutionStateMachineLifecycle } from './executionStateMachineLifecycle'
import type { GraphExecutionPolicy } from './GraphExecutionPolicy'
import type { ExecutionParameters } from './GraphExecutionPolicy'
import type { RuntimeBroadcaster } from '../../../runtime/broadcaster'

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
  private readonly runtimeBroadcaster: RuntimeBroadcaster
  private effectRegistry?: EffectRegistry
  private compiledCue?: CompiledNetCue
  private readonly cueId: string
  private nodeEngine: NodeExecutionEngine | null = null
  /** Per-context state-machine tracking (cue graph only, when delegating to nodeEngine). */
  private readonly esmLifecycle = createExecutionStateMachineLifecycle()
  /** Cue queuing: when a cue-started/cue-called run is in progress, queue incoming execute params. */
  private isExecutingCueStarted = false
  private queuedParameters: ExecutionParameters[] = []

  private get compiled(): CompiledNetCue {
    if (!this.compiledCue) {
      throw new Error('GraphExecutionEngine: compiledCue not set')
    }
    return this.compiledCue
  }

  /**
   * Create engine for a cue graph (YARG or motion node cues).
   * Effect registry required for effect-raiser nodes.
   */
  static forCue(
    compiledCue: CompiledNetCue,
    cueId: string,
    policy: GraphExecutionPolicy,
    session: IGraphExecutionSession,
    sequencer: ILightingController,
    lightManager: DmxLightManager,
    runtimeBroadcaster: RuntimeBroadcaster,
    effectRegistry: EffectRegistry,
    variableDefinitions: VariableDefinition[],
    callbacks?: NodeRuntimeCallbacks,
  ): GraphExecutionEngine {
    const engine = new GraphExecutionEngine(
      policy,
      session,
      sequencer,
      lightManager,
      runtimeBroadcaster,
      variableDefinitions,
      callbacks,
      cueId,
    )
    engine.compiledCue = compiledCue
    engine.effectRegistry = effectRegistry
    return engine
  }

  private constructor(
    policy: GraphExecutionPolicy,
    session: IGraphExecutionSession,
    sequencer: ILightingController,
    lightManager: DmxLightManager,
    runtimeBroadcaster: RuntimeBroadcaster,
    variableDefinitions: VariableDefinition[],
    callbacks?: NodeRuntimeCallbacks,
    cueId = '',
  ) {
    this.policy = policy
    this.session = session
    this.sequencer = sequencer
    this.lightManager = lightManager
    this.runtimeBroadcaster = runtimeBroadcaster
    this.variableDefinitions = variableDefinitions
    this.callbacks = callbacks
    this.cueId = cueId
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
      this.runtimeBroadcaster,
      this.session.getCueLevelVarStore(),
      this.session.getGroupLevelVarStore(),
      this.effectRegistry,
      this.variableDefinitions,
      {
        runtimeCallbacks: this.callbacks,
        consumeInitialClearPolicy: () => this.session.consumeInitialClearPolicy(),
        onContextLifecycle: this.esmLifecycle.onContextLifecycle,
        revisitPolicy: this.policy.revisitPolicy,
      },
    )
    return this.nodeEngine
  }

  /**
   * Run a cue graph: get entry nodes from policy, optionally queue, then start execution.
   * Caller must pass entryContext.hasCueStartedFired from session when policy uses queuing.
   *
   * Non-lifecycle entry events (beat, measure, instrument notes, etc.) dispatch immediately so
   * they are not dropped while a cue-started/cue-called chain is blocking.
   */
  startCueRun(
    parameters: ExecutionParameters,
    entryContext?: { hasCueStartedFired?: boolean },
  ): void {
    const compiled = this.compiled
    const entryNodes = this.policy.getEntryNodes(compiled, parameters, entryContext)
    const { cueStartedNodes, cueCalledNodes, nonLifecycleNodes } =
      this.splitLifecycleEntryNodes(entryNodes)
    const hasCueEvent = cueStartedNodes.length > 0 || cueCalledNodes.length > 0
    const lifecycleWouldQueue = this.policy.queuing && hasCueEvent && this.isExecutingCueStarted
    if (!lifecycleWouldQueue) {
      this.applyActivationSetup(cueStartedNodes, cueCalledNodes)
    }
    this.dispatchNonLifecycleEvents(nonLifecycleNodes, parameters)
    this.dispatchLifecycleEvents(cueStartedNodes, cueCalledNodes, parameters)
  }

  private splitLifecycleEntryNodes(entryNodes: BaseEventNode[]): {
    cueStartedNodes: BaseEventNode[]
    cueCalledNodes: BaseEventNode[]
    nonLifecycleNodes: BaseEventNode[]
  } {
    const cueStartedNodes = entryNodes.filter(
      (n) => (n as { eventType?: string }).eventType === 'cue-started',
    )
    const cueCalledNodes = entryNodes.filter(
      (n) => (n as { eventType?: string }).eventType === 'cue-called',
    )
    const nonLifecycleNodes = entryNodes.filter((n) => {
      const et = (n as { eventType?: string }).eventType
      return et !== 'cue-started' && et !== 'cue-called'
    })
    return { cueStartedNodes, cueCalledNodes, nonLifecycleNodes }
  }

  /** Initial-clear policy and cue-level variable reset before any entry submissions for this tick. */
  private applyActivationSetup(
    cueStartedNodes: BaseEventNode[],
    cueCalledNodes: BaseEventNode[],
  ): void {
    const hasCueEvent = cueStartedNodes.length > 0 || cueCalledNodes.length > 0
    if (
      this.policy.useInitialClearPolicy &&
      this.session.setFirstSubmissionUsesSetEffect &&
      hasCueEvent &&
      !(this.session.getClearedForThisActivation?.() ?? false)
    ) {
      this.session.setFirstSubmissionUsesSetEffect()
    }
    if (cueStartedNodes.length > 0 && this.session.resetCueLevelVariables) {
      this.session.resetCueLevelVariables(this.variableDefinitions)
    }
  }

  /**
   * Start execution for every triggered entry node except cue-started / cue-called.
   * Does not participate in lifecycle queuing.
   */
  private dispatchNonLifecycleEvents(
    nonLifecycleNodes: BaseEventNode[],
    parameters: ExecutionParameters,
  ): void {
    if (nonLifecycleNodes.length === 0) {
      return
    }
    const params = parameters as CueData
    const engine = this.getOrCreateNodeEngine()
    for (const event of nonLifecycleNodes) {
      engine.startExecution(event as BaseEventNode, params)
    }
  }

  /**
   * Run cue-started / cue-called chains with queuing when a previous lifecycle run is in flight.
   */
  private dispatchLifecycleEvents(
    cueStartedNodes: BaseEventNode[],
    cueCalledNodes: BaseEventNode[],
    parameters: ExecutionParameters,
  ): void {
    const hasCueEvent = cueStartedNodes.length > 0 || cueCalledNodes.length > 0

    if (this.policy.queuing && hasCueEvent && this.isExecutingCueStarted) {
      this.queuedParameters = [parameters]
      return
    }

    if (hasCueEvent) {
      this.isExecutingCueStarted = true
    }

    const params = parameters as CueData
    const engine = this.getOrCreateNodeEngine()

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
      const compiled = this.compiled
      const entryNodes = this.policy.getEntryNodes(compiled, next, { hasCueStartedFired })
      const { cueStartedNodes, cueCalledNodes } = this.splitLifecycleEntryNodes(entryNodes)
      this.applyActivationSetup(cueStartedNodes, cueCalledNodes)
      this.dispatchLifecycleEvents(cueStartedNodes, cueCalledNodes, next)
    }
  }

  /**
   * Cancel all active executions.
   * @param skipEffectRemoval When true, leave effects on sequencer (e.g. primary cue stop).
   */
  cancelAll(skipEffectRemoval = false): void {
    this.queuedParameters.length = 0
    this.isExecutingCueStarted = false
    this.esmLifecycle.cancelAll()
    if (this.nodeEngine) {
      this.nodeEngine.cancelAll(skipEffectRemoval)
    }
  }

  hasActiveContexts(): boolean {
    return this.esmLifecycle.hasActiveContexts()
  }
}
