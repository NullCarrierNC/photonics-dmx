import {  CueType } from './cueTypes';
import { ICueGroup } from './interfaces/ICueGroup';
import { ICue, CueStyle } from './interfaces/ICue';

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

  /** Track last called primary cue and its source group */
  private lastPrimaryCueName: string | null = null;
  private lastPrimaryCueGroup: string | null = null;
  
  /** Track last called secondary cue and its source group */
  private lastSecondaryCueName: string | null = null;
  private lastSecondaryCueGroup: string | null = null;
  
  /** Counter for consecutive calls to the same primary cue */
  private primaryCueCounter: number = 0;
  
  private primaryCueLimit: number = 100;

  /** Counter for consecutive calls to the same secondary cue */
  private secondaryCueCounter: number = 0;

  private secondaryCueLimit: number = 50;

  private constructor() {}

  /**
   * Reset the registry by clearing all groups.
   * This should be called when switching between different cue sets (e.g. YARG to RB3).
   */
  public reset(): void {
    this.groups.clear();
    this.enabledGroups.clear();
    this.activeGroups.clear();
    this.defaultGroup = null;
    
    // Reset cue tracking state
    this.lastPrimaryCueName = null;
    this.lastPrimaryCueGroup = null;
    this.lastSecondaryCueName = null;
    this.lastSecondaryCueGroup = null;
    this.primaryCueCounter = 0;
    this.secondaryCueCounter = 0;
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
    this.groups.set(group.name, group);
    
    // Add to enabled groups by default
    this.enabledGroups.add(group.name);
    // Add to active groups by default (all enabled groups are active by default)
    this.activeGroups.add(group.name);
  }

  /**
   * Set the default group.
   * @param groupName The name of the group to set as default
   * @returns Boolean indicating if the operation was successful
   * @throws Error if the group doesn't exist
   */
  public setDefaultGroup(groupName: string): boolean {
    // Verify that the group exists before setting it as default
    if (!this.groups.has(groupName)) {
      throw new Error(`Cannot set default group: group '${groupName}' not found`);
    }
    
    // Set it as the new default group
    this.defaultGroup = groupName;
    
    return true;
  }

  /**
   * Get a cue implementation with randomized selection for new cues.
   * For the first call to a primary/secondary cue (or after counter resets),
   * randomly selects from available groups. Subsequent calls use the same group.
   * @param cueType The type of cue to get
   * @returns The cue implementation or null if not found
   */
  public getCueImplementation(cueType: CueType): ICue | null {
    // First, get any implementation to check the style
    const tempCue = this.getAnyCueImplementation(cueType);
    if (!tempCue) {
      console.error(`No implementation found for cue: ${cueType}`);
      return null;
    }
    
    const isPrimary = tempCue.style === CueStyle.Primary;
    const isSecondary = tempCue.style === CueStyle.Secondary;
    
    if (isPrimary) {
      return this.handlePrimaryCue(cueType);
    } else if (isSecondary) {
      return this.handleSecondaryCue(cueType);
    }
    
    // Fallback to default behavior for unknown styles
    return this.getFallbackImplementation(cueType);
  }

  /**
   * Handle primary cue selection logic.
   * @param cueType The type of cue to get
   * @returns The cue implementation or null if not found
   */
  private handlePrimaryCue(cueType: CueType): ICue | null {
    const isNewCue = this.lastPrimaryCueName !== cueType;
    const shouldReset = this.primaryCueCounter >= this.primaryCueLimit;
    
    if (isNewCue || shouldReset) {
      // Reset counter and select new implementation
      this.primaryCueCounter = 0;
      const selectedGroup = this.selectRandomGroupWithCue(cueType);
      
      if (selectedGroup) {
        this.lastPrimaryCueName = cueType;
        this.lastPrimaryCueGroup = selectedGroup;
        this.primaryCueCounter++;
        return this.groups.get(selectedGroup)!.cues.get(cueType)!;
      }
    } else {
      // Use same group as last time
      this.primaryCueCounter++;
      if (this.lastPrimaryCueGroup && this.groups.get(this.lastPrimaryCueGroup)?.cues.has(cueType)) {
        return this.groups.get(this.lastPrimaryCueGroup)!.cues.get(cueType)!;
      }
    }
    
    // Fallback if previous logic failed
    return this.getFallbackImplementation(cueType);
  }

  /**
   * Handle secondary cue selection logic.
   * @param cueType The type of cue to get
   * @returns The cue implementation or null if not found
   */
  private handleSecondaryCue(cueType: CueType): ICue | null {
    const isNewCue = this.lastSecondaryCueName !== cueType;
    const shouldReset = this.secondaryCueCounter >= this.secondaryCueLimit;
    
    if (isNewCue || shouldReset) {
      // Reset counter and select new implementation
      this.secondaryCueCounter = 0;
      const selectedGroup = this.selectRandomGroupWithCue(cueType);
      
      if (selectedGroup) {
        this.lastSecondaryCueName = cueType;
        this.lastSecondaryCueGroup = selectedGroup;
        this.secondaryCueCounter++;
        return this.groups.get(selectedGroup)!.cues.get(cueType)!;
      }
    } else {
      // Use same group as last time
      this.secondaryCueCounter++;
      if (this.lastSecondaryCueGroup && this.groups.get(this.lastSecondaryCueGroup)?.cues.has(cueType)) {
        return this.groups.get(this.lastSecondaryCueGroup)!.cues.get(cueType)!;
      }
    }
    
    // Fallback if previous logic failed
    return this.getFallbackImplementation(cueType);
  }

  /**
   * Get any available implementation of a cue to check its style.
   * @param cueType The type of cue to get
   * @returns The cue implementation or null if not found
   */
  private getAnyCueImplementation(cueType: CueType): ICue | null {
    // Try active groups first
    for (const groupName of this.activeGroups) {
      const group = this.groups.get(groupName);
      if (group?.cues.has(cueType)) {
        return group.cues.get(cueType)!;
      }
    }
    
    // Try default group
    if (this.defaultGroup) {
      const defaultGroup = this.groups.get(this.defaultGroup);
      if (defaultGroup?.cues.has(cueType)) {
        return defaultGroup.cues.get(cueType)!;
      }
    }
    
    return null;
  }

  /**
   * Randomly select a group that has the specified cue type.
   * @param cueType The type of cue to find
   * @returns The selected group name or null if none found
   */
  private selectRandomGroupWithCue(cueType: CueType): string | null {
    // Get all active groups that have this cue
    const availableGroups: string[] = [];
    
    for (const groupName of this.activeGroups) {
      const group = this.groups.get(groupName);
      if (group?.cues.has(cueType)) {
        availableGroups.push(groupName);
      }
    }
    
    if (availableGroups.length > 0) {
      const randomIndex = Math.floor(Math.random() * availableGroups.length);
      return availableGroups[randomIndex];
    }
    
    // No active groups have it, try default as fallback
    if (this.defaultGroup && this.groups.get(this.defaultGroup)?.cues.has(cueType)) {
      return this.defaultGroup;
    }
    
    return null;
  }

  /**
   * Get a cue implementation using the original fallback logic.
   * @param cueType The type of cue to get
   * @returns The cue implementation or null if not found
   */
  private getFallbackImplementation(cueType: CueType): ICue | null {
    // Try active groups first
    for (const groupName of this.activeGroups) {
      const group = this.groups.get(groupName);
      if (group?.cues.has(cueType)) {
        return group.cues.get(cueType)!;
      }
    }
    
    // Fallback to default group if it exists and wasn't already checked in active groups
    if (this.defaultGroup && !this.activeGroups.has(this.defaultGroup)) {
      const defaultGroup = this.groups.get(this.defaultGroup);
      if (defaultGroup?.cues.has(cueType)) {
        return defaultGroup.cues.get(cueType)!;
      }
    }

    return null;
  }

  /**
   * Enable a single group by adding it to the enabled groups.
   * If the group was not previously enabled, it will also be activated.
   * @param groupName The name of the group to enable
   * @returns True if the group was enabled, false otherwise
   */
  public enableGroup(groupName: string): boolean {
    if (this.groups.has(groupName)) {
      const wasEnabled = this.enabledGroups.has(groupName);
      this.enabledGroups.add(groupName);
      
      // If it wasn't enabled before, activate it by default
      if (!wasEnabled) {
        this.activeGroups.add(groupName);
      }
      
      return true;
    }
    return false;
  }

  /**
   * Disable a single group by removing it from the enabled groups.
   * This will also deactivate the group if it was active.
   * @param groupName The name of the group to disable
   * @returns True if the group was disabled, false otherwise
   */
  public disableGroup(groupName: string): boolean {
    if (this.enabledGroups.has(groupName)) {
      this.enabledGroups.delete(groupName);
      // Also deactivate the group if it was active
      if (this.activeGroups.has(groupName)) {
        this.activeGroups.delete(groupName);
      }
      return true;
    }
    return false;
  }

  /**
   * Activate a single group by adding it to the active groups.
   * Only enabled groups can be activated.
   * @param groupName The name of the group to activate
   * @returns True if the group was activated, false otherwise
   */
  public activateGroup(groupName: string): boolean {
    if (this.groups.has(groupName) && this.enabledGroups.has(groupName)) {
      this.activeGroups.add(groupName);
      return true;
    }
    return false;
  }

  /**
   * Deactivate a single group by removing it from the active groups.
   * @param groupName The name of the group to deactivate
   * @returns True if the group was deactivated, false otherwise
   */
  public deactivateGroup(groupName: string): boolean {
    if (this.activeGroups.has(groupName)) {
      this.activeGroups.delete(groupName);
      return true;
    }
    return false;
  }

  /**
   * Set which groups are enabled.
   * All newly enabled groups will also be activated by default.
   * @param groupNames The names of the groups to enable
   */
  public setEnabledGroups(groupNames: string[]): void {
    this.enabledGroups.clear();
    this.activeGroups.clear();
    
    for (const name of groupNames) {
      if (this.groups.has(name)) {
        this.enabledGroups.add(name);
        // All enabled groups are active by default
        this.activeGroups.add(name);
      }
    }
  }

  /**
   * Set which groups are currently active.
   * Only enabled groups can be set as active.
   * @param groupNames The names of the groups to activate
   */
  public setActiveGroups(groupNames: string[]): void {
    this.activeGroups.clear();
    for (const name of groupNames) {
      if (this.groups.has(name) && this.enabledGroups.has(name)) {
        this.activeGroups.add(name);
      }
    }
  }

  /**
   * Get all registered group names, regardless of whether they're enabled or active.
   * @returns Array of all registered group names
   */
  public getAllGroups(): string[] {
    return Array.from(this.groups.keys());
  }

  /**
   * Get the currently enabled group names.
   * @returns Array of enabled group names
   */
  public getEnabledGroups(): string[] {
    return Array.from(this.enabledGroups);
  }

  /**
   * Get the currently active group names.
   * @returns Array of active group names
   */
  public getActiveGroups(): string[] {
    return Array.from(this.activeGroups);
  }

  /**
   * Get the name of the default group.
   * @returns The default group name or null if no default group is set
   */
  public getDefaultGroupName(): string | null {
    return this.defaultGroup;
  }

  /**
   * Get a specific group by name, regardless of whether it's enabled or active.
   * @param groupName The name of the group to get
   * @returns The group or undefined if not found
   */
  public getGroup(groupName: string): ICueGroup | undefined {
    return this.groups.get(groupName);
  }

  /**
   * Get debugging information about the current cue selection state.
   * @returns Object containing current selection state
   */
  public getDebugInfo(): {
    lastPrimaryCue: { name: string | null; group: string | null; counter: number };
    lastSecondaryCue: { name: string | null; group: string | null; counter: number };
    activeGroups: string[];
    enabledGroups: string[];
    defaultGroup: string | null;
  } {
    return {
      lastPrimaryCue: {
        name: this.lastPrimaryCueName,
        group: this.lastPrimaryCueGroup,
        counter: this.primaryCueCounter
      },
      lastSecondaryCue: {
        name: this.lastSecondaryCueName,
        group: this.lastSecondaryCueGroup,
        counter: this.secondaryCueCounter
      },
      activeGroups: Array.from(this.activeGroups),
      enabledGroups: Array.from(this.enabledGroups),
      defaultGroup: this.defaultGroup
    };
  }

  /**
   * Reset the cue selection counters and last selected groups.
   * Useful for debugging or forcing fresh randomization.
   */
  public resetCueSelectionState(): void {
    this.lastPrimaryCueName = null;
    this.lastPrimaryCueGroup = null;
    this.lastSecondaryCueName = null;
    this.lastSecondaryCueGroup = null;
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

    for (const [groupName, group] of this.groups) {
      if (group.cues.has(cueType)) {
        allGroupsWithCue.push(groupName);
        if (this.activeGroups.has(groupName)) {
          activeGroupsWithCue.push(groupName);
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
} 