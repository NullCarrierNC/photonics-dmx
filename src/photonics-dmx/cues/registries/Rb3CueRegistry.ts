import { YargCueRegistry } from './YargCueRegistry'

/**
 * The RB3 cue domain reuses the YARG cue-selection machinery but keeps its own registry instance,
 * so RB3 cue mode's groups, once-per-song lock, consistency window, and motion state are isolated
 * from the YARG listener's. Held as a module-level lazy instance, mirroring the YARG singleton.
 */
let instance: YargCueRegistry | null = null

export function getRb3CueRegistry(): YargCueRegistry {
  if (!instance) {
    instance = YargCueRegistry.create()
  }
  return instance
}
