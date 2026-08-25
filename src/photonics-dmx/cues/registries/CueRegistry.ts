import { CueType, type MotionCueRef } from '../types/cueTypes'
import type { MotionGroupSelectionMode } from '../types/nodeCueTypes'
import { ICueGroup } from '../interfaces/INetCueGroup'
import { INetCue, CueStyle } from '../interfaces/INetCue'
import { MotionNodeCue } from '../node/runtime/MotionNodeCue'
import { MotionSelectionState } from './MotionSelectionState'
import {
  DisabledCueStore,
  findMotionCueRefIn,
  motionCueDetailsFor,
  motionGroupsInfoFor,
  releaseSequencersFor,
  resolveMotionCue,
  type MotionCueDetail,
  type MotionGroupInfo,
} from './cueRegistrySupport'
import { createLogger } from '../../../shared/logger'
import { monotonicNowMs } from '../../../shared/time'
const log = createLogger('CueRegistry')

/**
 * Interface for cue state updates sent to frontend
 */
export interface CueStateUpdate {
  cueType: string
  groupId: string
  isFallback: boolean
  cueStyle: 'primary' | 'secondary'
  counter: number
  limit: number
}

/**
 * Selection state for one cue role. Primary and secondary cues are tracked separately so a run of
 * one does not rotate the other, and each role rotates to a fresh group once its counter reaches
 * `limit`.
 */
interface CueRoleState {
  readonly style: 'primary' | 'secondary'
  readonly limit: number
  lastCueName: string | null
  lastCueGroup: string | null
  lastIsFallback: boolean
  counter: number
}

function newCueRoleState(style: 'primary' | 'secondary', limit: number): CueRoleState {
  return {
    style,
    limit,
    lastCueName: null,
    lastCueGroup: null,
    lastIsFallback: false,
    counter: 0,
  }
}

function resetCueRoleState(role: CueRoleState): void {
  role.lastCueName = null
  role.lastCueGroup = null
  role.lastIsFallback = false
  role.counter = 0
}

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
 */
export class CueRegistry {
  /** The singleton instance of the CueRegistry */
  private static instance: CueRegistry

  /** Map of all registered cue groups by their name */
  private groups: Map<string, ICueGroup> = new Map()

  /** Set of groups that are enabled in user preferences */
  private enabledGroups: Set<string> = new Set()

  /** Set of groups that are currently active during gameplay */
  private activeGroups: Set<string> = new Set()

  /** Per-group disabled cue types (user preferences) */
  private readonly disabledCues = new DisabledCueStore()

  private readonly motionState = new MotionSelectionState<INetCue>()

  /** Name of the default group that provides fallback implementations */
  private defaultGroup: string | null = null

  /** Name of the stage kit group for special stage kit handling */
  private stageKitGroup: string | null = null

  /** Current stage kit priority preference */
  private stageKitPriority: 'prefer-for-tracked' | 'random' | 'never' = 'prefer-for-tracked'

  /** Last called cue and source group per role, with the consecutive-call counter for that role */
  private readonly primaryRole: CueRoleState = newCueRoleState('primary', 100)
  private readonly secondaryRole: CueRoleState = newCueRoleState('secondary', 50)

  /** Cue consistency throttling to prevent rapid randomization changes */
  private cueConsistencyWindow: number = 2000 // 2 seconds in milliseconds
  private lastCueExecutionTime: Map<CueType, number> = new Map()
  private lastCueGroupSelection: Map<CueType, { groupId: string; isFallback: boolean }> = new Map()

  /** Cue group selection mode: withinSong = can change during song; oncePerSong = one group for all cues in the song */
  private cueGroupSelectionMode: 'oncePerSong' | 'withinSong' = 'withinSong'
  /** When true, use a single locked group for all cues until onSongEnd (once-per-song behaviour) */
  private lockSelectionsForSong: boolean = false
  /** When once-per-song lock is active, this is the single group used for every cue in the song (null until first cue request) */
  private lockedGroupIdForSong: string | null = null

  /** Last cueType logged as missing, so a repeatedly-queried missing cue (e.g. an unregistered RB3
   *  slot at ~30 Hz) is logged once rather than every call. Cleared on a successful resolution. */
  private lastMissingCue: CueType | null = null

  /** Optional callback for sending cue state updates to frontend */
  private cueStateUpdateCallback: ((state: CueStateUpdate) => void) | null = null

  private constructor() {}

  /**
   * Set callback for sending cue state updates to frontend
   * @param callback Function to call when cue state changes
   */
  public setCueStateUpdateCallback(callback: (state: CueStateUpdate) => void): void {
    this.cueStateUpdateCallback = callback
  }

