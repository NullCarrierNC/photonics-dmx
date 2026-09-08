/**
 * Writing preferences and answering whether the write landed.
 *
 * The save channel reports a refusal by resolving `success: false` rather than by rejecting. This
 * reads that and a throw alike, and returns false for either.
 */
import type { AppPreferences } from '../../../shared/ipcTypes'
import { savePrefs } from '../ipcApi'
import { wasRefused } from './ipcResult'
import { createLogger } from '../../../shared/logger'

const log = createLogger('persistPrefs')

/**
 * @param what Names the setting in the message a failure reports, e.g. "the ArtNet configuration".
 */
export async function persistPrefs(
  updates: Partial<AppPreferences>,
  what: string,
  onFailure: (message: string) => void,
): Promise<boolean> {
  try {
    const result = await savePrefs(updates)
    if (wasRefused(result)) {
      log.error(`Refused to save ${what}:`, result.error)
      onFailure(`Could not save ${what}.`)
      return false
    }
    return true
  } catch (error) {
    log.error(`Failed to save ${what}:`, error)
    onFailure(`Could not save ${what}.`)
    return false
  }
}
