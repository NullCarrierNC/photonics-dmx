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

/**
 * YARG motion node cue: event graph with position / motion-pattern actions; runs parallel to lighting cues.
 * Uses `motionCueGraphPolicy`: same entry events as lighting cues (`cue-started`, `cue-called`, beat, etc.)
 * but no initial setEffect clear. Re-submitted `motion-pattern` actions with the same resolved config
 * are skipped so `cue-called` does not restart the waveform each tick.
 */
export class YargMotionNodeCue implements INetCue {
  private readonly groupId: string
  private readonly compiledCue: CompiledYargCue
  private readonly effectRegistry: EffectRegistry
  private readonly session: CueSession
  private readonly runtimeCallbacks?: NodeRuntimeCallbacks
  private engine: GraphExecutionEngine | null = null

  constructor(
    groupId: string,
    compiledCue: CompiledYargCue,
    effectRegistry?: EffectRegistry,
    runtimeCallbacks?: NodeRuntimeCallbacks,
  ) {
    this.groupId = groupId
    this.compiledCue = compiledCue
    this.effectRegistry = effectRegistry ?? new EffectRegistry()
    this.session = new CueSession()
    this.runtimeCallbacks = runtimeCallbacks
    const definition = compiledCue.definition as YargMotionNodeCueDefinition
    this.session.initializeVariables(definition.variables ?? [], compiledCue.groupVariables ?? [])
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
    if (!this.engine) {
      const definition = this.compiledCue.definition as YargMotionNodeCueDefinition
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
}
