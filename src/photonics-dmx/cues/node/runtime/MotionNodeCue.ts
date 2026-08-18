import { CueStyle } from '../../interfaces/INetCue'
import type { ILightingController } from '../../../controllers/sequencer/interfaces'
import type { VariableValue } from './executionTypes'
import type { GraphExecutionPolicy } from './GraphExecutionPolicy'
import { motionCueGraphPolicy } from './GraphExecutionPolicy'
import type { NetMotionNodeCueDefinition } from '../../types/nodeCueTypes'
import { BaseNodeCue } from './BaseNodeCue'

/**
 * A motion node cue: pan/tilt and motion-pattern actions running parallel to the lighting look.
 *
 * Uses `motionCueGraphPolicy`, which takes the same entry events as a lighting cue but performs no
 * initial setEffect clear. Re-submitted motion-pattern actions with the same resolved config are
 * skipped, so `cue-called` does not restart the waveform each tick.
 */
export class MotionNodeCue extends BaseNodeCue {
  protected policyFor(cueId: string): GraphExecutionPolicy {
    return motionCueGraphPolicy(this.groupId, cueId)
  }

  /** Motion state is private to the cue, so its session starts from an empty store. */
  protected sessionStoreFor(
    _sequencer: ILightingController,
  ): Map<string, VariableValue> | undefined {
    return undefined
  }

  /** Motion always clears its own effects, so a stop removes them whatever the style says. */
  protected get skipEffectRemovalOnStop(): boolean {
    return false
  }

  get cueId(): string {
    return (this.definition as NetMotionNodeCueDefinition).id
  }

  get name(): string {
    return (this.definition as NetMotionNodeCueDefinition).name
  }

  get style(): CueStyle {
    return CueStyle.Primary
  }
}
