import {  CueType } from './cueTypes';
import { ICueGroup } from './interfaces/ICueGroup';
import { ICueImplementation } from './interfaces/ICueImplementation';

/**
 * Registry for managing multiple sets of cue implementations.
 * Additional groups can define unique implementations for cues.
 * If a group doesn't define a specific cue we will fall back to the 
 * matching cue in the default group. This saves uf from having to 
 * define common cues like Strobe repeatedly in each group.
 * 
 */
export class CueRegistry {
  private static instance: CueRegistry;
  private groups: Map<string, ICueGroup> = new Map();
  private activeGroups: Set<string> = new Set();
  private defaultGroup: string | null = null;

  private constructor() {}

  /**
   * Reset the registry by clearing all groups.
   * This should be called when switching between different cue sets (e.g. YARG to RB3).
   */
  public reset(): void {
    this.groups.clear();
    this.activeGroups.clear();
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
    if (group.name === 'default') {
      this.defaultGroup = group.name;
    }
  }

  /**
   * Get a cue implementation from the active groups.
   * If no active groups are set, uses all registered groups.
   * Falls back to the default group if no implementation is found.
   * @param cueType The type of cue to get
   * @returns The cue implementation or null if not found
   */
  public getCueImplementation(cueType: CueType): ICueImplementation | null {
    // Try active groups first
    if (this.activeGroups.size > 0) {
      for (const groupName of this.activeGroups) {
        const group = this.groups.get(groupName);
        if (group?.cues.has(cueType)) {
          return group.cues.get(cueType)!;
        }
      }
    }

    // Fall back to default group
    if (this.defaultGroup) {
      const defaultGroup = this.groups.get(this.defaultGroup);
      if (defaultGroup?.cues.has(cueType)) {
        return defaultGroup.cues.get(cueType)!;
      }
    }

    console.error(`No implementation found for cue: ${cueType}`);
    return null;
  }

  /**
   * Set which groups are currently active.
   * @param groupNames The names of the groups to activate
   */
  public setActiveGroups(groupNames: string[]): void {
    this.activeGroups.clear();
    for (const name of groupNames) {
      if (this.groups.has(name)) {
        this.activeGroups.add(name);
      }
    }
  }

  /**
   * Get all registered group names.
   * @returns Array of group names
   */
  public getRegisteredGroups(): string[] {
    return Array.from(this.groups.keys());
  }

  /**
   * Get the currently active group names.
   * @returns Array of active group names
   */
  public getActiveGroups(): string[] {
    return Array.from(this.activeGroups);
  }
} 