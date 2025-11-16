import { AudioCueType } from '../types/audioCueTypes';
import { IAudioCue } from '../interfaces/IAudioCue';

/**
 * Interface for an audio cue group
 */
export interface AudioCueGroup {
  id: string;
  name: string;
  description: string;
  cues: Map<AudioCueType, IAudioCue>;
}

/**
 * Registry for managing audio-reactive lighting cue implementations.
 */
export class AudioCueRegistry {
  /** The singleton instance of the AudioCueRegistry */
  private static instance: AudioCueRegistry;

  /** Map of all registered cue groups by their ID */
  private groups: Map<string, AudioCueGroup> = new Map();

  /** Name of the default group */
  private defaultGroup: string | null = null;

  /** Groups that are currently enabled */
  private enabledGroups: Set<string> = new Set();

  /** Cache of cue metadata for renderer requests */
  private cueDetailsCache: Map<string, Array<{ id: string; description: string }>> = new Map();

  private constructor() {}

  /**
   * Get the singleton instance of the AudioCueRegistry
   * @returns The AudioCueRegistry instance
   */
  public static getInstance(): AudioCueRegistry {
    if (!AudioCueRegistry.instance) {
      AudioCueRegistry.instance = new AudioCueRegistry();
    }
    return AudioCueRegistry.instance;
  }

  /**
   * Register a new group of audio cue implementations.
   * @param group The group to register
   */
  public registerGroup(group: AudioCueGroup): void {
    this.groups.set(group.id, group);
    this.cueDetailsCache.delete(group.id);

    // Set as default if none exists
    if (!this.defaultGroup) {
      this.defaultGroup = group.id;
    }

    // Ensure at least one group is enabled
    if (this.enabledGroups.size === 0) {
      this.enabledGroups.add(group.id);
    }
  }

  /**
   * Set the default group.
   * @param groupId The ID of the group to set as default
   * @throws Error if the group doesn't exist
   */
  public setDefaultGroup(groupId: string): void {
    if (!this.groups.has(groupId)) {
      throw new Error(`Cannot set default group: group '${groupId}' not found`);
    }

    this.defaultGroup = groupId;
    this.enableGroup(groupId);
  }

  /**
   * Get a cue implementation from enabled groups.
   * Falls back to the default group if none of the enabled groups contain the cue.
   */
  public getCueImplementation(cueType: AudioCueType): IAudioCue | null {
    for (const groupId of this.enabledGroups) {
      const group = this.groups.get(groupId);
      const cue = group?.cues.get(cueType);
      if (cue) {
        return cue;
      }
    }

    const fallback = this.defaultGroup ? this.groups.get(this.defaultGroup) : null;
    return fallback?.cues.get(cueType) ?? null;
  }

  /**
   * Get all cue types available within enabled groups (or across all groups if includeAll=true)
   */
  public getAvailableCueTypes(includeAll = false): AudioCueType[] {
    const cueTypes = new Set<AudioCueType>();
    const groupIds = includeAll ? Array.from(this.groups.keys()) : this.getEnabledGroups();

    for (const groupId of groupIds) {
      const group = this.groups.get(groupId);
      if (!group) continue;
      group.cues.forEach((_cue, cueType) => cueTypes.add(cueType));
    }

    // Fallback to default group if none collected
    if (cueTypes.size === 0 && this.defaultGroup) {
      const fallback = this.groups.get(this.defaultGroup);
      fallback?.cues.forEach((_cue, cueType) => cueTypes.add(cueType));
    }

    return Array.from(cueTypes);
  }

  /**
   * Get a cue implementation from a specific group.
   */
  public getCueImplementationFromGroup(cueType: AudioCueType, groupId: string): IAudioCue | null {
    const group = this.groups.get(groupId);
    if (!group) return null;

    return group.cues.get(cueType) || null;
  }

  /**
   * Get all registered group IDs.
   */
  public getRegisteredGroups(): string[] {
    return Array.from(this.groups.keys());
  }

  /**
   * Get a specific group definition.
   */
  public getGroup(groupId: string): AudioCueGroup | undefined {
    return this.groups.get(groupId);
  }

  /**
   * Get full group definitions.
   */
  public getGroups(): AudioCueGroup[] {
    return Array.from(this.groups.values());
  }

  /**
   * Get summaries for all groups (used by renderer)
   */
  public getGroupSummaries(): Array<{ id: string; name: string; description: string }> {
    return Array.from(this.groups.values()).map(group => ({
      id: group.id,
      name: group.name,
      description: group.description
    }));
  }

  /**
   * Get enabled group IDs. Defaults to the default group if nothing has been set yet.
   */
  public getEnabledGroups(): string[] {
    if (this.enabledGroups.size === 0 && this.defaultGroup) {
      return [this.defaultGroup];
    }

    return Array.from(this.enabledGroups);
  }

  /**
   * Enable a specific group.
   */
  public enableGroup(groupId: string): boolean {
    if (!this.groups.has(groupId)) {
      return false;
    }

    this.enabledGroups.add(groupId);
    return true;
  }

  /**
   * Disable a specific group.
   */
  public disableGroup(groupId: string): boolean {
    if (groupId === this.defaultGroup) {
      return false;
    }

    return this.enabledGroups.delete(groupId);
  }

  /**
   * Replace the enabled group set with the provided list.
   */
  public setEnabledGroups(groupIds: string[]): void {
    const validIds = groupIds.filter((id) => this.groups.has(id));
    if (validIds.length === 0) {
      this.enabledGroups.clear();
      if (this.defaultGroup) {
        this.enabledGroups.add(this.defaultGroup);
      }
      return;
    }

    this.enabledGroups = new Set(validIds);
  }

  /**
   * Get cue metadata for a group (id + description).
   */
  public getCueDetails(groupId: string): Array<{ id: string; description: string }> {
    if (this.cueDetailsCache.has(groupId)) {
      return this.cueDetailsCache.get(groupId)!;
    }

    const group = this.groups.get(groupId);
    if (!group) {
      return [];
    }

    const cues = Array.from(group.cues.values()).map((cue) => ({
      id: String(cue.cueType),
      description: cue.description ?? ''
    }));

    this.cueDetailsCache.set(groupId, cues);
    return cues;
  }

  /**
   * Get the default group ID.
   */
  public getDefaultGroup(): string | null {
    return this.defaultGroup;
  }

  /**
   * Reset the registry to its initial state.
   */
  public reset(): void {
    this.groups.clear();
    this.defaultGroup = null;
    this.enabledGroups.clear();
    this.cueDetailsCache.clear();
    console.log('AudioCueRegistry reset to initial state');
  }
}

