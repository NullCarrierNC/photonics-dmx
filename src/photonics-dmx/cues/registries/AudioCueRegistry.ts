import { AudioCueType, AudioMotionCueRef } from '../types/audioCueTypes'
import type { MotionGroupSelectionMode } from '../types/nodeCueTypes'
import { IAudioCue } from '../interfaces/IAudioCue'
import { MotionSelectionState } from './MotionSelectionState'
import { CueGroupCatalog } from './CueGroupCatalog'
import {
  findMotionCueRefIn,
  motionCueDetailsFor,
  motionGroupsInfoFor,
  releaseSequencersFor,
  resolveMotionCue,
  type MotionCueDetail,
  type MotionGroupInfo,
} from './cueRegistrySupport'
import { createLogger } from '../../../shared/logger'
const log = createLogger('AudioCueRegistry')

/**
 * Interface for an audio cue group
 */
export interface AudioCueGroup {
  id: string
  name: string
  description: string
  cues: Map<AudioCueType, IAudioCue>
  /** Audio motion programs, keyed by cue definition id (parallel to lighting). */
  motionCues?: Map<string, IAudioCue>
}

/**
 * Registry for managing audio-reactive lighting cue implementations.
 *
 * The groups, the enabled set, the fallback groups and the disabled cue sets live in a
 * CueGroupCatalog, the same container the net registries hold, so the two answer questions like
 * "which groups are enabled" and "which group falls back" the same way. What stays here is what
 * audio does differently: a first-match selection over the enabled groups in place of the net
 * selection policy, and the cue-details cache the renderer reads.
 */
export class AudioCueRegistry {
  /** The singleton instance of the AudioCueRegistry */
  private static instance: AudioCueRegistry

  /** The registered groups, which of them are enabled, the default, and the disabled cue sets. */
  private readonly catalog = new CueGroupCatalog<AudioCueType, IAudioCue, AudioCueGroup>()

  private readonly motionState = new MotionSelectionState<IAudioCue>()

  /** Cache of cue metadata for renderer requests */
  private cueDetailsCache: Map<string, Array<{ id: string; description: string }>> = new Map()

  private constructor() {}

  /**
   * Get the singleton instance of the AudioCueRegistry
   * @returns The AudioCueRegistry instance
   */
  public static getInstance(): AudioCueRegistry {
    if (!AudioCueRegistry.instance) {
      AudioCueRegistry.instance = new AudioCueRegistry()
    }
    return AudioCueRegistry.instance
  }

  /**
   * Register a new group of audio cue implementations.
   * @param group The group to register
   */
  public registerGroup(group: AudioCueGroup): void {
    this.catalog.register(group)
    this.cueDetailsCache.delete(group.id)
    this.motionState.onRegisterGroup(group.id, group.motionCues?.size ?? 0)
  }

  /**
   * Unregister a cue group.
   * @param groupId The group identifier
   */
  public unregisterGroup(groupId: string): boolean {
    if (!this.catalog.unregister(groupId)) {
      return false
    }

    this.cueDetailsCache.delete(groupId)
    this.motionState.onUnregisterGroup(groupId)
    return true
  }

  /**
   * Flag the group serving fallback lighting cues. Leaves the enabled groups alone, since a
   * fallback serves whether or not its group is enabled.
   * @param groupId The ID of the group to set as default
   * @throws Error if the group doesn't exist
   */
  public setDefaultGroup(groupId: string): void {
    this.catalog.setDefaultGroup(groupId)
  }

  /**
   * Apply a cue file's group designations to a registered group. See
   * CueGroupCatalog.designateDefaults for how a default claim is routed.
   */
  public applyGroupDesignations(
    meta: { isDefault?: boolean; isStageKit?: boolean },
    group: AudioCueGroup,
  ): void {
    this.catalog.designateDefaults(meta, group.id)
  }

