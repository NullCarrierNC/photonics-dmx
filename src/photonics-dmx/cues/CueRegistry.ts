import {  CueType } from './cueTypes';
import { ICueGroup } from './interfaces/ICueGroup';
import { ICueImplementation } from './interfaces/ICueImplementation';

/**
 * Registry for managing multiple sets of cue implementations.
 * Additional groups can define unique implementations for cues.
 * If a group doesn't define a specific cue we will fall back to the 
 * matching cue in the default group. This saves us from having to 
 * define common cues like Strobe repeatedly in each group.
 * 
 * Registered Groups: Groups of cues known to the system.
 * Active Groups: Groups that are currently active during gameplay.
 * Enabled Groups: Groups that are enabled and can potentially be set as active.
 */
export class CueRegistry {
  /** The singleton instance of the CueRegistry */
  private static instance: CueRegistry;
  
  /** Map of all registered cue groups by their name */
  private groups: Map<string, ICueGroup> = new Map();
  
  /** Set of groups that are currently active during gameplay */
  private activeGroups: Set<string> = new Set();
  
  /** Set of groups that are enabled and can potentially be set as active */
  private enabledGroups: Set<string> = new Set();
  
  /** Name of the default group that provides fallback implementations */
  private defaultGroup: string | null = null;

  private constructor() {}

  /**
   * Reset the registry by clearing all groups.
   * This should be called when switching between different cue sets (e.g. YARG to RB3).
   */
  public reset(): void {
    this.groups.clear();
    this.activeGroups.clear();
    this.enabledGroups.clear();
    this.defaultGroup = null;
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
    
    // Ensure the default group is always active
    this.activeGroups.add(groupName);
    
    return true;
  }



  /**
   * Get a cue implementation from the active groups.
   * Falls back to the default group if no implementation is found.
   * @param cueType The type of cue to get
   * @returns The cue implementation or null if not found
   * @throws Error if no implementation is found in active groups and no default group is defined
   */
  public getCueImplementation(cueType: CueType): ICueImplementation | null {
    // Try active groups first
    if (this.activeGroups.size > 0) {
      for (const groupName of this.activeGroups) {
        const group = this.groups.get(groupName);
        if (group?.cues.has(cueType)) {
         // console.log(`Found implementation for cue: ${cueType} in group: ${groupName}`);
          return group.cues.get(cueType)!;
        }
      }
    }

    // Fall back to default group
    if (this.defaultGroup) {
      const defaultGroup = this.groups.get(this.defaultGroup);
      if (defaultGroup?.cues.has(cueType)) {
      //  console.log(`Found implementation for cue: ${cueType} in default group: ${this.defaultGroup}`);
        return defaultGroup.cues.get(cueType)!;
      }
    } else {
      // Throw an error if no default group is defined
      throw new Error(`No default group defined to fall back to for cue: ${cueType}`);
    }

    console.error(`No implementation found for cue: ${cueType}`);
    return null;
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
    // Don't allow removing the default group
    if (groupName === this.defaultGroup) {
      console.warn("Cannot deactivate the default group");
      return false;
    }
    
    if (this.activeGroups.has(groupName)) {
      this.activeGroups.delete(groupName);
      return true;
    }
    return false;
  }

  /**
   * Enable a single group by adding it to the enabled groups.
   * @param groupName The name of the group to enable
   * @returns True if the group was enabled, false otherwise
   */
  public enableGroup(groupName: string): boolean {
    if (this.groups.has(groupName)) {
      this.enabledGroups.add(groupName);
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
    // Don't allow disabling the default group
    if (groupName === this.defaultGroup) {
      console.warn("Cannot disable the default group");
      return false;
    }
    
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
   * Set which groups are enabled.
   * @param groupNames The names of the groups to enable
   */
  public setEnabledGroups(groupNames: string[]): void {
    this.enabledGroups.clear();
    for (const name of groupNames) {
      if (this.groups.has(name)) {
        this.enabledGroups.add(name);
      }
    }
    // Ensure active groups are still valid
    this.setActiveGroups(Array.from(this.activeGroups));
  }

  /**
   * Get all registered group names, regardless of whether they're enabled or active.
   * @returns Array of all registered group names
   */
  public getAllGroups(): string[] {
    return Array.from(this.groups.keys());
  }

  /**
   * Get the currently active group names.
   * These are the groups that will be used during gameplay.
   * @returns Array of active group names
   */
  public getActiveGroups(): string[] {
    return Array.from(this.activeGroups);
  }

  /**
   * Get the currently enabled group names.
   * @returns Array of enabled group names
   */
  public getEnabledGroups(): string[] {
    return Array.from(this.enabledGroups);
  }

  /**
   * Get a specific group by name, regardless of whether it's enabled or active.
   * @param groupName The name of the group to get
   * @returns The group or undefined if not found
   */
  public getGroup(groupName: string): ICueGroup | undefined {
    return this.groups.get(groupName);
  }
} 