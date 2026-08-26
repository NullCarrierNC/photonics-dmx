import { CueType, type MotionCueRef } from '../types/cueTypes'
import type { MotionGroupSelectionMode } from '../types/nodeCueTypes'
import { ICueGroup } from '../interfaces/INetCueGroup'
import { INetCue } from '../interfaces/INetCue'
import { CueGroupCatalog } from './CueGroupCatalog'
import {
  CueSelectionPolicy,
  type CueStateUpdate,
  type RoleDebugInfo,
  type TrackedCueStatus,
} from './CueSelectionPolicy'
import { MotionCueAccess } from './MotionCueAccess'
import {
  releaseSequencersFor,
  type MotionCueDetail,
  type MotionGroupInfo,
} from './cueRegistrySupport'
import { createLogger } from '../../../shared/logger'

const log = createLogger('CueRegistry')

export type { CueStateUpdate }

/**
 * Registry for managing multiple sets of cue implementations.
 * Additional groups can define unique implementations for cues.
 * If a group doesn't define a specific cue we will fall back to the
 * matching cue in the default group. This saves us from having to
 * define common cues like Strobe repeatedly in each group.
 *
 * Registered Groups: Groups of cues known to the system.
 * Enabled Groups: Groups that are enabled in user preferences (can be activated).
 * Active Groups: Groups that are currently active during gameplay (subset of enabled).
 *
 * The registry is a facade over three collaborators: CueGroupCatalog holds the groups and their
 * enabled/active/disabled preference state, CueSelectionPolicy owns lighting-cue selection (stage
 * kit priority, consistency, once-per-song lock), and MotionCueAccess serves
 * the motion-cue surface. Cross-collaborator side effects (motion bookkeeping on group changes,
 * consistency clearing on catalog changes) are wired here.
 */
export class CueRegistry {
  /** The singleton instance of the CueRegistry */
  private static instance: CueRegistry

  private readonly catalog = new CueGroupCatalog()
  private readonly selection = new CueSelectionPolicy(this.catalog)
  private readonly motion = new MotionCueAccess(this.catalog)

  private constructor() {}

  /**
   * Get the singleton instance of the CueRegistry
   * @returns The CueRegistry instance
   */
  public static getInstance(): CueRegistry {
    if (!CueRegistry.instance) {
      CueRegistry.instance = new CueRegistry()
    }
    return CueRegistry.instance
  }

  /**
   * Create a standalone registry instance separate from the shared singleton. Used by domains
   * that reuse the YARG cue-selection machinery but need their own group/lock/consistency state
   * (e.g. RB3 cue mode), so their selections never cross with the YARG listener's.
   */
  public static create(): CueRegistry {
    return new CueRegistry()
  }

  /**
   * Set callback for sending cue state updates to frontend
   * @param callback Function to call when cue state changes
   */
  public setCueStateUpdateCallback(callback: (state: CueStateUpdate) => void): void {
    this.selection.setStateUpdateCallback(callback)
  }

  /**
   * Reset the registry to its initial state. Registered groups stay known; preferences, selection
   * state and motion state are cleared.
   */
  public reset(): void {
    this.catalog.clearPreferences()
    this.selection.reset()
    this.motion.reset()
    log.info('CueRegistry reset to initial state')
  }

  /**
   * Register a new group of cue implementations.
   * @param group The group to register
   */
  public registerGroup(group: ICueGroup): void {
    this.catalog.register(group)
    this.motion.onRegisterGroup(group)
  }

  /**
   * Unregister an existing group of cues.
   * @param groupId The group identifier to remove
   */
  public unregisterGroup(groupId: string): boolean {
    if (!this.catalog.unregister(groupId)) {
      return false
    }
    this.motion.onUnregisterGroup(groupId)
    this.selection.clearGroupConsistencyTracking(groupId)
    return true
  }

  /**
   * Set the default group.
   * @param groupId The name of the group to set as default
   * @throws Error if the group doesn't exist
   */
  public setDefaultGroup(groupId: string): void {
    this.catalog.setDefaultGroup(groupId)
  }