  /**
   * Send cue state update to frontend if callback is set
   * @param cueType The cue type that was selected
   * @param groupId The group it came from
   * @param isFallback Whether this is a fallback use of disabled default group
   * @param cueStyle Primary or secondary
   * @param counter Current counter value
   * @param limit Counter limit
   */
  private emitCueStateUpdate(
    cueType: string,
    groupId: string,
    isFallback: boolean,
    cueStyle: 'primary' | 'secondary',
    counter: number,
    limit: number,
  ): void {
    if (this.cueStateUpdateCallback) {
      this.cueStateUpdateCallback({
        cueType,
        groupId,
        isFallback,
        cueStyle,
        counter,
        limit,
      })
    }
  }

  /**
   * Reset the registry to its initial state.
   */
  public reset(): void {
    this.enabledGroups.clear()
    this.activeGroups.clear()
    this.disabledCues.clear()
    this.motionState.reset()
    this.defaultGroup = null
    this.stageKitGroup = null
    this.stageKitPriority = 'prefer-for-tracked'
    resetCueRoleState(this.primaryRole)
    resetCueRoleState(this.secondaryRole)

    // Clear consistency tracking and once-per-song lock
    this.lockSelectionsForSong = false
    this.lockedGroupIdForSong = null
    this.clearConsistencyTracking()

    log.info('CueRegistry reset to initial state')
  }

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
   * Register a new group of cue implementations.
   * @param group The group to register
   */
  public registerGroup(group: ICueGroup): void {
    this.groups.set(group.id, group)

    // Add to enabled groups by default
    this.enabledGroups.add(group.id)
    // Add to active groups by default (all enabled groups are active by default)
    this.activeGroups.add(group.id)

    this.motionState.onRegisterGroup(group.id, group.motionCues?.size ?? 0)
  }

  /**
   * Unregister an existing group of cues.
   * @param groupId The group identifier to remove
   */
  public unregisterGroup(groupId: string): boolean {
    if (!this.groups.has(groupId)) {
      return false
    }

    this.groups.delete(groupId)
    this.enabledGroups.delete(groupId)
    this.activeGroups.delete(groupId)
    this.motionState.onUnregisterGroup(groupId)

    if (this.defaultGroup === groupId) {
      this.defaultGroup = null
    }

    if (this.stageKitGroup === groupId) {
      this.stageKitGroup = null
    }

    this.clearGroupConsistencyTracking(groupId)
    return true
  }

  /**
   * Set the default group.
   * @param groupName The name of the group to set as default
   * @throws Error if the group doesn't exist
   */
  public setDefaultGroup(groupId: string): void {
    // Verify that the group exists before setting it as default
    if (!this.groups.has(groupId)) {
      throw new Error(`Cannot set default group: group '${groupId}' not found`)
    }

    // Set it as the new default group
    this.defaultGroup = groupId
  }

  /**
   * Get a cue implementation with randomized selection for new cues.
   * For the first call to a primary/secondary cue (or after counter resets),
   * randomly selects from available groups. Subsequent calls use the same group.
   *
   * Cue consistency throttling: If the same cue is called within the consistency window
   * (default 2 seconds), it will use the same group selection as the previous call
   * to prevent rapid randomization changes.
   *
   * Stage Kit Priority: When trackMode is 'tracked' and stageKitPriority is 'prefer-for-tracked',
   * the stageKitGroup will be preferred over random selection.
   *
   * Simulation Mode: When trackMode is 'simulated', stage kit priority is ignored to allow
   * testing all cue groups regardless of priority settings.
   * @param cueType The type of cue to get
   * @param trackMode The track mode ('tracked', 'autogen', or 'simulated')
   * @returns The cue implementation or null if not found
   */
  public getCueImplementation(
    cueType: CueType,
    trackMode: 'tracked' | 'autogen' | 'simulated' = 'tracked',
  ): INetCue | null {
    // Check if we should prefer stage kit group based on priority and trackMode
    // When trackMode='tracked' and stageKitPriority='prefer-for-tracked', prefer stage kit group
    // When trackMode='simulated', ignore stage kit priority to allow testing all groups
    // This serves tracked cues from the stage kit group directly and does not engage the
    // once-per-song group lock: with a single group serving the whole song there is no group
    // switching to constrain.
    if (
      trackMode === 'tracked' &&
      this.stageKitPriority === 'prefer-for-tracked' &&
      this.stageKitGroup &&
      this.activeGroups.has(this.stageKitGroup)
    ) {
      const stageKitGroup = this.groups.get(this.stageKitGroup)
      if (stageKitGroup?.cues.has(cueType) && !this.isCueDisabled(this.stageKitGroup, cueType)) {
        // Stage kit group has this cue and should be preferred
        const cue = stageKitGroup.cues.get(cueType)!
        if (cue.style === CueStyle.Primary) {
          return this.handleRoleCue(
            this.primaryRole,
            cueType,
            { groupId: this.stageKitGroup, isFallback: false },
            false,
          )
        } else {
          return this.handleRoleCue(
            this.secondaryRole,
            cueType,
            { groupId: this.stageKitGroup, isFallback: false },
            false,
          )
        }
      }
    }

    // When priority is 'random' or 'never', proceed with normal random selection

    // Check consistency first before getting a new random selection
    const consistentSelection = this.shouldUseConsistentSelection(cueType, trackMode === 'autogen')
    if (consistentSelection) {
      // Use the consistent selection
      const group = this.groups.get(consistentSelection.groupId)
      const cue = group?.cues.get(cueType)
      if (group && cue && !this.isCueDisabled(consistentSelection.groupId, cueType)) {
        if (cue.style === CueStyle.Primary) {
          return this.handleRoleCue(
            this.primaryRole,
            cueType,
            consistentSelection,
            trackMode === 'autogen',
          )
        } else {
          return this.handleRoleCue(
            this.secondaryRole,
            cueType,
            consistentSelection,
            trackMode === 'autogen',
          )
        }
      }
    }

    // No consistent selection available, get a new random selection
    const tempSelection = this.getRandomCueFromActiveGroups(cueType)
    if (!tempSelection) {
      // Dedup consecutive identical misses: an always-active cue slot (RB3) with no cue registered
      // is queried ~30x/s, which would otherwise flood the log with the same error.
      if (this.lastMissingCue !== cueType) {
        log.error(`No implementation found for cue: ${cueType}`)
        this.lastMissingCue = cueType
      }
      return null
    }
    this.lastMissingCue = null

    if (this.lockSelectionsForSong && this.lockedGroupIdForSong === null) {
      this.lockedGroupIdForSong = tempSelection.groupId
    }

    const tempCue = this.groups.get(tempSelection.groupId)!.cues.get(cueType)!
    if (tempCue.style === CueStyle.Primary) {
      return this.handleRoleCue(this.primaryRole, cueType, tempSelection, trackMode === 'autogen')
    } else {
      return this.handleRoleCue(this.secondaryRole, cueType, tempSelection, trackMode === 'autogen')
    }
  }

