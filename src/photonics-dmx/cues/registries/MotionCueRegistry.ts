import { IMotionCueGroup } from '../interfaces/INetCueGroup'
import { INetCue } from '../interfaces/INetCue'
import { MotionNodeCue } from '../node/runtime/MotionNodeCue'

export type MotionGroupSelectionMode = 'oncePerSong' | 'perCueChange' | 'none'

/**
 * Registry for motion cue groups. Selection is random from enabled groups and non-disabled
 * cue definitions; optional once-per-song lock mirrors lighting cue group behaviour.
 */
export class MotionCueRegistry {
  private static instance: MotionCueRegistry

  private groups: Map<string, IMotionCueGroup> = new Map()
  private enabledGroups: Set<string> = new Set()
  private defaultGroup: string | null = null
  private disabledCues: Map<string, Set<string>> = new Map()

  private motionSelectionMode: MotionGroupSelectionMode = 'perCueChange'
  private lockSelectionsForSong = false
  private lockedGroupId: string | null = null
  private lockedCueId: string | null = null

  private constructor() {}

  public static getInstance(): MotionCueRegistry {
    if (!MotionCueRegistry.instance) {
      MotionCueRegistry.instance = new MotionCueRegistry()
    }
    return MotionCueRegistry.instance
  }

  public registerGroup(group: IMotionCueGroup): void {
    this.groups.set(group.id, group)
    if (!this.defaultGroup) {
      this.defaultGroup = group.id
    }
    if (this.enabledGroups.size === 0) {
      this.enabledGroups.add(group.id)
    }
  }

  public unregisterGroup(groupId: string): boolean {
    if (!this.groups.has(groupId)) {
      return false
    }
    this.groups.delete(groupId)
    this.enabledGroups.delete(groupId)
    if (this.defaultGroup === groupId) {
      this.defaultGroup = null
    }
    if (this.lockedGroupId === groupId) {
      this.lockedGroupId = null
      this.lockedCueId = null
    }
    return true
  }

  public setDefaultGroup(groupId: string): void {
    if (!this.groups.has(groupId)) {
      throw new Error(`Cannot set default motion group: group '${groupId}' not found`)
    }
    this.defaultGroup = groupId
    this.enabledGroups.add(groupId)
  }

  public getDefaultGroup(): string | null {
    return this.defaultGroup
  }

  public setMotionSelectionMode(mode: MotionGroupSelectionMode): void {
    this.motionSelectionMode = mode
    if (mode === 'perCueChange' || mode === 'none') {
      this.lockSelectionsForSong = false
      this.lockedGroupId = null
      this.lockedCueId = null
    }
  }

  public getMotionSelectionMode(): MotionGroupSelectionMode {
    return this.motionSelectionMode
  }

  /** Called when gameplay / song starts; enables once-per-song lock when mode is oncePerSong. */
  public onSongStart(): void {
    if (this.motionSelectionMode === 'oncePerSong') {
      this.lockSelectionsForSong = true
      this.lockedGroupId = null
      this.lockedCueId = null
    }
  }

  /** Called when song ends; clears once-per-song lock. */
  public onSongEnd(): void {
    this.lockSelectionsForSong = false
    this.lockedGroupId = null
    this.lockedCueId = null
  }

  /**
   * Picks a motion cue: random group then random program within the group, respecting disabled ids.
   * When oncePerSong and in a song, returns the same cue until onSongEnd.
   */
  public getRandomMotionCue(): INetCue | null {
    if (this.motionSelectionMode === 'none') {
      return null
    }

    if (
      this.motionSelectionMode === 'oncePerSong' &&
      this.lockSelectionsForSong &&
      this.lockedGroupId !== null &&
      this.lockedCueId !== null
    ) {
      const group = this.groups.get(this.lockedGroupId)
      const cue = group?.cues.get(this.lockedCueId)
      if (cue && !this.isCueDisabled(this.lockedGroupId, this.lockedCueId)) {
        return cue
      }
    }

    const picked = this.pickRandomGroupAndCue()
    if (!picked) {
      return null
    }

    if (this.motionSelectionMode === 'oncePerSong' && this.lockSelectionsForSong) {
      this.lockedGroupId = picked.groupId
      this.lockedCueId = picked.cueId
    }

    return picked.cue
  }

