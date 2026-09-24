import { useEffect } from 'react'
import { useSetAtom } from 'jotai'
import { audioListenerEnabledAtom } from '../atoms'
import { getAudioEnabled } from '../ipcApi'
import { registerIpcListener } from '../utils/ipcHelpers'
import { useLatestGenerationGate } from './useLatestGenerationGate'
import { RENDERER_RECEIVE } from '../../../shared/ipcChannels'
import { createLogger } from '../../../shared/logger'

const log = createLogger('useAudioEnabledSync')

/**
 * Keeps audioListenerEnabledAtom on what main is running: read on mount and after a restart, which
 * turns audio back on when it was the only input, then followed from each start and stop main
 * announces. WindowShell runs it once per window, so every reader of the atom sees the same answer.
 */
export function useAudioEnabledSync(): void {
  const setAudioEnabled = useSetAtom(audioListenerEnabledAtom)
  const { nextGeneration, isCurrentGeneration } = useLatestGenerationGate()

  useEffect(() => {
    const read = (): void => {
      const token = nextGeneration()
      getAudioEnabled().then(
        (enabled) => {
          if (isCurrentGeneration(token)) setAudioEnabled(enabled)
        },
        (error: unknown) => log.error('Failed to read whether audio is running:', error),
      )
    }

    read()
    const stopRestart = registerIpcListener(RENDERER_RECEIVE.CONTROLLERS_RESTARTED, read)
    const stopChanged = registerIpcListener(RENDERER_RECEIVE.AUDIO_ENABLED_CHANGED, (payload) => {
      // An announcement is newer than any read still under way.
      nextGeneration()
      setAudioEnabled(payload.enabled)
    })
    return () => {
      stopRestart()
      stopChanged()
    }
  }, [setAudioEnabled, nextGeneration, isCurrentGeneration])
}