  /**
   * Get cue implementation from a specific group (deterministic, for simulation).
   * Does not use random selection or mutate activeGroups. Routes through
   * handleRoleCue so state tracking and cue-state updates are preserved.
   * @param cueType The cue type to resolve
   * @param groupId The group to use (must exist and contain the cue, or fallback to defaultGroup if it has the cue)
   * @param trackMode Used only for autoGen flag when calling handlers
   * @returns The cue implementation or null if not found in the group or default fallback
   */
  public getCueImplementationFromGroup(
    cueType: CueType,
    groupId: string,
    trackMode: 'tracked' | 'autogen' | 'simulated' = 'simulated',
  ): INetCue | null {
    const group = this.groups.get(groupId)
    if (group?.cues.has(cueType) && !this.isCueDisabled(groupId, cueType)) {
      const cue = group.cues.get(cueType)!
      const selection = { groupId, isFallback: false }
      if (cue.style === CueStyle.Primary) {
        return this.handleRoleCue(this.primaryRole, cueType, selection, trackMode === 'autogen')
      }
      return this.handleRoleCue(this.secondaryRole, cueType, selection, trackMode === 'autogen')
    }
    if (
      this.defaultGroup &&
      this.groups.get(this.defaultGroup)?.cues.has(cueType) &&
      !this.isCueDisabled(this.defaultGroup, cueType)
    ) {
      const selection = { groupId: this.defaultGroup, isFallback: true }
      const cue = this.groups.get(this.defaultGroup)!.cues.get(cueType)!
      if (cue.style === CueStyle.Primary) {
        return this.handleRoleCue(this.primaryRole, cueType, selection, trackMode === 'autogen')
      }
      return this.handleRoleCue(this.secondaryRole, cueType, selection, trackMode === 'autogen')
    }
    return null
  }

  /**
   * Set the cue consistency window to prevent rapid randomization changes.
   * @param windowMs The consistency window in milliseconds (default: 2000ms)
   */
  public setCueConsistencyWindow(windowMs: number): void {
    this.cueConsistencyWindow = Math.max(0, windowMs)
    log.info(`Cue consistency window set to ${this.cueConsistencyWindow}ms`)
  }

  /**
   * Get the current cue consistency window setting.
   * @returns The consistency window in milliseconds
   */
  public getCueConsistencyWindow(): number {
    return this.cueConsistencyWindow
  }

  /**
   * Set the cue group selection mode (once per song vs within a song).
   */
  public setCueGroupSelectionMode(mode: 'oncePerSong' | 'withinSong'): void {
    this.cueGroupSelectionMode = mode
    if (mode === 'withinSong') {
      this.lockSelectionsForSong = false
      this.lockedGroupIdForSong = null
    }
  }

  /**
   * Get the current cue group selection mode.
   */
  public getCueGroupSelectionMode(): 'oncePerSong' | 'withinSong' {
    return this.cueGroupSelectionMode
  }