  private pickRandomGroupAndCue(): { groupId: string; cueId: string; cue: INetCue } | null {
    const candidateGroups: string[] = []
    for (const groupId of this.enabledGroups) {
      const group = this.groups.get(groupId)
      if (!group) {
        continue
      }
      const availableIds = Array.from(group.cues.keys()).filter(
        (id) => !this.isCueDisabled(groupId, id),
      )
      if (availableIds.length > 0) {
        candidateGroups.push(groupId)
      }
    }

    if (candidateGroups.length === 0) {
      const fallbackId = this.defaultGroup
      if (fallbackId) {
        const group = this.groups.get(fallbackId)
        if (group) {
          const availableIds = Array.from(group.cues.keys()).filter(
            (id) => !this.isCueDisabled(fallbackId, id),
          )
          if (availableIds.length > 0) {
            const randomCueId = availableIds[Math.floor(Math.random() * availableIds.length)]
            const cue = group.cues.get(randomCueId)!
            return { groupId: fallbackId, cueId: randomCueId, cue }
          }
        }
      }
      return null
    }

    const randomGroupId = candidateGroups[Math.floor(Math.random() * candidateGroups.length)]
    const group = this.groups.get(randomGroupId)!
    const availableIds = Array.from(group.cues.keys()).filter(
      (id) => !this.isCueDisabled(randomGroupId, id),
    )
    const randomCueId = availableIds[Math.floor(Math.random() * availableIds.length)]
    return { groupId: randomGroupId, cueId: randomCueId, cue: group.cues.get(randomCueId)! }
  }

  public getGroup(groupId: string): IMotionCueGroup | undefined {
    return this.groups.get(groupId)
  }

  /** All registered motion groups with metadata for IPC / UI. */
  public getMotionGroupsInfo(): Array<{
    id: string
    name: string
    description?: string
    cueCount: number
  }> {
    const rows: Array<{
      id: string
      name: string
      description?: string
      cueCount: number
    }> = []
    for (const group of this.groups.values()) {
      rows.push({
        id: group.id,
        name: group.name,
        description: group.description,
        cueCount: group.cues.size,
      })
    }
    return rows.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
  }

  /** Per-cue metadata for a group (Preferences accordion). */
  public getCueDetails(groupId: string): Array<{ id: string; name: string; description: string }> {
    const group = this.groups.get(groupId)
    if (!group) {
      return []
    }
    return Array.from(group.cues.values()).map((cue) => {
      const name = cue instanceof MotionNodeCue ? cue.name : cue.cueId
      return {
        id: cue.cueId,
        name,
        description: cue.description ?? '',
      }
    })
  }

  public getAllGroups(): string[] {
    return Array.from(this.groups.keys())
  }

  public getEnabledGroups(): string[] {
    return Array.from(this.enabledGroups)
  }

  public setEnabledGroups(groupIds: string[]): void {
    this.enabledGroups.clear()
    for (const id of groupIds) {
      if (this.groups.has(id)) {
        this.enabledGroups.add(id)
      }
    }
    if (this.lockedGroupId && !this.enabledGroups.has(this.lockedGroupId)) {
      this.lockedGroupId = null
      this.lockedCueId = null
    }
  }

  public enableGroup(groupId: string): void {
    if (this.groups.has(groupId)) {
      this.enabledGroups.add(groupId)
    }
  }

  public setDisabledCues(map: Record<string, string[]>): void {
    this.disabledCues.clear()
    for (const [groupId, cueIds] of Object.entries(map)) {
      this.disabledCues.set(groupId, new Set(cueIds))
    }
    if (
      this.lockedGroupId &&
      this.lockedCueId &&
      this.isCueDisabled(this.lockedGroupId, this.lockedCueId)
    ) {
      this.lockedGroupId = null
      this.lockedCueId = null
    }
  }

  private isCueDisabled(groupId: string, cueId: string): boolean {
    return this.disabledCues.get(groupId)?.has(cueId) ?? false
  }

  public reset(): void {
    this.groups.clear()
    this.enabledGroups.clear()
    this.defaultGroup = null
    this.disabledCues.clear()
    this.motionSelectionMode = 'perCueChange'
    this.lockSelectionsForSong = false
    this.lockedGroupId = null
    this.lockedCueId = null
  }
}
