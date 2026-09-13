import type { CueType } from '../types/cueTypes'
import type { INetCue } from '../interfaces/INetCue'
import type { ICueGroup } from '../interfaces/INetCueGroup'
import { DisabledCueStore } from './cueRegistrySupport'
import { createLogger } from '../../../shared/logger'

const log = createLogger('CueGroupCatalog')

/**
 * The least a catalog needs of a group: an id, the cues it carries keyed by cue type, and any
 * motion programs, which decide whether it can serve as the motion fallback.
 */
export interface CatalogGroup<K, V> {
  id: string
  cues: Map<K, V>
  motionCues?: ReadonlyMap<string, unknown>
}

/**
 * The group container behind the cue registries: which cue groups are registered, which the user
 * has enabled, which are active during gameplay, the default fallback group, the stage kit group,
 * and the per-group disabled cue types. Holds no selection state and emits nothing, selection
 * policy and cross-collaborator side effects (motion bookkeeping, consistency clearing) live with
 * the callers.
 *
 * Generic over the cue-type key and the cue itself, so the net registries and the audio registry
 * hold their groups the same way rather than each keeping their own container.
 *
 * Each surface keeps a fallback while any group can serve it. A group flagged as the default, by a
 * cue file or an explicit call, holds its slot. Until one is flagged, and whenever the flagged group
 * goes, the first registered group able to serve the surface fills it: one with lighting cues for
 * the lighting fallback, one with motion programs for the motion fallback.
 */
export class CueGroupCatalog<K extends string, V, G extends CatalogGroup<K, V>> {
  /** Map of all registered cue groups by their name */
  private groups: Map<string, G> = new Map()

  /** Set of groups that are enabled in user preferences */
  private enabledGroups: Set<string> = new Set()

  /** Set of groups that are currently active during gameplay */
  private activeGroups: Set<string> = new Set()

  /** Per-group disabled cue types (user preferences) */
  private readonly disabledCues = new DisabledCueStore()

  /** Name of the default group that provides fallback lighting cue implementations */
  private defaultGroup: string | null = null

  /** Name of the default group that provides fallback motion programs */
  private defaultMotionGroup: string | null = null

  /** Name of the stage kit group for special stage kit handling */
  private stageKitGroup: string | null = null

  /** Whether each fallback was flagged, rather than filled from the first group able to serve it. */
  private defaultFlagged = false
  private motionDefaultFlagged = false

  /**
   * Enabled and active membership of each group at the moment it was unregistered, restored if the
   * same id registers again. A cue file reload unregisters and re-registers every group, and without
   * this the user's disabled groups would come back enabled.
   */
  private readonly unregisteredMembership = new Map<string, { enabled: boolean; active: boolean }>()

  /** Clear the catalog back to holding nothing at all. */
  public clear(): void {
    this.groups.clear()
    this.clearPreferences()
  }

  /** Clear every preference-driven part of the catalog while keeping registered groups. */
  public clearPreferences(): void {
    this.enabledGroups.clear()
    this.activeGroups.clear()
    this.disabledCues.clear()
    this.defaultGroup = null
    this.defaultMotionGroup = null
    this.stageKitGroup = null
    this.defaultFlagged = false
    this.motionDefaultFlagged = false
    this.unregisteredMembership.clear()
  }

  /**
   * Register a group. A new id is enabled and active by default, an id registered before takes
   * back the membership it had when it was unregistered, and a group already registered keeps its
   * current membership. It fills either fallback that is empty and that it can serve.
   */
  public register(group: G): void {
    const alreadyRegistered = this.groups.has(group.id)
    this.groups.set(group.id, group)
    if (!alreadyRegistered) {
      const membership = this.unregisteredMembership.get(group.id) ?? {
        enabled: true,
        active: true,
      }
      this.unregisteredMembership.delete(group.id)
      if (membership.enabled) {
        this.enabledGroups.add(group.id)
        if (membership.active) {
          this.activeGroups.add(group.id)
        }
      }
    }
    this.fillEmptyFallbacks()
  }

  /**
   * Remove a group from the catalog, dropping any default or stage kit designation that pointed
   * at it. An emptied fallback is refilled from the first remaining group able to serve it.
   * @returns false when the group was not registered
   */
  public unregister(groupId: string): boolean {
    if (!this.groups.has(groupId)) {
      return false
    }

    this.unregisteredMembership.set(groupId, {
      enabled: this.enabledGroups.has(groupId),
      active: this.activeGroups.has(groupId),
    })
    this.groups.delete(groupId)
    this.enabledGroups.delete(groupId)
    this.activeGroups.delete(groupId)

    if (this.defaultGroup === groupId) {
      this.defaultGroup = null
      this.defaultFlagged = false
    }
    if (this.defaultMotionGroup === groupId) {
      this.defaultMotionGroup = null
      this.motionDefaultFlagged = false
    }
    if (this.stageKitGroup === groupId) {
      this.stageKitGroup = null
    }
    this.fillEmptyFallbacks()
    return true
  }

