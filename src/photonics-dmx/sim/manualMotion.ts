import type { MotionCueRef } from '../cues/types/cueTypes'

/** Motion timing that plays the manual motion cue at once, every time: no minimum hold, always picked. */
export const MANUAL_MOTION_TIMING = {
  getMotionCueMinimumHoldMs: (): number => 0,
  getMotionCueProbabilityPercent: (): number => 100,
}

interface LibraryRegistry {
  setEnabledGroups(groupIds: string[]): void
  setActiveGroups(groupIds: string[]): void
  setDefaultGroup(groupId: string): void
  setStageKitPriority(priority: 'never'): void
}

/** Holds a YARG or RB3 registry to one library, as live input sees it with only that one enabled. */
export function holdToLibrary(registry: LibraryRegistry, library: string): void {
  registry.setEnabledGroups([library])
  registry.setActiveGroups([library])
  registry.setDefaultGroup(library)
  registry.setStageKitPriority('never')
}

interface MotionHandler {
  setManualMotionRef(ref: MotionCueRef | null): void
  setMotionEnabled(enabled: boolean): void
}

interface MotionRegistry {
  setEnabledMotionGroups(groupIds: string[]): void
}

/**
 * Plays `motion` beside every lighting cue the handler runs, as a manual motion pick does, or turns
 * motion off when there is none.
 */
export function setManualMotion(
  handler: MotionHandler,
  registry: MotionRegistry,
  motion: MotionCueRef | null,
): void {
  if (motion) {
    registry.setEnabledMotionGroups([motion.groupId])
    handler.setManualMotionRef(motion)
  }
  handler.setMotionEnabled(motion !== null)
}
