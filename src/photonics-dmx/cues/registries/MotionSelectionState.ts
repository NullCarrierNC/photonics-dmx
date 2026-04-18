import type { MotionGroupSelectionMode } from '../types/nodeCueTypes'

/** Minimal group shape for motion random selection (YARG and Audio cue groups). */
export interface MotionCueGroupView<TCue> {
  motionCues?: Map<string, TCue>
}

/**
 * Shared motion-program selection: mode, per-song lock, enabled pool, disabled ids, random pick with default-group fallback.
 * Used by YargCueRegistry and AudioCueRegistry.
 */
export class MotionSelectionState<TCue> {
  private motionSelectionMode: MotionGroupSelectionMode = 'perCueChange'
  private motionLockSelectionsForSong = false
  private motionLockedGroupId: string | null = null
  private motionLockedCueId: string | null = null
  private readonly enabledMotionGroups = new Set<string>()
  private readonly disabledMotionCues = new Map<string, Set<string>>()

  reset(): void {
    this.disabledMotionCues.clear()
    this.motionSelectionMode = 'perCueChange'
    this.motionLockSelectionsForSong = false
    this.motionLockedGroupId = null
    this.motionLockedCueId = null
    this.enabledMotionGroups.clear()
  }

  /** When a group is registered with motion programs and no motion group is enabled yet, enable this group. */
  onRegisterGroup(groupId: string, motionCount: number): void {
    if (motionCount > 0 && this.enabledMotionGroups.size === 0) {
      this.enabledMotionGroups.add(groupId)
    }
  }

  onUnregisterGroup(groupId: string): void {
    this.enabledMotionGroups.delete(groupId)
    if (this.motionLockedGroupId === groupId) {
      this.motionLockedGroupId = null
      this.motionLockedCueId = null
    }
  }

  setMotionSelectionMode(mode: MotionGroupSelectionMode): void {
    this.motionSelectionMode = mode
    if (mode === 'perCueChange' || mode === 'none') {
      this.motionLockSelectionsForSong = false
      this.motionLockedGroupId = null
      this.motionLockedCueId = null
    }
  }

  getMotionSelectionMode(): MotionGroupSelectionMode {
    return this.motionSelectionMode
  }

  onMotionSongStart(): void {
    if (this.motionSelectionMode === 'oncePerSong') {
      this.motionLockSelectionsForSong = true
      this.motionLockedGroupId = null
      this.motionLockedCueId = null
    }
  }

  onMotionSongEnd(): void {
    this.motionLockSelectionsForSong = false
    this.motionLockedGroupId = null
    this.motionLockedCueId = null
  }

  getRandomMotionCue(
    getGroup: (groupId: string) => MotionCueGroupView<TCue> | undefined,
    defaultGroupId: string | null,
  ): TCue | null {
    if (this.motionSelectionMode === 'none') {
      return null
    }

    if (
      this.motionSelectionMode === 'oncePerSong' &&
      this.motionLockSelectionsForSong &&
      this.motionLockedGroupId !== null &&
      this.motionLockedCueId !== null
    ) {
      const group = getGroup(this.motionLockedGroupId)
      const cue = group?.motionCues?.get(this.motionLockedCueId)
      if (cue && !this.isMotionCueDisabled(this.motionLockedGroupId, this.motionLockedCueId)) {
        return cue
      }
    }

    const picked = this.pickRandomMotionCue(getGroup, defaultGroupId)
    if (!picked) {
      return null
    }

    if (this.motionSelectionMode === 'oncePerSong' && this.motionLockSelectionsForSong) {
      this.motionLockedGroupId = picked.groupId
      this.motionLockedCueId = picked.cueId
    }

    return picked.cue
  }

  private pickRandomMotionCue(
    getGroup: (groupId: string) => MotionCueGroupView<TCue> | undefined,
    defaultGroupId: string | null,
  ): { groupId: string; cueId: string; cue: TCue } | null {
    const candidateGroups: string[] = []
    for (const groupId of this.enabledMotionGroups) {
      const group = getGroup(groupId)
      const motionMap = group?.motionCues
      if (!motionMap || motionMap.size === 0) {
        continue
      }
      const availableIds = Array.from(motionMap.keys()).filter(
        (id) => !this.isMotionCueDisabled(groupId, id),
      )
      if (availableIds.length > 0) {
        candidateGroups.push(groupId)
      }
    }

    if (candidateGroups.length === 0) {
      if (defaultGroupId) {
        const group = getGroup(defaultGroupId)
        const motionMap = group?.motionCues
        if (motionMap && motionMap.size > 0) {
          const availableIds = Array.from(motionMap.keys()).filter(
            (id) => !this.isMotionCueDisabled(defaultGroupId, id),
          )
          if (availableIds.length > 0) {
            const randomCueId = availableIds[Math.floor(Math.random() * availableIds.length)]
            return {
              groupId: defaultGroupId,
              cueId: randomCueId,
              cue: motionMap.get(randomCueId)!,
            }
          }
        }
      }
      return null
    }

    const randomGroupId = candidateGroups[Math.floor(Math.random() * candidateGroups.length)]
    const group = getGroup(randomGroupId)!
    const motionMap = group.motionCues!
    const availableIds = Array.from(motionMap.keys()).filter(
      (id) => !this.isMotionCueDisabled(randomGroupId, id),
    )
    const randomCueId = availableIds[Math.floor(Math.random() * availableIds.length)]
    return { groupId: randomGroupId, cueId: randomCueId, cue: motionMap.get(randomCueId)! }
  }

  setDisabledMotionCues(map: Record<string, string[]>): void {
    this.disabledMotionCues.clear()
    for (const [groupId, cueIds] of Object.entries(map)) {
      this.disabledMotionCues.set(groupId, new Set(cueIds))
    }
    if (
      this.motionLockedGroupId &&
      this.motionLockedCueId &&
      this.isMotionCueDisabled(this.motionLockedGroupId, this.motionLockedCueId)
    ) {
      this.motionLockedGroupId = null
      this.motionLockedCueId = null
    }
  }

  isMotionCueDisabled(groupId: string, cueId: string): boolean {
    return this.disabledMotionCues.get(groupId)?.has(cueId) ?? false
  }

  setEnabledMotionGroups(groupIds: string[], groupsHasMotion: (groupId: string) => boolean): void {
    this.enabledMotionGroups.clear()
    for (const id of groupIds) {
      if (groupsHasMotion(id)) {
        this.enabledMotionGroups.add(id)
      }
    }
    if (this.motionLockedGroupId && !this.enabledMotionGroups.has(this.motionLockedGroupId)) {
      this.motionLockedGroupId = null
      this.motionLockedCueId = null
    }
  }

  getEnabledMotionGroups(): string[] {
    return Array.from(this.enabledMotionGroups)
  }

  getRegisteredMotionGroupIds(
    groups: Iterable<{ id: string; motionCues?: Map<string, unknown> }>,
  ): string[] {
    const ids: string[] = []
    for (const g of groups) {
      if ((g.motionCues?.size ?? 0) > 0) {
        ids.push(g.id)
      }
    }
    return ids
  }

  enableMotionGroup(groupId: string, groupsHasMotion: (groupId: string) => boolean): void {
    if (groupsHasMotion(groupId)) {
      this.enabledMotionGroups.add(groupId)
    }
  }
}