  /**
   * Notify that a song has started (e.g. Menu -> Gameplay). When mode is oncePerSong, locks group selection for the song.
   */
  public onSongStart(): void {
    if (this.cueGroupSelectionMode === 'oncePerSong') {
      this.clearConsistencyTracking()
      this.lockSelectionsForSong = true
      this.lockedGroupIdForSong = null
    }
  }

  /**
   * Notify that the current song has ended (left Gameplay). Clears the once-per-song lock.
   */
  public onSongEnd(): void {
    this.lockSelectionsForSong = false
    this.lockedGroupIdForSong = null
  }

  /**
   * Check if a cue should use consistent group selection based on the consistency window.
   * @param cueType The type of cue to check
   * @param autoGen Whether the song is auto-generated (affects stage kit priority)
   * @returns Object with group ID and fallback flag if consistency should be maintained, null otherwise
   */
  private shouldUseConsistentSelection(
    cueType: CueType,
    autoGen: boolean = false,
  ): { groupId: string; isFallback: boolean } | null {
    // If stage kit priority should be used, don't use consistency tracking
    // When autoGen=false (tracked lighting data), prefer stage kit group if priority is set
    if (
      !autoGen &&
      this.stageKitPriority === 'prefer-for-tracked' &&
      this.stageKitGroup &&
      this.activeGroups.has(this.stageKitGroup)
    ) {
      const stageKitGroup = this.groups.get(this.stageKitGroup)
      if (stageKitGroup?.cues.has(cueType) && !this.isCueDisabled(this.stageKitGroup, cueType)) {
        return null
      }
    }

    const now = monotonicNowMs()
    const lastExecutionTime = this.lastCueExecutionTime.get(cueType)
    const lastSelection = this.lastCueGroupSelection.get(cueType)

    // Once-per-song lock: use the single locked group for all cues in the song
    if (this.lockSelectionsForSong && this.lockedGroupIdForSong !== null) {
      const lockedGroup = this.groups.get(this.lockedGroupIdForSong)
      if (!lockedGroup || !this.activeGroups.has(this.lockedGroupIdForSong)) {
        this.lockedGroupIdForSong = null
        return null
      }
      if (
        lockedGroup.cues.has(cueType) &&
        !this.isCueDisabled(this.lockedGroupIdForSong, cueType)
      ) {
        this.lastCueExecutionTime.set(cueType, now)
        return { groupId: this.lockedGroupIdForSong, isFallback: false }
      }
      if (
        this.defaultGroup &&
        this.groups.get(this.defaultGroup)?.cues.has(cueType) &&
        !this.isCueDisabled(this.defaultGroup, cueType)
      ) {
        this.lastCueExecutionTime.set(cueType, now)
        return { groupId: this.defaultGroup, isFallback: true }
      }
      return null
    }

    // If we have a previous selection and it's within the consistency window, validate it's still available
    if (lastExecutionTime && lastSelection && now - lastExecutionTime < this.cueConsistencyWindow) {
      // Validate that the group still exists and has the cue implementation
      const group = this.groups.get(lastSelection.groupId)
      if (group && group.cues.has(cueType) && !this.isCueDisabled(lastSelection.groupId, cueType)) {
        // Check if this is a fallback group - if so, ensure it's still valid as fallback
        if (lastSelection.isFallback) {
          // For fallback groups, we need to ensure no active groups have this cue
          // If an active group now has it, we should use that instead
          const activeGroupHasCue = Array.from(this.activeGroups).some((groupId) => {
            const activeGroup = this.groups.get(groupId)
            return activeGroup?.cues.has(cueType) === true && !this.isCueDisabled(groupId, cueType)
          })

          if (activeGroupHasCue) {
            // An active group now has this cue, so we shouldn't use the fallback
            this.clearCueConsistencyTracking(cueType)
            return null
          } else {
            // No active group has this cue, so the fallback is still valid
          }
        } else {
          // Non-fallback: require the cached group to still be active (e.g. not toggled off in DMX preview)
          if (
            !this.activeGroups.has(lastSelection.groupId) ||
            this.isCueDisabled(lastSelection.groupId, cueType)
          ) {
            this.clearCueConsistencyTracking(cueType)
            return null
          }
        }

        // Update the execution time to prevent infinite loops
        this.lastCueExecutionTime.set(cueType, now)
        return lastSelection
      } else {
        // The group or cue is no longer available, clear the tracking
        this.clearCueConsistencyTracking(cueType)
        return null
      }
    }

    return null
  }

  /**
   * Record the execution of a cue for consistency tracking.
   * @param cueType The type of cue that was executed
   * @param selection The group selection that was used
   */
  private recordCueExecution(
    cueType: CueType,
    selection: { groupId: string; isFallback: boolean },
  ): void {
    const now = monotonicNowMs()
    this.lastCueExecutionTime.set(cueType, now)
    this.lastCueGroupSelection.set(cueType, selection)
  }

