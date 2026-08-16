import { CueRegistry } from './CueRegistry'
import type { GameCueMode } from '../types/nodeCueTypes'

/**
 * One cue registry per game domain. Each domain keeps its own instance so its enabled groups,
 * once-per-song lock, consistency window and motion state stay isolated from the other's, while
 * both share the same selection machinery.
 *
 * Held as module-level lazy instances. Resolve through this accessor at call time rather than
 * caching the instance, so a test can substitute one.
 */
const instances = new Map<GameCueMode, CueRegistry>()

export function getCueRegistry(domain: GameCueMode = 'yarg'): CueRegistry {
  // The YARG domain reads the process-wide singleton on every call, so callers that reach for it
  // directly (IPC handlers, the loader) always see the same instance the listener drives.
  if (domain === 'yarg') {
    return CueRegistry.getInstance()
  }
  let instance = instances.get(domain)
  if (!instance) {
    instance = CueRegistry.create()
    instances.set(domain, instance)
  }
  return instance
}
