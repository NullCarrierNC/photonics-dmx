import type { CueFileLoadReport } from '../../../shared/ipcTypes'

export interface CueFileLoadMessage {
  text: string
  level: 'error' | 'warning'
}

/**
 * What to tell the user about a startup load of the cue and effect files: the files it refused,
 * the files an older version wrote that it updated and saved, and the files it read differently
 * and left as they are on disk.
 */
export function cueFileLoadMessages(reports: readonly CueFileLoadReport[]): CueFileLoadMessage[] {
  const messages: CueFileLoadMessage[] = []
  for (const { source, errors, migrations, unsaved } of reports) {
    const label = source === 'node-cue' ? 'Cue file' : 'Effect file'
    if (errors.length > 0) {
      messages.push({
        level: 'error',
        text:
          errors.length === 1
            ? `${label} validation failed: ${errors[0]}`
            : `${label} validation failed (${errors.length} files): ${errors.join('; ')}`,
      })
    }
    if (migrations.length > 0) {
      messages.push({
        level: 'warning',
        text: `${label}s saved by an older version were updated to load in this one: ${migrations.join('; ')}`,
      })
    }
    if (unsaved.length > 0) {
      messages.push({
        level: 'warning',
        text: `${label}s read differently here and left as they are on disk: ${unsaved.join(' ')}`,
      })
    }
  }
  return messages
}