  /**
   * Handle cue selection for one role.
   *
   * Callers resolve and validate the group first and pass it as `preSelection`, which is the path
   * this takes in practice. The branches below it cover a pre-selection that no longer resolves:
   * the role falls back to its consistent selection, then to a fresh random pick, then to the group
   * the role used last.
   *
   * @param role Selection state for the cue's role, mutated in place
   * @param cueType The type of cue to get
   * @param preSelection Optional pre-selected group to avoid redundant selection
   * @param autoGen Whether the song is auto-generated (affects stage kit priority)
   * @returns The cue implementation or null if not found
   */
  private handleRoleCue(
    role: CueRoleState,
    cueType: CueType,
    preSelection?: { groupId: string; isFallback: boolean },
    autoGen: boolean = false,
  ): INetCue | null {
    // If we have a pre-selection, use it directly and bypass consistency
    if (preSelection) {
      const group = this.groups.get(preSelection.groupId)
      const cue = group?.cues.get(cueType)

      if (group && cue && !this.isCueDisabled(preSelection.groupId, cueType)) {
        // Use the pre-selection and increment counter
        role.counter++
        this.emitCueStateUpdate(
          cueType,
          preSelection.groupId,
          preSelection.isFallback,
          role.style,
          role.counter,
          role.limit,
        )

        // Record this execution for consistency tracking
        this.recordCueExecution(cueType, preSelection)

        return cue
      }
    }

    // Check consistency throttling if no pre-selection
    const consistentSelection = this.shouldUseConsistentSelection(cueType, autoGen)
    if (consistentSelection) {
      // Double-check that the group and cue are still available before using
      const group = this.groups.get(consistentSelection.groupId)
      const cue = group?.cues.get(cueType)

      if (group && cue && !this.isCueDisabled(consistentSelection.groupId, cueType)) {
        // Use the consistent selection and increment counter
        role.counter++
        this.emitCueStateUpdate(
          cueType,
          consistentSelection.groupId,
          consistentSelection.isFallback,
          role.style,
          role.counter,
          role.limit,
        )
        return cue
      } else {
        // Something went wrong with the consistent selection, clear it and fall through to normal logic
        log.warn(
          `[Consistency] Consistent selection validation failed for ${cueType}, falling back to normal selection`,
        )
        this.clearCueConsistencyTracking(cueType)
      }
    }

    const isNewCue = role.lastCueName !== cueType
    const shouldReset = role.counter >= role.limit

    if (isNewCue || shouldReset) {
      // Reset counter and select new implementation
      role.counter = 0
      const selection = preSelection || this.getRandomCueFromActiveGroups(cueType)

      if (selection) {
        role.lastCueName = cueType
        role.lastCueGroup = selection.groupId
        role.lastIsFallback = selection.isFallback
        role.counter++

        // Record this execution for consistency tracking
        this.recordCueExecution(cueType, selection)

        this.emitCueStateUpdate(
          cueType,
          selection.groupId,
          role.lastIsFallback,
          role.style,
          role.counter,
          role.limit,
        )
        return this.groups.get(selection.groupId)!.cues.get(cueType)!
      }
    } else {
      // Use same group as last time
      role.counter++
      if (
        role.lastCueGroup &&
        this.groups.get(role.lastCueGroup)?.cues.has(cueType) &&
        !this.isCueDisabled(role.lastCueGroup, cueType)
      ) {
        this.emitCueStateUpdate(
          cueType,
          role.lastCueGroup,
          role.lastIsFallback,
          role.style,
          role.counter,
          role.limit,
        )
        return this.groups.get(role.lastCueGroup)!.cues.get(cueType)!
      }
    }

    return null
  }

  /**
   * Select a group that has the specified cue type following the priority logic:
   * 1. Randomly select from any ACTIVE group that has the requested cue
   * 2. If default is active, it's considered along with other active groups
   * 3. If default is NOT active, it's normally not considered
   * 4. But if no active group has the cue, use default as fallback (even if active)
   * @param cueType The type of cue to find
   * @returns Object with group ID and whether it's a fallback, or null if not found
   */
  private getRandomCueFromActiveGroups(
    cueType: CueType,
  ): { groupId: string; isFallback: boolean } | null {
    // Step 1 & 2: Get all active groups that have this cue (including default if active)
    const availableGroups: string[] = []

    for (const groupId of this.activeGroups) {
      const group = this.groups.get(groupId)
      if (group?.cues.has(cueType) && !this.isCueDisabled(groupId, cueType)) {
        availableGroups.push(groupId)
      }
    }

    // If we found active groups with the cue, randomly select one
    if (availableGroups.length > 0) {
      const randomIndex = Math.floor(Math.random() * availableGroups.length)
      const selectedGroup = availableGroups[randomIndex]
      return {
        groupId: selectedGroup,
        isFallback: false,
      }
    }

    // Step 4: No active groups have it, try default as fallback (regardless of whether it's active)
    if (
      this.defaultGroup &&
      this.groups.get(this.defaultGroup)?.cues.has(cueType) &&
      !this.isCueDisabled(this.defaultGroup, cueType)
    ) {
      return {
        groupId: this.defaultGroup,
        isFallback: true,
      }
    }

    return null
  }