  /**
   * Get a cue implementation with randomized selection for new cues. See CueSelectionPolicy for
   * the full priority ladder (stage kit priority, once-per-song lock, consistency window, and
   * random with default fallback).
   * @param cueType The type of cue to get
   * @param trackMode The track mode ('tracked', 'autogen', or 'simulated')
   * @returns The cue implementation or null if not found
   */
  public getCueImplementation(
    cueType: CueType,
    trackMode: 'tracked' | 'autogen' | 'simulated' = 'tracked',
  ): INetCue | null {
    return this.selection.selectCue(cueType, trackMode)
  }

  /**
   * Get cue implementation from a specific group (deterministic, for simulation and callers that
   * rotate groups themselves, e.g. RB3 preferredCueGroup). Does not use random selection or mutate
   * activeGroups; the resolution is still recorded so counters, cue-state updates and getCueState
   * stay accurate.
   * @param cueType The cue type to resolve
   * @param groupId The group to use (must exist and contain the cue, or fallback to defaultGroup if it has the cue)
   * @param _trackMode Unused; kept so call sites that pass a mode keep compiling
   * @returns The cue implementation or null if not found in the group or default fallback
   */
  public getCueImplementationFromGroup(
    cueType: CueType,
    groupId: string,
    _trackMode: 'tracked' | 'autogen' | 'simulated' = 'simulated',
  ): INetCue | null {
    return this.selection.selectFromGroup(cueType, groupId)
  }

  /**
   * Set the cue consistency window to prevent rapid randomization changes.
   * @param windowMs The consistency window in milliseconds (default: 2000ms)
   */
  public setCueConsistencyWindow(windowMs: number): void {
    this.selection.setCueConsistencyWindow(windowMs)
  }

  /**
   * Get the current cue consistency window setting.
   * @returns The consistency window in milliseconds
   */
  public getCueConsistencyWindow(): number {
    return this.selection.getCueConsistencyWindow()
  }

  /**
   * Set the cue group selection mode (once per song vs within a song).
   */
  public setCueGroupSelectionMode(mode: 'oncePerSong' | 'withinSong'): void {
    this.selection.setCueGroupSelectionMode(mode)
  }

  public getCueGroupSelectionMode(): 'oncePerSong' | 'withinSong' {
    return this.selection.getCueGroupSelectionMode()
  }

  /**
   * Notify that a song has started (e.g. Menu -> Gameplay). When mode is oncePerSong, locks group selection for the song.
   */
  public onSongStart(): void {
    this.selection.onSongStart()
  }

  /**
   * Notify that the current song has ended (left Gameplay). Clears the once-per-song lock.
   */
  public onSongEnd(): void {
    this.selection.onSongEnd()
  }

  /**
   * Replace per-group disabled cue sets from preferences.
   */
  public setDisabledCues(disabled: Record<string, string[]>): void {
    this.catalog.setDisabledCues(disabled)
  }

  /**
   * Whether this cue type is disabled for the given group in preferences.
   */
  public isCueDisabled(groupId: string, cueType: CueType): boolean {
    return this.catalog.isCueDisabled(groupId, cueType)
  }

  /**
   * Enable a single group by adding it to the enabled groups.
   * If the group was not previously enabled, it will also be activated.
   * @param groupId The ID of the group to enable
   * @returns True if the group was enabled, false otherwise
   */
  public enableGroup(groupId: string): boolean {
    return this.catalog.enableGroup(groupId)
  }

  /**
   * Disable a single group by removing it from the enabled groups.
   * This will also deactivate the group if it was active.
   * @param groupId The ID of the group to disable
   * @returns True if the group was disabled, false otherwise
   */
  public disableGroup(groupId: string): boolean {
    if (!this.catalog.disableGroup(groupId)) {
      return false
    }
    this.selection.clearGroupConsistencyTracking(groupId)
    return true
  }

  /**
   * Activate a single group by adding it to the active groups.
   * Only enabled groups can be activated.
   * @param groupId The ID of the group to activate
   * @returns True if the group was activated, false otherwise
   */
  public activateGroup(groupId: string): boolean {
    return this.catalog.activateGroup(groupId)
  }

  /**
   * Deactivate a single group by removing it from the active groups.
   * @param groupId The ID of the group to deactivate
   * @returns True if the group was deactivated, false otherwise
   */
  public deactivateGroup(groupId: string): boolean {
    return this.catalog.deactivateGroup(groupId)
  }

