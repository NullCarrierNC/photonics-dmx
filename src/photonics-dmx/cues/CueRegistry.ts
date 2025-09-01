import { CueType } from './cueTypes';
import { ICueGroup } from './interfaces/ICueGroup';
import { ICue, CueStyle } from './interfaces/ICue';

/**
 * Interface for cue state updates sent to frontend
 */
export interface CueStateUpdate {
  cueType: string;
  groupId: string;
  isFallback: boolean;
  cueStyle: 'primary' | 'secondary';
  counter: number;
  limit: number;
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
  private static instance: CueRegistry;

  /** Map of all registered cue groups by their name */
  private groups: Map<string, ICueGroup> = new Map();

  /** Set of groups that are enabled in user preferences */
  private enabledGroups: Set<string> = new Set();

  /** Set of groups that are currently active during gameplay */
  private activeGroups: Set<string> = new Set();

  /** Name of the default group that provides fallback implementations */
  private defaultGroup: string | null = null;

  /** Name of the stage kit group for special stage kit handling */
  private stageKitGroup: string | null = null;

  /** Current stage kit priority preference */
  private stageKitPriority: 'prefer-for-tracked' | 'random' | 'never' = 'prefer-for-tracked';

  /** Track last called primary cue and its source group */
  private lastPrimaryCueName: string | null = null;
  private lastPrimaryCueGroup: string | null = null;
  private lastPrimaryIsFallback: boolean = false;

  /** Track last called secondary cue and its source group */
  private lastSecondaryCueName: string | null = null;
  private lastSecondaryCueGroup: string | null = null;
  private lastSecondaryIsFallback: boolean = false;

  /** Counter for consecutive calls to the same primary cue */
  private primaryCueCounter: number = 0;
  private primaryCueLimit: number = 100;

  /** Counter for consecutive calls to the same secondary cue */
  private secondaryCueCounter: number = 0;
  private secondaryCueLimit: number = 50;

  /** Cue consistency throttling to prevent rapid randomization changes */
  private cueConsistencyWindow: number = 2000; // 2 seconds in milliseconds
  private lastCueExecutionTime: Map<CueType, number> = new Map();
  private lastCueGroupSelection: Map<CueType, { groupId: string; isFallback: boolean }> = new Map();

  /** Optional callback for sending cue state updates to frontend */
  private cueStateUpdateCallback: ((state: CueStateUpdate) => void) | null = null;

  private constructor() { }

  /**
   * Set callback for sending cue state updates to frontend
   * @param callback Function to call when cue state changes
   */
  public setCueStateUpdateCallback(callback: (state: CueStateUpdate) => void): void {
    this.cueStateUpdateCallback = callback;
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
    limit: number
  ): void {
    if (this.cueStateUpdateCallback) {
      this.cueStateUpdateCallback({
        cueType,
        groupId,
        isFallback,
        cueStyle,
        counter,
        limit
      });
    }
  }

  /**
   * Reset the registry to its initial state.
   */
  public reset(): void {
    this.enabledGroups.clear();
    this.activeGroups.clear();
    this.defaultGroup = null;
    this.stageKitGroup = null;
    this.stageKitPriority = 'prefer-for-tracked';
    this.lastPrimaryCueName = null;
    this.lastPrimaryCueGroup = null;
    this.lastPrimaryIsFallback = false;
    this.lastSecondaryCueName = null;
    this.lastSecondaryCueGroup = null;
    this.lastSecondaryIsFallback = false;
    this.primaryCueCounter = 0;
    this.secondaryCueCounter = 0;
    
    // Clear consistency tracking
    this.clearConsistencyTracking();
    
    console.log('CueRegistry reset to initial state');
  }

  /**
   * Get the singleton instance of the CueRegistry
   * @returns The CueRegistry instance
   */
  public static getInstance(): CueRegistry {
    if (!CueRegistry.instance) {
      CueRegistry.instance = new CueRegistry();
    }
    return CueRegistry.instance;
  }

  /**
   * Register a new group of cue implementations.
   * @param group The group to register
   */
  public registerGroup(group: ICueGroup): void {
    this.groups.set(group.id, group);

    // Add to enabled groups by default
    this.enabledGroups.add(group.id);
    // Add to active groups by default (all enabled groups are active by default)
    this.activeGroups.add(group.id);
  }

