import { INetCue, CueStyle } from '../../interfaces/INetCue'
import { CueData } from '../../types/cueTypes'
import { ILightingController } from '../../../controllers/sequencer/interfaces'
import { DmxLightManager } from '../../../controllers/DmxLightManager'
import { CompiledYargCue } from '../compiler/NodeCueCompiler'
import { EffectRegistry } from './EffectRegistry'
import type { NodeRuntimeCallbacks } from './executionTypes'
import { CueSession } from './CueSession'
import { GraphExecutionEngine } from './GraphExecutionEngine'
import { cueGraphPolicy } from './GraphExecutionPolicy'
import type { YargLightingNodeCueDefinition } from '../../types/nodeCueTypes'
import type { RuntimeBroadcaster } from '../../../runtime/broadcaster'
import { noopRuntimeBroadcaster } from '../../../runtime/broadcaster'

/**
 * YARG node cue: uses CueSession and GraphExecutionEngine.
 * Optional host callbacks can be injected for debug/error emission; when provided,
 * the engine uses them in preference to main-process emission.
 *
 * When multiple rigs run the same cue in parallel, each rig's call to {@link execute}
 * carries its own sequencer reference; engine + session are keyed by that reference so
 * every rig gets its own runtime state without sharing it across rigs.
 */
interface YargCueRunState {
  /** Lazily (re)created after construction or onStop; cancelled and nulled on stop so the next
   *  execute starts with a fresh engine but the session's accumulated state survives. */
  engine: GraphExecutionEngine | null
  session: CueSession
}

export class YargNodeCue implements INetCue {
  private readonly groupId: string
  private readonly compiledCue: CompiledYargCue
  private readonly effectRegistry: EffectRegistry
  private readonly runtimeCallbacks?: NodeRuntimeCallbacks
  private readonly runtimeBroadcaster: RuntimeBroadcaster
  private readonly states = new Map<ILightingController, YargCueRunState>()

  constructor(
    groupId: string,
    compiledCue: CompiledYargCue,
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

  private getOrCreateState(
    sequencer: ILightingController,
    lightManager: DmxLightManager,
  ): YargCueRunState {
    let state = this.states.get(sequencer)
    if (!state) {
      const definition = this.compiledCue.definition as YargLightingNodeCueDefinition
      const session = new CueSession()
      session.initializeVariables(definition.variables ?? [], this.compiledCue.groupVariables ?? [])
      state = { engine: null, session }
      this.states.set(sequencer, state)
    }
    if (!state.engine) {
      const definition = this.compiledCue.definition as YargLightingNodeCueDefinition
      const cueId = this.id
      const policy = cueGraphPolicy(this.groupId, cueId)
      state.engine = GraphExecutionEngine.forCue(
        this.compiledCue,
        cueId,
        policy,
        state.session,
        sequencer,
        lightManager,
        this.runtimeBroadcaster,
        this.effectRegistry,
        definition.variables ?? [],
        this.runtimeCallbacks,
      )
    }
    return state
  }

  get cueId(): string {
    return (this.compiledCue.definition as YargLightingNodeCueDefinition).cueType
  }

  get id(): string {
    return `${this.groupId}:${(this.compiledCue.definition as YargLightingNodeCueDefinition).id}`
  }

  get description(): string | undefined {
    return (this.compiledCue.definition as YargLightingNodeCueDefinition).description
  }

  get style(): CueStyle {
    const s = (this.compiledCue.definition as YargLightingNodeCueDefinition).style
    return s === 'secondary' ? CueStyle.Secondary : CueStyle.Primary
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
    const skipEffectRemoval = this.style === CueStyle.Primary
    for (const state of this.states.values()) {
      state.engine?.cancelAll(skipEffectRemoval)
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
    state.engine?.cancelAll(this.style === CueStyle.Primary)
    this.states.delete(sequencer)
  }

  onPause(): void {
    // Optional INetCue lifecycle; no-op for node cues
  }
}
