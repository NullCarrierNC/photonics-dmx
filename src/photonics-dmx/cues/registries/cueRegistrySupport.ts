import type { ILightingController } from '../../controllers/sequencer/interfaces'

/**
 * Shared, non-generic building blocks for the cue registries (Yarg, Audio, and RB3 via Yarg). These
 * hold the logic that is byte-identical across registries. They are composed, not inherited: a base
 * class would need generics over the cue element type and hit TS `Map` invariance, whereas these keep
 * everything string-keyed and consume the cue only structurally (`releaseSequencer?`), which every cue
 * type satisfies. This mirrors the existing `MotionSelectionState` composition pattern.
 */

/** A cue that may hold a sequencer reference to release. Both INetCue and IAudioCue satisfy this. */
interface ReleasableCue {
  releaseSequencer?(sequencer: ILightingController): void
}

/**
 * A group as seen by the release helper. Read-only maps so the concrete cue element type (INetCue vs
 * IAudioCue) is a non-issue: `ReadonlyMap` is covariant in its value, unlike the invariant `Map`.
 */
interface ReleasableGroup {
  cues: ReadonlyMap<string, ReleasableCue>
  motionCues?: ReadonlyMap<string, ReleasableCue>
}

/** Release the sequencer from every cue and motion cue across the given groups. */
export function releaseSequencersFor(
  groups: Iterable<ReleasableGroup>,
  sequencer: ILightingController,
): void {
  for (const group of groups) {
    for (const cue of group.cues.values()) {
      cue.releaseSequencer?.(sequencer)
    }
    if (group.motionCues) {
      for (const motionCue of group.motionCues.values()) {
        motionCue.releaseSequencer?.(sequencer)
      }
    }
  }
}

/**
 * Per-registry store of disabled cue ids keyed by group id. String-keyed, so no generics. Each
 * registry composes one and keeps any registry-specific side effects (e.g. Audio's cue-details cache)
 * in its own `setDisabledCues`, so the divergent line lives outside this shared store.
 */
export class DisabledCueStore {
  private readonly disabled = new Map<string, Set<string>>()

  /** Replace the whole disabled map from a `{ groupId: cueIds[] }` record. */
  setAll(map: Record<string, string[]>): void {
    this.disabled.clear()
    for (const [groupId, ids] of Object.entries(map)) {
      this.disabled.set(groupId, new Set(ids))
    }
  }

  isDisabled(groupId: string, cueType: string): boolean {
    return this.disabled.get(groupId)?.has(cueType) ?? false
  }

  clear(): void {
    this.disabled.clear()
  }
}

/** A group as seen by the motion helpers, read-only for the same covariance reason as above. */
interface MotionGroupView<TCue> {
  id: string
  name: string
  description?: string
  motionCues?: ReadonlyMap<string, TCue>
}

/** One row of the motion-group picker. */
export interface MotionGroupInfo {
  id: string
  name: string
  description?: string
  cueCount: number
}

/** One row of the motion-cue picker, as the renderer displays it. */
export interface MotionCueDetail {
  id: string
  name: string
  description: string
}

/** Resolve a motion cue by reference, honouring the enabled-group and disabled-cue gates. */
export function resolveMotionCue<TCue>(
  group: MotionGroupView<TCue> | undefined,
  ref: { groupId: string; cueId: string },
  isGroupEnabled: (groupId: string) => boolean,
  isCueDisabled: (groupId: string, cueId: string) => boolean,
): TCue | null {
  const motionCues = group?.motionCues
  if (!motionCues || motionCues.size === 0) {
    return null
  }
  if (!isGroupEnabled(ref.groupId) || isCueDisabled(ref.groupId, ref.cueId)) {
    return null
  }
  return motionCues.get(ref.cueId) ?? null
}

/** Locate the group and cue ids of a motion cue instance, for UI and IPC metadata. */
export function findMotionCueRefIn<TCue>(
  groups: Iterable<MotionGroupView<TCue>>,
  cue: TCue,
): { groupId: string; cueId: string } | null {
  for (const group of groups) {
    if (!group.motionCues) continue
    for (const [cueId, impl] of group.motionCues) {
      if (impl === cue) {
        return { groupId: group.id, cueId }
      }
    }
  }
  return null
}

/** Every group holding at least one motion program, sorted by display name. */
export function motionGroupsInfoFor(groups: Iterable<MotionGroupView<unknown>>): MotionGroupInfo[] {
  const rows: MotionGroupInfo[] = []
  for (const group of groups) {
    const cueCount = group.motionCues?.size ?? 0
    if (cueCount === 0) {
      continue
    }
    rows.push({
      id: group.id,
      name: group.name,
      description: group.description,
      cueCount,
    })
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
}

/** The picker rows for one group's motion programs; `describe` names each cue for its family. */
export function motionCueDetailsFor<TCue>(
  motionCues: ReadonlyMap<string, TCue> | undefined,
  describe: (cue: TCue) => MotionCueDetail,
): MotionCueDetail[] {
  if (!motionCues) {
    return []
  }
  return Array.from(motionCues.values()).map(describe)
}