  /**
   * Set the default group.
   * @param groupName The name of the group to set as default
   * @throws Error if the group doesn't exist
   */
  public setDefaultGroup(groupId: string): void {
    // Verify that the group exists before setting it as default
    if (!this.groups.has(groupId)) {
      throw new Error(`Cannot set default group: group '${groupId}' not found`);
    }

    // Set it as the new default group
    this.defaultGroup = groupId;
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
   * Stage Kit Priority: When autoGen is false and stageKitPriority is 'prefer-for-tracked',
   * the stageKitGroup will be preferred over random selection.
   * @param cueType The type of cue to get
   * @param autoGen Whether the song is auto-generated (affects stage kit priority)
   * @returns The cue implementation or null if not found
   */
  public getCueImplementation(cueType: CueType, autoGen: boolean = false): ICue | null {
    // Check if we should prefer stage kit group based on priority and autoGen state
    // When autoGen=false (tracked lighting data), prefer stage kit group if priority is set
    if (!autoGen && this.stageKitPriority === 'prefer-for-tracked' && this.stageKitGroup) {
      const stageKitGroup = this.groups.get(this.stageKitGroup);
      if (stageKitGroup?.cues.has(cueType)) {
        // Stage kit group has this cue and should be preferred
        const cue = stageKitGroup.cues.get(cueType)!;
        if (cue.style === CueStyle.Primary) {
          return this.handlePrimaryCue(cueType, { groupId: this.stageKitGroup, isFallback: false }, autoGen);
        } else {
          return this.handleSecondaryCue(cueType, { groupId: this.stageKitGroup, isFallback: false }, autoGen);
        }
      }
    }

    // Check consistency first before getting a new random selection
    const consistentSelection = this.shouldUseConsistentSelection(cueType, autoGen);
    if (consistentSelection) {
      // Use the consistent selection
      const group = this.groups.get(consistentSelection.groupId);
      const cue = group?.cues.get(cueType);
      if (group && cue) {
        if (cue.style === CueStyle.Primary) {
          return this.handlePrimaryCue(cueType, consistentSelection, autoGen);
        } else {
          return this.handleSecondaryCue(cueType, consistentSelection, autoGen);
        }
      }
    }

    // No consistent selection available, get a new random selection
    const tempSelection = this.getRandomCueFromActiveGroups(cueType);
    if (!tempSelection) {
      console.error(`No implementation found for cue: ${cueType}`);
      return null;
    }

    const tempCue = this.groups.get(tempSelection.groupId)!.cues.get(cueType)!;
    if (tempCue.style === CueStyle.Primary) {
      return this.handlePrimaryCue(cueType, tempSelection, autoGen);
    } else {
      return this.handleSecondaryCue(cueType, tempSelection, autoGen);
    }
  }

  /**
   * Set the cue consistency window to prevent rapid randomization changes.
   * @param windowMs The consistency window in milliseconds (default: 2000ms)
   */
  public setCueConsistencyWindow(windowMs: number): void {
    this.cueConsistencyWindow = Math.max(0, windowMs);
    console.log(`Cue consistency window set to ${this.cueConsistencyWindow}ms`);
  }

  /**
   * Get the current cue consistency window setting.
   * @returns The consistency window in milliseconds
   */
  public getCueConsistencyWindow(): number {
    return this.cueConsistencyWindow;
  }

  /**
   * Check if a cue should use consistent group selection based on the consistency window.
   * @param cueType The type of cue to check
   * @param autoGen Whether the song is auto-generated (affects stage kit priority)
   * @returns Object with group ID and fallback flag if consistency should be maintained, null otherwise
   */
  private shouldUseConsistentSelection(cueType: CueType, autoGen: boolean = false): { groupId: string; isFallback: boolean } | null {
    // If stage kit priority should be used, don't use consistency tracking
    // When autoGen=false (tracked lighting data), prefer stage kit group if priority is set
    if (!autoGen && this.stageKitPriority === 'prefer-for-tracked' && this.stageKitGroup) {
      const stageKitGroup = this.groups.get(this.stageKitGroup);
      if (stageKitGroup?.cues.has(cueType)) {
        return null;
      }
    }

    const now = Date.now();
    const lastExecutionTime = this.lastCueExecutionTime.get(cueType);
    const lastSelection = this.lastCueGroupSelection.get(cueType);

  //  console.log(`[Consistency] Checking ${cueType}: lastExecution=${lastExecutionTime}, lastSelection=${lastSelection ? lastSelection.groupId : 'none'}, window=${this.cueConsistencyWindow}ms`);

    // If we have a previous selection and it's within the consistency window, validate it's still available
    if (lastExecutionTime && lastSelection && (now - lastExecutionTime) < this.cueConsistencyWindow) {
      // Validate that the group still exists and has the cue implementation
      const group = this.groups.get(lastSelection.groupId);
      if (group && group.cues.has(cueType)) {
        // Check if this is a fallback group - if so, ensure it's still valid as fallback
        if (lastSelection.isFallback) {
                  // For fallback groups, we need to ensure no active groups have this cue
        // If an active group now has it, we should use that instead
        const activeGroupHasCue = Array.from(this.activeGroups).some(groupId => {
          const activeGroup = this.groups.get(groupId);
          return activeGroup?.cues.has(cueType);
        });
        
        if (activeGroupHasCue) {
          // An active group now has this cue, so we shouldn't use the fallback
    //      console.log(`[Consistency] Active group now has ${cueType}, clearing fallback consistency`);
          this.clearCueConsistencyTracking(cueType);
          return null;
        } else {
          // No active group has this cue, so the fallback is still valid
     //     console.log(`[Consistency] No active group has ${cueType}, fallback is still valid`);
        }
        }
        
      //  console.log(`[Consistency] Using consistent selection for ${cueType} (${now - lastExecutionTime}ms since last execution)`);
        // Update the execution time to prevent infinite loops
        this.lastCueExecutionTime.set(cueType, now);
        return lastSelection;
      } else {
        // The group or cue is no longer available, clear the tracking
    //    console.log(`[Consistency] Group ${lastSelection.groupId} no longer available for ${cueType}, clearing tracking`);
        this.clearCueConsistencyTracking(cueType);
        return null;
      }
    }

    return null;
  }

  /**
   * Record the execution of a cue for consistency tracking.
   * @param cueType The type of cue that was executed
   * @param selection The group selection that was used
   */
  private recordCueExecution(cueType: CueType, selection: { groupId: string; isFallback: boolean }): void {
    const now = Date.now();
    this.lastCueExecutionTime.set(cueType, now);
    this.lastCueGroupSelection.set(cueType, selection);
  //  console.log(`[Consistency] Recorded execution of ${cueType} with group ${selection.groupId} at ${now}`);
  }

  /**
   * Handle primary cue selection logic.
   * @param cueType The type of cue to get
   * @param preSelection Optional pre-selected group to avoid redundant selection
   * @param autoGen Whether the song is auto-generated (affects stage kit priority)
   * @returns The cue implementation or null if not found
   */
  private handlePrimaryCue(cueType: CueType, preSelection?: { groupId: string; isFallback: boolean }, autoGen: boolean = false): ICue | null {
    // If we have a pre-selection, use it directly
    if (preSelection) {
      const group = this.groups.get(preSelection.groupId);
      const cue = group?.cues.get(cueType);
      
      if (group && cue) {
        // Use the pre-selection and increment counter
        this.primaryCueCounter++;
        this.emitCueStateUpdate(cueType, preSelection.groupId, preSelection.isFallback, 'primary', this.primaryCueCounter, this.primaryCueLimit);
        
        // Record this execution for consistency tracking
        this.recordCueExecution(cueType, preSelection);
        
        return cue;
      }
    }

    // Check consistency throttling if no pre-selection
    const consistentSelection = this.shouldUseConsistentSelection(cueType, autoGen);
    if (consistentSelection) {
      // Double-check that the group and cue are still available before using
      const group = this.groups.get(consistentSelection.groupId);
      const cue = group?.cues.get(cueType);
      
      if (group && cue) {
        // Use the consistent selection and increment counter
        this.primaryCueCounter++;
        this.emitCueStateUpdate(cueType, consistentSelection.groupId, consistentSelection.isFallback, 'primary', this.primaryCueCounter, this.primaryCueLimit);
        return cue;
      } else {
        // Something went wrong with the consistent selection, clear it and fall through to normal logic
        console.warn(`[Consistency] Consistent selection validation failed for ${cueType}, falling back to normal selection`);
        this.clearCueConsistencyTracking(cueType);
      }
    }

    const isNewCue = this.lastPrimaryCueName !== cueType;
    const shouldReset = this.primaryCueCounter >= this.primaryCueLimit;

    if (isNewCue || shouldReset) {
      // Reset counter and select new implementation
      this.primaryCueCounter = 0;
      const selection = preSelection || this.getRandomCueFromActiveGroups(cueType);

      if (selection) {
        this.lastPrimaryCueName = cueType;
        this.lastPrimaryCueGroup = selection.groupId;
        this.lastPrimaryIsFallback = selection.isFallback;
        this.primaryCueCounter++;
        
        // Record this execution for consistency tracking
        this.recordCueExecution(cueType, selection);
        
        this.emitCueStateUpdate(cueType, selection.groupId, this.lastPrimaryIsFallback, 'primary', this.primaryCueCounter, this.primaryCueLimit);
        return this.groups.get(selection.groupId)!.cues.get(cueType)!;
      }
    } else {
      // Use same group as last time
      this.primaryCueCounter++;
      if (this.lastPrimaryCueGroup && this.groups.get(this.lastPrimaryCueGroup)?.cues.has(cueType)) {
        this.emitCueStateUpdate(cueType, this.lastPrimaryCueGroup, this.lastPrimaryIsFallback, 'primary', this.primaryCueCounter, this.primaryCueLimit);
        return this.groups.get(this.lastPrimaryCueGroup)!.cues.get(cueType)!;
      }
    }
    
    return null;
  }

  /**
   * Handle secondary cue selection logic.
   * @param cueType The type of cue to get
   * @param preSelection Optional pre-selected group to avoid redundant selection
   * @param autoGen Whether the song is auto-generated (affects stage kit priority)
   * @returns The cue implementation or null if not found
   */
  private handleSecondaryCue(cueType: CueType, preSelection?: { groupId: string; isFallback: boolean }, autoGen: boolean = false): ICue | null {
    // If we have a pre-selection (from stage kit priority), use it directly and bypass consistency
    if (preSelection) {
      const group = this.groups.get(preSelection.groupId);
      const cue = group?.cues.get(cueType);
      
      if (group && cue) {
        // Use the pre-selection and increment counter
        this.secondaryCueCounter++;
        this.emitCueStateUpdate(cueType, preSelection.groupId, preSelection.isFallback, 'secondary', this.secondaryCueCounter, this.secondaryCueLimit);
        
        // Record this execution for consistency tracking
        this.recordCueExecution(cueType, preSelection);
        
        return cue;
      }
    }

    // Check consistency throttling if no pre-selection
    const consistentSelection = this.shouldUseConsistentSelection(cueType, autoGen);
    if (consistentSelection) {
      // Double-check that the group and cue are still available before using
      const group = this.groups.get(consistentSelection.groupId);
      const cue = group?.cues.get(cueType);
      
      if (group && cue) {
        // Use the consistent selection and increment counter
        this.secondaryCueCounter++;
        this.emitCueStateUpdate(cueType, consistentSelection.groupId, consistentSelection.isFallback, 'secondary', this.secondaryCueCounter, this.secondaryCueLimit);
        return cue;
      } else {
        // Something went wrong with the consistent selection, clear it and fall through to normal logic
        console.warn(`[Consistency] Consistent selection validation failed for ${cueType}, falling back to normal selection`);
        this.clearCueConsistencyTracking(cueType);
      }
    }

    const isNewCue = this.lastSecondaryCueName !== cueType;
    const shouldReset = this.secondaryCueCounter >= this.secondaryCueLimit;

    if (isNewCue || shouldReset) {
      // Reset counter and select new implementation
      this.secondaryCueCounter = 0;
      const selection = preSelection || this.getRandomCueFromActiveGroups(cueType);

      if (selection) {
        this.lastSecondaryCueName = cueType;
        this.lastSecondaryCueGroup = selection.groupId;
        this.lastSecondaryIsFallback = selection.isFallback;
        this.secondaryCueCounter++;
        
        // Record this execution for consistency tracking
        this.recordCueExecution(cueType, selection);
        
        this.emitCueStateUpdate(cueType, selection.groupId, this.lastSecondaryIsFallback, 'secondary', this.secondaryCueCounter, this.secondaryCueLimit);
        return this.groups.get(selection.groupId)!.cues.get(cueType)!;
      }
    } else {
      // Use same group as last time
      this.secondaryCueCounter++;
      if (this.lastSecondaryCueGroup && this.groups.get(this.lastSecondaryCueGroup)?.cues.has(cueType)) {
        this.emitCueStateUpdate(cueType, this.lastSecondaryCueGroup, this.lastSecondaryIsFallback, 'secondary', this.secondaryCueCounter, this.secondaryCueLimit);
        return this.groups.get(this.lastSecondaryCueGroup)!.cues.get(cueType)!;
      }
    }
    
    return null;
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
  private getRandomCueFromActiveGroups(cueType: CueType): { groupId: string; isFallback: boolean } | null {
    // Step 1 & 2: Get all active groups that have this cue (including default if active)
    const availableGroups: string[] = [];

    for (const groupId of this.activeGroups) {
      const group = this.groups.get(groupId);
      if (group?.cues.has(cueType)) {
        availableGroups.push(groupId);
      }
    }

    // If we found active groups with the cue, randomly select one
    if (availableGroups.length > 0) {
      const randomIndex = Math.floor(Math.random() * availableGroups.length);
      const selectedGroup = availableGroups[randomIndex];
      return {
        groupId: selectedGroup,
        isFallback: false
      };
    }

    // Step 4: No active groups have it, try default as fallback (regardless of whether it's active)
    if (this.defaultGroup && this.groups.get(this.defaultGroup)?.cues.has(cueType)) {
      return {
        groupId: this.defaultGroup,
        isFallback: true
      };
    }

    return null;
  }

  /**
   * Enable a single group by adding it to the enabled groups.
   * If the group was not previously enabled, it will also be activated.
   * @param groupId The ID of the group to enable
   * @returns True if the group was enabled, false otherwise
   */
  public enableGroup(groupId: string): boolean {
    if (this.groups.has(groupId)) {
      const wasEnabled = this.enabledGroups.has(groupId);
      this.enabledGroups.add(groupId);

      // If it wasn't enabled before, activate it by default
      if (!wasEnabled) {
        this.activeGroups.add(groupId);
      }

      return true;
    }
    return false;
  }

  /**
   * Disable a single group by removing it from the enabled groups.
   * This will also deactivate the group if it was active.
   * @param groupId The ID of the group to disable
   * @returns True if the group was disabled, false otherwise
   */
  public disableGroup(groupId: string): boolean {
    if (this.enabledGroups.has(groupId)) {
      this.enabledGroups.delete(groupId);
      // Also deactivate the group if it was active
      if (this.activeGroups.has(groupId)) {
        this.activeGroups.delete(groupId);
      }
      
      // Clear any consistency tracking for this group
      this.clearGroupConsistencyTracking(groupId);
      
      return true;
    }
    return false;
  }

  /**
   * Activate a single group by adding it to the active groups.
   * Only enabled groups can be activated.
   * @param groupId The ID of the group to activate
   * @returns True if the group was activated, false otherwise
   */
  public activateGroup(groupId: string): boolean {
    if (this.groups.has(groupId) && this.enabledGroups.has(groupId)) {
      this.activeGroups.add(groupId);
      return true;
    }
    return false;
  }

  /**
   * Deactivate a single group by removing it from the active groups.
   * @param groupId The ID of the group to deactivate
   * @returns True if the group was deactivated, false otherwise
   */
  public deactivateGroup(groupId: string): boolean {
    if (this.activeGroups.has(groupId)) {
      this.activeGroups.delete(groupId);
      return true;
    }
    return false;
  }

  /**
   * Set which groups are enabled.
   * All newly enabled groups will also be activated by default.
   * @param groupIds The IDs of the groups to enable
   */
  public setEnabledGroups(groupIds: string[]): void {
    this.enabledGroups.clear();
    this.activeGroups.clear();

    for (const id of groupIds) {
      if (this.groups.has(id)) {
        this.enabledGroups.add(id);
        // All enabled groups are active by default
        this.activeGroups.add(id);
      }
    }
  }

  /**
   * Set the active groups for cue selection.
   * @param groupIds Array of group IDs to set as active
   */
  public setActiveGroups(groupIds: string[]): void {
    // Clear consistency tracking when active groups change
    this.clearConsistencyTracking();
    
    this.activeGroups.clear();
    for (const groupId of groupIds) {
      if (this.enabledGroups.has(groupId)) {
        this.activeGroups.add(groupId);
      } else {
        console.warn(`Cannot activate group '${groupId}': group not enabled`);
      }
    }
  //  console.log(`Active groups set to: ${Array.from(this.activeGroups)}`);
  }

  /**
   * Clear all consistency tracking data.
   * This should be called when active groups change or when a reset is needed.
   */
  public clearConsistencyTracking(): void {
    this.lastCueExecutionTime.clear();
    this.lastCueGroupSelection.clear();
  //  console.log('[Consistency] Cleared all consistency tracking data');
  }

  /**
   * Clear consistency tracking for a specific cue type.
   * @param cueType The type of cue to clear tracking for
   */
  public clearCueConsistencyTracking(cueType: CueType): void {
    this.lastCueExecutionTime.delete(cueType);
    this.lastCueGroupSelection.delete(cueType);
  //  console.log(`[Consistency] Cleared tracking for cue: ${cueType}`);
  }

  /**
   * Clear consistency tracking for a specific group.
   * This should be called when a group is disabled or removed.
   * @param groupId The ID of the group to clear tracking for
   */
  public clearGroupConsistencyTracking(groupId: string): void {
    let clearedCount = 0;
    
    // Find all cues that were tracked for this group and clear them
    for (const [cueType, selection] of this.lastCueGroupSelection.entries()) {
      if (selection.groupId === groupId) {
        this.lastCueExecutionTime.delete(cueType);
        this.lastCueGroupSelection.delete(cueType);
        clearedCount++;
      }
    }
    
    
  }

  /**
   * Get all registered group IDs, regardless of whether they're enabled or active.
   * @returns Array of all registered group IDs
   */
  public getAllGroups(): string[] {
    return Array.from(this.groups.keys());
  }

  /**
   * Get the currently enabled group IDs.
   * @returns Array of enabled group IDs
   */
  public getEnabledGroups(): string[] {
    return Array.from(this.enabledGroups);
  }

  /**
   * Get the currently active group IDs.
   * @returns Array of active group IDs
   */
  public getActiveGroups(): string[] {
    return Array.from(this.activeGroups);
  }

  /**
   * Get the ID of the default group.
   * @returns The default group ID or null if no default group is set
   */
  public getDefaultGroupId(): string | null {
    return this.defaultGroup;
  }

  /**
   * Get the ID of the stage kit group.
   * @returns The stage kit group ID or null if no stage kit group is set
   */
  public getStageKitGroupId(): string | null {
    return this.stageKitGroup;
  }

  /**
   * Set the stage kit group.
   * @param groupId The ID of the group to set as the stage kit group
   * @throws Error if the group doesn't exist
   */
  public setStageKitGroup(groupId: string): void {
    if (!this.groups.has(groupId)) {
      throw new Error(`Cannot set stage kit group: group '${groupId}' not found`);
    }
    this.stageKitGroup = groupId;
  }

  /**
   * Set the stage kit priority preference.
   * @param preference 'prefer-for-tracked', 'random', or 'never'
   */
  public setStageKitPriority(preference: 'prefer-for-tracked' | 'random' | 'never'): void {
    this.stageKitPriority = preference;
    console.log(`Stage kit priority set to: ${preference}`);
  }

  /**
   * Get the current stage kit priority preference.
   * @returns The current stage kit priority preference
   */
  public getStageKitPriority(): 'prefer-for-tracked' | 'random' | 'never' {
    return this.stageKitPriority;
  }

  /**
   * Get a specific group by ID, regardless of whether it's enabled or active.
   * @param groupId The ID of the group to get
   * @returns The group or undefined if not found
   */
  public getGroup(groupId: string): ICueGroup | undefined {
    return this.groups.get(groupId);
  }

  /**
   * Get debugging information about the current cue selection state.
   * @returns Object containing current selection state
   */
  public getDebugInfo(): {
    lastPrimaryCue: { name: string | null; group: string | null; counter: number; isFallback: boolean };
    lastSecondaryCue: { name: string | null; group: string | null; counter: number; isFallback: boolean };
    activeGroups: string[];
    enabledGroups: string[];
    defaultGroup: string | null;
    stageKitGroup: string | null;
    stageKitPriority: 'prefer-for-tracked' | 'random' | 'never';
  } {
    return {
      lastPrimaryCue: {
        name: this.lastPrimaryCueName,
        group: this.lastPrimaryCueGroup,
        counter: this.primaryCueCounter,
        isFallback: this.lastPrimaryIsFallback
      },
      lastSecondaryCue: {
        name: this.lastSecondaryCueName,
        group: this.lastSecondaryCueGroup,
        counter: this.secondaryCueCounter,
        isFallback: this.lastSecondaryIsFallback
      },
      activeGroups: Array.from(this.activeGroups),
      enabledGroups: Array.from(this.enabledGroups),
      defaultGroup: this.defaultGroup,
      stageKitGroup: this.stageKitGroup,
      stageKitPriority: this.stageKitPriority
    };
  }

  /**
   * Reset the cue selection counters and last selected groups.
   */
  public resetCueSelectionState(): void {
    this.lastPrimaryCueName = null;
    this.lastPrimaryCueGroup = null;
    this.lastPrimaryIsFallback = false;
    this.lastSecondaryCueName = null;
    this.lastSecondaryCueGroup = null;
    this.lastSecondaryIsFallback = false;
    this.primaryCueCounter = 0;
    this.secondaryCueCounter = 0;
  }

  /**
   * Get information about which groups have implementations for a specific cue type.
   * @param cueType The cue type to check
   * @returns Object with group information
   */
  public getCueAvailability(cueType: CueType): {
    activeGroupsWithCue: string[];
    allGroupsWithCue: string[];
    defaultHasCue: boolean;
  } {
    const activeGroupsWithCue: string[] = [];
    const allGroupsWithCue: string[] = [];

    for (const [groupId, group] of this.groups) {
      if (group.cues.has(cueType)) {
        allGroupsWithCue.push(groupId);
        if (this.activeGroups.has(groupId)) {
          activeGroupsWithCue.push(groupId);
        }
      }
    }

    const defaultHasCue = this.defaultGroup ?
      (this.groups.get(this.defaultGroup)?.cues.has(cueType) ?? false) :
      false;

    return {
      activeGroupsWithCue,
      allGroupsWithCue,
      defaultHasCue
    };
  }

  /**
   * Get the current state of a specific cue.
   * @param cueType The type of cue to get state for
   * @returns The cue state or null if not found
   */
  public getCueState(cueType: CueType): CueStateUpdate | null {
    // Check if this is a primary or secondary cue by getting a temporary implementation
    const tempSelection = this.getRandomCueFromActiveGroups(cueType);
    if (!tempSelection) {
      return null;
    }

    const tempCue = this.groups.get(tempSelection.groupId)!.cues.get(cueType)!;
    const isPrimary = tempCue.style === CueStyle.Primary;

    if (isPrimary) {
      if (this.lastPrimaryCueName === cueType) {
        return {
          cueType,
          groupId: this.lastPrimaryCueGroup!,
          isFallback: this.lastPrimaryIsFallback,
          cueStyle: 'primary',
          counter: this.primaryCueCounter,
          limit: this.primaryCueLimit
        };
      }
    } else {
      if (this.lastSecondaryCueName === cueType) {
        return {
          cueType,
          groupId: this.lastSecondaryCueGroup!,
          isFallback: this.lastSecondaryIsFallback,
          cueStyle: 'secondary',
          counter: this.secondaryCueCounter,
          limit: this.secondaryCueLimit
        };
      }
    }

    return null;
  }

  /**
   * Get the current consistency status for debugging and monitoring.
   * @returns Object containing consistency tracking information
   */
  public getConsistencyStatus(): {
    windowMs: number;
    trackedCues: Array<{
      cueType: CueType;
      lastExecutionTime: number;
      lastGroupId: string;
      timeSinceLastExecution: number;
      isWithinWindow: boolean;
    }>;
  } {
    const now = Date.now();
    const trackedCues: Array<{
      cueType: CueType;
      lastExecutionTime: number;
      lastGroupId: string;
      timeSinceLastExecution: number;
      isWithinWindow: boolean;
    }> = [];

    for (const [cueType, executionTime] of this.lastCueExecutionTime.entries()) {
      const lastSelection = this.lastCueGroupSelection.get(cueType);
      if (lastSelection) {
        const timeSinceLastExecution = now - executionTime;
        trackedCues.push({
          cueType,
          lastExecutionTime: executionTime,
          lastGroupId: lastSelection.groupId,
          timeSinceLastExecution,
          isWithinWindow: timeSinceLastExecution < this.cueConsistencyWindow,
        });
      }
    }

    return {
      windowMs: this.cueConsistencyWindow,
      trackedCues,
    };
  }
} 