  /**
   * Replace per-group disabled cue sets from preferences.
   */
  public setDisabledCues(disabled: Record<string, string[]>): void {
    this.disabledCues.setAll(disabled)
  }

  /**
   * Whether this cue type is disabled for the given group in preferences.
   */
  public isCueDisabled(groupId: string, cueType: CueType): boolean {
    return this.disabledCues.isDisabled(groupId, cueType)
  }

  /**
   * Enable a single group by adding it to the enabled groups.
   * If the group was not previously enabled, it will also be activated.
   * @param groupId The ID of the group to enable
   * @returns True if the group was enabled, false otherwise
   */
  public enableGroup(groupId: string): boolean {
    if (this.groups.has(groupId)) {
      const wasEnabled = this.enabledGroups.has(groupId)
      this.enabledGroups.add(groupId)

      // If it wasn't enabled before, activate it by default
      if (!wasEnabled) {
        this.activeGroups.add(groupId)
      }

      return true
    }
    return false
  }

  /**
   * Disable a single group by removing it from the enabled groups.
   * This will also deactivate the group if it was active.
   * @param groupId The ID of the group to disable
   * @returns True if the group was disabled, false otherwise
   */
  public disableGroup(groupId: string): boolean {
    if (this.enabledGroups.has(groupId)) {
      this.enabledGroups.delete(groupId)
      // Also deactivate the group if it was active
      if (this.activeGroups.has(groupId)) {
        this.activeGroups.delete(groupId)
      }

      // Clear any consistency tracking for this group
      this.clearGroupConsistencyTracking(groupId)

      return true
    }
    return false
  }

  /**
   * Activate a single group by adding it to the active groups.
   * Only enabled groups can be activated.
   * @param groupId The ID of the group to activate
   * @returns True if the group was activated, false otherwise
   */
  public activateGroup(groupId: string): boolean {
    if (this.groups.has(groupId) && this.enabledGroups.has(groupId)) {
      this.activeGroups.add(groupId)
      return true
    }
    return false
  }

  /**
   * Deactivate a single group by removing it from the active groups.
   * @param groupId The ID of the group to deactivate
   * @returns True if the group was deactivated, false otherwise
   */
  public deactivateGroup(groupId: string): boolean {
    if (this.activeGroups.has(groupId)) {
      this.activeGroups.delete(groupId)
      return true
    }
    return false
  }

  /**
   * Set which groups are enabled (preference allowlist).
   * Does not replace the current active groups: only updates the enabled set and
   * removes from active any group that is no longer enabled.
   * Newly enabled groups are not auto-activated; active selection is independent.
   * @param groupIds The IDs of the groups to enable
   */
  public setEnabledGroups(groupIds: string[]): void {
    const newEnabled = new Set<string>()
    for (const id of groupIds) {
      if (this.groups.has(id)) {
        newEnabled.add(id)
      }
    }
    this.enabledGroups = newEnabled
    // Remove from active any group that is no longer enabled; leave other active groups unchanged
    for (const activeId of Array.from(this.activeGroups)) {
      if (!this.enabledGroups.has(activeId)) {
        this.activeGroups.delete(activeId)
      }
    }
  }

  /**
   * Set the active groups for cue selection.
   * Clears consistency tracking only when the active set actually changes (e.g. DMX preview toggle).
   * @param groupIds Array of group IDs to set as active
   */
  public setActiveGroups(groupIds: string[]): void {
    const newActive = new Set<string>()
    for (const groupId of groupIds) {
      if (this.enabledGroups.has(groupId)) {
        newActive.add(groupId)
      } else {
        log.warn(`Cannot activate group '${groupId}': group not enabled`)
      }
    }

    const sameSet =
      newActive.size === this.activeGroups.size &&
      Array.from(newActive).every((id) => this.activeGroups.has(id))
    if (!sameSet) {
      this.clearConsistencyTracking()
    }

    this.activeGroups.clear()
    for (const id of newActive) {
      this.activeGroups.add(id)
    }
  }

  /**
   * Clear all consistency tracking data.
   * This should be called when active groups change or when a reset is needed.
   */
  public clearConsistencyTracking(): void {
    this.lastCueExecutionTime.clear()
    this.lastCueGroupSelection.clear()
  }

  /**
   * Clear consistency tracking for a specific cue type.
   * @param cueType The type of cue to clear tracking for
   */
  public clearCueConsistencyTracking(cueType: CueType): void {
    this.lastCueExecutionTime.delete(cueType)
    this.lastCueGroupSelection.delete(cueType)
  }

