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
import type { YargNodeCueDefinition } from '../../types/nodeCueTypes'

/**
 * YARG node cue: uses CueSession and GraphExecutionEngine.
 * Optional host callbacks can be injected for debug/error emission; when provided,
 * the engine uses them in preference to main-process emission.
 */
export class YargNodeCue implements INetCue {
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
    const definition = compiledCue.definition as YargNodeCueDefinition
    this.session.initializeVariables(definition.variables ?? [], compiledCue.groupVariables ?? [])
  }

  get cueId(): string {
    return (this.compiledCue.definition as YargNodeCueDefinition).cueType
  }

  get id(): string {
    return `${this.groupId}:${(this.compiledCue.definition as YargNodeCueDefinition).id}`
  }

  get description(): string | undefined {
    return (this.compiledCue.definition as YargNodeCueDefinition).description
  }

  get style(): CueStyle {
    const s = (this.compiledCue.definition as YargNodeCueDefinition).style
    return s === 'secondary' ? CueStyle.Secondary : CueStyle.Primary
  }

  execute(
    parameters: CueData,
    sequencer: ILightingController,
    lightManager: DmxLightManager,
  ): void | Promise<void> {
    if (!this.engine) {
      const definition = this.compiledCue.definition as YargNodeCueDefinition
      const cueId = this.id
      const policy = cueGraphPolicy(this.groupId, cueId)
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
    const skipEffectRemoval = this.style === CueStyle.Primary
    this.engine?.cancelAll(skipEffectRemoval)
    this.engine = null
    this.session.resetForStop()
  }

  onPause(): void {
    // Optional INetCue lifecycle; no-op for node cues
  }

  onDestroy(): void {
    // Optional INetCue lifecycle; no-op for node cues
  }
}
