import { useEffect } from 'react'
import { useSetAtom } from 'jotai'
import { rb3eListenerEnabledAtom, yargListenerEnabledAtom } from '../atoms'
import { getSystemStatus } from '../ipcApi'
import { registerIpcListener } from '../utils/ipcHelpers'
import { useLatestGenerationGate } from './useLatestGenerationGate'
import { RENDERER_RECEIVE } from '../../../shared/ipcChannels'
import { createLogger } from '../../../shared/logger'

const log = createLogger('useListenerEnabledSync')

/**
 * Keeps yargListenerEnabledAtom and rb3eListenerEnabledAtom on what main is running: read on mount
 * and after a restart, then followed from each start and stop main announces. WindowShell runs it
 * once per window beside useAudioEnabledSync, so a switch in any window locks the others.
 */
export function useListenerEnabledSync(): void {
  const setYargEnabled = useSetAtom(yargListenerEnabledAtom)
  const setRb3Enabled = useSetAtom(rb3eListenerEnabledAtom)
  const { nextGeneration, isCurrentGeneration } = useLatestGenerationGate()

  useEffect(() => {
    const read = (): void => {
      const token = nextGeneration()
      getSystemStatus().then(
        (status) => {
          if (!status.success || !isCurrentGeneration(token)) return
          setYargEnabled(status.isYargEnabled)
          setRb3Enabled(status.isRb3Enabled)
        },
        (error: unknown) => log.error('Failed to read which listener is running:', error),
      )
    }

    read()
    const stopRestart = registerIpcListener(RENDERER_RECEIVE.CONTROLLERS_RESTARTED, read)
    const stopChanged = registerIpcListener(
      RENDERER_RECEIVE.LISTENER_ENABLED_CHANGED,
      (payload) => {
        // An announcement is newer than any read still under way.
        nextGeneration()
        if (payload.listener === 'yarg') {
          setYargEnabled(payload.enabled)
        } else {
          setRb3Enabled(payload.enabled)
        }
      },
    )
    return () => {
      stopRestart()
      stopChanged()
    }
  }, [setYargEnabled, setRb3Enabled, nextGeneration, isCurrentGeneration])
}
