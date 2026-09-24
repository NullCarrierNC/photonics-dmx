/**
 * Writing a setting and answering whether the write landed.
 *
 * The save channels report a refusal by resolving `success: false` rather than by rejecting. This
 * reads that and a throw alike, and hands the panel the one message every settings panel shows.
 */
import type { AppPreferences } from '../../../shared/ipcTypes'
import { savePrefs } from '../ipcApi'
import { wasRefused } from './ipcResult'
import { createLogger } from '../../../shared/logger'

const log = createLogger('persistPrefs')

/** What a panel shows when a write of `what` was refused or threw. */
export function saveFailureMessage(what: string): string {
  return `Could not save ${what}.`
}

/** What a panel shows when a write landed and the controller restart after it failed. */
function restartFailureMessage(restartError: string): string {
  return `Saved, but the lights did not restart. ${restartError}`
}

/** The restart failure a save answered with beside its success, if any. */
function restartErrorOf(result: unknown): string | undefined {
  if (typeof result !== 'object' || result === null || !('restartError' in result)) {
    return undefined
  }
  return typeof result.restartError === 'string' ? result.restartError : undefined
}

/**
 * Runs one settings write. Answers what the write landed with, or null when it was refused or
 * threw, in which case `report` has been told what to show.
 *
 * A write that landed and whose controller restart failed still counts as saved, and `report` is
 * told that the lights did not restart.
 *
 * @param what Names the setting in the message a failure reports, e.g. "the ArtNet configuration".
 */
export async function persistSetting<R>(
  write: () => Promise<R>,
  what: string,
  report: (message: string) => void,
): Promise<Exclude<R, { success: false }> | null> {
  try {
    const result = await write()
    if (wasRefused(result)) {
      log.error(`Refused to save ${what}:`, result.error)
      report(saveFailureMessage(what))
      return null
    }
    const restartError = restartErrorOf(result)
    if (restartError !== undefined) {
      log.error(`The restart after saving ${what} failed:`, restartError)
      report(restartFailureMessage(restartError))
    }
    return result as Exclude<R, { success: false }>
  } catch (error) {
    log.error(`Failed to save ${what}:`, error)
    report(saveFailureMessage(what))
    return null
  }
}

/**
 * @param what Names the setting in the message a failure reports, e.g. "the ArtNet configuration".
 */
export async function persistPrefs(
  updates: Partial<AppPreferences>,
  what: string,
  onFailure: (message: string) => void,
): Promise<boolean> {
  return (await persistSetting(() => savePrefs(updates), what, onFailure)) !== null
}
