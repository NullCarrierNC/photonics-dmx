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
  /** Bytes a single day's file may reach before further lines are dropped (default 64MB). */
  maxBytesPerDay?: number
  /** Bytes past the cap that errors alone may still use (default 4MB). */
  errorReserveBytes?: number
  /** Injected for tests. */
  clock?: () => number
}

/**
 * Cap for one day's file. Rotation is by date alone, so without a size bound a fault that logs on
 * a per-frame path fills the disk over a long show. Hitting the cap drops further lines for that
 * day rather than truncating what is already written, and says so once.
 */
const DEFAULT_MAX_BYTES_PER_DAY = 64 * 1024 * 1024

/**
 * How far past the cap errors alone may keep writing.
 *
 * A cap that silences errors as well takes the account of whatever filled the file with it, which
 * is the opposite of what the file is for. This bounds how much a sustained fault can add.
 */
const ERROR_RESERVE_BYTES = 4 * 1024 * 1024

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
 * Create a `LogSink` that appends to a daily log file, rotating at local midnight, capping each
 * day's file and pruning old files at creation and on each rotation.
 */
export function createFileLogSink(options: FileLogSinkOptions): {
  sink: LogSink
  close: () => Promise<void>
} {
  const retentionDays = options.retentionDays ?? 30
  const maxBytesPerDay = options.maxBytesPerDay ?? DEFAULT_MAX_BYTES_PER_DAY
  const errorReserveBytes = options.errorReserveBytes ?? ERROR_RESERVE_BYTES
  const clock = options.clock ?? Date.now
  const { logsDir } = options

  fs.mkdirSync(logsDir, { recursive: true })
  pruneOldLogFiles(logsDir, retentionDays, clock)

  let currentDateKey: string | null = null
  let currentStream: fs.WriteStream | null = null
  let bytesThisDay = 0
  let capReported = false
  let closed = false
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
    // Appending, so start from what the file already holds rather than zero.
    try {
      bytesThisDay = fs.statSync(filePath).size
    } catch {
      bytesThisDay = 0
    }
    capReported = false
  }

  const sink: LogSink = (entry: LogEntry) => {
    // Ahead of the rotation branch, which would otherwise open a stream nobody is left to end.
    if (closed) {
      return
    }
    const key = localDateKeyFromMs(clock())
    if (key !== currentDateKey) {
      if (currentStream) {
        // Track the rotated-away stream's flush so close() can await it, otherwise the
        // previous day's last lines may not have reached disk yet when the file is read.
        flushing.push(endStream(currentStream))
        currentStream = null
        currentDateKey = null
      }
      pruneOldLogFiles(logsDir, retentionDays, clock)
      openStreamForDateKey(key)
    }
    if (!currentStream) {
      return
    }
    const iso = new Date(clock()).toISOString()
    const line = formatLine(iso, entry)
    // The cap keeps a runaway from filling the disk, but an error is the one thing worth the space:
    // whatever filled the file is usually the thing being diagnosed, and dropping errors too meant
    // losing the account of it for the rest of the day. Everything below error still stops.
    if (bytesThisDay >= maxBytesPerDay) {
      reportCapOnce()
      const spent = bytesThisDay >= maxBytesPerDay + errorReserveBytes
      if (entry.level !== 'error' || spent) {
        return
      }
    }
    bytesThisDay += Buffer.byteLength(line)
    currentStream.write(line)
  }

  /** Say once, on the console, that the day's file is full. */
  function reportCapOnce(): void {
    if (capReported) {
      return
    }
    capReported = true
    // eslint-disable-next-line no-console
    console.error(
      `[fileLogSink] ${currentDateKey} log reached ${maxBytesPerDay} bytes, dropping further lines for today.`,
    )
  }

  return {
    sink,
    close: () => {
      // Terminal. Without this a line logged after the flush would find no current date key, take
      // the rotation branch and open a fresh stream nobody is left to end.
      closed = true
      if (currentStream) {
        flushing.push(endStream(currentStream))
        currentStream = null
        currentDateKey = null
      }
      return Promise.all(flushing).then(() => undefined)
    },
  }
}
