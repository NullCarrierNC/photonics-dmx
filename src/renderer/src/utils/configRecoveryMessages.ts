/** A stored settings file the main process could not use as it was, and what it did about it. */
export interface ConfigRecoveryFile {
  fileName: string
  /**
   * 'repaired' when only some values went back to their defaults, 'newerVersion' when a newer build
   * wrote the file, which is never saved over.
   */
  reason?: string
  message?: string
  /**
   * Set when a file that would not load is still there: one that could not be moved aside, or a
   * newer version's file this version cannot read.
   */
  leftInPlace?: boolean
}

/**
 * What to tell the user about settings files recovered at startup: one message for files that
 * were replaced by defaults, one for files that would not load and are still in place, one for
 * files where only some values were reset, and one each for files from a newer version that are in
 * use or unreadable, neither of which is saved to.
 */
export function configRecoveryMessages(files: readonly ConfigRecoveryFile[]): string[] {
  const messages: string[] = []
  const repaired = files.filter((f) => f.reason === 'repaired')
  const repairCopies = files.filter((f) => f.reason === 'repairCopied')
  const newer = files.filter((f) => f.reason === 'newerVersion' && f.leftInPlace !== true)
  const newerUnreadable = files.filter((f) => f.reason === 'newerVersion' && f.leftInPlace === true)
  const leftInPlace = files.filter((f) => f.reason !== 'newerVersion' && f.leftInPlace === true)
  const replaced = files.filter(
    (f) =>
      f.reason !== 'repaired' &&
      f.reason !== 'newerVersion' &&
      f.reason !== 'repairCopied' &&
      f.leftInPlace !== true,
  )
  if (replaced.length > 0) {
    const list = replaced.map((f) => f.fileName).join(', ')
    messages.push(
      `A local settings file was invalid. Defaults were restored and your original file was saved as a backup. (${list})`,
    )
  }
  if (leftInPlace.length > 0) {
    const list = leftInPlace.map((f) => f.fileName).join(', ')
    messages.push(
      `A local settings file was invalid and could not be moved aside, so defaults are in use. Repair it and relaunch to load it, or leave it and the next save moves it aside. (${list})`,
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
  if (repairCopies.length > 0) {
    const details = repairCopies
      .map((f) => (f.message ? `${f.fileName}: ${f.message}` : f.fileName))
      .join(', ')
    messages.push(
      `A settings file you repaired was replaced by a save from a page opened before the repair. Your repaired file was kept as a copy beside it. (${details})`,
    )
  }
  if (newerUnreadable.length > 0) {
    const list = newerUnreadable.map((f) => f.fileName).join(', ')
    messages.push(
      `A settings file was saved by a newer version of Photonics that this version cannot read, so defaults are in use. The file is kept as it is and changes are not saved while this version runs. (${list})`,
    )
  }
  return messages
}
