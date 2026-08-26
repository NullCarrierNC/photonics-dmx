import { CueType } from '../types/cueTypes'
import { ICueGroup } from '../interfaces/INetCueGroup'
import { INetCue } from '../interfaces/INetCue'
import { DisabledCueStore } from './cueRegistrySupport'
import { createLogger } from '../../../shared/logger'

const log = createLogger('CueGroupCatalog')

/**
 * The group container behind CueRegistry: which cue groups are registered, which the user has
 * enabled, which are active during gameplay, the default fallback group, the stage kit group, and
 * the per-group disabled cue types. Holds no selection state and emits nothing; selection policy
 * and cross-collaborator side effects (motion bookkeeping, consistency clearing) live with the
 * callers.
 */
export class CueGroupCatalog {
  /** Map of all registered cue groups by their name */
  private groups: Map<string, ICueGroup> = new Map()

  /** Set of groups that are enabled in user preferences */
  private enabledGroups: Set<string> = new Set()

  /** Set of groups that are currently active during gameplay */
  private activeGroups: Set<string> = new Set()

  /** Per-group disabled cue types (user preferences) */
  private readonly disabledCues = new DisabledCueStore()

  /** Name of the default group that provides fallback implementations */
  private defaultGroup: string | null = null

  /** Name of the stage kit group for special stage kit handling */
  private stageKitGroup: string | null = null

  /**
   * Clear every preference-driven part of the catalog while keeping registered groups, matching
   * what a registry reset preserves.
   */
  public clearPreferences(): void {
    this.enabledGroups.clear()
    this.activeGroups.clear()
    this.disabledCues.clear()
    this.defaultGroup = null
    this.stageKitGroup = null
  }

  /** Register a group, enabled and active by default. */
  public register(group: ICueGroup): void {
    this.groups.set(group.id, group)
    this.enabledGroups.add(group.id)
    this.activeGroups.add(group.id)
  }

  /**
   * Remove a group from the catalog, dropping any default or stage kit designation that pointed
   * at it.
   * @returns false when the group was not registered
   */
  public unregister(groupId: string): boolean {
    if (!this.groups.has(groupId)) {
      return false
    }

    this.groups.delete(groupId)
    this.enabledGroups.delete(groupId)
    this.activeGroups.delete(groupId)

    if (this.defaultGroup === groupId) {
      this.defaultGroup = null
    }
    if (this.stageKitGroup === groupId) {
      this.stageKitGroup = null
    }
    return true
  }

  /**
   * Set the default group.
   * @throws Error if the group doesn't exist
   */
  public setDefaultGroup(groupId: string): void {
    if (!this.groups.has(groupId)) {
      throw new Error(`Cannot set default group: group '${groupId}' not found`)
    }
    this.defaultGroup = groupId
  }

  public getDefaultGroupId(): string | null {
    return this.defaultGroup
  }

  /**
   * Set the stage kit group.
   * @throws Error if the group doesn't exist
   */
  public setStageKitGroup(groupId: string): void {
    if (!this.groups.has(groupId)) {
      throw new Error(`Cannot set stage kit group: group '${groupId}' not found`)
    }
    this.stageKitGroup = groupId
  }

  public getStageKitGroupId(): string | null {
    return this.stageKitGroup
  }

  /**
   * Enable a single group. A group that was not previously enabled is also activated.
   * @returns True if the group was enabled, false otherwise
   */
  public enableGroup(groupId: string): boolean {
    if (this.groups.has(groupId)) {
      const wasEnabled = this.enabledGroups.has(groupId)
      this.enabledGroups.add(groupId)
      if (!wasEnabled) {
        this.activeGroups.add(groupId)
      }
      return true
    }
    return false
  }

  /**
   * Disable a single group, deactivating it as well.
   * @returns True if the group was disabled, false otherwise
   */
  public disableGroup(groupId: string): boolean {
    if (this.enabledGroups.has(groupId)) {
      this.enabledGroups.delete(groupId)
      this.activeGroups.delete(groupId)
      return true
    }
    return false
  }

  /**
   * Activate a single group. Only enabled groups can be activated.
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
   * Deactivate a single group.
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
   */
  public setEnabledGroups(groupIds: string[]): void {
    const newEnabled = new Set<string>()
    for (const id of groupIds) {
      if (this.groups.has(id)) {
        newEnabled.add(id)
      }
    }
    this.enabledGroups = newEnabled
    for (const activeId of Array.from(this.activeGroups)) {
      if (!this.enabledGroups.has(activeId)) {
        this.activeGroups.delete(activeId)
      }
    }
  }

  /**
   * Set the active groups for cue selection. Requested groups that are not enabled are skipped
   * with a warning.
   * @returns True when the active set actually changed (e.g. a DMX preview toggle)
   */
  public setActiveGroups(groupIds: string[]): boolean {
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

    this.activeGroups.clear()
    for (const id of newActive) {
      this.activeGroups.add(id)
    }
    return !sameSet
  }

  public getAllGroups(): string[] {
    return Array.from(this.groups.keys())
  }

  public getEnabledGroups(): string[] {
    return Array.from(this.enabledGroups)
  }

  public getActiveGroups(): string[] {
    return Array.from(this.activeGroups)
  }

  /** Active groups that implement (and haven't disabled) the given cue type. */
  public getActiveGroupsImplementing(cueType: CueType): string[] {
    return this.getActiveGroups().filter((id) => this.cueFrom(id, cueType) !== null)
  }

  public getGroup(groupId: string): ICueGroup | undefined {
    return this.groups.get(groupId)
  }

  public hasGroup(groupId: string): boolean {
    return this.groups.has(groupId)
  }

  public isActive(groupId: string): boolean {
    return this.activeGroups.has(groupId)
  }

  /** Every registered group, for callers that fan out over the whole catalog. */
  public groupsIterable(): IterableIterator<ICueGroup> {
    return this.groups.values()
  }

  /** Replace per-group disabled cue sets from preferences. */
  public setDisabledCues(disabled: Record<string, string[]>): void {
    this.disabledCues.setAll(disabled)
  }

  /** Whether this cue type is disabled for the given group in preferences. */
  public isCueDisabled(groupId: string, cueType: CueType): boolean {
    return this.disabledCues.isDisabled(groupId, cueType)
  }

  /**
   * The cue implementation for a group, or null when the group is unknown, does not implement the
   * cue type, or has it disabled in preferences. The single validation gate selection runs on.
   */
  public cueFrom(groupId: string, cueType: CueType): INetCue | null {
    if (this.isCueDisabled(groupId, cueType)) {
      return null
    }
    return this.groups.get(groupId)?.cues.get(cueType) ?? null
  }

  /** Which groups carry an implementation for the cue type, split by active status. */
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

    return { activeGroupsWithCue, allGroupsWithCue, defaultHasCue }
  }
}
