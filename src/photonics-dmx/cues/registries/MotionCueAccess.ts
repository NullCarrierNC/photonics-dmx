import type { MotionCueRef } from '../types/cueTypes'
import type { MotionGroupSelectionMode } from '../types/nodeCueTypes'
import { MotionSelectionState } from './MotionSelectionState'
import type { CatalogGroup, CueGroupCatalog } from './CueGroupCatalog'
import {
  findMotionCueRefIn,
  motionCueDetailsFor,
  motionGroupsInfoFor,
  resolveMotionCue,
  type MotionCueDetail,
  type MotionGroupInfo,
} from './cueRegistrySupport'

/** A group the motion surface can serve: a catalog group with a display name for the pickers. */
export interface MotionCapableGroup<K extends string, V> extends CatalogGroup<K, V> {
  name: string
  description?: string
  motionCues?: Map<string, V>
}

/**
 * The motion-cue surface behind a cue registry: motion group enablement, selection mode, per-song
 * state, and motion program resolution. Group storage is answered by the injected catalog and the
 * per-motion selection state lives in MotionSelectionState.
 *
 * Generic over the cue family, so the net registries and the audio registry serve motion the same
 * way. Each supplies only how its cues read in the motion-cue picker.
 */
export class MotionCueAccess<K extends string, V, G extends MotionCapableGroup<K, V>> {
  private readonly motionState = new MotionSelectionState<V>()

  constructor(
    private readonly catalog: CueGroupCatalog<K, V, G>,
    private readonly describe: (cue: V) => MotionCueDetail,
  ) {}

  public reset(): void {
    this.motionState.reset()
  }

  /** Track a newly registered group's motion programs. */
  public onRegisterGroup(group: G): void {
    this.motionState.onRegisterGroup(group.id, group.motionCues?.size ?? 0)
  }

  /** Drop motion tracking for an unregistered group. */
  public onUnregisterGroup(groupId: string): void {
    this.motionState.onUnregisterGroup(groupId)
  }

  public setMotionSelectionMode(mode: MotionGroupSelectionMode): void {
    this.motionState.setMotionSelectionMode(mode)
  }

  public getMotionSelectionMode(): MotionGroupSelectionMode {
    return this.motionState.getMotionSelectionMode()
  }

  public onMotionSongStart(): void {
    this.motionState.onMotionSongStart()
  }

  public onMotionSongEnd(): void {
    this.motionState.onMotionSongEnd()
  }

  public getRandomMotionCue(): V | null {
    return this.motionState.getRandomMotionCue(
      (id) => this.catalog.getGroup(id),
      this.catalog.getDefaultMotionGroupId(),
    )
  }

  /**
   * Resolve a specific motion program when manual selection is active.
   * Returns null if the group is not motion-enabled, the cue is disabled, or the id is unknown.
   */
  public getMotionCueImplementation(ref: MotionCueRef): V | null {
    return resolveMotionCue(
      this.catalog.getGroup(ref.groupId),
      ref,
      (groupId) => this.motionState.getEnabledMotionGroups().includes(groupId),
      (groupId, cueId) => this.isMotionCueDisabled(groupId, cueId),
    )
  }

  /** Locate group/cue ids for a motion cue instance (for UI / IPC metadata). */
  public findMotionCueRef(cue: V): MotionCueRef | null {
    return findMotionCueRefIn(this.catalog.groupsIterable(), cue)
  }

  public getMotionGroupsInfo(): MotionGroupInfo[] {
    return motionGroupsInfoFor(this.catalog.groupsIterable())
  }

  public getMotionCueDetails(groupId: string): MotionCueDetail[] {
    return motionCueDetailsFor(this.catalog.getGroup(groupId)?.motionCues, this.describe)
  }

  public setDisabledMotionCues(map: Record<string, string[]>): void {
    this.motionState.setDisabledMotionCues(map)
  }

  public isMotionCueDisabled(groupId: string, cueId: string): boolean {
    return this.motionState.isMotionCueDisabled(groupId, cueId)
  }

  public setEnabledMotionGroups(groupIds: string[]): void {
    this.motionState.setEnabledMotionGroups(groupIds, (id) => this.groupHasMotionCues(id))
  }

  public getEnabledMotionGroups(): string[] {
    return this.motionState.getEnabledMotionGroups()
  }

  /** Group ids that have at least one motion program registered. */
  public getRegisteredMotionGroupIds(): string[] {
    return this.motionState.getRegisteredMotionGroupIds(this.catalog.groupsIterable())
  }

  public enableMotionGroup(groupId: string): void {
    this.motionState.enableMotionGroup(groupId, (id) => this.groupHasMotionCues(id))
  }

  private groupHasMotionCues(groupId: string): boolean {
    return (this.catalog.getGroup(groupId)?.motionCues?.size ?? 0) > 0
  }
}