  /**
   * Set which groups are enabled (preference allowlist).
   * Does not replace the current active groups: only updates the enabled set and
   * removes from active any group that is no longer enabled.
   * Newly enabled groups are not auto-activated; active selection is independent.
   * @param groupIds The IDs of the groups to enable
   */
  public setEnabledGroups(groupIds: string[]): void {
    this.catalog.setEnabledGroups(groupIds)
  }

  /**
   * Set the active groups for cue selection.
   * Clears consistency tracking only when the active set actually changes (e.g. DMX preview toggle).
   * @param groupIds Array of group IDs to set as active
   */
  public setActiveGroups(groupIds: string[]): void {
    if (this.catalog.setActiveGroups(groupIds)) {
      this.selection.clearConsistencyTracking()
    }
  }

  /**
   * Clear all consistency tracking data.
   * This should be called when active groups change or when a reset is needed.
   */
  public clearConsistencyTracking(): void {
    this.selection.clearConsistencyTracking()
  }

  /**
   * Clear consistency tracking for a specific cue type.
   * @param cueType The type of cue to clear tracking for
   */
  public clearCueConsistencyTracking(cueType: CueType): void {
    this.selection.clearCueConsistencyTracking(cueType)
  }

  /**
   * Clear consistency tracking for a specific group.
   * This should be called when a group is disabled or removed.
   * @param groupId The ID of the group to clear tracking for
   */
  public clearGroupConsistencyTracking(groupId: string): void {
    this.selection.clearGroupConsistencyTracking(groupId)
  }

  /**
   * Get all registered group IDs, regardless of whether they're enabled or active.
   * @returns Array of all registered group IDs
   */
  public getAllGroups(): string[] {
    return this.catalog.getAllGroups()
  }

  /**
   * Notifies every registered cue (lighting and motion) that the given sequencer is going
   * away so the cue impl can drop its per-sequencer runtime state. Called by `RigChain.dispose`
   * to keep cue instances from accumulating stale entries across `restartControllers` cycles.
   */
  public releaseSequencerFromAllCues(
    sequencer: import('../../controllers/sequencer/interfaces').ILightingController,
  ): void {
    releaseSequencersFor(this.catalog.groupsIterable(), sequencer)
  }

  /**
   * Get the currently enabled group IDs.
   * @returns Array of enabled group IDs
   */
  public getEnabledGroups(): string[] {
    return this.catalog.getEnabledGroups()
  }

  /**
   * Get the currently active group IDs.
   * @returns Array of active group IDs
   */
  public getActiveGroups(): string[] {
    return this.catalog.getActiveGroups()
  }

  /**
   * Active groups that implement (and haven't disabled) the given cue type. Used by the RB3 game-mode
   * manager as the primary-cue rotation pool: RB3 has a single primary cueType, so rotation is by group.
   */
  public getActiveGroupsImplementing(cueType: CueType): string[] {
    return this.catalog.getActiveGroupsImplementing(cueType)
  }

  /**
   * Get the ID of the default group.
   * @returns The default group ID or null if no default group is set
   */
  public getDefaultGroupId(): string | null {
    return this.catalog.getDefaultGroupId()
  }

  /**
   * Get the ID of the stage kit group.
   * @returns The stage kit group ID or null if no stage kit group is set
   */
  public getStageKitGroupId(): string | null {
    return this.catalog.getStageKitGroupId()
  }

  /**
   * Set the stage kit group.
   * @param groupId The ID of the group to set as the stage kit group
   * @throws Error if the group doesn't exist
   */
  public setStageKitGroup(groupId: string): void {
    this.catalog.setStageKitGroup(groupId)
  }

  /**
   * Set the stage kit priority preference.
   * @param preference 'prefer-for-tracked', 'random', or 'never'
   */
  public setStageKitPriority(preference: 'prefer-for-tracked' | 'random' | 'never'): void {
    this.selection.setStageKitPriority(preference)
  }

  /**
   * Get the current stage kit priority preference.
   * @returns The current stage kit priority preference
   */
  public getStageKitPriority(): 'prefer-for-tracked' | 'random' | 'never' {
    return this.selection.getStageKitPriority()
  }