  /**
   * Clear consistency tracking for a specific group.
   * This should be called when a group is disabled or removed.
   * @param groupId The ID of the group to clear tracking for
   */
  public clearGroupConsistencyTracking(groupId: string): void {
    let _clearedCount = 0

    // Find all cues that were tracked for this group and clear them
    for (const [cueType, selection] of this.lastCueGroupSelection.entries()) {
      if (selection.groupId === groupId) {
        this.lastCueExecutionTime.delete(cueType)
        this.lastCueGroupSelection.delete(cueType)
        _clearedCount++
      }
    }
  }

  /**
   * Get all registered group IDs, regardless of whether they're enabled or active.
   * @returns Array of all registered group IDs
   */
  public getAllGroups(): string[] {
    return Array.from(this.groups.keys())
  }

  /**
   * Notifies every registered cue (lighting and motion) that the given sequencer is going
   * away so the cue impl can drop its per-sequencer runtime state. Called by `RigChain.dispose`
   * to keep cue instances from accumulating stale entries across `restartControllers` cycles.
   */
  public releaseSequencerFromAllCues(
    sequencer: import('../../controllers/sequencer/interfaces').ILightingController,
  ): void {
    releaseSequencersFor(this.groups.values(), sequencer)
  }

  /**
   * Get the currently enabled group IDs.
   * @returns Array of enabled group IDs
   */
  public getEnabledGroups(): string[] {
    return Array.from(this.enabledGroups)
  }

  /**
   * Get the currently active group IDs.
   * @returns Array of active group IDs
   */
  public getActiveGroups(): string[] {
    return Array.from(this.activeGroups)
  }

  /**
   * Active groups that implement (and haven't disabled) the given cue type. Used by the RB3 game-mode
   * manager as the primary-cue rotation pool: RB3 has a single primary cueType, so rotation is by group.
   */
  public getActiveGroupsImplementing(cueType: CueType): string[] {
    return this.getActiveGroups().filter(
      (id) => this.groups.get(id)?.cues.has(cueType) === true && !this.isCueDisabled(id, cueType),
    )
  }

  /**
   * Get the ID of the default group.
   * @returns The default group ID or null if no default group is set
   */
  public getDefaultGroupId(): string | null {
    return this.defaultGroup
  }

  /**
   * Get the ID of the stage kit group.
   * @returns The stage kit group ID or null if no stage kit group is set
   */
  public getStageKitGroupId(): string | null {
    return this.stageKitGroup
  }

  /**
   * Set the stage kit group.
   * @param groupId The ID of the group to set as the stage kit group
   * @throws Error if the group doesn't exist
   */
  public setStageKitGroup(groupId: string): void {
    if (!this.groups.has(groupId)) {
      throw new Error(`Cannot set stage kit group: group '${groupId}' not found`)
    }
    this.stageKitGroup = groupId
  }

  /**
   * Set the stage kit priority preference.
   * @param preference 'prefer-for-tracked', 'random', or 'never'
   */
  public setStageKitPriority(preference: 'prefer-for-tracked' | 'random' | 'never'): void {
    const oldPriority = this.stageKitPriority
    this.stageKitPriority = preference
    log.info(`[CueRegistry] Stage kit priority changed from '${oldPriority}' to '${preference}'`)

    // Clear consistency tracking when priority changes to ensure immediate effect
    this.clearConsistencyTracking()
  }

  /**
   * Get the current stage kit priority preference.
   * @returns The current stage kit priority preference
   */
  public getStageKitPriority(): 'prefer-for-tracked' | 'random' | 'never' {
    return this.stageKitPriority
  }

  /**
   * Get a specific group by ID, regardless of whether it's enabled or active.
   * @param groupId The ID of the group to get
   * @returns The group or undefined if not found
   */
  public getGroup(groupId: string): ICueGroup | undefined {
    return this.groups.get(groupId)
  }

  /**
   * Get debugging information about the current cue selection state.
   * @returns Object containing current selection state
   */
  public getDebugInfo(): {
    lastPrimaryCue: {
      name: string | null
      group: string | null
      counter: number
      isFallback: boolean
    }
    lastSecondaryCue: {
      name: string | null
      group: string | null
      counter: number
      isFallback: boolean
    }
    activeGroups: string[]
    enabledGroups: string[]
    defaultGroup: string | null
    stageKitGroup: string | null
    stageKitPriority: 'prefer-for-tracked' | 'random' | 'never'
  } {
    return {
      lastPrimaryCue: {
        name: this.primaryRole.lastCueName,
        group: this.primaryRole.lastCueGroup,
        counter: this.primaryRole.counter,
        isFallback: this.primaryRole.lastIsFallback,
      },
      lastSecondaryCue: {
        name: this.secondaryRole.lastCueName,
        group: this.secondaryRole.lastCueGroup,
        counter: this.secondaryRole.counter,
        isFallback: this.secondaryRole.lastIsFallback,
      },
      activeGroups: Array.from(this.activeGroups),
      enabledGroups: Array.from(this.enabledGroups),
      defaultGroup: this.defaultGroup,
      stageKitGroup: this.stageKitGroup,
      stageKitPriority: this.stageKitPriority,
    }
  }

