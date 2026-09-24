import { useAtomValue } from 'jotai'
import {
  yargListenerEnabledAtom,
  rb3eListenerEnabledAtom,
  audioListenerEnabledAtom,
} from '../atoms'

/**
 * Determines which input platform is active for cue preview.
 * Priority: RB3E > YARG > AUDIO > null
 *
 * Audio comes from audioListenerEnabledAtom, which WindowShell keeps on what main is running.
 *
 * @returns The active platform or null if none are enabled
 */
export function useCuePreviewInputPlatform(): 'RB3E' | 'YARG' | 'AUDIO' | null {
  const yargListenerEnabled = useAtomValue(yargListenerEnabledAtom)
  const rb3eListenerEnabled = useAtomValue(rb3eListenerEnabledAtom)
  const audioEnabled = useAtomValue(audioListenerEnabledAtom)

  if (rb3eListenerEnabled) {
    return 'RB3E'
  } else if (yargListenerEnabled) {
    return 'YARG'
  } else if (audioEnabled) {
    return 'AUDIO'
  }
  return null
}
