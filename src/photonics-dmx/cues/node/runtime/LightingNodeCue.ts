import { CueStyle } from '../../interfaces/INetCue'
import { ILightingController } from '../../../controllers/sequencer/interfaces'
import type { VariableValue } from './executionTypes'
import type { GraphExecutionPolicy } from './GraphExecutionPolicy'
import { cueGraphPolicy } from './GraphExecutionPolicy'
import type { NetLightingNodeCueDefinition } from '../../types/nodeCueTypes'
import { BaseNodeCue } from './BaseNodeCue'

/**
 * A lighting node cue: the colour and intensity look for one CueType.
 *
 * Cues in the same group share a variable store per sequencer, so one cue can hand state to another
 * (Stomp recording its on/off state for Silhouettes_Spotlight, for instance).
 */
export class LightingNodeCue extends BaseNodeCue {
  /**
   * Group-level variable stores shared across every cue in a group, per sequencer:
   * sequencer -> groupId -> store. Keyed per sequencer so rigs running the same group in parallel
   * keep isolated state.
   */
  private static groupLevelVarStores = new Map<
    ILightingController,
    Map<string, Map<string, VariableValue>>
  >()

  private static getSharedGroupStore(
    sequencer: ILightingController,
    groupId: string,
  ): Map<string, VariableValue> {
    let perSeq = LightingNodeCue.groupLevelVarStores.get(sequencer)
    if (!perSeq) {
      perSeq = new Map()
      LightingNodeCue.groupLevelVarStores.set(sequencer, perSeq)
    }
    let store = perSeq.get(groupId)
    if (!store) {
      store = new Map()
      perSeq.set(groupId, store)
    }
    return store
  }

  protected policyFor(cueId: string): GraphExecutionPolicy {
    return cueGraphPolicy(this.groupId, cueId)
  }

  protected sessionStoreFor(sequencer: ILightingController): Map<string, VariableValue> {
    return LightingNodeCue.getSharedGroupStore(sequencer, this.groupId)
  }

  /** A primary look owns the output, so its effects stay up until the next cue replaces them. */
  protected get skipEffectRemovalOnStop(): boolean {
    return this.style === CueStyle.Primary
  }

  protected override onSequencerReleased(sequencer: ILightingController): void {
    // The disposed sequencer's shared group stores can be dropped wholesale: other cues that
    // shared them are releasing the same sequencer in the same teardown. Idempotent, so a later
    // release for the same sequencer finds no entry and no-ops.
    LightingNodeCue.groupLevelVarStores.delete(sequencer)
  }

  get cueId(): string {
    return (this.definition as NetLightingNodeCueDefinition).cueType
  }

  get style(): CueStyle {
    const s = (this.definition as NetLightingNodeCueDefinition).style
    return s === 'secondary' ? CueStyle.Secondary : CueStyle.Primary
  }
}
