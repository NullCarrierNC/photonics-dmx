import * as path from 'path'

/**
 * Report from ConfigFile when a stored file could not be used as it was. For 'read', 'parse' and
 * 'schema' the original file is preserved under a `.corrupt-*` name and defaults are used. For
 * 'repaired' only the named fields went back to their defaults, and the rest of the file was kept.
 * For 'newerVersion' the file came from a newer build and nothing is saved over it: it is used as
 * it is, or with `leftInPlace` set, this build cannot read it and defaults are used.
 */
export type ConfigCorruptReason = 'read' | 'parse' | 'schema' | 'repaired' | 'newerVersion'

export interface ConfigCorruptInfo {
  fileName: string
  filePath: string
  reason: ConfigCorruptReason
  /** human-readable, for logs and optional UI */
  message?: string
  /** Set when a file that would not load is still there, with defaults in use. */
  leftInPlace?: boolean
}

export function corruptBackupFilePath(
  absoluteFilePath: string,
  timestamp: Date = new Date(),
): string {
  const dir = path.dirname(absoluteFilePath)
  const ext = path.extname(absoluteFilePath)
  const base = path.basename(absoluteFilePath, ext)
  const iso = timestamp.toISOString().replace(/:/g, '-')
  return path.join(dir, `${base}.corrupt-${iso}${ext}`)
}
