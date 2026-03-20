import { useState, useEffect } from 'react'
import { useAtom } from 'jotai'
import { yargListenerEnabledAtom, rb3eListenerEnabledAtom } from '../atoms'
import { getAudioEnabled } from '../ipcApi'

/**
 * Determines which input platform is active for cue preview.
 * Priority: RB3E > YARG > AUDIO > null
 *
 * @returns The active platform or null if none are enabled
 */
export function useCuePreviewInputPlatform(): 'RB3E' | 'YARG' | 'AUDIO' | null {
  const [yargListenerEnabled] = useAtom(yargListenerEnabledAtom)
  const [rb3eListenerEnabled] = useAtom(rb3eListenerEnabledAtom)
  const [audioEnabled, setAudioEnabled] = useState(false)

  // Check audio enabled state
  useEffect(() => {
    const checkAudioState = async () => {
      try {
        const enabled = await getAudioEnabled()
        setAudioEnabled(enabled)
      } catch (error) {
        console.error('Failed to check audio enabled state:', error)
      }
    }

    checkAudioState()

    // Poll for audio state changes every 500ms
    const interval = setInterval(checkAudioState, 500)
    return () => clearInterval(interval)
  }, [])

  // Derive platform from listener state. Priority: RB3E > YARG > AUDIO
  if (rb3eListenerEnabled) {
    return 'RB3E'
  } else if (yargListenerEnabled) {
    return 'YARG'
  } else if (audioEnabled) {
    return 'AUDIO'
  }
  return null
}
