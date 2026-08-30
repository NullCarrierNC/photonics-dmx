import { CueType } from '../types/cueTypes'
import { INetCue, CueStyle } from '../interfaces/INetCue'
import { CueGroupCatalog } from './CueGroupCatalog'
import { createLogger } from '../../../shared/logger'
import { monotonicNowMs } from '../../../shared/time'

const log = createLogger('CueSelectionPolicy')

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
 * one does not restart the other's counter. `limit` is reported with each cue-state update.
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
 * Where a resolved selection came from: 'stagekit' is an explicit priority override, 'locked' is
 * the once-per-song group, 'consistent' is the group pinned inside the consistency window,
 * 'random' is a fresh roll, and 'direct' is a caller-chosen group (simulation, RB3
 * preferredCueGroup).
 */
type SelectionSource = 'stagekit' | 'locked' | 'consistent' | 'random' | 'direct'

/** A validated selection ready to be recorded against a role. */
interface RoleSelection {
  cue: INetCue
  groupId: string
  isFallback: boolean
  source: SelectionSource
}

/** Snapshot of one role's last selection, for debug reporting. */
export interface RoleDebugInfo {
  name: string | null
  group: string | null
  counter: number
  isFallback: boolean
}

/** One consistency-tracked cue, as reported by getConsistencyStatus. */
export interface TrackedCueStatus {
  cueType: CueType
  lastExecutionTime: number
  lastGroupId: string
  timeSinceLastExecution: number
  isWithinWindow: boolean
}

/**
 * The lighting-cue selection policy behind CueRegistry: stage kit priority, the once-per-song
 * lock, the consistency window, random selection with default-group fallback, per-role counters
 * reported with each resolution, and the cue-state updates emitted to the frontend. Candidate
 * validation is answered by the injected catalog; this class owns every piece of mutable
 * selection state.
 */
export class CueSelectionPolicy {
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

  /** Current stage kit priority preference */
  private stageKitPriority: 'prefer-for-tracked' | 'random' | 'never' = 'prefer-for-tracked'

  /** Last cueType logged as missing, so a repeatedly-queried missing cue (e.g. an unregistered RB3
   *  slot at ~30 Hz) is logged once rather than every call. Cleared on a successful resolution. */
  private lastMissingCue: CueType | null = null

  /** Optional callback for sending cue state updates to frontend */
  private cueStateUpdateCallback: ((state: CueStateUpdate) => void) | null = null

  constructor(private readonly catalog: CueGroupCatalog) {}

  /** Set callback for sending cue state updates to frontend. */
  public setStateUpdateCallback(callback: (state: CueStateUpdate) => void): void {
    this.cueStateUpdateCallback = callback
  }

  /**
   * Reset every piece of selection state except the consistency window, which survives a registry
   * reset.
   */
  public reset(): void {
    resetCueRoleState(this.primaryRole)
    resetCueRoleState(this.secondaryRole)
    this.stageKitPriority = 'prefer-for-tracked'
    this.lockSelectionsForSong = false
    this.lockedGroupIdForSong = null
    this.lastMissingCue = null
    this.clearConsistencyTracking()
  }

