import { INetCue, CueStyle } from '../../interfaces/INetCue'
import { CueData } from '../../types/cueTypes'
import { ILightingController } from '../../../controllers/sequencer/interfaces'
import { DmxLightManager } from '../../../controllers/DmxLightManager'
import { CompiledMotionCue } from '../compiler/NodeCueCompiler'
import { EffectRegistry } from './EffectRegistry'
import type { NodeRuntimeCallbacks } from './executionTypes'
import { CueSession } from './CueSession'
import { GraphExecutionEngine } from './GraphExecutionEngine'
import { motionCueGraphPolicy } from './GraphExecutionPolicy'
import type { MotionNodeCueDefinition } from '../../types/nodeCueTypes'

/**
 * Motion node cue: YARG event graph with set-position actions; runs parallel to lighting cues.
 */
export class MotionNodeCue implements INetCue {
  private readonly groupId: string
  private readonly compiledCue: CompiledMotionCue
  private readonly effectRegistry: EffectRegistry
  private readonly session: CueSession
  private readonly runtimeCallbacks?: NodeRuntimeCallbacks
  private engine: GraphExecutionEngine | null = null

  constructor(
    groupId: string,
    compiledCue: CompiledMotionCue,
    effectRegistry?: EffectRegistry,
    runtimeCallbacks?: NodeRuntimeCallbacks,
  ) {
    this.groupId = groupId
    this.compiledCue = compiledCue
    this.effectRegistry = effectRegistry ?? new EffectRegistry()
    this.session = new CueSession()
    this.runtimeCallbacks = runtimeCallbacks
    const definition = compiledCue.definition as MotionNodeCueDefinition
    this.session.initializeVariables(definition.variables ?? [], compiledCue.groupVariables ?? [])
  }

  get cueId(): string {
    return (this.compiledCue.definition as MotionNodeCueDefinition).id
  }

  get name(): string {
    return (this.compiledCue.definition as MotionNodeCueDefinition).name
  }

  get id(): string {
    return `${this.groupId}:${(this.compiledCue.definition as MotionNodeCueDefinition).id}`
  }

  get description(): string | undefined {
    return (this.compiledCue.definition as MotionNodeCueDefinition).description
  }

  get style(): CueStyle {
    return CueStyle.Primary
  }

  execute(
    parameters: CueData,
    sequencer: ILightingController,
    lightManager: DmxLightManager,
  ): void | Promise<void> {
    if (!this.engine) {
      const definition = this.compiledCue.definition as MotionNodeCueDefinition
      const cueId = this.id
      const policy = motionCueGraphPolicy(this.groupId, cueId)
      this.engine = GraphExecutionEngine.forCue(
        this.compiledCue,
        cueId,
        policy,
        this.session,
        sequencer,
        lightManager,
        this.effectRegistry,
        definition.variables ?? [],
        this.runtimeCallbacks,
      )
    }
    this.engine.startCueRun(parameters, {
      hasCueStartedFired: this.session.hasCueStartedFired(),
    })
  }

  onStop(): void {
    this.engine?.cancelAll(false)
    this.engine = null
    this.session.resetForStop()
  }

  onPause(): void {
    // Optional INetCue lifecycle
  }

  onDestroy(): void {
    // Optional INetCue lifecycle
  }
}
