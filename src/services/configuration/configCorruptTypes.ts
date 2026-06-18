import * as path from 'path'

/**
 * Report from ConfigFile when a read, JSON parse, migration, or schema check fails on disk;
 * the original file is preserved under a `.corrupt-*` name.
 */
export type ConfigCorruptReason = 'read' | 'parse' | 'schema'

export interface ConfigCorruptInfo {
  fileName: string
  filePath: string
  reason: ConfigCorruptReason
  /** human-readable, for logs and optional UI */
  message?: string
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
