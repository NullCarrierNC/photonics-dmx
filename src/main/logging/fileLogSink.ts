/**
 * Main-process only: appends log lines to daily `photonics-YYYY-MM-DD.log` under `logsDir`.
 * Renderer and preload do not use this; they log to the devtools console only.
 */

import * as fs from 'fs'
import * as path from 'path'
import * as util from 'util'
import type { LogEntry, LogSink } from '../../shared/logger'

const DAILY_LOG_RE = /^photonics-(\d{4})-(\d{2})-(\d{2})\.log$/

export type FileLogSinkOptions = {
  logsDir: string
  /** How many full calendar days of files to keep (default 30). */
  retentionDays?: number
  /** Injected for tests. */
  clock?: () => number
}

function localDateKeyFromMs(ms: number): string {
  const d = new Date(ms)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function startOfLocalDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/**
 * Prune `photonics-YYYY-MM-DD.log` files with a file date before `today - retentionDays`.
 * Failures are logged to `console.warn` and never throw.
 */
export function pruneOldLogFiles(
  logsDir: string,
  retentionDays: number,
  clock: () => number = Date.now,
): void {
  try {
    if (!fs.existsSync(logsDir)) {
      return
    }
    const now = clock()
    const todayStart = startOfLocalDay(new Date(now))
    const cutoff = todayStart - retentionDays * 24 * 60 * 60 * 1000
    const entries = fs.readdirSync(logsDir, { withFileTypes: true })
    for (const ent of entries) {
      if (!ent.isFile()) {
        continue
      }
      const m = DAILY_LOG_RE.exec(ent.name)
      if (!m) {
        continue
      }
      const fileDate = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10))
      const fileStart = startOfLocalDay(fileDate)
      if (fileStart < cutoff) {
        const p = path.join(logsDir, ent.name)
        try {
          fs.unlinkSync(p)
        } catch (e) {
          // eslint-disable-next-line no-console -- file sink is allowed to use console when file logging itself fails
          console.warn(`[fileLogSink] Could not delete old log file ${p}:`, e)
        }
      }
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(`[fileLogSink] Prune failed for ${logsDir}:`, e)
  }
}

function safeSerializeData(data: unknown[]): string {
  if (data.length === 0) {
    return ''
  }
  const parts: string[] = []
  for (const item of data) {
    parts.push(serializeValue(item))
  }
  return ` ${parts.join(' ')}`
}

function serializeValue(v: unknown): string {
  if (v instanceof Error) {
    return JSON.stringify({
      name: v.name,
      message: v.message,
      stack: v.stack,
    })
  }
  try {
    return JSON.stringify(v)
  } catch {
    return util.inspect(v, { depth: 4, breakLength: Infinity })
  }
}

function formatLine(iso: string, entry: LogEntry): string {
  const dataSuffix = entry.data.length > 0 ? safeSerializeData(entry.data) : ''
  return `${iso} [${entry.level}] [${entry.scope}] ${entry.message}${dataSuffix}\n`
}

/**
 * Create a `LogSink` that appends to a daily log file, rotating at local midnight and pruning old files once at creation.
 */
export function createFileLogSink(options: FileLogSinkOptions): {
  sink: LogSink
  close: () => Promise<void>
} {
  const retentionDays = options.retentionDays ?? 30
  const clock = options.clock ?? Date.now
  const { logsDir } = options

  fs.mkdirSync(logsDir, { recursive: true })
  pruneOldLogFiles(logsDir, retentionDays, clock)

  let currentDateKey: string | null = null
  let currentStream: fs.WriteStream | null = null
  // Streams that have been rotated away (or are the final stream) and are flushing to disk.
  // close() awaits these so a file is never read back before its buffered writes have landed.
  const flushing: Promise<void>[] = []

  // Ends a stream and resolves once it has finished flushing its buffer to disk.
  function endStream(s: fs.WriteStream): Promise<void> {
    return new Promise((resolve) => {
      s.once('finish', () => resolve())
      s.end()
    })
  }

  function openStreamForDateKey(dateKey: string): void {
    const filePath = path.join(logsDir, `photonics-${dateKey}.log`)
    const s = fs.createWriteStream(filePath, { flags: 'a' })
    s.setMaxListeners(20)
    s.on('error', (err) => {
      // eslint-disable-next-line no-console
      console.error(`[fileLogSink] Write stream error for ${filePath}:`, err)
    })
    currentStream = s
    currentDateKey = dateKey
  }

  const sink: LogSink = (entry: LogEntry) => {
    const key = localDateKeyFromMs(clock())
    if (key !== currentDateKey) {
      if (currentStream) {
        // Track the rotated-away stream's flush so close() can await it, otherwise the
        // previous day's last lines may not have reached disk yet when the file is read.
        flushing.push(endStream(currentStream))
        currentStream = null
        currentDateKey = null
      }
      openStreamForDateKey(key)
    }
    if (!currentStream) {
      return
    }
    const iso = new Date(clock()).toISOString()
    const line = formatLine(iso, entry)
    currentStream.write(line)
  }

  return {
    sink,
    close: () => {
      if (currentStream) {
        flushing.push(endStream(currentStream))
        currentStream = null
        currentDateKey = null
      }
      return Promise.all(flushing).then(() => undefined)
    },
  }
}
