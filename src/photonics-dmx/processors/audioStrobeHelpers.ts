import type { IAudioCue } from '../cues/interfaces/IAudioCue'
import { AudioCueRegistry } from '../cues/registries/AudioCueRegistry'
import type { AudioCueType } from '../cues/types/audioCueTypes'
import { pickRandom } from '../helpers/utils'

export function getCueStyle(registry: AudioCueRegistry, cueType: AudioCueType): IAudioCue['style'] {
  const cue = registry.getCueImplementation(cueType)
  return cue?.style
}

export function isStrobeStyleCue(registry: AudioCueRegistry, cueType: AudioCueType): boolean {
  return getCueStyle(registry, cueType) === 'strobe'
}

/**
 * Picks a random strobe-style cue from the available list.
 */
export function pickStrobeCueType(
  registry: AudioCueRegistry,
  available: AudioCueType[],
): AudioCueType | null {
  const tagged = available.filter((t) => isStrobeStyleCue(registry, t))
  return pickRandom(tagged) ?? null
}

/**
 * Rolls the strobe probability and, on a hit, picks a strobe cue from the enabled groups, or from
 * every group when none is enabled. Null on a miss or when no strobe cue is available.
 */
export function rollStrobeCueType(
  registry: AudioCueRegistry,
  probabilityPct = 100,
): AudioCueType | null {
  if (probabilityPct < 100 && Math.random() * 100 >= probabilityPct) return null
  const available = registry.getAvailableCueTypes()
  const all = available.length > 0 ? available : registry.getAvailableCueTypes(true)
  const chosen = pickStrobeCueType(registry, all)
  return chosen && registry.getCueImplementation(chosen) ? chosen : null
}
