/** A stored settings file the main process could not use as it was, and what it did about it. */
export interface ConfigRecoveryFile {
  fileName: string
  /**
   * 'repaired' when only some values went back to their defaults, 'newerVersion' when a newer build
   * wrote the file and it is used as it is.
   */
  reason?: string
  message?: string
}

/**
 * What to tell the user about settings files recovered at startup: one message for files that
 * were replaced by defaults, one for files where only some values were reset, and one for files
 * from a newer version that are not saved to.
 */
export function configRecoveryMessages(files: readonly ConfigRecoveryFile[]): string[] {
  const messages: string[] = []
  const repaired = files.filter((f) => f.reason === 'repaired')
  const newer = files.filter((f) => f.reason === 'newerVersion')
  const replaced = files.filter((f) => f.reason !== 'repaired' && f.reason !== 'newerVersion')
  if (replaced.length > 0) {
    const list = replaced.map((f) => f.fileName).join(', ')
    messages.push(
      `A local settings file was invalid. Defaults were restored and your original file was saved as a backup. (${list})`,
    )
  }
  if (repaired.length > 0) {
    const details = repaired
      .map((f) => (f.message ? `${f.fileName}: ${f.message}` : f.fileName))
      .join(', ')
    messages.push(
      `Some saved settings were invalid and went back to their defaults. Everything else was kept. (${details})`,
    )
  }
  if (newer.length > 0) {
    const list = newer.map((f) => f.fileName).join(', ')
    messages.push(
      `A settings file was saved by a newer version of Photonics. Its settings are in use, but changes are not saved while this version runs. (${list})`,
    )
  }
  return messages
}
