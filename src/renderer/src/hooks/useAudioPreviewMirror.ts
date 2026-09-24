import { useEffect } from 'react'
import { useStore } from 'jotai'
import { audioDataAtom } from '../atoms'
import { registerIpcListener } from '../utils/ipcHelpers'
import { RENDERER_RECEIVE } from '../../../shared/ipcChannels'

/**
 * Subscribes the Audio Preview window to mirrored audio frames from the main process
 * (capture runs in the main app renderer).
 */
export function useAudioPreviewMirror(): void {
  const store = useStore()
  useEffect(() => {
    const cleanupMirror = registerIpcListener(RENDERER_RECEIVE.AUDIO_DATA_MIRROR, (payload) => {
      store.set(audioDataAtom, payload)
    })
    const cleanupDisable = registerIpcListener(RENDERER_RECEIVE.AUDIO_DISABLE, () => {
      store.set(audioDataAtom, null)
    })
    return () => {
      cleanupMirror()
      cleanupDisable()
    }
  }, [store])
}
