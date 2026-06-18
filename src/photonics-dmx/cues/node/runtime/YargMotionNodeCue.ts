import { INetCue, CueStyle } from '../../interfaces/INetCue'
import { CueData } from '../../types/cueTypes'
import { ILightingController } from '../../../controllers/sequencer/interfaces'
import { DmxLightManager } from '../../../controllers/DmxLightManager'
import { CompiledYargCue } from '../compiler/NodeCueCompiler'
import { EffectRegistry } from './EffectRegistry'
import type { NodeRuntimeCallbacks } from './executionTypes'
import { CueSession } from './CueSession'
import { GraphExecutionEngine } from './GraphExecutionEngine'
import { motionCueGraphPolicy } from './GraphExecutionPolicy'
import type { YargMotionNodeCueDefinition } from '../../types/nodeCueTypes'
import type { RuntimeBroadcaster } from '../../../runtime/broadcaster'
import { noopRuntimeBroadcaster } from '../../../runtime/broadcaster'

/**
 * YARG motion node cue: event graph with position / motion-pattern actions; runs parallel to lighting cues.
 * Uses `motionCueGraphPolicy`: same entry events as lighting cues (`cue-started`, `cue-called`, beat, etc.)
 * but no initial setEffect clear. Re-submitted `motion-pattern` actions with the same resolved config
 * are skipped so `cue-called` does not restart the waveform each tick.
 */
interface YargMotionRunState {
  /** Lazily (re)created on execute; cancelled and nulled in onStop so the next execute
   *  starts a fresh engine but the session's accumulated state survives. */
  engine: GraphExecutionEngine | null
  session: CueSession
}

export class YargMotionNodeCue implements INetCue {
  private readonly groupId: string
  private readonly compiledCue: CompiledYargCue
  private readonly effectRegistry: EffectRegistry
  private readonly runtimeCallbacks?: NodeRuntimeCallbacks
  private readonly runtimeBroadcaster: RuntimeBroadcaster
  private readonly states = new Map<ILightingController, YargMotionRunState>()

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
  ): YargMotionRunState {
    let state = this.states.get(sequencer)
    if (!state) {
      const definition = this.compiledCue.definition as YargMotionNodeCueDefinition
      const session = new CueSession()
      session.initializeVariables(definition.variables ?? [], this.compiledCue.groupVariables ?? [])
      state = { engine: null, session }
      this.states.set(sequencer, state)
    }
    if (!state.engine) {
      const definition = this.compiledCue.definition as YargMotionNodeCueDefinition
      const cueId = this.id
      const policy = motionCueGraphPolicy(this.groupId, cueId)
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
    return (this.compiledCue.definition as YargMotionNodeCueDefinition).id
  }

  get name(): string {
    return (this.compiledCue.definition as YargMotionNodeCueDefinition).name
  }

  get id(): string {
    return `${this.groupId}:${(this.compiledCue.definition as YargMotionNodeCueDefinition).id}`
  }

  get description(): string | undefined {
    return (this.compiledCue.definition as YargMotionNodeCueDefinition).description
  }

  get style(): CueStyle {
    return CueStyle.Primary
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
      state.engine?.cancelAll(false)
      state.engine = null
      state.session.resetForStop()
    }
  }

  /**
   * Drops the per-sequencer state entry so a disposed chain's sequencer can be garbage
   * collected. See {@link YargNodeCue.releaseSequencer} for the rationale.
   */
  releaseSequencer(sequencer: ILightingController): void {
    const state = this.states.get(sequencer)
    if (!state) return
    state.engine?.cancelAll(false)
    this.states.delete(sequencer)
  }

  onPause(): void {
    // Optional INetCue lifecycle
  }
}