  /**
   * Get a cue implementation from enabled groups.
   * Falls back to the default group if none of the enabled groups contain the cue.
   */
  public getCueImplementation(cueType: AudioCueType): IAudioCue | null {
    for (const groupId of this.catalog.getEnabledGroups()) {
      const cue = this.catalog.cueFrom(groupId, cueType)
      if (cue) {
        return cue
      }
    }

    const fallbackId = this.catalog.getDefaultGroupId()
    return fallbackId ? this.catalog.cueFrom(fallbackId, cueType) : null
  }

  /**
   * Get all cue types available within enabled groups (or across all groups if includeAll=true)
   */
  public getAvailableCueTypes(includeAll = false): AudioCueType[] {
    const cueTypes = new Set<AudioCueType>()
    const groupIds = includeAll ? this.catalog.getAllGroups() : this.getEnabledGroups()

    for (const groupId of groupIds) {
      this.collectCueTypes(groupId, cueTypes)
    }

    // Fallback to default group if none collected
    const defaultId = this.catalog.getDefaultGroupId()
    if (cueTypes.size === 0 && defaultId) {
      this.collectCueTypes(defaultId, cueTypes)
    }

    return Array.from(cueTypes)
  }

  /**
   * Get a cue implementation from a specific group, falling back to the default group when that
   * group cannot serve the cue.
   */
  public getCueImplementationFromGroup(cueType: AudioCueType, groupId: string): IAudioCue | null {
    const cue = this.catalog.cueFrom(groupId, cueType)
    if (cue) {
      return cue
    }
    const fallbackId = this.catalog.getDefaultGroupId()
    return fallbackId ? this.catalog.cueFrom(fallbackId, cueType) : null
  }

  /** Add every cue type the group carries and has not disabled. */
  private collectCueTypes(groupId: string, into: Set<AudioCueType>): void {
    const group = this.catalog.getGroup(groupId)
    group?.cues.forEach((_cue, cueType) => {
      if (!this.catalog.isCueDisabled(groupId, cueType)) {
        into.add(cueType)
      }
    })
  }

  /**
   * Get all registered group IDs.
   */
  public getRegisteredGroups(): string[] {
    return this.catalog.getAllGroups()
  }

  /**
   * Get a specific group definition.
   */
  public getGroup(groupId: string): AudioCueGroup | undefined {
    return this.catalog.getGroup(groupId)
  }

  /**
   * Notifies every registered audio cue (lighting and motion) that the given sequencer is
   * going away so the cue impl can drop its per-sequencer runtime state. Called by
   * `RigChain.dispose` to keep cue instances from accumulating stale entries across
   * `restartControllers` cycles.
   */
  public releaseSequencerFromAllCues(
    sequencer: import('../../controllers/sequencer/interfaces').ILightingController,
  ): void {
    releaseSequencersFor(this.catalog.groupsIterable(), sequencer)
  }

  /**
   * Get full group definitions.
   */
  public getGroups(): AudioCueGroup[] {
    return Array.from(this.catalog.groupsIterable())
  }

  /**
   * Get summaries for all groups (used by renderer)
   */
  public getGroupSummaries(): Array<{ id: string; name: string; description: string }> {
    return Array.from(this.catalog.groupsIterable())
      .filter((group) => group.cues.size > 0)
      .map((group) => ({
        id: group.id,
        name: group.name,
        description: group.description,
      }))
  }

  /**
   * Get enabled group IDs. Defaults to the default group if nothing has been set yet.
   */
  public getEnabledGroups(): string[] {
    return this.catalog.getEnabledGroups()
  }

  /**
   * Enable a specific group.
   */
  public enableGroup(groupId: string): boolean {
    return this.catalog.enableGroup(groupId)
  }

  /**
   * Disable a specific group.
   */
  public disableGroup(groupId: string): boolean {
    return this.catalog.disableGroup(groupId)
  }

  /**
   * Replace the enabled group set with the provided list.
   */
  public setEnabledGroups(groupIds: string[]): void {
    this.catalog.setEnabledGroups(groupIds)
  }