  /**
   * Select a cue implementation for the given cue type.
   *
   * Priority order: the stage kit group when priority applies, then the once-per-song lock or the
   * consistency window, then a uniform random pick over active groups with the default group as
   * fallback.
   *
   * @param cueType The type of cue to get
   * @param trackMode The track mode ('tracked', 'autogen', or 'simulated')
   * @returns The cue implementation or null if not found
   */
  public selectCue(
    cueType: CueType,
    trackMode: 'tracked' | 'autogen' | 'simulated' = 'tracked',
  ): INetCue | null {
    // When trackMode='tracked' and stageKitPriority='prefer-for-tracked', prefer the stage kit
    // group. When trackMode='simulated', ignore stage kit priority to allow testing all groups.
    // This serves tracked cues from the stage kit group directly and does not engage the
    // once-per-song group lock: with a single group serving the whole song there is no group
    // switching to constrain.
    const stageKitGroupId = this.catalog.getStageKitGroupId()
    if (
      trackMode === 'tracked' &&
      this.stageKitPriority === 'prefer-for-tracked' &&
      stageKitGroupId &&
      this.catalog.isActive(stageKitGroupId)
    ) {
      const cue = this.catalog.cueFrom(stageKitGroupId, cueType)
      if (cue) {
        return this.recordRoleSelection(this.roleFor(cue), cueType, {
          cue,
          groupId: stageKitGroupId,
          isFallback: false,
          source: 'stagekit',
        })
      }
    }

    // The once-per-song lock (when seeded) labels the selection source for the whole song.
    const lockHolds = this.lockSelectionsForSong && this.lockedGroupIdForSong !== null

    // Check consistency first before getting a new random selection
    const consistentSelection = this.shouldUseConsistentSelection(cueType, trackMode === 'autogen')
    if (consistentSelection) {
      const cue = this.catalog.cueFrom(consistentSelection.groupId, cueType)
      if (cue) {
        return this.recordRoleSelection(this.roleFor(cue), cueType, {
          cue,
          groupId: consistentSelection.groupId,
          isFallback: consistentSelection.isFallback,
          source: lockHolds ? 'locked' : 'consistent',
        })
      }
    }

    // No consistent selection available, get a new random selection
    const selection = this.getRandomCueFromActiveGroups(cueType)
    if (!selection) {
      // Dedup consecutive identical misses: an always-active cue slot (RB3) with no cue registered
      // is queried ~30x/s, which would otherwise flood the log with the same error.
      if (this.lastMissingCue !== cueType) {
        log.error(`No implementation found for cue: ${cueType}`)
        this.lastMissingCue = cueType
      }
      return null
    }
    this.lastMissingCue = null

    const cue = this.catalog.cueFrom(selection.groupId, cueType)!

    if (this.lockSelectionsForSong && this.lockedGroupIdForSong === null) {
      this.lockedGroupIdForSong = selection.groupId
    }

    return this.recordRoleSelection(this.roleFor(cue), cueType, {
      cue,
      groupId: selection.groupId,
      isFallback: selection.isFallback,
      source: 'random',
    })
  }

