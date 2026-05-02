import { useEffect, useState } from 'react'
import { getLifecyclePhase } from '../ipcApi'
import { registerIpcListener } from '../utils/ipcHelpers'
import { RENDERER_RECEIVE } from '../../../shared/ipcChannels'
import type { LifecyclePhase } from '../../../shared/ipcTypes'
import { createLogger } from '../../../shared/logger'

const log = createLogger('useLifecyclePhase')

/**
 * Tracks the main-process `ControllerManager` lifecycle phase.
 *
 * Seeds with `getLifecyclePhase()` once on mount, then updates from `LIFECYCLE_PHASE_CHANGED`
 * pushes. Renderer code can use the phase to disable Restart, listener-enable, or Console-Mode
 * controls outside `'running'` / `'consoleMode'`, and to surface a recovery banner on `'failed'`.
 */
export function useLifecyclePhase(): LifecyclePhase {
  // 'initializing' is the seed used until the first GET_PHASE resolves; it matches the main-process default.
  const [phase, setPhase] = useState<LifecyclePhase>('initializing')

  useEffect(() => {
    let cancelled = false
    getLifecyclePhase()
      .then((current) => {
        if (!cancelled) setPhase(current)
      })
      .catch((err) => {
        log.error('Failed to fetch initial lifecycle phase', err)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    return registerIpcListener(RENDERER_RECEIVE.LIFECYCLE_PHASE_CHANGED, (next) => {
      setPhase(next)
    })
  }, [])

  return phase
}

/**
 * Convenience: when true, renderer should disable Restart / Enable / Disable / Console-Mode actions
 * because the controller graph is mid-transition or has stopped.
 */
export function isLifecycleBusy(phase: LifecyclePhase): boolean {
  return phase !== 'running' && phase !== 'consoleMode'
}
