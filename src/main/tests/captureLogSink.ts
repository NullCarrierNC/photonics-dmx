import {
  setLogSink,
  setMinLogLevel,
  resetLogConfiguration,
  type LogEntry,
} from '../../shared/logger'

/**
 * Runs `fn` while recording every log entry. Restores the default logger configuration afterward.
 * Sets minimum level to `debug` so all levels are delivered to the capture sink.
 */
export function withCapturedLogEntries<T>(fn: (entries: LogEntry[]) => T): T {
  const entries: LogEntry[] = []
  setMinLogLevel('debug')
  setLogSink((entry) => {
    entries.push(entry)
  })
  try {
    return fn(entries)
  } finally {
    resetLogConfiguration()
  }
}
