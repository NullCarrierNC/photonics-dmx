import { INetCue, CueStyle } from '../../interfaces/INetCue'
import { CueData } from '../../types/cueTypes'
import { ILightingController } from '../../../controllers/sequencer/interfaces'
import { DmxLightManager } from '../../../controllers/DmxLightManager'
import { CompiledNetCue } from '../compiler/NodeCueCompiler'
import { EffectRegistry } from './EffectRegistry'
import type { NodeRuntimeCallbacks, VariableValue } from './executionTypes'
import { CueSession } from './CueSession'
import { GraphExecutionEngine } from './GraphExecutionEngine'
import type { GraphExecutionPolicy } from './GraphExecutionPolicy'
import type { NetNodeCueDefinition } from '../../types/nodeCueTypes'
import type { RuntimeBroadcaster } from '../../../runtime/broadcaster'
import { noopRuntimeBroadcaster } from '../../../runtime/broadcaster'

/** Per-sequencer runtime state for one cue. */
interface NodeCueRunState {
  /** Lazily (re)created after construction or onStop; cancelled and nulled on stop so the next
   *  execute starts with a fresh engine but the session's accumulated state survives. */
  engine: GraphExecutionEngine | null
  session: CueSession
}

/**
 * Shared runtime for the node cues that run on a rig: session and engine lifecycle keyed per
 * sequencer, so multiple rigs running the same cue each get their own state without sharing it.
 *
 * Subclasses supply what differs between a lighting cue and a motion cue through the hooks below:
 * the execution policy, how the session is built, the cue's identity and style, and whether a stop
 * leaves submitted effects in place.
 */
export abstract class BaseNodeCue implements INetCue {
  protected readonly groupId: string
  protected readonly compiledCue: CompiledNetCue
  private readonly effectRegistry: EffectRegistry
  private readonly runtimeCallbacks?: NodeRuntimeCallbacks
  private readonly runtimeBroadcaster: RuntimeBroadcaster
  private readonly states = new Map<ILightingController, NodeCueRunState>()

  constructor(
    groupId: string,
    compiledCue: CompiledNetCue,
    effectRegistry?: EffectRegistry,
    runtimeCallbacks?: NodeRuntimeCallbacks,
    runtimeBroadcaster?: RuntimeBroadcaster,
  ) {
    this.groupId = groupId
    this.compiledCue = compiledCue
    this.effectRegistry = effectRegistry ?? new EffectRegistry()
    this.runtimeCallbacks = runtimeCallbacks
    this.runtimeBroadcaster = runtimeBroadcaster ?? noopRuntimeBroadcaster()
  }

  // --- hooks for the genuine differences --------------------------------------

  /** Entry-node and effect-clear policy for this kind of cue. */
  protected abstract policyFor(cueId: string): GraphExecutionPolicy

  /**
   * The variable store this cue's session starts from. Lighting cues share a group-level store so
   * one cue can hand state to another in the same group, motion cues start fresh.
   */
  protected abstract sessionStoreFor(
    sequencer: ILightingController,
  ): Map<string, VariableValue> | undefined

  /** Whether a stop leaves already-submitted effects on the sequencer. */
  protected abstract get skipEffectRemovalOnStop(): boolean

  /** Called when a sequencer is released, for state held outside {@link states}. */
  protected onSequencerReleased(_sequencer: ILightingController): void {
    // default: nothing beyond the per-sequencer state the base already drops
  }

  protected get definition(): NetNodeCueDefinition {
    return this.compiledCue.definition as NetNodeCueDefinition
  }

  abstract get cueId(): string
  abstract get style(): CueStyle

  get id(): string {
    return `${this.groupId}:${this.definition.id}`
  }

  get description(): string | undefined {
    return this.definition.description
  }

  // --- shared lifecycle -------------------------------------------------------

  private getOrCreateState(
    sequencer: ILightingController,
    lightManager: DmxLightManager,
  ): NodeCueRunState {
    let state = this.states.get(sequencer)
    if (!state) {
      const session = new CueSession(this.sessionStoreFor(sequencer))
      session.initializeVariables(
        this.definition.variables ?? [],
        this.compiledCue.groupVariables ?? [],
      )
      state = { engine: null, session }
      this.states.set(sequencer, state)
    }
    if (!state.engine) {
      const cueId = this.id
      state.engine = GraphExecutionEngine.forCue(
        this.compiledCue,
        cueId,
        this.policyFor(cueId),
        state.session,
        sequencer,
        lightManager,
        this.runtimeBroadcaster,
        this.effectRegistry,
        this.definition.variables ?? [],
        this.runtimeCallbacks,
      )
    }
    return state
  }

  execute(
    parameters: CueData,
    sequencer: ILightingController,
    lightManager: DmxLightManager,
  ): void | Promise<void> {
    const state = this.getOrCreateState(sequencer, lightManager)
    state.engine!.startCueRun(parameters, {
      hasCueStartedFired: state.session.hasCueStartedFired(),
    })
  }

  onStop(): void {
    for (const state of this.states.values()) {
      state.engine?.cancelAll(this.skipEffectRemovalOnStop)
      state.engine = null
      state.session.resetForStop()
    }
  }

  /**
   * Drops the per-sequencer state entry so a disposed chain's sequencer reference can be
   * garbage collected. Without this hook the cue instance (a registry singleton) would
   * accumulate one stale entry per `restartControllers` cycle.
   */
  releaseSequencer(sequencer: ILightingController): void {
    const state = this.states.get(sequencer)
    if (!state) return
    state.engine?.cancelAll(this.skipEffectRemovalOnStop)
    this.states.delete(sequencer)
    this.onSequencerReleased(sequencer)
  }

  onPause(): void {
    // Optional INetCue lifecycle; no-op for node cues
  }
}
