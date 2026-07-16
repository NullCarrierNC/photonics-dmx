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
