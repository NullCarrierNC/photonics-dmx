/** A stored settings file the main process could not use as it was, and what it did about it. */
export interface ConfigRecoveryFile {
  fileName: string
  /** 'repaired' when only some values went back to their defaults. */
  reason?: string
  message?: string
}

/**
 * What to tell the user about settings files recovered at startup: one message for files that
 * were replaced by defaults, and one for files where only some values were reset.
 */
export function configRecoveryMessages(files: readonly ConfigRecoveryFile[]): string[] {
  const messages: string[] = []
  const repaired = files.filter((f) => f.reason === 'repaired')
  const replaced = files.filter((f) => f.reason !== 'repaired')
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
  return messages
}
