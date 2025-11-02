import { AudioCueType } from './AudioCueTypes';
import { IAudioCue } from './interfaces/IAudioCue';

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

  private constructor() { }

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

    // Set as default if none exists
    if (!this.defaultGroup) {
      this.defaultGroup = group.id;
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
  }

  /**
   * Get a cue implementation from the default group.
   * @param cueType The type of cue to get
   * @returns The cue implementation or null if not found
   */
  public getCueImplementation(cueType: AudioCueType): IAudioCue | null {
    const group = this.defaultGroup ? this.groups.get(this.defaultGroup) : null;
    if (!group) return null;

    return group.cues.get(cueType) || null;
  }

  /**
   * Get all available cue types from the default group.
   * @returns Array of available AudioCueType values
   */
  public getAvailableCueTypes(): AudioCueType[] {
    const group = this.defaultGroup ? this.groups.get(this.defaultGroup) : null;
    if (!group) return [];

    return Array.from(group.cues.keys());
  }

  /**
   * Get a cue implementation from a specific group.
   * @param cueType The type of cue to get
   * @param groupId The ID of the group to get the cue from
   * @returns The cue implementation or null if not found
   */
  public getCueImplementationFromGroup(cueType: AudioCueType, groupId: string): IAudioCue | null {
    const group = this.groups.get(groupId);
    if (!group) return null;

    return group.cues.get(cueType) || null;
  }

  /**
   * Get all registered groups.
   * @returns Array of group IDs
   */
  public getRegisteredGroups(): string[] {
    return Array.from(this.groups.keys());
  }

  /**
   * Get the default group ID.
   * @returns The default group ID or null if none is set
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
    console.log('AudioCueRegistry reset to initial state');
  }
}