  /**
   * Flag the group serving fallback lighting cues. It holds the slot until it is unregistered.
   * @throws Error if the group doesn't exist
   */
  public setDefaultGroup(groupId: string): void {
    if (!this.groups.has(groupId)) {
      throw new Error(`Cannot set default group: group '${groupId}' not found`)
    }
    if (this.defaultFlagged && this.defaultGroup !== groupId) {
      log.warn(
        `Default group '${this.defaultGroup}' replaced by '${groupId}': only one group can serve fallback cues`,
      )
    }
    this.defaultGroup = groupId
    this.defaultFlagged = true
  }

  public getDefaultGroupId(): string | null {
    return this.defaultGroup
  }

  /**
   * Flag the group serving fallback motion programs. Tracked separately from the lighting default,
   * so each surface falls back to a group that serves it, and held until the group is unregistered.
   * @throws Error if the group doesn't exist
   */
  public setDefaultMotionGroup(groupId: string): void {
    if (!this.groups.has(groupId)) {
      throw new Error(`Cannot set default motion group: group '${groupId}' not found`)
    }
    if (this.motionDefaultFlagged && this.defaultMotionGroup !== groupId) {
      log.warn(
        `Default motion group '${this.defaultMotionGroup}' replaced by '${groupId}': only one group can serve fallback motion programs`,
      )
    }
    this.defaultMotionGroup = groupId
    this.motionDefaultFlagged = true
  }

  public getDefaultMotionGroupId(): string | null {
    return this.defaultMotionGroup
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
   * Apply a cue file's designations to a registered group. A default claim is routed by what the
   * group actually holds, so a motion-only group takes the motion fallback and leaves the lighting
   * fallback to a group that serves lighting cues. A group holding both serves both.
   * @throws Error if the group doesn't exist
   */
  public designateDefaults(
    meta: { isDefault?: boolean; isStageKit?: boolean },
    groupId: string,
  ): void {
    const group = this.groups.get(groupId)
    if (!group) {
      throw new Error(`Cannot designate defaults: group '${groupId}' not found`)
    }
    if (meta.isDefault) {
      if (group.cues.size > 0) {
        this.setDefaultGroup(groupId)
      }
      if ((group.motionCues?.size ?? 0) > 0) {
        this.setDefaultMotionGroup(groupId)
      }
    }
    if (meta.isStageKit) {
      this.setStageKitGroup(groupId)
    }
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
  public getActiveGroupsImplementing(cueType: K): string[] {
    return this.getActiveGroups().filter((id) => this.cueFrom(id, cueType) !== null)
  }

  public getGroup(groupId: string): G | undefined {
    return this.groups.get(groupId)
  }

  public hasGroup(groupId: string): boolean {
    return this.groups.has(groupId)
  }

  public isActive(groupId: string): boolean {
    return this.activeGroups.has(groupId)
  }

  /** Every registered group, for callers that fan out over the whole catalog. */
  public groupsIterable(): IterableIterator<G> {
    return this.groups.values()
  }

  /** Replace per-group disabled cue sets from preferences. */
  public setDisabledCues(disabled: Record<string, string[]>): void {
    this.disabledCues.setAll(disabled)
  }

  /** Whether this cue type is disabled for the given group in preferences. */
  public isCueDisabled(groupId: string, cueType: K): boolean {
    return this.disabledCues.isDisabled(groupId, cueType)
  }

  /**
   * The cue implementation for a group, or null when the group is unknown, does not implement the
   * cue type, or has it disabled in preferences. The single validation gate selection runs on.
   */
  public cueFrom(groupId: string, cueType: K): V | null {
    if (this.isCueDisabled(groupId, cueType)) {
      return null
    }
    return this.groups.get(groupId)?.cues.get(cueType) ?? null
  }

  /** Which groups carry an implementation for the cue type, split by active status. */
  public getCueAvailability(cueType: K): {
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

  /** Fill each empty fallback from the first registered group able to serve it. */
  private fillEmptyFallbacks(): void {
    if (this.defaultGroup === null) {
      this.defaultGroup = this.firstGroupWhere((group) => group.cues.size > 0)
    }
    if (this.defaultMotionGroup === null) {
      this.defaultMotionGroup = this.firstGroupWhere((group) => (group.motionCues?.size ?? 0) > 0)
    }
  }

  /** The first registered group, in registration order, that passes the test. */
  private firstGroupWhere(test: (group: G) => boolean): string | null {
    for (const group of this.groups.values()) {
      if (test(group)) {
        return group.id
      }
    }
    return null
  }
}

/** The catalog the net registries hold: YARG and RB3 cue types over the net cue interface. */
export type LightingCueGroupCatalog = CueGroupCatalog<CueType, INetCue, ICueGroup>
