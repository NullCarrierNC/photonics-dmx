/**
 * Starting and stopping one output sender, keeping its toggle honest about what is running.
 *
 * The toggle moves first so it answers the click, then the main process is awaited. A refusal or a
 * thrown call puts the toggle back, which is the only signal for the paths that report a bare error
 * string and so cannot say which sender failed.
 */
import { createLogger } from '../../../shared/logger'

const log = createLogger('senderSwitch')

/**
 * Whether the main process refused. Only an explicit `success: false` counts, so a handler that
 * resolves nothing is read as having worked.
 */
function wasRefused(result: unknown): result is { error?: string } {
  return (
    typeof result === 'object' &&
    result !== null &&
    (result as { success?: unknown }).success === false
  )
}

export async function applySenderRunState(
  sender: string,
  wanted: boolean,
  setRunning: (running: boolean) => void,
  call: () => Promise<unknown> | unknown,
): Promise<void> {
  setRunning(wanted)
  try {
    const result = await call()
    if (wasRefused(result)) {
      log.error(`Sender "${sender}" refused to ${wanted ? 'start' : 'stop'}:`, result.error)
      setRunning(!wanted)
    }
  } catch (error) {
    log.error(`Sender "${sender}" failed to ${wanted ? 'start' : 'stop'}:`, error)
    setRunning(!wanted)
  }
}