  /**
   * Get a specific group by ID, regardless of whether it's enabled or active.
   * @param groupId The ID of the group to get
   * @returns The group or undefined if not found
   */
  public getGroup(groupId: string): ICueGroup | undefined {
    return this.catalog.getGroup(groupId)
  }

  /**
   * Get debugging information about the current cue selection state.
   * @returns Object containing current selection state
   */
  public getDebugInfo(): {
    lastPrimaryCue: RoleDebugInfo
    lastSecondaryCue: RoleDebugInfo
    activeGroups: string[]
    enabledGroups: string[]
    defaultGroup: string | null
    stageKitGroup: string | null
    stageKitPriority: 'prefer-for-tracked' | 'random' | 'never'
  } {
    return {
      ...this.selection.roleSnapshots(),
      activeGroups: this.catalog.getActiveGroups(),
      enabledGroups: this.catalog.getEnabledGroups(),
      defaultGroup: this.catalog.getDefaultGroupId(),
      stageKitGroup: this.catalog.getStageKitGroupId(),
      stageKitPriority: this.selection.getStageKitPriority(),
    }
  }

  /**
   * Reset the cue selection counters and last selected groups.
   */
  public resetCueSelectionState(): void {
    this.selection.resetRoleState()
  }

  /**
   * Get information about which groups have implementations for a specific cue type.
   * @param cueType The cue type to check
   * @returns Object with group information
   */
  public getCueAvailability(cueType: CueType): {
    activeGroupsWithCue: string[]
    allGroupsWithCue: string[]
    defaultHasCue: boolean
  } {
    return this.catalog.getCueAvailability(cueType)
  }

  /**
   * Get the current state of a specific cue.
   * @param cueType The type of cue to get state for
   * @returns The cue state or null if not found
   */
  public getCueState(cueType: CueType): CueStateUpdate | null {
    return this.selection.getCueState(cueType)
  }

  /**
   * Get the current consistency status for debugging and monitoring.
   * @returns Object containing consistency tracking information
   */
  public getConsistencyStatus(): { windowMs: number; trackedCues: TrackedCueStatus[] } {
    return this.selection.getConsistencyStatus()
  }

  public setMotionSelectionMode(mode: MotionGroupSelectionMode): void {
    this.motion.setMotionSelectionMode(mode)
  }

  public getMotionSelectionMode(): MotionGroupSelectionMode {
    return this.motion.getMotionSelectionMode()
  }

  public onMotionSongStart(): void {
    this.motion.onMotionSongStart()
  }

  public onMotionSongEnd(): void {
    this.motion.onMotionSongEnd()
  }

  public getRandomMotionCue(): INetCue | null {
    return this.motion.getRandomMotionCue()
  }

  /**
   * Resolve a specific motion program when manual selection is active.
   * Returns null if the group is not motion-enabled, the cue is disabled, or the id is unknown.
   */
  public getMotionCueImplementation(ref: MotionCueRef): INetCue | null {
    return this.motion.getMotionCueImplementation(ref)
  }

  /** Locate group/cue ids for a motion cue instance (for UI / IPC metadata). */
  public findMotionCueRef(cue: INetCue): MotionCueRef | null {
    return this.motion.findMotionCueRef(cue)
  }

  public getMotionGroupsInfo(): MotionGroupInfo[] {
    return this.motion.getMotionGroupsInfo()
  }

  public getMotionCueDetails(groupId: string): MotionCueDetail[] {
    return this.motion.getMotionCueDetails(groupId)
  }

  public setDisabledMotionCues(map: Record<string, string[]>): void {
    this.motion.setDisabledMotionCues(map)
  }

  public isMotionCueDisabled(groupId: string, cueId: string): boolean {
    return this.motion.isMotionCueDisabled(groupId, cueId)
  }

  public setEnabledMotionGroups(groupIds: string[]): void {
    this.motion.setEnabledMotionGroups(groupIds)
  }

  public getEnabledMotionGroups(): string[] {
    return this.motion.getEnabledMotionGroups()
  }

  /** Group ids that have at least one YARG motion program registered. */
  public getRegisteredMotionGroupIds(): string[] {
    return this.motion.getRegisteredMotionGroupIds()
  }

  public enableMotionGroup(groupId: string): void {
    this.motion.enableMotionGroup(groupId)
  }
}
