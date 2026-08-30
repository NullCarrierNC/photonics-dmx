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
