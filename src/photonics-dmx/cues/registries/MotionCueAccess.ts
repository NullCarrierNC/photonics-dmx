import { type MotionCueRef } from '../types/cueTypes'
import type { MotionGroupSelectionMode } from '../types/nodeCueTypes'
import { ICueGroup } from '../interfaces/INetCueGroup'
import { INetCue } from '../interfaces/INetCue'
import { MotionNodeCue } from '../node/runtime/MotionNodeCue'
import { MotionSelectionState } from './MotionSelectionState'
import { CueGroupCatalog } from './CueGroupCatalog'
import {
  findMotionCueRefIn,
  motionCueDetailsFor,
  motionGroupsInfoFor,
  resolveMotionCue,
  type MotionCueDetail,
  type MotionGroupInfo,
} from './cueRegistrySupport'

/**
 * The motion-cue surface behind CueRegistry: motion group enablement, selection mode, per-song
 * state, and motion program resolution. Group storage is answered by the injected catalog; the
 * per-motion selection state lives in MotionSelectionState.
 */
export class MotionCueAccess {
  private readonly motionState = new MotionSelectionState<INetCue>()

  constructor(private readonly catalog: CueGroupCatalog) {}

  public reset(): void {
    this.motionState.reset()
  }

  /** Track a newly registered group's motion programs. */
  public onRegisterGroup(group: ICueGroup): void {
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

  public getRandomMotionCue(): INetCue | null {
    return this.motionState.getRandomMotionCue(
      (id) => this.catalog.getGroup(id),
      this.catalog.getDefaultGroupId(),
    )
  }

  /**
   * Resolve a specific motion program when manual selection is active.
   * Returns null if the group is not motion-enabled, the cue is disabled, or the id is unknown.
   */
  public getMotionCueImplementation(ref: MotionCueRef): INetCue | null {
    return resolveMotionCue(
      this.catalog.getGroup(ref.groupId),
      ref,
      (groupId) => this.motionState.getEnabledMotionGroups().includes(groupId),
      (groupId, cueId) => this.isMotionCueDisabled(groupId, cueId),
    )
  }

  /** Locate group/cue ids for a motion cue instance (for UI / IPC metadata). */
  public findMotionCueRef(cue: INetCue): MotionCueRef | null {
    return findMotionCueRefIn(this.catalog.groupsIterable(), cue)
  }

  public getMotionGroupsInfo(): MotionGroupInfo[] {
    return motionGroupsInfoFor(this.catalog.groupsIterable())
  }

  public getMotionCueDetails(groupId: string): MotionCueDetail[] {
    return motionCueDetailsFor(this.catalog.getGroup(groupId)?.motionCues, (cue) => ({
      id: cue.cueId,
      name: cue instanceof MotionNodeCue ? cue.name : cue.cueId,
      description: cue.description ?? '',
    }))
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

  /** Group ids that have at least one YARG motion program registered. */
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
