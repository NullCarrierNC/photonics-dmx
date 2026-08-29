import React, { useCallback, useState } from 'react'
import { useLifecyclePhase } from '../hooks/useLifecyclePhase'
import { retryControllerInit } from '../ipcApi'
import { createLogger } from '../../../shared/logger'

const log = createLogger('LifecycleFailedBanner')

/**
 * Shown while the controller graph is in the `failed` phase, which the main process reports when
 * initialization or a restart did not complete. The UI still runs in that state but nothing it
 * drives does, so this is the surface that says why and offers a way back without relaunching.
 */
const LifecycleFailedBanner: React.FC = () => {
  const phase = useLifecyclePhase()
  const [retrying, setRetrying] = useState(false)
  const [retryError, setRetryError] = useState<string | null>(null)

  const handleRetry = useCallback(async (): Promise<void> => {
    setRetrying(true)
    setRetryError(null)
    try {
      const result = await retryControllerInit()
      // A success leaves the phase on `running`, which unmounts this banner. A failure keeps the
      // phase on `failed`, so report why and leave the retry available.
      if (!result.success) {
        setRetryError(result.error)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      log.error('Retry request failed:', error)
      setRetryError(message)
    } finally {
      setRetrying(false)
    }
  }, [])

  if (phase !== 'failed') {
    return null
  }

  return (
    <div
      role="alert"
      className="flex items-center gap-3 px-4 py-2 bg-red-600 text-white text-sm shadow-md">
      <span className="flex-grow">
        Lighting controllers failed to start. DMX output, cues and listeners are unavailable. Check
        the log for the cause, then retry.
        {retryError && <span className="block mt-1 opacity-90">Retry failed: {retryError}</span>}
      </span>
      <button
        type="button"
        onClick={handleRetry}
        disabled={retrying}
        className="shrink-0 px-3 py-1 rounded bg-white text-red-700 font-semibold disabled:opacity-60">
        {retrying ? 'Retrying...' : 'Retry'}
      </button>
    </div>
  )
}

export default LifecycleFailedBanner