  /**
   * Reset the cue selection counters and last selected groups.
   */
  public resetCueSelectionState(): void {
    resetCueRoleState(this.primaryRole)
    resetCueRoleState(this.secondaryRole)
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
    const activeGroupsWithCue: string[] = []
    const allGroupsWithCue: string[] = []

    for (const [groupId, group] of this.groups) {
      if (group.cues.has(cueType)) {
        allGroupsWithCue.push(groupId)
        if (this.activeGroups.has(groupId)) {
          activeGroupsWithCue.push(groupId)
        }
      }
    }

    const defaultHasCue = this.defaultGroup
      ? this.groups.get(this.defaultGroup)?.cues.has(cueType) ?? false
      : false

    return {
      activeGroupsWithCue,
      allGroupsWithCue,
      defaultHasCue,
    }
  }

  /**
   * Get the current state of a specific cue.
   * @param cueType The type of cue to get state for
   * @returns The cue state or null if not found
   */
  public getCueState(cueType: CueType): CueStateUpdate | null {
    // Check if this is a primary or secondary cue by getting a temporary implementation
    const tempSelection = this.getRandomCueFromActiveGroups(cueType)
    if (!tempSelection) {
      return null
    }

    const tempCue = this.groups.get(tempSelection.groupId)!.cues.get(cueType)!
    const isPrimary = tempCue.style === CueStyle.Primary

    const role = isPrimary ? this.primaryRole : this.secondaryRole
    if (role.lastCueName === cueType) {
      return {
        cueType,
        groupId: role.lastCueGroup!,
        isFallback: role.lastIsFallback,
        cueStyle: role.style,
        counter: role.counter,
        limit: role.limit,
      }
    }

    return null
  }

  /**
   * Get the current consistency status for debugging and monitoring.
   * @returns Object containing consistency tracking information
   */
  public getConsistencyStatus(): {
    windowMs: number
    trackedCues: Array<{
      cueType: CueType
      lastExecutionTime: number
      lastGroupId: string
      timeSinceLastExecution: number
      isWithinWindow: boolean
    }>
  } {
    const now = monotonicNowMs()
    const trackedCues: Array<{
      cueType: CueType
      lastExecutionTime: number
      lastGroupId: string
      timeSinceLastExecution: number
      isWithinWindow: boolean
    }> = []

    for (const [cueType, executionTime] of this.lastCueExecutionTime.entries()) {
      const lastSelection = this.lastCueGroupSelection.get(cueType)
      if (lastSelection) {
        const timeSinceLastExecution = now - executionTime
        trackedCues.push({
          cueType,
          lastExecutionTime: executionTime,
          lastGroupId: lastSelection.groupId,
          timeSinceLastExecution,
          isWithinWindow: timeSinceLastExecution < this.cueConsistencyWindow,
        })
      }
    }

    return {
      windowMs: this.cueConsistencyWindow,
      trackedCues,
    }
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
    return this.motionState.getRandomMotionCue((id) => this.groups.get(id), this.defaultGroup)
  }

  /**
   * Resolve a specific motion program when manual selection is active.
   * Returns null if the group is not motion-enabled, the cue is disabled, or the id is unknown.
   */
  public getMotionCueImplementation(ref: MotionCueRef): INetCue | null {
    return resolveMotionCue(
      this.groups.get(ref.groupId),
      ref,
      (groupId) => this.motionState.getEnabledMotionGroups().includes(groupId),
      (groupId, cueId) => this.isMotionCueDisabled(groupId, cueId),
    )
  }

  /** Locate group/cue ids for a motion cue instance (for UI / IPC metadata). */
  public findMotionCueRef(cue: INetCue): MotionCueRef | null {
    return findMotionCueRefIn(this.groups.values(), cue)
  }

  public getMotionGroupsInfo(): MotionGroupInfo[] {
    return motionGroupsInfoFor(this.groups.values())
  }

  public getMotionCueDetails(groupId: string): MotionCueDetail[] {
    return motionCueDetailsFor(this.groups.get(groupId)?.motionCues, (cue) => ({
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
    this.motionState.setEnabledMotionGroups(groupIds, (id) => {
      return this.groups.has(id) && (this.groups.get(id)?.motionCues?.size ?? 0) > 0
    })
  }

  public getEnabledMotionGroups(): string[] {
    return this.motionState.getEnabledMotionGroups()
  }

  /** Group ids that have at least one YARG motion program registered. */
  public getRegisteredMotionGroupIds(): string[] {
    return this.motionState.getRegisteredMotionGroupIds(this.groups.values())
  }

  public enableMotionGroup(groupId: string): void {
    this.motionState.enableMotionGroup(groupId, (id) => {
      return this.groups.has(id) && (this.groups.get(id)?.motionCues?.size ?? 0) > 0
    })
  }
}