  /**
   * Replace per-group disabled cue sets from preferences.
   */
  public setDisabledCues(disabled: Record<string, string[]>): void {
    this.catalog.setDisabledCues(disabled)
    // Audio-specific: the cue-details cache is keyed by group and does not track disabled state, so
    // clear it here to stay consistent. This is the one line that differs from the net registry.
    this.cueDetailsCache.clear()
  }

  /**
   * Whether this cue type is disabled for the given group in preferences.
   */
  public isCueDisabled(groupId: string, cueType: AudioCueType): boolean {
    return this.catalog.isCueDisabled(groupId, cueType)
  }

  /**
   * Get cue metadata for a group (id + description).
   */
  public getCueDetails(groupId: string): Array<{ id: string; description: string }> {
    if (this.cueDetailsCache.has(groupId)) {
      return this.cueDetailsCache.get(groupId)!
    }

    const group = this.catalog.getGroup(groupId)
    if (!group) {
      return []
    }

    const cues = Array.from(group.cues.values()).map((cue) => ({
      id: String(cue.cueType),
      description: cue.description ?? '',
    }))

    this.cueDetailsCache.set(groupId, cues)
    return cues
  }

  /**
   * Get the default group ID.
   */
  public getDefaultGroupId(): string | null {
    return this.catalog.getDefaultGroupId()
  }

  /** Get the group serving fallback motion programs. */
  public getDefaultMotionGroupId(): string | null {
    return this.catalog.getDefaultMotionGroupId()
  }

  /**
   * Reset the registry to its initial state.
   */
  public reset(): void {
    this.catalog.clear()
    this.motionState.reset()
    this.cueDetailsCache.clear()
    log.info('AudioCueRegistry reset to initial state')
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

  public getRandomMotionCue(): IAudioCue | null {
    return this.motionState.getRandomMotionCue(
      (id) => this.catalog.getGroup(id),
      this.catalog.getDefaultMotionGroupId(),
    )
  }

  /**
   * Resolve a specific motion program when manual selection is active.
   * Returns null if the group is not motion-enabled, the cue is disabled, or the id is unknown.
   */
  public getMotionCueImplementation(ref: AudioMotionCueRef): IAudioCue | null {
    return resolveMotionCue(
      this.catalog.getGroup(ref.groupId),
      ref,
      (groupId) => this.motionState.getEnabledMotionGroups().includes(groupId),
      (groupId, cueId) => this.isMotionCueDisabled(groupId, cueId),
    )
  }

  /** Locate group/cue ids for a motion cue instance (for UI / IPC metadata). */
  public findMotionCueRef(cue: IAudioCue): AudioMotionCueRef | null {
    return findMotionCueRefIn(this.catalog.groupsIterable(), cue)
  }

  public getMotionGroupsInfo(): MotionGroupInfo[] {
    return motionGroupsInfoFor(this.catalog.groupsIterable())
  }

  public getMotionCueDetails(groupId: string): MotionCueDetail[] {
    return motionCueDetailsFor(this.catalog.getGroup(groupId)?.motionCues, (cue) => ({
      id: String(cue.cueType),
      name: cue.name,
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
    this.motionState.setEnabledMotionGroups(groupIds, (id) => this.hasMotionCues(id))
  }

  /** Whether the group is registered and carries at least one motion program. */
  private hasMotionCues(groupId: string): boolean {
    return (this.catalog.getGroup(groupId)?.motionCues?.size ?? 0) > 0
  }

  public getEnabledMotionGroups(): string[] {
    return this.motionState.getEnabledMotionGroups()
  }

  public getRegisteredMotionGroupIds(): string[] {
    return this.motionState.getRegisteredMotionGroupIds(this.catalog.groupsIterable())
  }

  public enableMotionGroup(groupId: string): void {
    this.motionState.enableMotionGroup(groupId, (id) => this.hasMotionCues(id))
  }
}
