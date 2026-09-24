import * as fs from 'fs'
import * as fsPromises from 'fs/promises'
import { createLogger } from '../../shared/logger'

const log = createLogger('ConfigFile')

/** Rename failures another process holding the file can cause, which a short wait clears. */
const TRANSIENT_RENAME_CODES = new Set(['EPERM', 'EACCES', 'EBUSY', 'ENOTEMPTY'])
const RENAME_RETRY_DELAYS_MS = [10, 20, 40, 80, 160]

function isTransientRenameFailure(error: unknown, attempt: number): boolean {
  const code = (error as NodeJS.ErrnoException)?.code
  return !!code && TRANSIENT_RENAME_CODES.has(code) && attempt < RENAME_RETRY_DELAYS_MS.length
}

/** The load path is synchronous, so its move-aside waits out a transient failure in place. */
export function renameSyncWithRetry(from: string, to: string): void {
  for (let attempt = 0; ; attempt++) {
    try {
      fs.renameSync(from, to)
      return
    } catch (error) {
      if (!isTransientRenameFailure(error, attempt)) throw error
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, RENAME_RETRY_DELAYS_MS[attempt])
    }
  }
}

/**
 * Renames with retry-and-backoff for transient Windows file-lock errors.
 *
 * On Windows, rename() fails with EPERM/EACCES/EBUSY when the source temp file or
 * the destination is momentarily held open by another process (antivirus real-time
 * scanning, Controlled Folder Access, cloud-sync of AppData, or the search indexer).
 * These locks clear within tens of milliseconds, so a short backoff almost always
 * succeeds. Non-transient errors (e.g. ENOSPC, ENOENT) are re-thrown immediately.
 */
export async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await fsPromises.rename(from, to)
      return
    } catch (error) {
      if (!isTransientRenameFailure(error, attempt)) {
        throw error
      }
      const delay = RENAME_RETRY_DELAYS_MS[attempt]
      const code = (error as NodeJS.ErrnoException).code
      log.warn(
        `Rename of ${to} hit ${code}, retrying in ${delay}ms (attempt ${attempt + 1}/${RENAME_RETRY_DELAYS_MS.length})`,
      )
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
}