  /**
   * Select from a specific group (deterministic, for simulation and callers that rotate groups
   * themselves, e.g. RB3 preferredCueGroup). Falls back to the default group when the requested
   * group cannot serve the cue. The resolution is recorded so counters, cue-state updates and
   * getCueState stay accurate.
   */
  public selectFromGroup(cueType: CueType, groupId: string): INetCue | null {
    const cue = this.catalog.cueFrom(groupId, cueType)
    if (cue) {
      return this.recordRoleSelection(this.roleFor(cue), cueType, {
        cue,
        groupId,
        isFallback: false,
        source: 'direct',
      })
    }

    const defaultGroupId = this.catalog.getDefaultGroupId()
    if (defaultGroupId) {
      const fallback = this.catalog.cueFrom(defaultGroupId, cueType)
      if (fallback) {
        return this.recordRoleSelection(this.roleFor(fallback), cueType, {
          cue: fallback,
          groupId: defaultGroupId,
          isFallback: true,
          source: 'direct',
        })
      }
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

  public getCueConsistencyWindow(): number {
    return this.cueConsistencyWindow
  }

  /** Set the cue group selection mode (once per song vs within a song). */
  public setCueGroupSelectionMode(mode: 'oncePerSong' | 'withinSong'): void {
    this.cueGroupSelectionMode = mode
    if (mode === 'withinSong') {
      this.lockSelectionsForSong = false
      this.lockedGroupIdForSong = null
    }
  }

  public getCueGroupSelectionMode(): 'oncePerSong' | 'withinSong' {
    return this.cueGroupSelectionMode
  }

  /**
   * Notify that a song has started (e.g. Menu -> Gameplay). When mode is oncePerSong, locks group
   * selection for the song.
   */
  public onSongStart(): void {
    if (this.cueGroupSelectionMode === 'oncePerSong') {
      this.clearConsistencyTracking()
      this.lockSelectionsForSong = true
      this.lockedGroupIdForSong = null
    }
  }

  /** Notify that the current song has ended (left Gameplay). Clears the once-per-song lock. */
  public onSongEnd(): void {
    this.lockSelectionsForSong = false
    this.lockedGroupIdForSong = null
  }

  /** Set the stage kit priority preference, clearing consistency so it takes immediate effect. */
  public setStageKitPriority(preference: 'prefer-for-tracked' | 'random' | 'never'): void {
    const oldPriority = this.stageKitPriority
    this.stageKitPriority = preference
    log.info(`Stage kit priority changed from '${oldPriority}' to '${preference}'`)
    this.clearConsistencyTracking()
  }

  public getStageKitPriority(): 'prefer-for-tracked' | 'random' | 'never' {
    return this.stageKitPriority
  }

  /** Clear all consistency tracking data. */
  public clearConsistencyTracking(): void {
    this.lastCueExecutionTime.clear()
    this.lastCueGroupSelection.clear()
  }

  /** Clear consistency tracking for a specific cue type. */
  public clearCueConsistencyTracking(cueType: CueType): void {
    this.lastCueExecutionTime.delete(cueType)
    this.lastCueGroupSelection.delete(cueType)
  }

  /** Clear consistency tracking for every cue pinned to the given group. */
  public clearGroupConsistencyTracking(groupId: string): void {
    for (const [cueType, selection] of this.lastCueGroupSelection.entries()) {
      if (selection.groupId === groupId) {
        this.lastCueExecutionTime.delete(cueType)
        this.lastCueGroupSelection.delete(cueType)
      }
    }
  }

  /** Reset the cue selection counters and last selected groups. */
  public resetRoleState(): void {
    resetCueRoleState(this.primaryRole)
    resetCueRoleState(this.secondaryRole)
  }

  /** Last-selection snapshots for both roles, for debug reporting. */
  public roleSnapshots(): { lastPrimaryCue: RoleDebugInfo; lastSecondaryCue: RoleDebugInfo } {
    const snapshot = (role: CueRoleState): RoleDebugInfo => ({
      name: role.lastCueName,
      group: role.lastCueGroup,
      counter: role.counter,
      isFallback: role.lastIsFallback,
    })
    return {
      lastPrimaryCue: snapshot(this.primaryRole),
      lastSecondaryCue: snapshot(this.secondaryRole),
    }
  }

  /**
   * Get the current state of a specific cue.
   * @returns The cue state or null if the cue cannot be resolved or was not the role's last cue
   */
  public getCueState(cueType: CueType): CueStateUpdate | null {
    // Check if this is a primary or secondary cue by getting a temporary implementation
    const tempSelection = this.getRandomCueFromActiveGroups(cueType)
    if (!tempSelection) {
      return null
    }

    const tempCue = this.catalog.cueFrom(tempSelection.groupId, cueType)!
    const role = this.roleFor(tempCue)
    if (role.lastCueName === cueType && role.lastCueGroup !== null) {
      return {
        cueType,
        groupId: role.lastCueGroup,
        isFallback: role.lastIsFallback,
        cueStyle: role.style,
        counter: role.counter,
        limit: role.limit,
      }
    }

    return null
  }

  /** The current consistency status for debugging and monitoring. */
  public getConsistencyStatus(): { windowMs: number; trackedCues: TrackedCueStatus[] } {
    const now = monotonicNowMs()
    const trackedCues: TrackedCueStatus[] = []

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

    return { windowMs: this.cueConsistencyWindow, trackedCues }
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
    const stageKitGroupId = this.catalog.getStageKitGroupId()
    if (
      !autoGen &&
      this.stageKitPriority === 'prefer-for-tracked' &&
      stageKitGroupId &&
      this.catalog.isActive(stageKitGroupId) &&
      this.catalog.cueFrom(stageKitGroupId, cueType) !== null
    ) {
      return null
    }

    const now = monotonicNowMs()
    const lastExecutionTime = this.lastCueExecutionTime.get(cueType)
    const lastSelection = this.lastCueGroupSelection.get(cueType)

    // Once-per-song lock: use the single locked group for all cues in the song
    if (this.lockSelectionsForSong && this.lockedGroupIdForSong !== null) {
      if (
        !this.catalog.hasGroup(this.lockedGroupIdForSong) ||
        !this.catalog.isActive(this.lockedGroupIdForSong)
      ) {
        this.lockedGroupIdForSong = null
        return null
      }
      if (this.catalog.cueFrom(this.lockedGroupIdForSong, cueType)) {
        this.lastCueExecutionTime.set(cueType, now)
        return { groupId: this.lockedGroupIdForSong, isFallback: false }
      }
      const defaultGroupId = this.catalog.getDefaultGroupId()
      if (defaultGroupId && this.catalog.cueFrom(defaultGroupId, cueType)) {
        this.lastCueExecutionTime.set(cueType, now)
        return { groupId: defaultGroupId, isFallback: true }
      }
      return null
    }

    // If we have a previous selection and it's within the consistency window, validate it's still available
    if (lastExecutionTime && lastSelection && now - lastExecutionTime < this.cueConsistencyWindow) {
      if (this.catalog.cueFrom(lastSelection.groupId, cueType)) {
        if (lastSelection.isFallback) {
          // For fallback groups, ensure no active group has picked up this cue in the meantime.
          // If one has, use that instead of the fallback.
          if (this.catalog.getActiveGroupsImplementing(cueType).length > 0) {
            this.clearCueConsistencyTracking(cueType)
            return null
          }
        } else {
          // Non-fallback: require the cached group to still be active (e.g. not toggled off in DMX preview)
          if (!this.catalog.isActive(lastSelection.groupId)) {
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

  /** Record the execution of a cue for consistency tracking. */
  private recordCueExecution(
    cueType: CueType,
    selection: { groupId: string; isFallback: boolean },
  ): void {
    const now = monotonicNowMs()
    this.lastCueExecutionTime.set(cueType, now)
    this.lastCueGroupSelection.set(cueType, selection)
  }

  /** The selection state for the role a cue belongs to. */
  private roleFor(cue: INetCue): CueRoleState {
    return cue.style === CueStyle.Primary ? this.primaryRole : this.secondaryRole
  }

  /**
   * Record a validated selection against its role and return the cue.
   *
   * This is the single accounting point for every resolution: the counter restarts whenever the
   * cue type or source group changes and increments otherwise, the last-cue fields always reflect
   * the selection just made (so getCueState and roleSnapshots answer from live data), the state
   * update is emitted to the frontend, and the selection is recorded for consistency tracking.
   */
  private recordRoleSelection(
    role: CueRoleState,
    cueType: CueType,
    selection: RoleSelection,
  ): INetCue {
    const isNewCue = role.lastCueName !== cueType
    const groupChanged = role.lastCueGroup !== selection.groupId
    role.counter = isNewCue || groupChanged ? 1 : role.counter + 1
    role.lastCueName = cueType
    role.lastCueGroup = selection.groupId
    role.lastIsFallback = selection.isFallback

    if (this.cueStateUpdateCallback) {
      this.cueStateUpdateCallback({
        cueType,
        groupId: selection.groupId,
        isFallback: selection.isFallback,
        cueStyle: role.style,
        counter: role.counter,
        limit: role.limit,
      })
    }

    this.recordCueExecution(cueType, {
      groupId: selection.groupId,
      isFallback: selection.isFallback,
    })

    return selection.cue
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
    const availableGroups = this.catalog.getActiveGroupsImplementing(cueType)

    if (availableGroups.length > 0) {
      const randomIndex = Math.floor(Math.random() * availableGroups.length)
      return { groupId: availableGroups[randomIndex], isFallback: false }
    }

    // Step 4: No active groups have it, try default as fallback (regardless of whether it's active)
    const defaultGroupId = this.catalog.getDefaultGroupId()
    if (defaultGroupId && this.catalog.cueFrom(defaultGroupId, cueType)) {
      return { groupId: defaultGroupId, isFallback: true }
    }

    return null
  }
}
